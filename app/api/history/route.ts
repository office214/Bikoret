import { handler } from '@/lib/http';
import { history } from '@/lib/reviews';
export const dynamic = 'force-dynamic';
export const GET = handler(async () => history());
