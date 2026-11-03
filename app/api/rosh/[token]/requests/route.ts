import { NextResponse } from 'next/server';
import { checkRoshToken } from '@/lib/reviews';
import { activeRequests, roshAccept, roshCancel, roshCreate, roshRepropose } from '@/lib/requests';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };

const nope = () => NextResponse.json({ error: 'הקישור אינו בתוקף' }, { status: 404 });
const ok = (d: unknown) => NextResponse.json(d, { headers: { 'Cache-Control': 'no-store' } });

/** הבקשות של ראש הישיבה לבצע ביקורת */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await checkRoshToken((await params).token))) return nope();
  return ok({ requests: await activeRequests() });
}

/** בקשה חדשה / אישור הצעה / מועד אחר / ביטול */
export async function POST(req: Request, { params }: Ctx) {
  if (!(await checkRoshToken((await params).token))) return nope();
  try {
    const b = await req.json();
    const id = Number(b.id);
    if (b.action === 'create') return ok({ request: await roshCreate(String(b.date), String(b.time), String(b.note || '')) });
    if (b.action === 'accept') return ok({ request: await roshAccept(id) });
    if (b.action === 'repropose') return ok({ request: await roshRepropose(id, String(b.date), String(b.time), b.note === undefined ? undefined : String(b.note)) });
    if (b.action === 'cancel') return ok({ request: await roshCancel(id) });
    return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה' }, { status: 400 });
  }
}
