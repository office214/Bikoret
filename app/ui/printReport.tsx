'use client';

import { pctText, Result, typeLabel } from './kit';

/* דוח הדפסה אחד (שער / כללי / חסר / בישוב / נרשם) — משותף למסך ההדפסה ולמסך ראש הישיבה */

type PrintReview = { id: number; number: number; date_heb: string; time: string; type: string; total: number; chaser: number; nirsham: number; bishuv: number; lo_ana: number; pct: number | null; passed: boolean | null };

export type PrintData = { reviews: PrintReview[]; rows: { last: string; first: string; statuses: string[]; notes?: string[] }[]; zman?: string };

/** כמה ביקורות להדפיס: 1–10 או "מתחילת הזמן" */
export type PrintCount = number | 'zman';
export const COUNT_OPTIONS: { value: string; label: string }[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  { value: 'zman', label: 'מתחילת הזמן' },
];
export const parseCount = (v: string): PrintCount => (v === 'zman' ? 'zman' : Number(v) || 3);
/** לרוחב הדף כשיש יותר מ-4 עמודות ביקורת */
export const isLandscape = (count: PrintCount, data: PrintData | null) => (count === 'zman' ? (data?.reviews.length || 0) > 4 : count > 4);
/** עד כמה ביקורות נכנסות ברוחב דף אחד; מעבר לזה הטבלה מתחלקת לכמה חלקים */
const MAX_COLS = 10;
export const REPORTS = [
  { kind: 'cover', label: 'שער — סיכום' },
  { kind: 'all', label: 'כללי' },
  { kind: 'missing', label: 'חסר / לא ענה' },
  { kind: 'bishuv', label: 'בישוב' },
  { kind: 'nirsham', label: 'נרשם' },
];

export function PrintReport({ kind, data, landscape }: { kind: string; data: PrintData; landscape: boolean }) {
  const summary: [string, (r: PrintReview) => React.ReactNode][] = [
    ['מס׳ ביקורת', (r) => r.number], ['תאריך', (r) => r.date_heb], ['שעה', (r) => r.time], ['סוג', (r) => typeLabel(r.type)],
    ['מס׳ תלמידים', (r) => r.total], ['חסר', (r) => r.chaser], ['נרשם', (r) => r.nirsham], ['סה״כ חסרים', (r) => r.chaser + r.nirsham],
    ['בישוב', (r) => r.bishuv], ['לא ענה', (r) => r.lo_ana], ['אחוז נוכחות', (r) => pctText(r.pct)], ['עובר/נכשל', (r) => <Result passed={r.passed} />],
  ];
  const L = data.reviews[0];
  const rowsAll = data.rows.filter((row) => {
    const s = row.statuses[0];
    if (kind === 'missing') return s === 'חסר' || s === 'לא ענה';
    if (kind === 'bishuv') return s === 'בישוב';
    if (kind === 'nirsham') return s === 'נרשם';
    return true;
  });
  const title = ({
    cover: `תוצאות ביקורת (${L.total} תלמידים)`, all: `כלל הישיבה (${rowsAll.length})`,
    missing: `חסר (${L.chaser}) לא ענה (${L.lo_ana})`, bishuv: `בישוב (${L.bishuv})`, nirsham: `נרשם (${L.nirsham})`,
  } as Record<string, string>)[kind];
  const cover = kind === 'cover';
  // מחלקים את השמות לעמודים בעצמנו, כדי שבראש כל עמוד מודפס יופיעו הכותרת וכל שורות הסיכום
  // (דפדפנים לא חוזרים על כותרת טבלה גבוהה). מספר שורות שמרני כדי שעמוד לא יגלוש.
  // יותר מ-10 ביקורות (מתחילת הזמן) — הטבלה מתחלקת לקבוצות של עד 10 עמודות, מהחדשה לישנה.
  // הסינון (חסר / בישוב / נרשם) נשאר לפי הביקורת האחרונה בכל הקבוצות.
  const PER = landscape ? 14 : 27;
  const pages: { cols: number[]; rows: typeof rowsAll; part: string }[] = [];
  const nGroups = Math.ceil(data.reviews.length / MAX_COLS);
  for (let g = 0; g < nGroups; g++) {
    const cols = data.reviews.slice(g * MAX_COLS, (g + 1) * MAX_COLS).map((_, i) => g * MAX_COLS + i);
    const part = nGroups > 1 ? `ביקורות ${data.reviews[cols[cols.length - 1]].number}–${data.reviews[cols[0]].number}` : '';
    if (!cover && rowsAll.length) {
      for (let i = 0; i < rowsAll.length; i += PER) pages.push({ cols, rows: rowsAll.slice(i, i + PER), part });
    } else pages.push({ cols, rows: [], part });
  }
  return (
    <section className="print-section">
      {pages.map(({ cols, rows: chunk, part }, pi) => (
        <div className="ppage" key={pi}>
          <h2>{title}{part && <small className="ppno"> · {part}</small>}{pages.length > 1 && <small className="ppno"> · עמוד {pi + 1} מתוך {pages.length}</small>}</h2>
          {!cover && data.rows.some((r) => r.notes?.some(Boolean)) && <p className="plegend"><span className="pswatch" /> חסר עם הערה (ההערה כתובה בתא)</p>}
          <div className="twrap">
            {/* כותרות ושמות על אפור (שמות מודגשים), הסטטוסים על לבן */}
            <table className={'ptable' + (cols.length > 7 ? ' wide' : '')}>
              <thead className="psum">
                {summary.map(([label, get]) => (
                  <tr key={label}><th className="pname">{label}</th>{cols.map((c) => { const r = data.reviews[c]; return <th key={r.id} className="pcol">{get(r)}</th>; })}</tr>
                ))}
              </thead>
              {!cover && (
                <tbody>{chunk.map((row, i) => (
                  <tr key={i}>
                    <td className="pname">{row.last} {row.first}</td>
                    {cols.map((j) => {
                      const st = row.statuses[j];
                      const note = row.notes?.[j];
                      // "חסר" עם הערה: רקע צהוב, ובמקום המילה — ההערה עצמה, בגופן שקטן ככל שהיא ארוכה,
                      // כך שהשורה נשארת בגובה רגיל
                      return note
                        ? <td key={j} className="pcol has-note" title={note}><span className={'pnote ' + (note.length <= 16 ? 'n1' : note.length <= 40 ? 'n2' : 'n3')}>{note}</span></td>
                        : <td key={j} className="pcol">{st}</td>;
                    })}
                  </tr>
                ))}</tbody>
              )}
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
