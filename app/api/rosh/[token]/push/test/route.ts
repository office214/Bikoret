import { NextResponse } from 'next/server';
import { checkRoshToken } from '@/lib/reviews';
import { sendPush } from '@/lib/push';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };

/** התראת בדיקה — רק לדפדפן ששלח את הבקשה */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!(await checkRoshToken(token))) return NextResponse.json({ error: 'הקישור אינו בתוקף' }, { status: 404 });
  const { endpoint } = await req.json().catch(() => ({ endpoint: '' }));
  if (!endpoint) return NextResponse.json({ error: 'הדפדפן לא רשום' }, { status: 400 });
  const r = await sendPush({ title: 'בדיקת התראות', body: 'ההתראות עובדות. כך תיראה התראה על ביקורת שנסגרה.', url: `/rosh/${token}`, tag: 'bikoret-test' }, String(endpoint));
  return NextResponse.json(r);
}
