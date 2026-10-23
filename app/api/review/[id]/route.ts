import { body, handler } from '@/lib/http';
import { discardReview, saveMeta } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler<Ctx>(async (req, user, { params }) => {
  const { resync, ...meta } = await body<{ date_heb?: string; time?: string; type?: string; resync?: 'apply' | 'skip' }>(req);
  return saveMeta(Number((await params).id), meta, resync === 'apply' || resync === 'skip' ? resync : undefined, user.email);
});

export const DELETE = handler<Ctx>(async (_req, user, { params }) => {
  await discardReview(Number((await params).id), user.email);
  return { ok: true };
});
