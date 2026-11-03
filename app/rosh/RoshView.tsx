'use client';

import { useCallback, useEffect, useState } from 'react';

type Review = {
  id: number; number: number; date_heb: string; time: string; type: string; total: number;
  chaser: number; nirsham: number; bishuv: number; lo_ana: number; pct: number | null; passed: boolean | null;
};
type Data = { reviews: Review[]; rows: { id: string; last: string; first: string; statuses: string[]; notes: string[] }[]; zman: string };
type Card = { kind: 'review'; col: number } | { kind: 'student'; id: string; name: string };
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
  const [card, setCard] = useState<Card | null>(null);

  // כרטיס (ביקורת או תלמיד): "חזור" בטלפון סוגר אותו (ולא יוצא מהמסך)
  const openCard = (c: Card) => { setCard(c); try { if (!history.state?.rv) history.pushState({ rv: 1 }, ''); } catch {} };
  const openReview = (j: number) => openCard({ kind: 'review', col: j });
  const closeReview = useCallback(() => { if (history.state?.rv) history.back(); else setCard(null); }, []);
  useEffect(() => {
    const onPop = () => setCard(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
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
          {n > 0 && ' · לחצו על ביקורת או על תלמיד לפרטים'}
        </p>
      </header>

      {err ? <div className="empty">{err}</div>
        : !data ? <div className="loading">טוען…</div>
        : !n ? <div className="empty">{sel === 'zman' ? 'עוד לא נערכו ביקורות בזמן הזה.' : 'אין ביקורות סגורות.'}</div>
        : (
          <div className="rosh-scroll">
            <table className="ptable rosh-table">
              <thead className="psum">
                {SUMMARY.map(([label, get], li) => (
                  <tr key={label}>
                    <th className="pname">{label}</th>
                    {data.reviews.map((r, j) => (
                      <th key={r.id} className="pcol rcol" onClick={() => openReview(j)}
                        {...(li === 0 ? { role: 'button', tabIndex: 0, 'aria-label': `פרטי ביקורת ${r.number}`, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReview(j); } } } : {})}>
                        {li === 0 ? <span className="rlink">{get(r)}</span> : get(r)}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i}>
                    <td className="pname">
                      <button className="sname" onClick={() => openCard({ kind: 'student', id: row.id, name: `${row.last} ${row.first}` })}>{row.last} {row.first}</button>
                    </td>
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
      {data && card?.kind === 'review' && data.reviews[card.col] && <ReviewCard data={data} col={card.col} onClose={closeReview} onStudent={(id, name) => openCard({ kind: 'student', id, name })} />}
      {card?.kind === 'student' && <StudentCard token={token} id={card.id} name={card.name} onClose={closeReview} />}
    </div>
  );
}

/* ---------- כרטיס של ביקורת אחת: פרטים + סינון לפי סטטוס ---------- */

const TABS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: 'כל החריגים', match: (s) => !!s },
  { key: 'missing', label: 'חסר / לא ענה', match: (s) => s === 'חסר' || s === 'לא ענה' },
  { key: 'chaser', label: 'חסר', match: (s) => s === 'חסר' },
  { key: 'lo', label: 'לא ענה', match: (s) => s === 'לא ענה' },
  { key: 'nirsham', label: 'נרשם', match: (s) => s === 'נרשם' },
  { key: 'bishuv', label: 'בישוב', match: (s) => s === 'בישוב' },
  { key: 'mil', label: 'מילואים', match: (s) => s === 'מילואים' },
];

function ReviewCard({ data, col, onClose, onStudent }: { data: Data; col: number; onClose: () => void; onStudent: (id: string, name: string) => void }) {
  const r = data.reviews[col];
  const [tab, setTab] = useState('missing');
  const people = data.rows.map((row) => ({ id: row.id, name: `${row.last} ${row.first}`, s: row.statuses[col], note: row.notes[col] }));
  const tabs = TABS.map((t) => ({ ...t, n: people.filter((p) => t.match(p.s)).length })).filter((t) => t.n > 0 || t.key === 'all' || t.key === 'missing');
  const cur = tabs.find((t) => t.key === tab) || tabs[0];
  const list = people.filter((p) => cur.match(p.s));
  const present = r.total - (r.chaser + r.nirsham + r.bishuv + r.lo_ana);
  useSheet(onClose);

  return (
    <div className="rcard-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="rcard" role="dialog" aria-modal="true" aria-label={`ביקורת ${r.number}`}>
        <header className="rcard-h">
          <div>
            <h2>ביקורת #{r.number} · {typeLabel(r.type)}</h2>
            <p className="rosh-sub">{r.date_heb} · {r.time}</p>
          </div>
          <button className="rcard-x" onClick={onClose} aria-label="סגירה">✕</button>
        </header>
        <div className="rcard-stats">
          <div><b>{pct(r.pct)}</b><span>נוכחות</span></div>
          <div>{r.passed === null ? '' : r.passed ? <b className="pass">✓ עובר</b> : <b className="fail">✗ נכשל</b>}<span>תוצאה</span></div>
          <div><b>{r.total}</b><span>תלמידים</span></div>
          <div><b>{present}</b><span>נוכחים</span></div>
        </div>
        <div className="rcard-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={cur.key === t.key} onClick={() => setTab(t.key)}>{t.label} <span>{t.n}</span></button>
          ))}
        </div>
        <ul className="rcard-list">
          {list.length ? list.map((p, i) => (
            <li key={i} className={p.note ? 'has-note' : undefined}>
              <button className="nm sname" onClick={() => onStudent(p.id, p.name)}>{p.name}</button>
              <span className="st">{p.s}</span>
              {p.note && <span className="nt">{p.note}</span>}
            </li>
          )) : <li className="empty-li">אין תלמידים בקטגוריה הזו</li>}
        </ul>
      </section>
    </div>
  );
}

/* ---------- כרטיס תלמיד: כל ההיסטוריה שלו ---------- */

type Hist = { id: number; number: number; date_heb: string; time: string; type: string; status: string; note?: string }[];

function StudentCard({ token, id, name, onClose }: { token: string; id: string; name: string; onClose: () => void }) {
  const [hist, setHist] = useState<Hist | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'bishuv' | 'missing' | 'nirsham' | 'all'>('missing');
  useEffect(() => {
    fetch(`/api/rosh/${token}/student?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'שגיאה'); setHist(j); })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [token, id]);
  useSheet(onClose);

  const count = (f: (s: string) => boolean) => (hist || []).filter((h) => f(h.status)).length;
  const present = count((s) => s === 'נוכח' || s === 'מילואים');
  const total = hist?.length || 0;
  const inTab = (st: string) => tab === 'all' || (tab === 'missing' ? st === 'חסר' || st === 'לא ענה' : st === (tab === 'bishuv' ? 'בישוב' : 'נרשם'));
  const list = (hist || []).filter((h) => inTab(h.status));

  return (
    <div className="rcard-bg" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="rcard" role="dialog" aria-modal="true" aria-label={`${name} — היסטוריה`}>
        <header className="rcard-h">
          <div>
            <h2>{name} — היסטוריה</h2>
            <p className="rosh-sub">
              {hist ? `${total} ביקורות במערכת` : '…'}
              {hist && total > 0 && <> · נוכחות <bdi dir="ltr">{Math.round((present + count((s) => s === 'בישוב')) / total * 100)}%</bdi></>}
            </p>
          </div>
          <button className="rcard-x" onClick={onClose} aria-label="סגירה">✕</button>
        </header>
        {err ? <p className="empty">{err}</p> : !hist ? <p className="loading">טוען…</p> : (
          <>
            <div className="rcard-tabs fit counts" role="tablist">
              <button role="tab" aria-selected={tab === 'bishuv'} onClick={() => setTab('bishuv')}>בישוב <span>{count((s) => s === 'בישוב')}</span></button>
              <button role="tab" aria-selected={tab === 'missing'} onClick={() => setTab('missing')}>חסר ולא ענה <span>{count((s) => s === 'חסר' || s === 'לא ענה')}</span></button>
              <button role="tab" aria-selected={tab === 'nirsham'} onClick={() => setTab('nirsham')}>נרשם <span>{count((s) => s === 'נרשם')}</span></button>
              <button role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>כל הביקורות <span>{total}</span></button>
            </div>
            <ul className="rcard-list">
              {list.length ? list.map((h) => (
                <li key={h.id} className={h.note ? 'has-note' : undefined}>
                  <span className="nm">#{h.number} · {h.date_heb} <small className="rosh-sub">{typeLabel(h.type)}</small></span>
                  <span className={'st' + (h.status === 'נוכח' ? ' ok' : '')}>{h.status}</span>
                  {h.note && <span className="nt">{h.note}</span>}
                </li>
              )) : <li className="empty-li">{tab === 'missing' ? 'לא היה חסר באף ביקורת' : tab === 'all' ? 'אין ביקורות' : 'אין ביקורות בקטגוריה הזו'}</li>}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/** התנהגות משותפת לכרטיסים: Escape סוגר, והדף מאחור לא נגלל */
function useSheet(onClose: () => void) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onClose]);
}
