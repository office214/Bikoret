import { body, handler } from '@/lib/http';
import { closeReview } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, user, { params }) => {
  const b = await body<{ date_heb?: string; time?: string; type?: string }>(req);
  return closeReview(Number((await params).id), b, user.email);
});
