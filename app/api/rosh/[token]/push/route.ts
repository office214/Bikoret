import { NextResponse } from 'next/server';
import { checkRoshToken } from '@/lib/reviews';
import { pushPublicKey, removeSub, saveSub } from '@/lib/push';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };

const nope = () => NextResponse.json({ error: 'הקישור אינו בתוקף' }, { status: 404 });

/** המפתח הציבורי להרשמה */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await checkRoshToken((await params).token))) return nope();
  return NextResponse.json({ publicKey: await pushPublicKey() });
}

/** רישום הדפדפן הזה לקבלת התראות */
export async function POST(req: Request, { params }: Ctx) {
  if (!(await checkRoshToken((await params).token))) return nope();
  try {
    const { sub } = await req.json();
    await saveSub('rosh', sub, req.headers.get('user-agent') || '');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 400 });
  }
}

/** ביטול ההתראות בדפדפן הזה */
export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await checkRoshToken((await params).token))) return nope();
  const { endpoint } = await req.json().catch(() => ({ endpoint: '' }));
  if (endpoint) await removeSub('rosh', String(endpoint));
  return NextResponse.json({ ok: true });
}
