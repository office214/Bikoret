import { handler } from '@/lib/http';
import { deleteClosedReview, reviewDetail } from '@/lib/reviews';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export const GET = handler<Ctx>(async (_req, _u, { params }) => reviewDetail(Number((await params).id)));
export const DELETE = handler<Ctx>(async (_req, user, { params }) => deleteClosedReview(Number((await params).id), user.email), { admin: true });
