import { NextResponse } from 'next/server';
import { checkRoshToken, studentHistory } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };

// היסטוריית תלמיד במסך ראש הישיבה — צפייה בלבד, לפי הקישור הסודי
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!(await checkRoshToken(token))) return NextResponse.json({ error: 'הקישור אינו בתוקף' }, { status: 404 });
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'חסר תלמיד' }, { status: 400 });
  try {
    return NextResponse.json(await studentHistory(id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'שגיאה בטעינת הנתונים' }, { status: 500 });
  }
}
