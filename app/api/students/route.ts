import { handler } from '@/lib/http';
import { searchStudents } from '@/lib/reviews';
export const dynamic = 'force-dynamic';
export const GET = handler(async (req) => {
  const q = new URL(req.url).searchParams.get('q') || '';
  return q.trim().length < 2 ? [] : searchStudents(q);
});
