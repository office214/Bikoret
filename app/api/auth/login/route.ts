import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { authorizeUrl, googleConfigured, redirectUri } from '@/lib/google';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL('/login?error=setup', req.url));
  }
  const connect = new URL(req.url).searchParams.get('connect') === '1';
  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(authorizeUrl(redirectUri(req), state, connect));
  res.cookies.set('bk_oauth', `${state}:${connect ? 1 : 0}`, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600,
  });
  return res;
}
