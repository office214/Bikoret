import { config, NO_ANSWER, REVIEW_TYPES, SESSIONS, STATUSES, type Status } from './config';
import { audit, db } from './db';
import { autoSession, hebrewDateShort, timeHHmm } from './hebdate';
import { getSetting } from './secure';
import { HttpError } from './http';
import { readSheet } from './google';
import { normId, normText, readCentralStudents, selectForReview } from './students';
import { adminReport, send019, smsSettings, smsText, toInternational972, validMobile, type SmsKind } from './sms';

export type ReviewMeta = {
  id: number; number: number | null; status: 'open' | 'closed'; session: string; type: string;
  date_heb: string; time: string; created_at: string; created_by: string | null;
};

const isStatus = (s: string): s is Status => (STATUSES as readonly string[]).includes(s);

/* ---------- ביקורת פתוחה ---------- */

export async function currentReview(since?: string) {
  const sql = await db();
  const [review] = await sql<ReviewMeta[]>`
    select id, number, status, session, type, date_heb, time, created_at, created_by
    from reviews where status = 'open'`;
  const smsTest = !!(await getSetting(SMS_TEST_KEY));
  if (!review) return { review: null, entries: [], full: true, now: new Date().toISOString(), smsTest, session: autoSession() };
  const full = !since || isNaN(Date.parse(since));
  const entries = full
    ? await sql`select student_id as id, last_name, first_name, status, updated_at from entries where review_id = ${review.id} order by last_name, first_name`
    : await sql`select student_id as id, last_name, first_name, status, updated_at from entries where review_id = ${review.id} and updated_at > ${since}`;
  const [{ now }] = await sql`select now() as now`;
  return { review, entries, full, now, smsTest, session: autoSession() };
}

export const SMS_TEST_KEY = 'sms_test_phone';

export async function prepareReview(type: string, replace: boolean, user: string, session: string = autoSession()) {
  if (!(SESSIONS as readonly string[]).includes(session)) throw new HttpError(400, 'זמן ביקורת לא תקין');
  if (!(REVIEW_TYPES as readonly string[]).includes(type)) throw new HttpError(400, 'סוג ביקורת לא תקין');

  // קריאה מהמסד המרכזי לפני פתיחת הטרנזקציה — כדי לא להחזיק נעילה בזמן קריאה מגוגל
  const all = await readCentralStudents();
  const { picked, skipped } = selectForReview(all, session, type);
  if (!picked.length) throw new HttpError(400, 'לא נמצאו תלמידים לביקורת לפי הסינון');

  const sql = await db();
  const id = await sql.begin(async (tx) => {
    const [open] = await tx`select id from reviews where status = 'open' for update`;
    if (open) {
      if (!replace) throw new HttpError(409, 'כבר יש ביקורת פתוחה', { openId: open.id });
      await tx`delete from reviews where id = ${open.id}`;
    }
    const [r] = await tx`
      insert into reviews (status, session, type, date_heb, time, created_by)
      values ('open', ${session}, ${type}, ${hebrewDateShort()}, ${timeHHmm()}, ${user})
      returning id`;
    const rows = picked.map((s) => ({
      review_id: r.id, student_id: s.id, last_name: s.lastName, first_name: s.firstName,
      phone: s.phone, lang: s.lang, talmud: s.talmud, study_status: s.studyStatus,
      status: NO_ANSWER, updated_by: user,
    }));
    for (let i = 0; i < rows.length; i += 500) await tx`insert into entries ${tx(rows.slice(i, i + 500))}`;
    return r.id as number;
  });
  await audit(user, 'prepare', { id, session, type, count: picked.length, skipped: skipped.length });
  return { id, count: picked.length, skipped };
}

export async function markStatus(reviewId: number, studentId: string, status: string, user: string) {
  if (!isStatus(status)) throw new HttpError(400, 'סטטוס לא תקין');
  const sql = await db();
  const rows = await sql`
    update entries e set status = ${status}, updated_at = clock_timestamp(), updated_by = ${user}
    from reviews r
    where e.review_id = ${reviewId} and e.student_id = ${normId(studentId)} and r.id = e.review_id and r.status = 'open'
    returning e.updated_at`;
  if (!rows.length) throw new HttpError(409, 'הביקורת נסגרה או שהתלמיד לא נמצא — רענן את המסך');
  return { updated_at: rows[0].updated_at };
}

export async function markMany(reviewId: number, ids: string[], status: string, user: string) {
  if (!isStatus(status)) throw new HttpError(400, 'סטטוס לא תקין');
  const sql = await db();
  const clean = ids.map(normId).filter(Boolean);
  const rows = await sql`
    update entries e set status = ${status}, updated_at = clock_timestamp(), updated_by = ${user}
    from reviews r
    where e.review_id = ${reviewId} and e.student_id = any(${clean}) and r.id = e.review_id and r.status = 'open'
    returning e.student_id`;
  return { updated: rows.length };
}

export async function updateMeta(reviewId: number, meta: { date_heb?: string; time?: string; type?: string }) {
  const sql = await db();
  const patch: Record<string, string> = {};
  if (meta.date_heb !== undefined) patch.date_heb = normText(meta.date_heb).slice(0, 40);
  if (meta.time !== undefined) {
    if (meta.time && !/^\d{1,2}:\d{2}$/.test(meta.time)) throw new HttpError(400, 'שעה לא תקינה');
    patch.time = meta.time;
  }
  if (meta.type !== undefined) {
    if (!(REVIEW_TYPES as readonly string[]).includes(meta.type)) throw new HttpError(400, 'סוג ביקורת לא תקין');
    patch.type = meta.type;
  }
  if (!Object.keys(patch).length) return;
  const rows = await sql`update reviews set ${sql(patch)} where id = ${reviewId} and status = 'open' returning id`;
  if (!rows.length) throw new HttpError(409, 'הביקורת כבר נסגרה');
}

/** מחיקת ביקורת סגורה מהתוצאות (מנהלים בלבד). המספר שלה יתפנה אם היא האחרונה. */
export async function deleteClosedReview(reviewId: number, user: string) {
  const sql = await db();
  const [r] = await sql`delete from reviews where id = ${reviewId} and status = 'closed' returning number, date_heb, total`;
  if (!r) throw new HttpError(404, 'הביקורת לא נמצאה');
  await sql`delete from sms_log where review_id = ${reviewId}`;
  await audit(user, 'delete-closed', { reviewId, number: r.number, date: r.date_heb, total: r.total });
  return { number: r.number };
}

export async function discardReview(reviewId: number, user: string) {
  const sql = await db();
  await sql`delete from reviews where id = ${reviewId} and status = 'open'`;
  await audit(user, 'discard', { reviewId });
}

export async function closeReview(reviewId: number, meta: { date_heb?: string; time?: string; type?: string }, user: string) {
  await updateMeta(reviewId, meta);
  const sql = await db();
  const result = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(872342)`; // מספור ביקורות רציף גם בסגירות מקבילות
    const [r] = await tx`select id from reviews where id = ${reviewId} and status = 'open' for update`;
    if (!r) throw new HttpError(409, 'הביקורת כבר נסגרה');
    const [c] = await tx`
      select count(*)::int as total,
        count(*) filter (where status = 'נוכח')::int as present,
        count(*) filter (where status = 'בישוב')::int as bishuv,
        count(*) filter (where status = 'חסר')::int as chaser,
        count(*) filter (where status = 'לא ענה')::int as lo_ana,
        count(*) filter (where status = 'נרשם')::int as nirsham
      from entries where review_id = ${reviewId}`;
    const pct = c.total ? (c.present + c.bishuv) / c.total : 0;
    const [{ next }] = await tx`select greatest(coalesce(max(number), 0) + 1, ${config.firstReviewNumber}::int) as next from reviews`;
    const [done] = await tx`
      update reviews set status = 'closed', number = ${next}, total = ${c.total}, present = ${c.present},
        bishuv = ${c.bishuv}, chaser = ${c.chaser}, lo_ana = ${c.lo_ana}, nirsham = ${c.nirsham},
        pct = ${pct}, passed = ${pct >= config.passThreshold}, closed_at = now(), closed_by = ${user}
      where id = ${reviewId} returning *`;
    return done;
  });
  await audit(user, 'close', { reviewId, number: result.number });
  return result;
}

/* ---------- SMS ---------- */

export async function sendReviewSms(reviewId: number, kind: SmsKind, force: boolean, user: string) {
  const sql = await db();
  const [review] = await sql<ReviewMeta[]>`select * from reviews where id = ${reviewId} and status = 'open'`;
  if (!review) throw new HttpError(409, 'אין ביקורת פתוחה');

  // הגנה מכפילות: אותו סוג הודעה לאותה ביקורת בתוך 3 דקות
  const [recent] = await sql`
    select created_at from sms_log where review_id = ${reviewId} and kind = ${kind}
    and created_at > now() - interval '3 minutes' order by created_at desc limit 1`;
  if (recent && !force) throw new HttpError(409, 'הודעה זו כבר נשלחה לפני פחות מ-3 דקות', { recent: recent.created_at });

  const targets = await sql`
    select student_id, last_name, first_name, phone, lang from entries
    where review_id = ${reviewId} and status = ${NO_ANSWER} order by last_name, first_name`;
  if (!targets.length) return { target: 0, sent: 0, missing: [], errors: [] };

  const settings = await smsSettings();
  const label = kind === 'start' ? 'סמס התחלה' : 'סמס לא ענו';
  const testPhone = await getSetting(SMS_TEST_KEY);
  const missing: string[] = [];
  const errors: string[] = [];
  const log: { review_id: number; kind: string; student_id: string; phone: string; ok: boolean; error: string | null; sent_by: string }[] = [];

  // קיבוץ לפי נוסח ההודעה (עברית/אנגלית) — בקשה אחת לכל קבוצה של עד 100 נמענים
  const groups = new Map<string, { id: string; name: string; phone: string }[]>();
  for (const t of targets) {
    const name = `${t.last_name} ${t.first_name}`.trim();
    const p = toInternational972(t.phone);
    if (!validMobile(p)) {
      missing.push(name);
      log.push({ review_id: reviewId, kind, student_id: t.student_id, phone: t.phone, ok: false, error: 'אין מספר נייד תקין', sent_by: user });
      continue;
    }
    const text = smsText(kind, t.lang, review.type, review.time);
    if (!groups.has(text)) groups.set(text, []);
    groups.get(text)!.push({ id: t.student_id, name, phone: p });
  }

  // מצב בדיקה: כל נוסח נשלח פעם אחת למספר הבדיקה בלבד — לא לתלמידים
  if (testPhone) {
    const to = toInternational972(testPhone);
    let sentTest = 0;
    for (const [text, list] of groups) {
      const sample = `[בדיקה — היה נשלח ל-${list.length} תלמידים]\n${text}`;
      try {
        await send019(settings, [to], sample);
        sentTest++;
        await sql`insert into sms_log (review_id, kind, phone, ok, sent_by) values (${reviewId}, ${kind + '-test'}, ${to}, true, ${user})`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(msg);
        await sql`insert into sms_log (review_id, kind, phone, ok, error, sent_by) values (${reviewId}, ${kind + '-test'}, ${to}, false, ${msg}, ${user})`;
      }
    }
    await audit(user, 'sms-test', { reviewId, kind, messages: sentTest, errors: errors.length });
    return { target: targets.length, sent: 0, missing, errors, test: { phone: testPhone, messages: sentTest } };
  }

  await adminReport(`↖️ מתחיל ${label} | יעד: ${targets.length}`);
  let sent = 0;
  for (const [text, list] of groups) {
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      try {
        await send019(settings, chunk.map((c) => c.phone), text);
        sent += chunk.length;
        chunk.forEach((c) => log.push({ review_id: reviewId, kind, student_id: c.id, phone: c.phone, ok: true, error: null, sent_by: user }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${chunk.length} נמענים: ${msg}`);
        chunk.forEach((c) => log.push({ review_id: reviewId, kind, student_id: c.id, phone: c.phone, ok: false, error: msg, sent_by: user }));
      }
    }
  }
  for (let i = 0; i < log.length; i += 500) await sql`insert into sms_log ${sql(log.slice(i, i + 500))}`;
  await adminReport(`${kind === 'start' ? '🟢' : '🔴'} דוח ${label}:\nנשלחו: ${sent}\nדולגו (חסר טלפון): ${missing.length}\n` +
    (errors.length ? `\nשגיאות:\n- ${errors.join('\n- ')}` : '\nללא שגיאות ✅'));
  await audit(user, 'sms', { reviewId, kind, sent, missing: missing.length, errors: errors.length });
  return { target: targets.length, sent, missing, errors };
}

/* ---------- תוצאות ---------- */

export async function history() {
  const sql = await db();
  return sql`
    select id, number, session, type, date_heb, time, total, present, bishuv, chaser, lo_ana, nirsham,
      pct::float as pct, passed, imported, closed_at, closed_by
    from reviews where status = 'closed' order by number desc`;
}

export async function reviewDetail(reviewId: number) {
  const sql = await db();
  const [review] = await sql`select id, number, date_heb, time, type, pct::float as pct, passed, imported from reviews where id = ${reviewId}`;
  if (!review) throw new HttpError(404, 'לא נמצא');
  const entries = await sql`
    select student_id as id, last_name, first_name, status from entries
    where review_id = ${reviewId} and status <> 'נוכח' order by last_name, first_name`;
  return { review, entries };
}

export async function searchStudents(q: string) {
  const sql = await db();
  const term = `%${normText(q)}%`;
  return sql`
    select distinct on (e.student_id) e.student_id as id, e.last_name, e.first_name
    from entries e join reviews r on r.id = e.review_id
    where (e.last_name || ' ' || e.first_name) ilike ${term}
    order by e.student_id, r.created_at desc
    limit 30`;
}

export async function studentHistory(studentId: string) {
  const sql = await db();
  return sql`
    select r.id, r.number, r.date_heb, r.time, r.type, r.imported, e.status, e.last_name, e.first_name
    from entries e join reviews r on r.id = e.review_id
    where e.student_id = ${normId(studentId)} and r.status = 'closed'
    order by r.number desc`;
}

/** נתוני הדפסה: N הביקורות האחרונות, לתלמידי הביקורת הפתוחה (או האחרונה שנסגרה) */
export async function printData(kind: string, count: number) {
  const sql = await db();
  const reviews = await sql`
    select id, number, date_heb, time, type, total, chaser, nirsham, bishuv, lo_ana, pct::float as pct, passed
    from reviews where status = 'closed' order by number desc limit ${Math.min(Math.max(count, 1), 8)}`;
  if (!reviews.length) return { reviews: [], rows: [] };
  if (kind === 'cover') return { reviews, rows: [] };

  const [open] = await sql`select id from reviews where status = 'open'`;
  const baseId = open ? open.id : reviews[0].id;
  const ids = reviews.map((r) => r.id);
  const people = await sql`select student_id, last_name, first_name from entries where review_id = ${baseId} order by last_name, first_name`;
  const marks = await sql`select review_id, student_id, status from entries where review_id = any(${ids}) and student_id = any(${people.map((p) => p.student_id)})`;
  const map = new Map<string, string>();
  marks.forEach((m) => map.set(`${m.review_id}:${m.student_id}`, m.status === 'נוכח' ? '' : m.status));

  const rows = people.map((p) => ({
    last: p.last_name, first: p.first_name,
    statuses: reviews.map((r) => map.get(`${r.id}:${p.student_id}`) || ''),
  })).filter((row) => {
    const s = row.statuses[0];
    if (kind === 'missing') return s === 'חסר' || s === 'לא ענה';
    if (kind === 'bishuv') return s === 'בישוב';
    if (kind === 'nirsham') return s === 'נרשם';
    return true;
  });
  return { reviews, rows };
}

/* ---------- ייבוא חד-פעמי מגיליון "מסד" בקובץ ביקורת הישן ---------- */

function num(v: string): number | null {
  const t = String(v || '').replace(/[^\d.\-]/g, '');
  const n = t === '' ? NaN : Number(t);
  return Number.isFinite(n) ? n : null;
}
function pctValue(v: string): number | null {
  const s = String(v || '').trim();
  if (!s) return null;
  const n = num(s);
  if (n === null) return null;
  // בעמודות ישנות האחוז נשמר כמספר שלם (91.4 במקום 0.914) — מנרמלים לשבר
  let p = s.includes('%') ? n / 100 : n;
  while (p > 1.5) p /= 100;
  return p;
}

export async function importHistory(user: string) {
  const rows = await readSheet(config.historySheetId, config.historySheetName);
  if (rows.length < 14) throw new HttpError(400, 'גיליון "מסד" נראה ריק');

  const headerIdx = rows.findIndex((r, i) => i < 40 && r.some((c) => normText(c).startsWith('תעודת זהות')));
  if (headerIdx === -1) throw new HttpError(400, 'לא נמצאה שורת הכותרות במסד');
  const header = rows[headerIdx].map(normText);
  const cId = header.findIndex((h) => h.startsWith('תעודת זהות'));
  const cLast = header.indexOf('שם משפחה');
  const cFirst = header.indexOf('שם פרטי');
  if (cLast === -1 || cFirst === -1) throw new HttpError(400, 'חסרות עמודות שם משפחה / שם פרטי');

  const width = Math.max(...rows.map((r) => r.length));
  const reviewCols: { col: number; number: number }[] = [];
  for (let c = 0; c < width; c++) {
    const v = normText(rows[0]?.[c]);
    if (/^\d+$/.test(v) && Number(v) > 0) reviewCols.push({ col: c, number: Number(v) });
  }
  if (!reviewCols.length) throw new HttpError(400, 'לא נמצאו עמודות ביקורת');

  const students = rows.slice(headerIdx + 1).map((r) => ({
    id: normId(r[cId]), last: normText(r[cLast]), first: normText(r[cFirst]), row: r,
  })).filter((s) => s.last || s.first);

  const sql = await db();
  const cell = (r: number, c: number) => normText(rows[r]?.[c]);
  let imported = 0, skipped = 0, entryCount = 0;

  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(872342)`;
    const existing = new Set((await tx`select number from reviews where number is not null`).map((r) => r.number));
    for (const { col, number } of reviewCols) {
      if (existing.has(number)) { skipped++; continue; }
      const total = num(cell(4, col)) ?? 0;
      const chaser = num(cell(5, col)) ?? 0;
      const nirsham = num(cell(6, col)) ?? 0;
      const bishuv = num(cell(8, col)) ?? 0;
      const loAna = num(cell(9, col)) ?? 0;
      const pct = pctValue(cell(10, col));
      const result = cell(11, col);
      // בביקורות 153–154 הסקריפט הישן כתב את השעה בשורת "סוג ביקורת"
      let time = cell(2, col);
      let type = cell(3, col);
      if (!time && /^\d{1,2}:\d{2}$/.test(type)) { time = type; type = 'פנימית'; }
      const [r] = await tx`
        insert into reviews (number, status, type, date_heb, time, total, present, bishuv, chaser, lo_ana, nirsham,
          pct, passed, imported, created_by, closed_at, closed_by)
        values (${number}, 'closed', ${type}, ${cell(1, col)}, ${time}, ${total},
          ${Math.max(total - chaser - nirsham - bishuv - loAna, 0)}, ${bishuv}, ${chaser}, ${loAna}, ${nirsham},
          ${pct}, ${result ? result === 'עובר' : pct !== null ? pct >= config.passThreshold : null}, true, ${user}, now(), ${user})
        returning id`;
      const seen = new Set<string>();
      const entries = students
        .map((s) => ({ s, status: normText(s.row[col]) }))
        .filter(({ s, status }) => status && s.id && !seen.has(s.id) && seen.add(s.id))
        .map(({ s, status }) => ({
          review_id: r.id, student_id: s.id, last_name: s.last, first_name: s.first, status, updated_by: user,
        }));
      for (let i = 0; i < entries.length; i += 500) await tx`insert into entries ${tx(entries.slice(i, i + 500))}`;
      entryCount += entries.length;
      imported++;
    }
  });
  await audit(user, 'import', { imported, skipped, entryCount });
  return { imported, skipped, entries: entryCount };
}
