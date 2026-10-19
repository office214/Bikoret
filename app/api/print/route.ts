import { handler } from '@/lib/http';
import { printData } from '@/lib/reviews';
export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  const u = new URL(req.url).searchParams;
  return printData(u.get('kind') || 'all', Number(u.get('count') || 3));
});
