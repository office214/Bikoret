import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { config } from './config';
import { db } from './db';

// הצפנת ערכים רגישים שנשמרים במסד (טוקן 019, טוקן גישה לגוגל)
function key() {
  if (!config.authSecret) throw new Error('AUTH_SECRET לא מוגדר');
  return createHash('sha256').update(`${config.authSecret}:settings`).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(blob: string): string {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

export async function getSetting(name: string): Promise<string> {
  const sql = await db();
  const [row] = await sql`select value from app_settings where key = ${name}`;
  if (!row) return '';
  try { return decrypt(row.value); } catch { return ''; }
}

export async function setSetting(name: string, value: string, by: string) {
  const sql = await db();
  const enc = encrypt(value);
  await sql`
    insert into app_settings (key, value, updated_by) values (${name}, ${enc}, ${by})
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
}

export async function deleteSetting(name: string) {
  const sql = await db();
  await sql`delete from app_settings where key = ${name}`;
}
