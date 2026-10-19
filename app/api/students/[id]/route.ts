import { handler } from '@/lib/http';
import { studentHistory } from '@/lib/reviews';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export const GET = handler<Ctx>(async (_req, _u, { params }) => studentHistory((await params).id));
