import { body, handler, HttpError } from '@/lib/http';
import { db, audit } from '@/lib/db';
import { smsText } from '@/lib/sms';
import { roshToken } from '@/lib/reviews';
import { greeting, normalizePhone, relaySend, waDirect, waGroup, waRecipients } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

const typeLabel = (t: string) => t.replace(/^חיצונית/, 'ביקורת אמת').replace(/^פנימית$/, 'ביקורת פנימית');

/**
 * וואטסאפ ישיר לביקורת:
 *  kind 'group'  — הודעת פתיחת הביקורת לקבוצה שנבחרה בהגדרות
 *  kind 'update' — אחרי הסגירה: הודעה אישית לנמען אחד (index), עם הסיכום והקישור למסך ראש הישיבה.
 * הנמענים נשלחים אחד-אחד מהמסך; אפליקציית המזכירות מרווחת ביניהם כמה שניות.
 */
export const POST = handler<Ctx>(async (req, user, { params }) => {
  if (!waDirect()) throw new HttpError(409, 'וואטסאפ ישיר לא מוגדר');
  const id = Number((await params).id);
  const b = await body<{ kind?: 'group' | 'update'; index?: number }>(req);
  const sql = await db();
  const [r] = await sql`select number, type, date_heb, time, pct::float as pct, passed, chaser, lo_ana, nirsham, bishuv, status from reviews where id = ${id}`;
  if (!r) throw new HttpError(404, 'הביקורת לא נמצאה');

  if (b.kind === 'group') {
    const g = await waGroup();
    if (!g) throw new HttpError(409, 'עוד לא נבחרה קבוצת וואטסאפ (ניהול ← מסך ראש הישיבה)');
    const text = smsText('start', 'HE', r.type, r.time);
    try { await relaySend({ group: g.id }, text, `ביקורת – ${g.name}`); }
    catch (e) { throw new HttpError(502, e instanceof Error ? e.message : String(e)); }
    await audit(user.email, 'wa-group-sent', { reviewId: id, group: g.name });
    return { ok: true, group: g.name };
  }

  if (r.status !== 'closed') throw new HttpError(409, 'הביקורת עוד לא נסגרה');
  const list = await waRecipients();
  const x = list[Number(b.index)];
  if (!x) throw new HttpError(400, 'נמען לא קיים');
  const phone = normalizePhone(x.phone);
  if (!phone) throw new HttpError(400, `אין מספר טלפון ל${x.name || 'נמען'} (ניהול ← מסך ראש הישיבה)`);
  const pct = r.pct === null ? '' : `נוכחות ${Math.round(r.pct * 1000) / 10}%`;
  const result = r.passed === null ? '' : r.passed ? 'עובר ✓' : 'נכשל ✗';
  const token = await roshToken(false, user.email);
  const lines = [
    greeting(x, r.number),
    '',
    `${typeLabel(r.type)} · ${r.date_heb} ${r.time}${pct || result ? ' — ' + [pct, result].filter(Boolean).join(' · ') : ''}`,
    `חסר ${r.chaser} · לא ענה ${r.lo_ana} · נרשם ${r.nirsham} · בישוב ${r.bishuv}`,
    ...(token ? ['', `${new URL(req.url).origin}/rosh/${token}`] : []),
  ];
  try { await relaySend({ phone }, lines.join('\n'), x.name); }
  catch (e) { throw new HttpError(502, e instanceof Error ? e.message : String(e)); }
  await audit(user.email, 'wa-update-sent', { reviewId: id, number: r.number, to: x.name });
  return { ok: true };
});

/** מה מוגדר: וואטסאפ ישיר, שם הקבוצה */
export const GET = handler<Ctx>(async () => {
  const g = await waGroup();
  return { direct: waDirect(), group: g?.name || null };
});
