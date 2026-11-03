import { NextResponse } from 'next/server';
import { checkRoshToken, roshData } from '@/lib/reviews';
import { sendDueReminders } from '@/lib/requests';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };

// מסך ראש הישיבה — צפייה בלבד, לפי הקישור הסודי (בלי התחברות)
export async function GET(req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!(await checkRoshToken(token))) return NextResponse.json({ error: 'הקישור אינו בתוקף' }, { status: 404 });
  try {
    // המסך של ראש הישיבה מתרענן כל שתי דקות — הזדמנות לשלוח תזכורות שהגיע זמנן
    await sendDueReminders().catch(() => 0);
    const n = new URL(req.url).searchParams.get('n') || '3';
    const data = await roshData(n === 'zman' ? 'zman' : Number(n) || 3);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'שגיאה בטעינת הנתונים' }, { status: 500 });
  }
}
