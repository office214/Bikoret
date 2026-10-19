import { config } from './config';
import { readSheet } from './google';

export type Student = {
  id: string;
  lastName: string;
  firstName: string;
  phone: string;
  lang: string;
  talmud: string;
  studyStatus: string;
  row: number;
};

const HEADERS = {
  id: 'תעודת זהות',
  talmud: 'תלמוד',
  studyStatus: 'מצב לימודים',
  lastName: 'שם משפחה',
  firstName: 'שם פרטי',
  lang: 'שפת הודעות ביקורת',
  phone: "טל' תלמיד",
} as const;

export const normText = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');

/** ספרות בלבד, משלים אפסים מובילים ל-9 ספרות (כדי שת"ז מהגיליון הישן ומהמרכזי יתאימו) */
export function normId(v: unknown): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length < 9 ? d.padStart(9, '0') : d;
}

// "תלמיד - בוקר בלבד" / "תלמיד בוקר בלבד" / ר״מ — כולם מנורמלים לאותה צורה
function normStatus(v: string): string {
  return normText(v.replace(/[-–—_]/g, ' ').replace(/[״”“]/g, '"').replace(/[׳’]/g, "'"));
}
export type Kind = 'full' | 'morning' | 'afternoon' | 'ram' | null;
export function statusKind(v: string): Kind {
  const s = normStatus(v);
  if (s === 'תלמיד') return 'full';
  if (s === 'ר"מ' || s === "ר'מ" || s === 'רמ') return 'ram';
  if (s.startsWith('תלמיד') && s.includes('בוקר')) return 'morning';
  if (s.startsWith('תלמיד') && (s.includes('צהריים') || s.includes('צהרים'))) return 'afternoon';
  return null;
}

function normTalmud(v: string): string {
  const t = normText(v);
  return /^\d$/.test(t) ? '0' + t : t;
}

export async function readCentralStudents(): Promise<Student[]> {
  const rows = await readSheet(config.centralDbId, config.centralDbSheet);
  if (!rows.length) throw new Error(`הגליון "${config.centralDbSheet}" ריק או לא נמצא`);
  const header = rows[0].map(normText);
  const col: Record<keyof typeof HEADERS, number> = {} as never;
  const missing: string[] = [];
  for (const [k, h] of Object.entries(HEADERS) as [keyof typeof HEADERS, string][]) {
    const i = header.indexOf(normText(h));
    if (i === -1) missing.push(h);
    col[k] = i;
  }
  if (missing.length) throw new Error(`במסד המרכזי חסרות הכותרות: ${missing.join(', ')}`);
  return rows.slice(1).map((r, i) => ({
    id: normId(r[col.id]),
    lastName: normText(r[col.lastName]),
    firstName: normText(r[col.firstName]),
    phone: normText(r[col.phone]),
    lang: normText(r[col.lang]),
    talmud: normTalmud(r[col.talmud] || ''),
    studyStatus: normText(r[col.studyStatus]),
    row: i + 2,
  })).filter((s) => s.id || s.lastName || s.firstName);
}

/** אותם כללים כמו בסקריפט: תלמוד 00/02, מצב לימודים, זמן הביקורת, וסינון לפי מוסד בביקורת חיצונית */
export function selectForReview(all: Student[], session: string, type: string) {
  const external = type.match(/^חיצונית\s*(\d\d)$/)?.[1] || '';
  const picked: Student[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const s of all) {
    if (!['00', '02'].includes(s.talmud)) continue;
    const kind = statusKind(s.studyStatus);
    if (!kind) continue;
    const byTime = kind === 'full' || kind === 'ram' ||
      (session === 'בוקר' && kind === 'morning') || (session === 'צהריים' && kind === 'afternoon');
    if (!byTime) continue;
    if (external && s.talmud !== external) continue;
    const name = `${s.lastName} ${s.firstName}`.trim();
    if (!s.id) { skipped.push({ name, reason: `חסרה תעודת זהות (שורה ${s.row})` }); continue; }
    if (seen.has(s.id)) { skipped.push({ name, reason: `תעודת זהות כפולה (שורה ${s.row})` }); continue; }
    seen.add(s.id);
    picked.push(s);
  }
  picked.sort((a, b) =>
    a.lastName.localeCompare(b.lastName, 'he', { sensitivity: 'base', numeric: true }) ||
    a.firstName.localeCompare(b.firstName, 'he', { sensitivity: 'base', numeric: true }));
  return { picked, skipped };
}
