import { body, handler } from '@/lib/http';
import { discardReview, updateMeta } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler<Ctx>(async (req, _user, { params }) => {
  const b = await body<{ date_heb?: string; time?: string; type?: string }>(req);
  await updateMeta(Number((await params).id), b);
  return { ok: true };
});

export const DELETE = handler<Ctx>(async (_req, user, { params }) => {
  await discardReview(Number((await params).id), user.email);
  return { ok: true };
});
