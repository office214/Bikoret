import { handler } from '@/lib/http';
import { reviewDetail } from '@/lib/reviews';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export const GET = handler<Ctx>(async (_req, _u, { params }) => reviewDetail(Number((await params).id)));
