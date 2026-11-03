import webpush from 'web-push';
import { config } from './config';
import { db } from './db';
import { getSetting, setSetting } from './secure';

/*
 * התראות לראש הישיבה (Web Push): הדפדפן במחשב שלו נרשם פעם אחת, וכשסוגרים ביקורת
 * (ומאשרים) נשלחת התראה שנשארת על המסך עד שסוגרים אותה (requireInteraction).
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

export async function saveSub(sub: Sub, ua: string) {
  if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('הרשמה לא תקינה');
  const sql = await db();
  await sql`
    insert into push_subs (endpoint, p256dh, auth, ua) values (${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth}, ${ua.slice(0, 200)})
    on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua`;
}

export async function removeSub(endpoint: string) {
  const sql = await db();
  await sql`delete from push_subs where endpoint = ${endpoint}`;
}

export async function pushDevices(): Promise<number> {
  const sql = await db();
  const [{ n }] = await sql`select count(*)::int as n from push_subs`;
  return n;
}

export type PushMsg = { title: string; body: string; url: string; tag?: string };

/** שולח לכל המכשירים הרשומים (או לאחד בלבד); מוחק הרשמות שפג תוקפן */
export async function sendPush(msg: PushMsg, onlyEndpoint?: string) {
  await vapid();
  const sql = await db();
  const subs = onlyEndpoint
    ? await sql`select endpoint, p256dh, auth from push_subs where endpoint = ${onlyEndpoint}`
    : await sql`select endpoint, p256dh, auth from push_subs`;
  let sent = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 24 * 3, urgency: 'high' });
      sent++;
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await removeSub(s.endpoint); // המכשיר ביטל / ההרשמה פגה
      else console.error('push failed', code, (e as Error).message);
    }
  }));
  return { sent, failed, devices: subs.length };
}
