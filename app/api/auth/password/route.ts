import { NextResponse } from 'next/server';
import { createSession, recordAttempt, SESSION_COOKIE, sessionCookieOptions, tooManyAttempts, verifyLogin } from '@/lib/auth';
import { audit } from '@/lib/db';

export const dynamic = 'force-dynamic';

const back = (req: Request, error: string) => NextResponse.redirect(new URL(`/login?error=${error}`, req.url), 303);

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const name = String(form?.get('name') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const password = String(form?.get('password') || '');
  if (!name) return back(req, 'name');
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (await tooManyAttempts(ip)) return back(req, 'locked');
  const role = password ? await verifyLogin(password) : null;
  await recordAttempt(ip, !!role);
  if (!role) return back(req, 'password');
  await audit(name, 'login', { role });
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSession(name, role), sessionCookieOptions);
  return res;
}
