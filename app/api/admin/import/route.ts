import { handler } from '@/lib/http';
import { importHistory } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = handler(async (_req, user) => importHistory(user.email), { admin: true });
