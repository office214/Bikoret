/*
 * לוח עברי — חישובים בלבד (בלי תלות בשרת), משמש גם בדפדפן וגם בשרת.
 * תאריך "אזרחי" מיוצג כמחרוזת YYYY-MM-DD; השעה תמיד לפי שעון ישראל.
 */

export const TZ = 'Asia/Jerusalem';

/** מספר באותיות עבריות עם גרש/גרשיים: 1 → א׳, 15 → ט״ו, 787 → תשפ״ז */
export function hebNum(n: number): string {
  let out = '';
  for (const [v, l] of [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק']] as const) {
    while (n >= v) { out += l; n -= v; }
  }
  if (n === 15) out += 'טו';
  else if (n === 16) out += 'טז';
  else out += ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'][Math.floor(n / 10)] + ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'][n % 10];
  return out.length === 1 ? out + '׳' : out.slice(0, -1) + '״' + out.slice(-1);
}

export const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

const pad = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DD → Date בצהריים UTC (כך שאזורי זמן לא מזיזים את היום) */
export const ymdToDate = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
export const dateToYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (ymd: string, n: number) => dateToYmd(new Date(ymdToDate(ymd).getTime() + n * 86400000));

/** היום ושעת עכשיו לפי שעון ישראל */
export function nowIL(d = new Date()): { ymd: string; hhmm: string } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return { ymd: `${g('year')}-${g('month')}-${g('day')}`, hhmm: `${g('hour')}:${g('minute')}` };
}

const numFmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('he-u-ca-hebrew', { timeZone: 'UTC', month: 'long' });

/** היום, החודש והשנה העבריים של תאריך אזרחי */
export function heb(ymd: string): { day: number; monthKey: string; month: string; year: number } {
  const d = ymdToDate(ymd);
  const p = numFmt.formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return { day: Number(g('day')), monthKey: `${g('year')}-${g('month')}`, month: monthFmt.format(d), year: Number(g('year')) };
}

export type MonthGrid = { title: string; first: string; last: string; days: { ymd: string; day: number; weekday: number; greg: string }[] };

/** כל ימי החודש העברי שהתאריך נמצא בו */
export function hebMonth(ymd: string): MonthGrid {
  let first = ymd;
  for (let i = heb(ymd).day; i > 1; i--) first = addDays(first, -1);
  const h = heb(first);
  const days: MonthGrid['days'] = [];
  for (let cur = first; heb(cur).monthKey === h.monthKey; cur = addDays(cur, 1)) {
    const d = ymdToDate(cur);
    days.push({ ymd: cur, day: heb(cur).day, weekday: d.getUTCDay(), greg: `${d.getUTCDate()}/${d.getUTCMonth() + 1}` });
  }
  return { title: `${h.month} ${hebNum(h.year % 1000)}`, first, last: days[days.length - 1].ymd, days };
}

/** "יום ג׳, כ״ג בחשוון" */
export function dayLabel(ymd: string): string {
  const h = heb(ymd);
  return `יום ${WEEKDAYS[ymdToDate(ymd).getUTCDay()]}, ${hebNum(h.day)} ב${h.month}`;
}

/** מועד מלא לתצוגה: "מחר · יום ג׳, כ״ג בחשוון · 11:00" */
export function whenLabel(at: Date | string, now = new Date()): string {
  const t = nowIL(new Date(at));
  const today = nowIL(now).ymd;
  const rel = t.ymd === today ? 'היום · ' : t.ymd === addDays(today, 1) ? 'מחר · ' : '';
  return `${rel}${dayLabel(t.ymd)} · ${t.hhmm}`;
}
