import { config } from './config';
import { getSetting, setSetting } from './secure';

/* ---------- הגדרות 019 — משתני סביבה, או הגדרה מוצפנת מתוך האפליקציה ---------- */

export type SmsSettings = { token: string; username: string; source: string; adminPhone: string };
const KEYS: Record<keyof SmsSettings, [string, string]> = {
  token: ['SMS019_TOKEN', 'sms_token'],
  username: ['SMS019_USERNAME', 'sms_username'],
  source: ['SMS019_SOURCE', 'sms_source'],
  adminPhone: ['ADMIN_REPORT_PHONE', 'sms_admin_phone'],
};

export async function smsSettings(): Promise<SmsSettings & { fromEnv: Record<string, boolean> }> {
  const out = { fromEnv: {} as Record<string, boolean> } as SmsSettings & { fromEnv: Record<string, boolean> };
  for (const [k, [env, db]] of Object.entries(KEYS) as [keyof SmsSettings, [string, string]][]) {
    const v = process.env[env];
    out.fromEnv[k] = !!v;
    out[k] = v || (await getSetting(db));
  }
  return out;
}

export async function saveSmsSettings(s: Partial<SmsSettings>, by: string) {
  for (const [k, [, db]] of Object.entries(KEYS) as [keyof SmsSettings, [string, string]][]) {
    const v = String(s[k] || '').trim();
    if (v) await setSetting(db, v, by);
  }
}

/* ---------- טקסטים (זהים לסקריפט הקיים) ---------- */

export type SmsKind = 'start' | 'noanswer';

export function smsText(kind: SmsKind, lang: string, type: string, time: string): string {
  const en = /^(EN|ENG|ENGLISH)$/i.test(lang.trim());
  if (type.startsWith('חיצונית')) {
    return en
      ? 'OFFICIAL ATTENDANCE CHECK!\nAn official inspection is taking place at the yeshiva now.\nEveryone must arrive immediately with an official ID.\nYeshiva Administration'
      : '!!!ביקורת אמת!!!\nכעת מתקיימת ביקורת אמת בישיבה.\nעל כולם להגיע לישיבה מיד עם תעודות מזהות!\nבברכה,\nהנהלת הישיבה';
  }
  if (kind === 'start') {
    return en
      ? 'An internal attendance check is taking place now. Please come to the Beit Midrash.\nIf you cannot come, reply whether you are on campus or off campus.\nNo reply will be considered an absence.\nYeshiva Administration'
      : 'כעת מתקיימת ביקורת פנימית. עליך להגיע לבית המדרש.\nאם אתה לא יכול להגיע ענה להודעה זו אם אתה בישוב או מחוץ לישוב.\nחוסר מענה יחשב כהעדרות.\nמזכירות הישיבה';
  }
  return en
    ? `During the internal attendance check, I did not see you in the Beit Midrash.\nPlease reply whether you were in the Beit Midrash / on campus / off campus at the time of the check (${time}).\nNo reply will be considered an absence.\nYeshiva Administration`
    : `במהלך הביקורת הפנימית לא ראיתי אותך בביהמ"ד.\nציין בהודעה חוזרת אם היית בבית המדרש/בישוב/מחוץ לישוב במהלך הביקורת (${time}).\nחוסר מענה יחשב כהעדרות.\nמזכירות הישיבה`;
}

export function toInternational972(phone: string): string {
  let p = String(phone || '').trim().replace(/[^\d+]/g, '');
  if (p.startsWith('+972')) p = p.slice(1);
  if (p.startsWith('972')) return p.replace(/\D/g, '');
  p = p.replace(/\D/g, '');
  if (p.startsWith('05') && p.length === 10) return '972' + p.slice(1);
  if (p.startsWith('5') && p.length === 9) return '972' + p;
  return p;
}

export function validMobile(p972: string) {
  return /^9725\d{8}$/.test(p972);
}

/* ---------- שליחה דרך 019 — כמה נמענים בבקשה אחת ---------- */

export async function send019(s: SmsSettings, phones: string[], message: string): Promise<void> {
  if (!s.token || !s.username || !s.source) throw new Error('הגדרות SMS חסרות (טוקן / שם משתמש / שולח)');
  if (config.smsDryRun) return;
  const res = await fetch('https://019sms.co.il/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8', Authorization: `Bearer ${s.token}` },
    body: JSON.stringify({ sms: { user: { username: s.username }, source: s.source, destinations: { phone: phones }, message } }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`019 HTTP ${res.status}: ${body.slice(0, 200)}`);
  let st: number | null = null;
  let msg = body;
  try {
    const j = JSON.parse(body);
    const root = j.sms ?? j;
    if (root.status !== undefined) { st = parseInt(root.status, 10); msg = root.message || body; }
  } catch {
    const m = body.match(/<status>\s*(-?\d+)\s*<\/status>/i);
    const mm = body.match(/<message>\s*([\s\S]*?)\s*<\/message>/i);
    if (m) st = parseInt(m[1], 10);
    if (mm) msg = mm[1].trim();
  }
  if (st !== null && st !== 0) throw new Error(`019 (status ${st}): ${String(msg).slice(0, 200)}`);
}

export async function adminReport(text: string) {
  try {
    const s = await smsSettings();
    if (!s.adminPhone) return;
    await send019(s, [toInternational972(s.adminPhone)], text);
  } catch (e) {
    console.error('admin report failed', e);
  }
}
