import { getSetting, setSetting } from './secure';

/*
 * וואטסאפ ישיר: ההודעות יוצאות מהמספר של מזכירות הגבוהה דרך החיבור של אפליקציית המזכירות
 * (mazkirut.vercel.app/api/wa/relay) — תור אחד, הפסקה של כמה שניות בין הודעות, מכסה יומית,
 * וכל הודעה אישית (פונה בשמו של כל אחד). אם החיבור לא זמין — חוזרים לפתיחת WhatsApp כמו קודם.
 */

export type WaRecipient = { name: string; phone: string; greet?: string };
export type WaGroup = { id: string; name: string };

const KEY = 'wa_recipients';
const GROUP_KEY = 'wa_group';
const DEFAULTS: WaRecipient[] = [{ name: 'הרב יצחק', phone: '' }, { name: 'הרב ניר אפרתי', phone: '' }];

/** 050-123-4567 / +972 50… → 972501234567 (הפורמט של wa.me); ריק אם לא נראה כמו מספר */
export function normalizePhone(p: string): string {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '972' + d.slice(1);
  return d.length >= 10 && d.length <= 15 ? d : '';
}

export async function waRecipients(): Promise<WaRecipient[]> {
  try {
    const v = JSON.parse(await getSetting(KEY) || 'null');
    if (Array.isArray(v)) return v.map((r) => ({ name: String(r.name || ''), phone: String(r.phone || ''), greet: String(r.greet || '') }));
  } catch {}
  return DEFAULTS;
}

export async function saveWaRecipients(list: WaRecipient[], by: string) {
  const clean = list.slice(0, 6)
    .map((r) => ({ name: String(r.name || '').trim().slice(0, 40), phone: String(r.phone || '').trim().slice(0, 20), greet: String(r.greet || '').trim().slice(0, 200) }))
    .filter((r) => r.name || r.phone);
  for (const r of clean) if (r.phone && !normalizePhone(r.phone)) throw new Error(`מספר הטלפון של ${r.name || 'אחד הנמענים'} לא תקין`);
  await setSetting(KEY, JSON.stringify(clean), by);
  return clean;
}

export async function waGroup(): Promise<WaGroup | null> {
  try { const g = JSON.parse(await getSetting(GROUP_KEY) || 'null'); return g?.id ? { id: String(g.id), name: String(g.name || '') } : null; } catch { return null; }
}
export async function saveWaGroup(g: WaGroup | null, by: string) {
  await setSetting(GROUP_KEY, JSON.stringify(g && g.id ? { id: g.id, name: g.name } : null), by);
}

/**
 * פתיחה אישית לכל נמען — כך הנוסח אף פעם לא זהה בין שתי הודעות.
 * אם נשמרה פתיחה בהגדרות היא קובעת ({n} = מספר הביקורת).
 */
export function greeting(r: WaRecipient, number: number): string {
  if (r.greet) return r.greet.replace(/\{n\}/g, String(number));
  if (/ניר/.test(r.name)) return `שלום הרב ניר, מה נשמע? שלחתי לך עכשיו את התוצאות של ביקורת #${number} — אפשר לראות הכול בקישור.`;
  if (/יצחק/.test(r.name)) return `שלום הרב, שלחתי לרב עכשיו את ביקורת #${number} שסגרתי.`;
  return `שלום ${r.name || ''}, שלחתי עכשיו את התוצאות של ביקורת #${number}.`.replace('שלום ,', 'שלום,');
}

/* ---------- החיבור לאפליקציית המזכירות ---------- */

const RELAY = process.env.WA_RELAY_URL || 'https://mazkirut.vercel.app/api/wa/relay';
export const waDirect = () => !!process.env.WA_RELAY_KEY;

async function relay(method: 'GET' | 'POST', body?: object, query = '') {
  if (!process.env.WA_RELAY_KEY) throw new Error('וואטסאפ ישיר לא מוגדר');
  const r = await fetch(RELAY + query, {
    method, cache: 'no-store',
    headers: { 'x-wa-key': process.env.WA_RELAY_KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(58000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `וואטסאפ ישיר: שגיאה ${r.status}`);
  return j;
}

/** הקבוצות שבהן נמצא המספר של מזכירות הגבוהה (לבחירה בהגדרות) */
export async function relayGroups(fresh = false): Promise<WaGroup[]> {
  return (await relay('GET', undefined, `?groups=1${fresh ? '&fresh=1' : ''}`)).groups || [];
}
export async function relaySend(to: { phone?: string; group?: string }, text: string, name: string) {
  return relay('POST', { to: to.phone, group: to.group, text, name });
}
