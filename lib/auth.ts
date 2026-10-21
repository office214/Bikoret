import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { config } from './config';
import { db } from './db';
import { getSetting, setSetting } from './secure';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = 'bk_session';
// עוגיית סשן (בלי maxAge) נמחקת כשסוגרים את הדפדפן; ה-JWT עצמו פג אחרי 14 שעות לכל המקרים
const SESSION_HOURS = 14;

export type Role = 'user' | 'admin';
export type User = { email: string; name: string; admin: boolean };

function secret() {
  if (!config.authSecret) throw new Error('AUTH_SECRET לא מוגדר');
  return new TextEncoder().encode(config.authSecret);
}

/* ---------- כניסת Google (גיבוי למנהלים בלבד) ---------- */

export function isAllowed(email: string): boolean {
  const e = email.toLowerCase();
  if (config.allowedEmails.includes(e) || config.adminEmails.includes(e)) return true;
  return !!config.allowedDomain && e.endsWith('@' + config.allowedDomain);
}

export function isAdmin(email: string): boolean {
  return config.adminEmails.includes(email.toLowerCase());
}

/* ---------- סיסמאות ---------- */

const PW_KEY: Record<Role, string> = { user: 'password_user', admin: 'password_admin' };

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 32);
  return `${salt.toString('base64')}.${hash.toString('base64')}`;
}

async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split('.');
  if (!salt || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), want.length);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** טביעה קצרה של הסיסמה — כשהסיסמה משתנה, כל הכניסות הקיימות מתבטלות */
const fingerprint = (stored: string) => createHash('sha256').update(stored).digest('base64url').slice(0, 10);

const g = globalThis as unknown as { __pwCache?: { at: number; v: Record<Role, string> } };
async function storedPasswords(): Promise<Record<Role, string>> {
  if (g.__pwCache && Date.now() - g.__pwCache.at < 30_000) return g.__pwCache.v;
  const v = { user: await getSetting(PW_KEY.user), admin: await getSetting(PW_KEY.admin) };
  g.__pwCache = { at: Date.now(), v };
  return v;
}

export async function passwordsStatus() {
  const p = await storedPasswords();
  return { user: !!p.user, admin: !!p.admin };
}

export async function setPassword(role: Role, pw: string, by: string) {
  if (pw.length < 6) throw new Error('הסיסמה צריכה להיות לפחות 6 תווים');
  await setSetting(PW_KEY[role], await hashPassword(pw), by);
  g.__pwCache = undefined;
}

/** בודק סיסמה ומחזיר את התפקיד שלה. סיסמת מנהל נותנת גם הרשאות משתמש. */
export async function verifyLogin(pw: string): Promise<Role | null> {
  const p = await storedPasswords();
  if (p.admin && (await checkPassword(pw, p.admin))) return 'admin';
  if (p.user && (await checkPassword(pw, p.user))) return 'user';
  return null;
}

/* ---------- הגבלת ניסיונות כניסה ---------- */

export async function tooManyAttempts(ip: string): Promise<boolean> {
  const sql = await db();
  await sql`create table if not exists login_attempts (ip text not null, at timestamptz not null default now(), ok boolean not null)`;
  const [r] = await sql`select count(*)::int as n from login_attempts where ip = ${ip} and not ok and at > now() - interval '15 minutes'`;
  return r.n >= 8;
}

export async function recordAttempt(ip: string, ok: boolean) {
  const sql = await db();
  await sql`insert into login_attempts (ip, ok) values (${ip}, ${ok})`;
  await sql`delete from login_attempts where at < now() - interval '1 day'`;
}

/* ---------- סשן ---------- */

export async function createSession(name: string, role: Role, via: 'password' | 'google' = 'password'): Promise<string> {
  const p = await storedPasswords();
  const fp = via === 'password' ? fingerprint(p[role]) : '';
  return new SignJWT({ name, role, via, fp })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

/** המשתמש המחובר, או null */
export async function getUser(): Promise<User | null> {
  if (config.devAuthEmail) return { email: config.devAuthEmail, name: 'מפתח', admin: true };
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const role = payload.role === 'admin' ? 'admin' : payload.role === 'user' ? 'user' : null;
    if (!role) return null;
    const name = String(payload.name || '').slice(0, 60);
    if (payload.via === 'password') {
      const stored = (await storedPasswords())[role];
      if (!stored || payload.fp !== fingerprint(stored)) return null;
    } else if (payload.via === 'google') {
      if (!isAdmin(name)) return null;
    } else {
      return null;
    }
    return { email: name, name, admin: role === 'admin' };
  } catch {
    return null;
  }
}
