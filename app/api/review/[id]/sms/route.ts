import { body, handler, HttpError } from '@/lib/http';
import { sendReviewSms } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, user, { params }) => {
  const b = await body<{ kind: string; force?: boolean }>(req);
  if (b.kind !== 'start' && b.kind !== 'noanswer') throw new HttpError(400, 'סוג הודעה לא תקין');
  return sendReviewSms(Number((await params).id), b.kind, !!b.force, user.email);
});
