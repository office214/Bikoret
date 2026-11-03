import { body, handler } from '@/lib/http';
import { roshToken, rotateRoshToken } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

const link = (req: Request, t: string) => (t ? `${new URL(req.url).origin}/rosh/${t}` : '');

/** הקישור הקיים לראש הישיבה (ריק אם עוד לא נוצר) */
export const GET = handler(async (req, user) => ({ url: link(req, await roshToken(false, user.email)) }), { admin: true });

/** יצירה, או החלפה (הקישור הקודם מפסיק לעבוד) */
export const POST = handler(async (req, user) => {
  const b = await body<{ rotate?: boolean }>(req);
  const t = b.rotate ? await rotateRoshToken(user.email) : await roshToken(true, user.email);
  return { url: link(req, t) };
}, { admin: true });
