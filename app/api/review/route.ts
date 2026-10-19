import { body, handler } from '@/lib/http';
import { currentReview, prepareReview } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const GET = handler(async (req) => {
  const since = new URL(req.url).searchParams.get('since') || undefined;
  return currentReview(since);
});

export const POST = handler(async (req, user) => {
  const b = await body<{ type: string; replace?: boolean }>(req);
  return prepareReview(b.type, !!b.replace, user.email);
});
