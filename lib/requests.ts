import { db, audit } from './db';
import { trySendPush } from './push';
import { roshToken } from './reviews';
import { nowIL, whenLabel } from './hebcal';

/*
 * בקשות של ראש הישיבה לבצע ביקורת במועד מסוים:
 *   ראש הישיבה מבקש (pending) → המזכירות מאשרת (approved) או מציעה מועד אחר (counter)
 *   → על הצעה ראש הישיבה מאשר (approved) או בוחר מועד אחר (pending שוב).
 * כל מעבר שולח התראה לצד השני. שעה לפני מועד מאושר נשלחת תזכורת לטלפון של המזכירות.
 * כל מעבר מותנה במצב הנוכחי — לחיצה כפולה לא מבצעת פעמיים ולא שולחת שתי התראות.
 */

export type Req = {
  id: number; at: string; asked_at: string; note: string; reply: string;
  status: 'pending' | 'counter' | 'approved' | 'cancelled' | 'done';
  label: string; asked_label: string; ymd: string; hhmm: string;
};

const ADMIN_URL = '/';

async function roshUrl() {
  const t = await roshToken(false, 'system');
  return t ? `/rosh/${t}` : '/';
}

function shape(r: Record<string, unknown>): Req {
  const at = new Date(r.at as string), asked = new Date(r.asked_at as string);
  const il = nowIL(at);
  return {
    id: Number(r.id), at: at.toISOString(), asked_at: asked.toISOString(), note: String(r.note || ''), reply: String(r.reply || ''),
    status: r.status as Req['status'], label: whenLabel(at), asked_label: whenLabel(asked), ymd: il.ymd, hhmm: il.hhmm,
  };
}

/** תאריך + שעה (שעון ישראל) → מועד; חייב להיות בעתיד */
async function parseWhen(date: string, time: string): Promise<Date> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) throw new Error('יש לבחור תאריך ושעה');
  const sql = await db();
  const [{ at }] = await sql`select (${date}::date + ${time}::time) at time zone 'Asia/Jerusalem' as at`;
  const d = new Date(at);
  if (d.getTime() < Date.now() + 5 * 60_000) throw new Error('המועד שנבחר כבר עבר');
  if (d.getTime() > Date.now() + 120 * 86400_000) throw new Error('אפשר לבקש עד ארבעה חודשים קדימה');
  return d;
}

/** בקשות פעילות (ושל היממה האחרונה), מהקרובה לרחוקה */
export async function activeRequests(): Promise<Req[]> {
  const sql = await db();
  const rows = await sql`
    select * from review_requests
    where status in ('pending','counter','approved') and at > now() - interval '3 hours'
    order by at`;
  return rows.map(shape);
}

const clip = (s: unknown, n: number) => String(s || '').trim().slice(0, n);

/* ---------- צד ראש הישיבה ---------- */

export async function roshCreate(date: string, time: string, note: string) {
  const at = await parseWhen(date, time);
  const sql = await db();
  const [r] = await sql`insert into review_requests (at, asked_at, note, status, updated_by) values (${at}, ${at}, ${clip(note, 200)}, 'pending', 'rosh') returning *`;
  const q = shape(r);
  await audit('rosh', 'request-create', { id: q.id, at: q.at });
  await trySendPush('admin', {
    title: 'ראש הישיבה מבקש ביקורת',
    body: `${q.label}${q.note ? `\n${q.note}` : ''}\nלחצו כדי לאשר או להציע מועד אחר`,
    url: `${ADMIN_URL}?req=${q.id}`, tag: `req-${q.id}`,
  });
  return q;
}

/** ראש הישיבה מאשר את המועד שהמזכירות הציעה */
export async function roshAccept(id: number) {
  const sql = await db();
  const [r] = await sql`
    update review_requests set status = 'approved', updated_at = now(), updated_by = 'rosh',
      reminded_at = case when at - now() < interval '70 minutes' then now() else null end
    where id = ${id} and status = 'counter' returning *`;
  if (!r) return null; // כבר טופל
  const q = shape(r);
  await audit('rosh', 'request-accept', { id });
  await trySendPush('admin', { title: 'ראש הישיבה אישר את המועד ✓', body: `ביקורת ${q.label}\nתישלח תזכורת שעה לפני`, url: `${ADMIN_URL}?req=${q.id}`, tag: `req-${q.id}` });
  return q;
}

/** ראש הישיבה בוחר מועד אחר (אחרי הצעה של המזכירות, או כדי לשנות בקשה) */
export async function roshRepropose(id: number, date: string, time: string, note?: string) {
  const at = await parseWhen(date, time);
  const sql = await db();
  const [r] = await sql`
    update review_requests set at = ${at}, status = 'pending', reply = '', reminded_at = null,
      note = coalesce(${note === undefined ? null : clip(note, 200)}, note), updated_at = now(), updated_by = 'rosh'
    where id = ${id} and status in ('pending','counter','approved') returning *`;
  if (!r) throw new Error('הבקשה כבר לא פעילה');
  const q = shape(r);
  await audit('rosh', 'request-repropose', { id, at: q.at });
  await trySendPush('admin', {
    title: 'ראש הישיבה מבקש ביקורת — מועד חדש',
    body: `${q.label}${q.note ? `\n${q.note}` : ''}\nלחצו כדי לאשר או להציע מועד אחר`,
    url: `${ADMIN_URL}?req=${q.id}`, tag: `req-${q.id}`,
  });
  return q;
}

export async function roshCancel(id: number) {
  const sql = await db();
  const [r] = await sql`update review_requests set status = 'cancelled', updated_at = now(), updated_by = 'rosh' where id = ${id} and status in ('pending','counter','approved') returning *`;
  if (!r) return null;
  const q = shape(r);
  await audit('rosh', 'request-cancel', { id });
  await trySendPush('admin', { title: 'ראש הישיבה ביטל את הבקשה', body: `הביקורת שתוכננה ל${q.label} בוטלה`, url: ADMIN_URL, tag: `req-${q.id}` });
  return q;
}

/* ---------- צד המזכירות ---------- */

export async function adminApprove(id: number, user: string) {
  const sql = await db();
  const [r] = await sql`
    update review_requests set status = 'approved', updated_at = now(), updated_by = ${user},
      reminded_at = case when at - now() < interval '70 minutes' then now() else null end
    where id = ${id} and status = 'pending' returning *`;
  if (!r) return null; // כבר אושרה / בוטלה — לא שולחים שוב
  const q = shape(r);
  await audit(user, 'request-approve', { id });
  await trySendPush('rosh', { title: 'הבקשה לביקורת אושרה ✓', body: `הביקורת תתבצע ${q.label}`, url: await roshUrl(), tag: `req-${q.id}` });
  return q;
}

export async function adminCounter(id: number, date: string, time: string, reply: string, user: string) {
  const at = await parseWhen(date, time);
  const sql = await db();
  const [r] = await sql`
    update review_requests set at = ${at}, reply = ${clip(reply, 200)}, status = 'counter', reminded_at = null, updated_at = now(), updated_by = ${user}
    where id = ${id} and status in ('pending','approved') returning *`;
  if (!r) throw new Error('הבקשה כבר לא פעילה');
  const q = shape(r);
  await audit(user, 'request-counter', { id, at: q.at });
  await trySendPush('rosh', {
    title: 'הצעה למועד אחר לביקורת',
    body: `במקום ${q.asked_label}:\n${q.label}${q.reply ? `\n${q.reply}` : ''}\nלחצו כדי לאשר או לבחור מועד אחר`,
    url: await roshUrl(), tag: `req-${q.id}`,
  });
  return q;
}

/** כשפותחים ביקורת קרוב למועד מאושר — הבקשה מסומנת כבוצעה */
export async function markDoneNearNow() {
  const sql = await db();
  await sql`update review_requests set status = 'done', updated_at = now() where status = 'approved' and at between now() - interval '4 hours' and now() + interval '3 hours'`;
}

/* ---------- תזכורת שעה לפני ---------- */

let lastCheck = 0;

/** שולח תזכורות שהגיע זמנן (כל תזכורת פעם אחת בלבד — העדכון אטומי) */
export async function sendDueReminders(force = false) {
  if (!force && Date.now() - lastCheck < 60_000) return 0;
  lastCheck = Date.now();
  const sql = await db();
  const due = await sql`
    update review_requests set reminded_at = now()
    where status = 'approved' and reminded_at is null and at - interval '60 minutes' <= now() and at > now() - interval '20 minutes'
    returning *`;
  for (const r of due) {
    const q = shape(r);
    const mins = Math.max(0, Math.round((new Date(q.at).getTime() - Date.now()) / 60_000));
    await trySendPush('admin', {
      title: `תזכורת: ביקורת בשעה ${q.hhmm}`,
      body: `${mins >= 5 ? `בעוד ${mins >= 55 ? 'כשעה' : `${mins} דקות`} · ` : ''}לבקשת ראש הישיבה\n${q.label}`,
      url: ADMIN_URL, tag: `req-${q.id}`,
    });
  }
  return due.length;
}
