import { NextResponse } from 'next/server';
import { sendDueReminders } from '@/lib/requests';

export const dynamic = 'force-dynamic';

/*
 * בדיקה תקופתית של תזכורות (נקראת מבחוץ כל כמה דקות, וגם בכל טעינה של האפליקציה).
 * אין כאן מידע ואין פעולה מסוכנת: רק שולח תזכורות שהגיע זמנן, וכל אחת פעם אחת בלבד.
 */
export async function GET() {
  try {
    return NextResponse.json({ sent: await sendDueReminders(true) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 });
  }
}
