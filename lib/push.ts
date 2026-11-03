import webpush from 'web-push';
import { config } from './config';
import { db } from './db';
import { getSetting, setSetting } from './secure';

/*
 * התראות (Web Push): המחשב של ראש הישיבה (ביקורת נסגרה, תשובות לבקשות) והטלפון של
 * המזכירות (בקשות מראש הישיבה ותזכורות). כל מכשיר נרשם פעם אחת.
 * מפתחות ה-VAPID נוצרים אוטומטית בפעם הראשונה ונשמרים מוצפנים בהגדרות.
 */

async function vapid() {
  let pub = await getSetting('vapid_public');
  let priv = await getSetting('vapid_private');
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey; priv = k.privateKey;
    await setSetting('vapid_public', pub, 'system');
    await setSetting('vapid_private', priv, 'system');
  }
  webpush.setVapidDetails(`mailto:${config.adminEmails[0] || 'admin@example.com'}`, pub, priv);
  return pub;
}

export const pushPublicKey = () => vapid();

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
/** rosh = המחשב של ראש הישיבה; admin = הטלפון של המזכירות */
export type PushRole = 'rosh' | 'admin';

export async function saveSub(role: PushRole, sub: Sub, ua: string) {
  if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('הרשמה לא תקינה');
  const sql = await db();
  await sql`
    insert into push_devices (endpoint, role, p256dh, auth, ua) values (${sub.endpoint}, ${role}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${ua.slice(0, 200)})
    on conflict (endpoint, role) do update set p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua`;
}

export async function removeSub(role: PushRole, endpoint: string) {
  const sql = await db();
  await sql`delete from push_devices where endpoint = ${endpoint} and role = ${role}`;
}

export async function pushDevices(role: PushRole): Promise<number> {
  const sql = await db();
  const [{ n }] = await sql`select count(*)::int as n from push_devices where role = ${role}`;
  return n;
}

export type PushMsg = { title: string; body: string; url: string; tag?: string; sticky?: boolean };

/** שולח לכל המכשירים של התפקיד (או לאחד בלבד); מוחק הרשמות שפג תוקפן */
export async function sendPush(role: PushRole, msg: PushMsg, onlyEndpoint?: string) {
  await vapid();
  const sql = await db();
  const subs = onlyEndpoint
    ? await sql`select endpoint, p256dh, auth from push_devices where role = ${role} and endpoint = ${onlyEndpoint}`
    : await sql`select endpoint, p256dh, auth from push_devices where role = ${role}`;
  let sent = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 24 * 3, urgency: 'high' });
      sent++;
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sql`delete from push_devices where endpoint = ${s.endpoint}`; // המכשיר ביטל / ההרשמה פגה
      else console.error('push failed', code, (e as Error).message);
    }
  }));
  return { sent, failed, devices: subs.length };
}

/** שליחה שלא מפילה את הפעולה אם נכשלה */
export async function trySendPush(role: PushRole, msg: PushMsg) {
  try { return await sendPush(role, msg); } catch (e) { console.error('push', e); return { sent: 0, failed: 0, devices: 0 }; }
}
