import { hebrewDateShort } from './hebdate';

/*
 * זמנים בישיבה (לפי התאריך העברי שכתוב על הביקורת):
 *   חורף — א' מרחשון עד סוף אדר (בשנה מעוברת — סוף אדר ב')
 *   קיץ  — א' אייר עד ט' באב
 *   אלול — א' אלול עד יום כיפור (י' תשרי של השנה הבאה)
 * מה שבין לבין (ניסן, י' אב–כט' אב, י"א תשרי–כט' תשרי) — בין הזמנים.
 */

type Month = 'tishrei' | 'heshvan' | 'kislev' | 'tevet' | 'shevat' | 'adar' | 'adar1' | 'adar2'
  | 'nisan' | 'iyar' | 'sivan' | 'tamuz' | 'av' | 'elul';
export type HebDate = { day: number; month: Month; year: number | null }; // year = שתי הספרות האחרונות (פז = 87)
export type ZmanKind = 'winter' | 'summer' | 'elul';
export type Zman = { kind: ZmanKind; year: number };

const LETTERS: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50,
  ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90, ק: 100, ר: 200, ש: 300, ת: 400,
};
const gematria = (s: string) => [...s].reduce((n, ch) => n + (LETTERS[ch] || 0), 0);

const MONTHS: [RegExp, Month][] = [
  [/^תשרי$/, 'tishrei'], [/^(מר)?חשו?ון$/, 'heshvan'], [/^כסלו$/, 'kislev'], [/^טבת$/, 'tevet'], [/^שבט$/, 'shevat'],
  [/^אדר(א|ראשון)$/, 'adar1'], [/^אדר(ב|שני)$/, 'adar2'], [/^אדר$/, 'adar'], [/^ניסן$/, 'nisan'], [/^אייר$/, 'iyar'],
  [/^סיו?ון$/, 'sivan'], [/^תמוז$/, 'tamuz'], [/^אב$/, 'av'], [/^אלול$/, 'elul'],
];

/** מפרק תאריך עברי כמו "כח תמוז פו", "ב אדר ב פד", "ה תמוז התשעח", "ג טבת" (בלי שנה) */
export function parseHebDate(text: string): HebDate | null {
  const tokens = String(text || '').replace(/[״׳"'`]/g, '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const day = gematria(tokens[0]);
  if (!day || day > 30) return null;
  // השנה — הטוקן האחרון, אם הוא לא חלק משם החודש
  for (const yearTokens of [1, 0]) {
    const monthPart = tokens.slice(1, tokens.length - yearTokens).join('');
    const month = MONTHS.find(([re]) => re.test(monthPart))?.[1];
    if (!month) continue;
    if (!yearTokens) return { day, month, year: null };
    const y = tokens[tokens.length - 1].replace(/^ה(?=ת)/, ''); // "התשעח" ← "תשעח"
    const n = gematria(y);
    return { day, month, year: n ? n % 100 : null };
  }
  return null;
}

/** לאיזה זמן שייך התאריך (או null — בין הזמנים / שנה לא ידועה) */
export function zmanOf(d: HebDate): Zman | null {
  if (d.year === null) return null;
  const { day, month, year } = d;
  if (['heshvan', 'kislev', 'tevet', 'shevat', 'adar', 'adar1', 'adar2'].includes(month)) return { kind: 'winter', year };
  if (month === 'iyar' || month === 'sivan' || month === 'tamuz' || (month === 'av' && day <= 9)) return { kind: 'summer', year };
  if (month === 'elul') return { kind: 'elul', year };
  if (month === 'tishrei' && day <= 10) return { kind: 'elul', year: (year + 99) % 100 }; // אלול של השנה הקודמת
  return null;
}

export const sameZman = (a: Zman | null, b: Zman | null) => !!a && !!b && a.kind === b.kind && a.year === b.year;

/** הזמן הנוכחי; בבין הזמנים — הזמן האחרון שהסתיים */
export function currentZman(now = new Date()): Zman | null {
  for (let i = 0; i < 120; i++) {
    const d = parseHebDate(hebrewDateShort(new Date(now.getTime() - i * 86400000)));
    const z = d && zmanOf(d);
    if (z) return z;
  }
  return null;
}

const NAMES: Record<ZmanKind, string> = { winter: 'זמן חורף', summer: 'זמן קיץ', elul: 'זמן אלול' };
const YEAR_LETTERS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];

/** "זמן חורף תשפ״ז" */
export function zmanLabel(z: Zman): string {
  const tens = TENS[Math.floor(z.year / 10)], ones = YEAR_LETTERS[z.year % 10];
  const y = 'תש' + tens + ones; // התאריכים כאן בשנות ה-תש"ף ואילך
  return `${NAMES[z.kind]} ${y.slice(0, -1)}״${y.slice(-1)}`;
}
