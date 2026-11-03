import { body, handler, HttpError } from '@/lib/http';
import { db, audit } from '@/lib/db';
import { roshToken } from '@/lib/reviews';
import { pushDevices, sendPush } from '@/lib/push';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const typeLabel = (t: string) => t.replace(/^חיצונית/, 'ביקורת אמת').replace(/^פנימית$/, 'ביקורת פנימית');

/** כמה מחשבים של ראש הישיבה רשומים להתראות */
export const GET = handler<Ctx>(async () => ({ devices: await pushDevices() }));

/** התראה לראש הישיבה על ביקורת שנסגרה (רק אחרי שמי שסגר אישר) */
export const POST = handler<Ctx>(async (req, user, { params }) => {
  await body<object>(req).catch(() => ({}));
  const id = Number((await params).id);
  const sql = await db();
  const [r] = await sql`select number, type, date_heb, time, pct::float as pct, passed, chaser, lo_ana, nirsham, bishuv, status from reviews where id = ${id}`;
  if (!r || r.status !== 'closed') throw new HttpError(404, 'הביקורת לא נמצאה או שעוד לא נסגרה');
  const token = await roshToken(false, user.email);
  if (!token) throw new HttpError(400, 'עוד לא נוצר קישור לראש הישיבה');
  const pct = r.pct === null ? '' : `נוכחות ${Math.round(r.pct * 1000) / 10}%`;
  const result = r.passed === null ? '' : r.passed ? 'עובר ✓' : 'נכשל ✗';
  const res = await sendPush({
    title: `ביקורת #${r.number} נסגרה — ${[pct, result].filter(Boolean).join(' · ')}`,
    body: `${typeLabel(r.type)} · ${r.date_heb} ${r.time}\nחסר ${r.chaser} · לא ענה ${r.lo_ana} · נרשם ${r.nirsham} · בישוב ${r.bishuv}`,
    url: `/rosh/${token}`,
    tag: `bikoret-${r.number}`,
  });
  await audit(user.email, 'notify-rosh', { reviewId: id, number: r.number, ...res });
  return res;
});
