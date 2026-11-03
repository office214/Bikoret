import { body, handler } from '@/lib/http';
import { currentReview, prepareReview } from '@/lib/reviews';
import { markDoneNearNow } from '@/lib/requests';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = handler(async (req) => {
  const since = new URL(req.url).searchParams.get('since') || undefined;
  return currentReview(since);
});

export const POST = handler(async (req, user) => {
  const b = await body<{ type: string; replace?: boolean }>(req);
  const res = await prepareReview(b.type, !!b.replace, user.email);
  await markDoneNearNow().catch(() => {}); // ביקורת שראש הישיבה ביקש — בוצעה
  return res;
});
