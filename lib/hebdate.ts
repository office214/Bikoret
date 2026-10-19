import { config } from './config';

export function gematria(n: number): string {
  let out = '';
  for (const [v, l] of [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק']] as const) {
    while (n >= v) { out += l; n -= v; }
  }
  if (n === 15) return out + 'טו';
  if (n === 16) return out + 'טז';
  return out + ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'][Math.floor(n / 10)] + ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'][n % 10];
}

/** תאריך עברי קצר, כמו בגיליון: "כג תשרי פז" */
export function hebrewDateShort(d = new Date()): string {
  const parts = new Intl.DateTimeFormat('he-u-ca-hebrew', {
    timeZone: config.timeZone, day: 'numeric', month: 'long', year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => (parts.find((p) => p.type === t)?.value || '').replace(/[״׳"']/g, '').trim();
  let day = get('day');
  let year = get('year');
  if (/^\d+$/.test(day)) day = gematria(Number(day));
  if (/^\d+$/.test(year)) year = gematria(Number(year) % 1000);
  const month = get('month').replace(/^ב(?=[א-ת])/, '').replace(/\s+/g, '');
  return `${day} ${month} ${year.slice(-2)}`;
}

export function timeHHmm(d = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}

/**
 * בוקר: 08:30–14:00, צהריים: 14:00–17:30 (שעון ישראל).
 * מחוץ לשעות האלה — לפי הקרוב: לפני 14:00 בוקר, אחרי 14:00 צהריים.
 */
export function autoSession(d = new Date()): 'בוקר' | 'צהריים' {
  const [h, m] = timeHHmm(d).split(':').map(Number);
  return h * 60 + m < 14 * 60 ? 'בוקר' : 'צהריים';
}
