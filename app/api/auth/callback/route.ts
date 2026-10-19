import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSession, isAdmin, isAllowed, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';
import { exchangeCode, idTokenClaims, redirectUri, saveSheetsConnection, SHEETS_SCOPE } from '@/lib/google';
import { config } from '@/lib/config';
import { audit } from '@/lib/db';

export const dynamic = 'force-dynamic';

function fail(req: Request, code: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${code}`, req.url));
  res.cookies.delete('bk_oauth');
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const [state, connectFlag] = (jar.get('bk_oauth')?.value || '').split(':');
  if (!state || state !== url.searchParams.get('state')) return fail(req, 'state');
  const code = url.searchParams.get('code');
  if (!code) return fail(req, 'denied');

  try {
    const tok = await exchangeCode(code, redirectUri(req));
    if (!tok.id_token) return fail(req, 'token');
    const claims = idTokenClaims(tok.id_token);
    if (claims.aud !== config.google.clientId || !/accounts\.google\.com$/.test(claims.iss) || !claims.email_verified) {
      return fail(req, 'token');
    }
    const email = claims.email.toLowerCase();
    if (!isAllowed(email)) return fail(req, 'forbidden');

    let dest = '/';
    if (connectFlag === '1') {
      if (!isAdmin(email)) return fail(req, 'admin');
      if (!tok.refresh_token || !(tok.scope || '').includes(SHEETS_SCOPE)) return fail(req, 'scope');
      await saveSheetsConnection(tok.refresh_token, email);
      await audit(email, 'connect-sheets');
      dest = '/?tab=admin&connected=1';
    }

    const res = NextResponse.redirect(new URL(dest, req.url));
    res.cookies.set(SESSION_COOKIE, await createSession(email, claims.name || email), sessionCookieOptions);
    res.cookies.delete('bk_oauth');
    return res;
  } catch (e) {
    console.error(e);
    return fail(req, 'token');
  }
}
