import { body, handler } from '@/lib/http';
import { markMany, markStatus } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, user, { params }) => {
  const id = Number((await params).id);
  const b = await body<{ studentId?: string; ids?: string[]; status: string }>(req);
  if (b.ids) return markMany(id, b.ids, b.status, user.email);
  return markStatus(id, String(b.studentId || ''), b.status, user.email);
});
