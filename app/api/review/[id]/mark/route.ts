import { body, handler } from '@/lib/http';
import { markMany, markNote, markStatus } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, user, { params }) => {
  const id = Number((await params).id);
  const b = await body<{ studentId?: string; ids?: string[]; status: string; note?: string }>(req);
  if (b.ids) return markMany(id, b.ids, b.status, user.email);
  if (b.note !== undefined) return markNote(id, b.studentId || '', b.note, user.email);
  return markStatus(id, String(b.studentId || ''), b.status, user.email);
});
