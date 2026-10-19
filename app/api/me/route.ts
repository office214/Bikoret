import { handler } from '@/lib/http';
export const dynamic = 'force-dynamic';
export const GET = handler(async (_req, user) => user);
