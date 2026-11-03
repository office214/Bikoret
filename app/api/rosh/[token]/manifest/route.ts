import { NextResponse } from 'next/server';
import { checkRoshToken } from '@/lib/reviews';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ token: string }> };

// "הוספה למסך הבית" של מסך ראש הישיבה — נפתח ישר לקישור שלו
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!(await checkRoshToken(token))) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({
    name: 'ביקורות — ראש הישיבה', short_name: 'ביקורות', lang: 'he', dir: 'rtl',
    start_url: `/rosh/${token}`, scope: `/rosh/${token}`, display: 'standalone',
    background_color: '#ffffff', theme_color: '#1e3a5f',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' } });
}
