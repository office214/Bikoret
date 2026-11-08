'use client';

import { pctText, Result, typeLabel } from './kit';

/* דוח הדפסה אחד (שער / כללי / חסר / בישוב / נרשם) — משותף למסך ההדפסה ולמסך ראש הישיבה */

type PrintReview = { id: number; number: number; date_heb: string; time: string; type: string; total: number; chaser: number; nirsham: number; bishuv: number; lo_ana: number; pct: number | null; passed: boolean | null };

export type PrintData = { reviews: PrintReview[]; rows: { last: string; first: string; statuses: string[]; notes?: string[] }[] };
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
  const rows = data.rows.filter((row) => {
    const s = row.statuses[0];
    if (kind === 'missing') return s === 'חסר' || s === 'לא ענה';
    if (kind === 'bishuv') return s === 'בישוב';
    if (kind === 'nirsham') return s === 'נרשם';
    return true;
  });
  const title = ({
    cover: `תוצאות ביקורת (${L.total} תלמידים)`, all: `כלל הישיבה (${rows.length})`,
    missing: `חסר (${L.chaser}) לא ענה (${L.lo_ana})`, bishuv: `בישוב (${L.bishuv})`, nirsham: `נרשם (${L.nirsham})`,
  } as Record<string, string>)[kind];
  const cover = kind === 'cover';
  // מחלקים את השמות לעמודים בעצמנו, כדי שבראש כל עמוד מודפס יופיעו הכותרת וכל שורות הסיכום
  // (דפדפנים לא חוזרים על כותרת טבלה גבוהה). מספר שורות שמרני כדי שעמוד לא יגלוש.
  const PER = landscape ? 14 : 27;
  const pages: (typeof rows)[] = [];
  if (!cover) {
    for (let i = 0; i < rows.length; i += PER) pages.push(rows.slice(i, i + PER));
  }
  if (!pages.length) pages.push([]);
  return (
    <section className="print-section">
      {pages.map((chunk, pi) => (
        <div className="ppage" key={pi}>
          <h2>{title}{pages.length > 1 && <small className="ppno"> · עמוד {pi + 1} מתוך {pages.length}</small>}</h2>
          {!cover && data.rows.some((r) => r.notes?.some(Boolean)) && <p className="plegend"><span className="pswatch" /> חסר עם הערה (ההערה כתובה בתא)</p>}
          <div className="twrap">
            {/* כותרות ושמות על אפור (שמות מודגשים), הסטטוסים על לבן */}
            <table className="ptable">
              <thead className="psum">
                {summary.map(([label, get]) => (
                  <tr key={label}><th className="pname">{label}</th>{data.reviews.map((r) => <th key={r.id} className="pcol">{get(r)}</th>)}</tr>
                ))}
              </thead>
              {!cover && (
                <tbody>{chunk.map((row, i) => (
                  <tr key={i}>
                    <td className="pname">{row.last} {row.first}</td>
                    {row.statuses.map((st, j) => {
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
