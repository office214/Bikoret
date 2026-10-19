import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { config } from './config';

export const SESSION_COOKIE = 'bk_session';
const SESSION_DAYS = 30;

export type User = { email: string; name: string; admin: boolean };

function secret() {
  if (!config.authSecret) throw new Error('AUTH_SECRET לא מוגדר');
  return new TextEncoder().encode(config.authSecret);
}

export function isAllowed(email: string): boolean {
  const e = email.toLowerCase();
  if (config.allowedEmails.includes(e) || config.adminEmails.includes(e)) return true;
  return !!config.allowedDomain && e.endsWith('@' + config.allowedDomain);
}

export function isAdmin(email: string): boolean {
  return config.adminEmails.includes(email.toLowerCase());
}

export async function createSession(email: string, name: string): Promise<string> {
  return new SignJWT({ email, name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DAYS * 24 * 3600,
};

/** המשתמש המחובר, או null */
export async function getUser(): Promise<User | null> {
  if (config.devAuthEmail) return { email: config.devAuthEmail, name: 'מפתח', admin: true };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const email = String(payload.email || '');
    if (!email || !isAllowed(email)) return null;
    return { email, name: String(payload.name || email), admin: isAdmin(email) };
  } catch {
    return null;
  }
}
