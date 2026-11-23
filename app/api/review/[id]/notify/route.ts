import { body, handler, HttpError } from '@/lib/http';
import { db, audit } from '@/lib/db';
import { roshToken } from '@/lib/reviews';
import { pushDevices, sendPush } from '@/lib/push';
import { normalizePhone, waDirect, waRecipients } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const typeLabel = (t: string) => t.replace(/^חיצונית/, 'ביקורת אמת').replace(/^פנימית$/, 'ביקורת פנימית');

/** סיכום ביקורת שנסגרה — לנוסח ההתראה ולהודעת הוואטסאפ */
async function summary(id: number) {
  const sql = await db();
  const [r] = await sql`select number, type, date_heb, time, pct::float as pct, passed, chaser, lo_ana, nirsham, bishuv, status from reviews where id = ${id}`;
  if (!r || r.status !== 'closed') return null;
  const pct = r.pct === null ? '' : `נוכחות ${Math.round(r.pct * 1000) / 10}%`;
  const result = r.passed === null ? '' : r.passed ? 'עובר ✓' : 'נכשל ✗';
  return {
    number: r.number as number,
    title: `ביקורת #${r.number} נסגרה — ${[pct, result].filter(Boolean).join(' · ')}`,
    line1: `${typeLabel(r.type)} · ${r.date_heb} ${r.time}`,
    line2: `חסר ${r.chaser} · לא ענה ${r.lo_ana} · נרשם ${r.nirsham} · בישוב ${r.bishuv}`,
  };
}

/**
 * כמה מחשבים של ראש הישיבה רשומים להתראות, ונוסח העדכון בוואטסאפ עם הנמענים השמורים.
 * בהודעה יש קישור למסך הצפייה של ראש הישיבה.
 */
export const GET = handler<Ctx>(async (req, user, { params }) => {
  const devices = await pushDevices('rosh');
  const s = await summary(Number((await params).id));
  if (!s) return { devices, wa: null };
  const token = await roshToken(false, user.email);
  const link = token ? `\nלפרטים: ${new URL(req.url).origin}/rosh/${token}` : '';
  const text = `${s.title}\n${s.line1}\n${s.line2}${link}`;
  const recipients = (await waRecipients()).map((x) => ({ name: x.name, phone: normalizePhone(x.phone) }));
  return { devices, wa: { text, recipients, direct: waDirect() } };
});

/** התראה לראש הישיבה על ביקורת שנסגרה (רק אחרי שמי שסגר אישר) */
export const POST = handler<Ctx>(async (req, user, { params }) => {
  await body<object>(req).catch(() => ({}));
  const id = Number((await params).id);
  const s = await summary(id);
  if (!s) throw new HttpError(404, 'הביקורת לא נמצאה או שעוד לא נסגרה');
  const token = await roshToken(false, user.email);
  if (!token) throw new HttpError(400, 'עוד לא נוצר קישור לראש הישיבה');
  const res = await sendPush('rosh', { title: s.title, body: `${s.line1}\n${s.line2}`, url: `/rosh/${token}`, tag: `bikoret-${s.number}` });
  await audit(user.email, 'notify-rosh', { reviewId: id, number: s.number, ...res });
  return res;
});
