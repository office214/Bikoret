'use client';

import { useCallback, useEffect, useState } from 'react';

type Review = {
  id: number; number: number; date_heb: string; time: string; type: string; total: number;
  chaser: number; nirsham: number; bishuv: number; lo_ana: number; pct: number | null; passed: boolean | null;
};
type Data = { reviews: Review[]; rows: { last: string; first: string; statuses: string[]; notes: string[] }[]; zman: string };
type Sel = number | 'zman';

const typeLabel = (t: string) => t.replace(/^חיצונית/, 'אמת').replace(/^פנימית$/, 'פנימית');
const pct = (p: number | null) => (p === null || p === undefined ? '' : `${Math.round(p * 1000) / 10}%`);

const SUMMARY: [string, (r: Review) => React.ReactNode][] = [
  ['מס׳ ביקורת', (r) => r.number], ['תאריך', (r) => r.date_heb], ['שעה', (r) => r.time], ['סוג', (r) => typeLabel(r.type)],
  ['מס׳ תלמידים', (r) => r.total], ['חסר', (r) => r.chaser], ['נרשם', (r) => r.nirsham], ['בישוב', (r) => r.bishuv],
  ['לא ענה', (r) => r.lo_ana], ['אחוז נוכחות', (r) => pct(r.pct)],
  ['עובר/נכשל', (r) => (r.passed === null ? '' : r.passed ? <span className="pass">✓ עובר</span> : <span className="fail">✗ נכשל</span>)],
];

/** מסך ראש הישיבה: בורר כמה ביקורות אחורה (או מתחילת הזמן) וטבלה מלאה — צפייה בלבד */
export default function RoshView({ token }: { token: string }) {
  const [sel, setSel] = useState<Sel>(3);
  const [ready, setReady] = useState(false);
  // הבחירה האחרונה נזכרת במכשיר (נקראת אחרי הטעינה, כדי שהשרת והדפדפן יציגו אותו דבר)
  useEffect(() => {
    try { const v = localStorage.getItem('bk_rosh_sel'); if (v === 'zman') setSel('zman'); else if (v && +v >= 1 && +v <= 10) setSel(+v); } catch {}
    setReady(true);
  }, []);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async (s: Sel) => {
    try {
      const res = await fetch(`/api/rosh/${token}?n=${s}`, { cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'שגיאה');
      setData(j); setErr('');
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    setData(null);
    load(sel);
    try { localStorage.setItem('bk_rosh_sel', String(sel)); } catch {}
    // נתונים עדכניים בכל רגע: רענון כשחוזרים למסך וכל שתי דקות
    const t = setInterval(() => { if (!document.hidden) load(sel); }, 120_000);
    const onVis = () => { if (!document.hidden) load(sel); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [sel, load, ready]);

  const n = data?.reviews.length ?? 0;
  return (
    <div className="rosh">
      <header className="rosh-top">
        <h1>ביקורות נוכחות</h1>
        <div className="rosh-sel" role="radiogroup" aria-label="כמה ביקורות להציג">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((k) => (
            <button key={k} role="radio" aria-checked={sel === k} onClick={() => setSel(k)}>{k}</button>
          ))}
          <button className="z" role="radio" aria-checked={sel === 'zman'} onClick={() => setSel('zman')}>מתחילת הזמן</button>
        </div>
        <p className="rosh-sub">
          {sel === 'zman'
            ? (data ? `${data.zman || 'הזמן'} · ${n} ביקורות` : '…')
            : sel === 1 ? 'הביקורת האחרונה' : `${sel} הביקורות האחרונות`}
        </p>
      </header>

      {err ? <div className="empty">{err}</div>
        : !data ? <div className="loading">טוען…</div>
        : !n ? <div className="empty">{sel === 'zman' ? 'עוד לא נערכו ביקורות בזמן הזה.' : 'אין ביקורות סגורות.'}</div>
        : (
          <div className="rosh-scroll">
            <table className="ptable rosh-table">
              <thead className="psum">
                {SUMMARY.map(([label, get]) => (
                  <tr key={label}><th className="pname">{label}</th>{data.reviews.map((r) => <th key={r.id} className="pcol">{get(r)}</th>)}</tr>
                ))}
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    <td className="pname">{row.last} {row.first}</td>
                    {row.statuses.map((st, j) => {
                      const note = row.notes[j];
                      return note
                        ? <td key={j} className="pcol has-note" title={note}><span className={'pnote ' + (note.length <= 16 ? 'n1' : note.length <= 40 ? 'n2' : 'n3')}>{note}</span></td>
                        : <td key={j} className="pcol">{st}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
