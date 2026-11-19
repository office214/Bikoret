import { getSetting, setSetting } from './secure';

/* מי מקבל עדכון בוואטסאפ אחרי סגירת ביקורת (שם + טלפון). נשמר מוצפן בהגדרות */

export type WaRecipient = { name: string; phone: string };

const KEY = 'wa_recipients';
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
    if (Array.isArray(v)) return v.map((r) => ({ name: String(r.name || ''), phone: String(r.phone || '') }));
  } catch {}
  return DEFAULTS;
}

export async function saveWaRecipients(list: WaRecipient[], by: string) {
  const clean = list.slice(0, 6)
    .map((r) => ({ name: String(r.name || '').trim().slice(0, 40), phone: String(r.phone || '').trim().slice(0, 20) }))
    .filter((r) => r.name || r.phone);
  for (const r of clean) if (r.phone && !normalizePhone(r.phone)) throw new Error(`מספר הטלפון של ${r.name || 'אחד הנמענים'} לא תקין`);
  await setSetting(KEY, JSON.stringify(clean), by);
  return clean;
}
