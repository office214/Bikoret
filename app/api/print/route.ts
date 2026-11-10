import { handler } from '@/lib/http';
import { printData } from '@/lib/reviews';
export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  const u = new URL(req.url).searchParams;
  const c = u.get('count') || '3';
  return printData(u.get('kind') || 'all', c === 'zman' ? 'zman' : Number(c) || 3);
});
