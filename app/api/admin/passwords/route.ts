import { body, handler, HttpError } from '@/lib/http';
import { setPassword } from '@/lib/auth';
import { audit } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req, user) => {
  const b = await body<{ role: string; password: string }>(req);
  if (b.role !== 'user' && b.role !== 'admin') throw new HttpError(400, 'סוג סיסמה לא תקין');
  try { await setPassword(b.role, String(b.password || ''), user.email); }
  catch (e) { throw new HttpError(400, e instanceof Error ? e.message : String(e)); }
  await audit(user.email, 'set-password', { role: b.role });
  return { ok: true };
}, { admin: true });
