'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, AsyncButton, errMsg, NO_ANSWER, pctText, Result, STATUSES, TYPES, typeLabel, useUi, Warn } from './kit';
import type { ReviewState } from './App';
import { openWhatsApp, useSms } from './useSms';

type HistRow = {
  id: number; number: number; session: string; type: string; date_heb: string; time: string; total: number; present: number;
  bishuv: number; chaser: number; lo_ana: number; nirsham: number; pct: number | null; passed: boolean | null; imported: boolean;
};

/* ======================= תוצאות ======================= */

export function HistoryView({ admin }: { admin: boolean }) {
  const [rows, setRows] = useState<HistRow[] | null>(null);
  const [err, setErr] = useState('');
  const { dialog, toast } = useUi();

  useEffect(() => { api<HistRow[]>('/api/history').then(setRows).catch((e) => setErr(errMsg(e))); }, []);

  const open = async (r: HistRow) => {
    const data = await api<{ entries: { id: string; last_name: string; first_name: string; status: string; note?: string }[] }>(`/api/history/${r.id}`).catch((e) => ({ error: errMsg(e) }));
    const groups = new Map<string, string[]>();
    if ('entries' in data) data.entries.forEach((e) => {
      if (!groups.has(e.status)) groups.set(e.status, []);
      groups.get(e.status)!.push(`${e.last_name} ${e.first_name}` + (e.note ? ` (${e.note})` : ''));
    });
    const action = await dialog({
      title: `ביקורת #${r.number} — ${r.date_heb}`, cancel: false, ok: 'סגור',
      body: (close) => 'error' in data ? <p>{data.error}</p> : (
        <>
          <p className="sub">{[r.time, r.type, pctText(r.pct)].filter(Boolean).join(' · ')} · <Result passed={r.passed} /></p>
          {!groups.size && <p>כל התלמידים היו נוכחים.</p>}
          {[...groups].map(([st, names]) => (
            <div key={st}>
              <h3 style={{ margin: '12px 0 4px', fontSize: '1em' }}><Warn show={st === NO_ANSWER} />{st} ({names.length})</h3>
              <p style={{ margin: 0 }}>{names.join(' · ')}</p>
            </div>
          ))}
          {admin && <button type="button" className="btn danger" style={{ marginTop: 16 }} onClick={() => close('delete')}>מחק ביקורת זו מהתוצאות</button>}
        </>
      ),
    });
    if (action !== 'delete') return;
    const ok = await dialog({
      title: `מחיקת ביקורת #${r.number}`, ok: 'מחק לצמיתות',
      body: <><p><Warn />הביקורת מ-{r.date_heb} ({r.total} תלמידים) ותוצאותיה יימחקו לצמיתות. אי אפשר לבטל.</p>
        <p className="sub">הביקורות שאחריה יקבלו מספר אחד פחות, כדי שהרצף יישמר (למשל #{r.number + 1} תהפוך ל-#{r.number}).</p></>,
    });
    if (!ok) return;
    try {
      const res = await api<{ renumbered: number }>(`/api/history/${r.id}`, { method: 'DELETE' });
      setRows(await api<HistRow[]>('/api/history')); // המספרים של הביקורות שאחריה השתנו
      toast(`ביקורת #${r.number} נמחקה` + (res.renumbered ? ` · ${res.renumbered} ביקורות מוספרו מחדש` : ''));
    } catch (e) { toast(errMsg(e)); }
  };

  return (
    <>
      <StudentHistory />
      <div className="card">
        <h2>כל הביקורות</h2>
        <p className="sub">לחיצה על שורה מציגה מי לא היה נוכח.</p>
        {err ? <div className="empty">{err}</div> : !rows ? <div className="loading">טוען…</div> : !rows.length ? <div className="empty">עדיין אין ביקורות סגורות.</div> : (
          <div className="twrap">
            <table>
              <thead><tr>
                <th className="num">#</th><th>תאריך</th><th>שעה</th><th>סוג</th><th className="num">תלמידים</th><th className="num">חסר</th>
                <th className="num">נרשם</th><th className="num">בישוב</th><th className="num">לא ענה</th><th className="num">נוכחות</th><th>תוצאה</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="click" tabIndex={0} onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r); } }}>
                    <td className="num">{r.number}</td><td>{r.date_heb}</td><td>{r.time}</td><td>{typeLabel(r.type)}</td>
                    <td className="num">{r.total}</td><td className="num">{r.chaser}</td><td className="num">{r.nirsham}</td>
                    <td className="num">{r.bishuv}</td><td className="num">{r.lo_ana}</td>
                    <td className="num"><b>{pctText(r.pct)}</b></td><td><Result passed={r.passed} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function StudentHistory() {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; last_name: string; first_name: string }[]>([]);
  const [sel, setSel] = useState<{ id: string; name: string } | null>(null);
  const [hist, setHist] = useState<{ id: number; number: number; date_heb: string; time: string; type: string; status: string; note?: string; imported: boolean }[] | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      api<typeof found>(`/api/students?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal }).then(setFound).catch(() => {});
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const pick = async (s: { id: string; last_name: string; first_name: string }) => {
    setSel({ id: s.id, name: `${s.last_name} ${s.first_name}` });
    setFound([]); setQ(''); setHist(null);
    setHist(await api(`/api/students/${s.id}`));
  };

  const counts = new Map<string, number>();
  hist?.forEach((h) => counts.set(h.status, (counts.get(h.status) || 0) + 1));

  return (
    <div className="card">
      <h2>היסטוריה של תלמיד</h2>
      <label className="sr-only" htmlFor="stuq">שם תלמיד</label>
      <input id="stuq" className="search" type="search" placeholder="הקלד לפחות 2 אותיות משם התלמיד" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" enterKeyHint="search"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
      {found.length > 0 && (
        <ul className="list" style={{ marginTop: 8 }}>
          {found.map((s) => <li key={s.id}><button className="btn ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => pick(s)}>{s.last_name} {s.first_name}</button></li>)}
        </ul>
      )}
      {sel && (
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 8px' }}><b>{sel.name}</b>{hist && ' — ' + [...counts].map(([k, v]) => `${k} ${v}`).join(' · ')}</p>
          {!hist ? <div className="loading">טוען…</div> : (
            <>
              <div className="twrap" style={{ maxHeight: 340, overflow: 'auto' }}>
                <table>
                  <thead><tr><th className="num">#</th><th>תאריך</th><th>שעה</th><th>סוג</th><th>סטטוס</th></tr></thead>
                  <tbody>{hist.map((h) => <tr key={h.id}><td className="num">{h.number}</td><td>{h.date_heb}</td><td>{h.time}</td><td>{typeLabel(h.type)}</td><td><Warn show={h.status === NO_ANSWER} />{h.status}{h.note ? <span className="sub"> — {h.note}</span> : null}</td></tr>)}</tbody>
                </table>
              </div>
              {hist.some((h) => h.imported) && <p className="sub" style={{ marginTop: 8 }}>בביקורות שיובאו מהגיליון הישן מופיעות רק היעדרויות.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ======================= הדפסה ======================= */

type PrintReview = { id: number; number: number; date_heb: string; time: string; type: string; total: number; chaser: number; nirsham: number; bishuv: number; lo_ana: number; pct: number | null; passed: boolean | null };

type PrintData = { reviews: PrintReview[]; rows: { last: string; first: string; statuses: string[]; notes?: string[] }[] };
const REPORTS = [
  { kind: 'cover', label: 'שער — סיכום' },
  { kind: 'all', label: 'כללי' },
  { kind: 'missing', label: 'חסר / לא ענה' },
  { kind: 'bishuv', label: 'בישוב' },
  { kind: 'nirsham', label: 'נרשם' },
];

export function PrintView() {
  // אילו דוחות להדפיס — בחירה מרובה; ברירת מחדל: כולם
  const [kinds, setKinds] = useState<string[]>(REPORTS.map((r) => r.kind));
  const allOn = kinds.length === REPORTS.length;
  const toggleKind = (k: string) => setKinds((cur) => REPORTS.map((r) => r.kind).filter((x) => (x === k ? !cur.includes(x) : cur.includes(x))));
  const [count, setCount] = useState(3);
  const [data, setData] = useState<PrintData | null>(null);
  const [err, setErr] = useState('');

  // נתון אחד מהשרת (כל התלמידים), והסינונים נעשים כאן — מהיר יותר מ-5 קריאות
  useEffect(() => {
    setData(null); setErr('');
    api<PrintData>(`/api/print?kind=all&count=${count}`).then(setData).catch((e) => setErr(errMsg(e)));
  }, [count]);

  const landscape = count > 4;

  return (
    <>
      {landscape && <style>{'@media print { @page { size: A4 landscape; } }'}</style>}
      <div className="card no-print">
        <h2>הדפסה</h2>
        <p className="sub">תלמידי הביקורת הנוכחית, לפי הביקורות האחרונות שנסגרו.{landscape ? ' יודפס לרוחב הדף.' : ''}</p>
        <div className="grid">
          <fieldset className="f kinds">
            <legend>דוחות להדפסה</legend>
            <label className="chk chk-all"><input type="checkbox" checked={allOn} onChange={() => setKinds(allOn ? [] : REPORTS.map((r) => r.kind))} /> הכל</label>
            {REPORTS.map((r) => (
              <label key={r.kind} className="chk"><input type="checkbox" checked={kinds.includes(r.kind)} onChange={() => toggleKind(r.kind)} /> {r.label}</label>
            ))}
          </fieldset>
          <label className="f">מספר ביקורות
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}</select>
          </label>
        </div>
        <div className="actions"><button className="btn solid" onClick={() => window.print()} disabled={!data?.reviews.length || !kinds.length}>הדפס</button></div>
      </div>
      <div id="printArea">
        {err ? <div className="empty">{err}</div> : !data ? <div className="loading">טוען…</div> : !data.reviews.length ? <div className="empty">אין ביקורות סגורות.</div> : (
          REPORTS.filter((r) => kinds.includes(r.kind)).map((r) => <PrintReport key={r.kind} kind={r.kind} data={data} landscape={landscape} />)
        )}
      </div>
    </>
  );
}

function PrintReport({ kind, data, landscape }: { kind: string; data: PrintData; landscape: boolean }) {
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

/* ======================= ניהול ======================= */

type AdminStatus = {
  google: boolean; sheetsEmail: string;
  reviews: { imported: number; closed: number; last_number: number | null; gaps: number[] };
  passwords: { user: boolean; admin: boolean };
  sms: { token: string; username: string; source: string; adminPhone: string; ready: boolean; fromEnv: Record<string, boolean>; testPhone: string };
};

export function AdminView({ user, rv, counts, goReview }: { user: { admin: boolean }; rv: ReviewState; counts: Record<string, number>; goReview: () => void }) {
  const { toast, dialog } = useUi();
  const sms = useSms(rv);
  const [st, setSt] = useState<AdminStatus | null>(null);
  const r = rv.review;
  const [meta, setMeta] = useState({ date_heb: r?.date_heb || '', time: r?.time || '', type: r?.type || 'פנימית' });
  useEffect(() => { setMeta({ date_heb: r?.date_heb || '', time: r?.time || '', type: r?.type || 'פנימית' }); }, [r?.id, r?.date_heb, r?.time, r?.type]);

  const loadStatus = useCallback(() => { if (user.admin) api<AdminStatus>('/api/admin/status').then(setSt).catch(() => {}); }, [user.admin]);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  /**
   * שומר את הפרטים. אם השעה/הסוג משנים את רשימת התלמידים — שואל אם לסנכרן.
   * מחזיר false אם המשתמש ביטל.
   */
  const persistMeta = async (quiet = false): Promise<boolean> => {
    type Diff = { from: { session: string; type: string }; to: { session: string; type: string }; kept: number; added: string[]; removed: string[]; removedMarked: string[] };
    try {
      const res = await api<{ ok?: true; needsResync?: true; diff?: Diff }>(`/api/review/${r!.id}`, { method: 'PATCH', body: meta });
      if (res.needsResync && res.diff) {
        const d = res.diff;
        const what = [
          d.from.session !== d.to.session && `מ${d.from.session} ל${d.to.session}`,
          d.from.type !== d.to.type && `מ${typeLabel(d.from.type)} ל${typeLabel(d.to.type)}`,
        ].filter(Boolean).join(' ו');
        const names = (list: string[]) => list.length > 0 && (
          <details><summary>הצג שמות</summary><p className="sub" style={{ margin: '4px 0 0' }}>{list.join(' · ')}</p></details>
        );
        const choice = await dialog({
          title: 'לסנכרן את רשימת התלמידים?', ok: false, cancel: 'ביטול',
          body: (done) => (
            <>
              <p>הביקורת עוברת {what}, ולכן רשימת התלמידים שונה.</p>
              <ul className="resync">
                <li><b>{d.kept}</b> תלמידים נשארים — עם הסימון שכבר יש להם</li>
                <li><b>{d.added.length}</b> נוספים כ&quot;לא ענה&quot;{names(d.added)}</li>
                <li><b>{d.removed.length}</b> יוצאים מהביקורת{names(d.removed)}</li>
              </ul>
              {d.removedMarked.length > 0 && <p className="warn-ic">⚠ {d.removedMarked.length} מהיוצאים כבר סומנו, והסימון שלהם יימחק: {d.removedMarked.join(' · ')}</p>}
              <div className="actions">
                <button type="button" className="btn solid" onClick={() => done('apply')}>סנכרן תלמידים</button>
                <button type="button" className="btn" onClick={() => done('skip')}>שמור בלי לסנכרן</button>
              </div>
            </>
          ),
        });
        if (choice !== 'apply' && choice !== 'skip') return false;
        await rv.waitSaved();
        const r2 = await api<{ diff?: Diff }>(`/api/review/${r!.id}`, { method: 'PATCH', body: { ...meta, resync: choice } });
        await rv.reload();
        if (choice === 'apply' && r2.diff) toast(`סונכרן: ${r2.diff.added.length} נוספו, ${r2.diff.removed.length} יצאו`);
        else if (!quiet) toast('הפרטים נשמרו');
        return true;
      }
      await rv.reload();
      if (!quiet) toast('הפרטים נשמרו');
      return true;
    } catch (e) { toast(errMsg(e)); return false; }
  };
  const saveMeta = async () => { await persistMeta(); };

  const close = async () => {
    if (!r) return;
    // שעה/סוג ששונו ולא נשמרו — קודם שומרים (ושואלים על סנכרון אם צריך)
    if (meta.time !== r.time || meta.type !== r.type || meta.date_heb !== r.date_heb) {
      if (!(await persistMeta(true))) return;
    }
    const pct = counts.all ? Math.round(((counts['נוכח'] + counts['בישוב']) / counts.all) * 1000) / 10 : 0;
    const ok = await dialog({
      title: 'סגירת ביקורת', ok: 'סגור ושמור',
      body: (
        <>
          <p>{[meta.date_heb, meta.time, meta.type].join(' · ')}</p>
          <div className="twrap"><table><tbody>
            {STATUSES.map((s) => <tr key={s}><td><Warn show={s === NO_ANSWER} />{s}</td><td className="num">{counts[s]}</td></tr>)}
            {counts['מילואים'] > 0 && <tr><td className="sub">מתוכם במילואים (נחשבים נוכחים)</td><td className="num">{counts['מילואים']}</td></tr>}
            <tr><th>אחוז נוכחות</th><th className="num">{pct}%</th></tr>
          </tbody></table></div>
          {counts[NO_ANSWER] > 0 && <p className="warn-ic">⚠ {counts[NO_ANSWER]} תלמידים עדיין &quot;לא ענה&quot;.</p>}
        </>
      ),
    });
    if (!ok) return;
    try {
      await rv.waitSaved();
      const res = await api<{ number: number; pct: string; passed: boolean }>(`/api/review/${r.id}/close`, { body: meta });
      toast(`ביקורת #${res.number} נשמרה — ${pctText(Number(res.pct))} · ${res.passed ? 'עובר' : 'נכשל'}`);
      await rv.reload();
      loadStatus();
      goReview();
    } catch (e) { toast(errMsg(e)); }
  };

  const discard = async () => {
    const ok = await dialog({ title: 'מחיקת הביקורת הפתוחה', body: <p>כל הסימונים בביקורת הזו יימחקו ולא יישמרו. להמשיך?</p>, ok: 'מחק' });
    if (!ok) return;
    try { await api(`/api/review/${r!.id}`, { method: 'DELETE' }); await rv.reload(); toast('הביקורת נמחקה'); } catch (e) { toast(errMsg(e)); }
  };

  // ניהול מחולק לנושאים: תפריט כפתורים, וכל נושא נפתח במסך משלו ("חזרה" / כפתור החזור בטלפון חוזרים לתפריט)
  const [section, setSection] = useState<AdminSection | null>(null);
  const openSection = (k: AdminSection) => { setSection(k); window.scrollTo(0, 0); try { history.pushState({ adm: k }, ''); } catch {} };
  const back = () => { if (history.state?.adm) history.back(); else setSection(null); };
  useEffect(() => {
    const onPop = () => setSection(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const reloadAll = () => { loadStatus(); rv.reload(); };

  const items: { key: AdminSection; title: string; sub: string; warn?: boolean; admin?: boolean }[] = [
    { key: 'review', title: 'הביקורת הפתוחה', sub: r ? `${typeLabel(r.type)} · ${r.session} · ${counts[NO_ANSWER]} לא ענו — SMS, פרטים וסגירה` : 'אין ביקורת פתוחה' },
    { key: 'sms', title: 'הודעות SMS', admin: true, sub: !st ? '…' : st.sms.testPhone ? `מצב בדיקה פעיל — רק ל-${st.sms.testPhone}` : st.sms.ready ? `מוגדר (${st.sms.username})` : 'עדיין לא מוגדר', warn: !!st && (!st.sms.ready || !!st.sms.testPhone) },
    { key: 'rosh', title: 'מסך ראש הישיבה', admin: true, sub: 'קישור קבוע לצפייה בלבד בתוצאות' },
    { key: 'db', title: 'מסד התלמידים והיסטוריה', admin: true, sub: !st ? '…' : [st.sheetsEmail ? 'מחובר' : 'לא מחובר', st.reviews.gaps?.length ? `חסרים מספרים ברצף` : `רצף תקין עד #${st.reviews.last_number ?? '—'}`].join(' · '), warn: !!st && (!st.sheetsEmail || !!st.reviews.gaps?.length) },
    { key: 'passwords', title: 'סיסמאות', admin: true, sub: !st ? '…' : st.passwords.user && st.passwords.admin ? 'סיסמת כניסה וסיסמת מנהל מוגדרות' : 'חסרה סיסמה', warn: !!st && !(st.passwords.user && st.passwords.admin) },
  ];
  const cur = items.find((i) => i.key === section);

  if (cur) return (
    <>
      <div className="asec-head">
        <button className="btn ghost asec-back" onClick={back}>→ חזרה</button>
        <h2>{cur.title}</h2>
      </div>
      {section === 'review' && (r ? (
        <>
          <div className="card">
            <h2>SMS</h2>
            <p className="sub">נשלח רק למי שמסומן &quot;לא ענה&quot; ({counts[NO_ANSWER]}).</p>
            <div className="actions">
              <AsyncButton className="btn solid" busyText="שולח…" onClick={() => sms('start', counts[NO_ANSWER])}>סמס התחלה</AsyncButton>
              <AsyncButton className="btn" busyText="שולח…" onClick={() => sms('noanswer', counts[NO_ANSWER])}>סמס לא ענו</AsyncButton>
              <button className="btn wa" disabled={!rv.groupText} onClick={() => openWhatsApp(rv.groupText)}>הודעה לקבוצת הוואטסאפ</button>
            </div>
          </div>

          <div className="card">
            <h2>פרטי הביקורת וסגירה</h2>
            <p className="sub">הסגירה שומרת את התוצאות ומקבלת מספר ביקורת.</p>
            <div className="grid">
              <label className="f">תאריך עברי<input value={meta.date_heb} onChange={(e) => setMeta({ ...meta, date_heb: e.target.value })} /></label>
              <label className="f">שעה<input type="time" value={meta.time} onChange={(e) => setMeta({ ...meta, time: e.target.value })} /></label>
              <label className="f">סוג<select value={meta.type} onChange={(e) => setMeta({ ...meta, type: e.target.value })}>{TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}</select></label>
            </div>
            <div className="actions">
              <AsyncButton className="btn ghost" onClick={saveMeta}>שמור פרטים</AsyncButton>
              <AsyncButton className="btn solid" busyText="סוגר…" onClick={close}>סגור ביקורת</AsyncButton>
              <button className="btn danger" onClick={discard}>מחק ביקורת</button>
            </div>
          </div>
        </>
      ) : <div className="card"><p className="sub" style={{ margin: 0 }}>אין ביקורת פתוחה. ביקורת חדשה נפתחת ממסך הבית (לשונית ביקורת).</p></div>)}
      {user.admin && st && section === 'sms' && <div className="card"><SmsSection st={st} reload={reloadAll} /></div>}
      {user.admin && section === 'rosh' && <div className="card"><RoshLink /></div>}
      {user.admin && st && section === 'db' && <div className="card"><DbSection st={st} reload={reloadAll} /></div>}
      {user.admin && st && section === 'passwords' && <div className="card"><Passwords st={st} reload={reloadAll} /></div>}
    </>
  );

  return (
    <>
      <nav className="amenu" aria-label="נושאי ניהול">
        {items.filter((i) => !i.admin || user.admin).map((i) => (
          <button key={i.key} className="amenu-item" onClick={() => openSection(i.key)}>
            <span className="t">{i.title}</span>
            <span className={'s' + (i.warn ? ' warn' : '')}>{i.warn ? '⚠ ' : ''}{i.sub}</span>
            <span className="chev" aria-hidden="true">‹</span>
          </button>
        ))}
      </nav>
      <div className="card">
        <form action="/api/auth/logout" method="post"><button className="btn ghost">יציאה מהמערכת</button></form>
      </div>
    </>
  );
}

type AdminSection = 'review' | 'sms' | 'rosh' | 'db' | 'passwords';

const Line = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <div className="okline"><span className={'dot ' + (ok ? 'on' : 'off')} aria-hidden="true" /><span>{ok ? '✓' : '⚠'} {children}</span></div>
);

/** מסד התלמידים, ייבוא ההיסטוריה ורצף המספרים */
function DbSection({ st, reload }: { st: AdminStatus; reload: () => void }) {
  const { toast, dialog } = useUi();
  const fixNumbers = async () => {
    const g = st.reviews.gaps;
    const ok = await dialog({
      title: 'סידור רצף המספרים', ok: 'סדר',
      body: <p>כל ביקורת שאחרי מספר חסר תקבל מספר אחד פחות, עד שהרצף רציף (למשל #{g[0] + 1} תהפוך ל-#{g[0]}). סדר הביקורות לא משתנה.</p>,
    });
    if (!ok) return;
    try { const r = await api<{ changed: number }>('/api/admin/renumber', { body: {} }); toast(`הרצף סודר · ${r.changed} ביקורות קיבלו מספר חדש`); reload(); }
    catch (e) { toast(errMsg(e)); }
  };
  const importHist = async () => {
    const ok = await dialog({ title: 'ייבוא היסטוריה', body: <p>ייבוא כל הביקורות מגליון &quot;מסד&quot; בקובץ &quot;ביקורת&quot;. ביקורות שכבר יובאו לא ייובאו שוב.</p>, ok: 'ייבא' });
    if (!ok) return;
    try {
      const r = await api<{ imported: number; skipped: number; entries: number }>('/api/admin/import', { body: {} });
      toast(`יובאו ${r.imported} ביקורות (${r.entries} רשומות)${r.skipped ? `, ${r.skipped} כבר היו קיימות` : ''}`);
      reload();
    } catch (e) { toast(errMsg(e)); }
  };
  return (
    <>
      <Line ok={!!st.sheetsEmail}>{st.sheetsEmail ? `מסד התלמידים מחובר דרך ${st.sheetsEmail}` : 'מסד התלמידים עדיין לא מחובר'}</Line>
      <Line ok={st.reviews.imported > 0}>{st.reviews.imported ? `יובאו ${st.reviews.imported} ביקורות מהגיליון הישן` : 'ההיסטוריה עדיין לא יובאה'}</Line>
      <Line ok={!st.reviews.gaps?.length}>
        {!st.reviews.gaps?.length ? `רצף מספרי הביקורות תקין (עד #${st.reviews.last_number ?? '—'})`
          : <>חסרים מספרים ברצף: {st.reviews.gaps.slice(0, 10).map((n) => `#${n}`).join(', ')}{st.reviews.gaps.length > 10 ? '…' : ''}</>}
      </Line>
      <div className="actions">
        <a className="btn solid" href="/api/auth/login?connect=1">{st.sheetsEmail ? 'חיבור מחדש למסד' : 'חיבור למסד התלמידים'}</a>
        <AsyncButton className="btn" busyText="מייבא…" onClick={importHist} disabled={!st.sheetsEmail}>ייבוא היסטוריה</AsyncButton>
        {!!st.reviews.gaps?.length && <AsyncButton className="btn" onClick={fixNumbers}>סדר את הרצף</AsyncButton>}
      </div>
    </>
  );
}

/** הגדרות SMS (019) ומצב בדיקה */
function SmsSection({ st, reload }: { st: AdminStatus; reload: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState({ token: '', username: '', source: '', adminPhone: '' });
  const [testPhone, setTestPhone] = useState('');
  const setTest = async (on: boolean) => {
    try {
      await api('/api/admin/sms-settings', { body: on ? { testPhone } : { testOff: true } });
      setTestPhone(''); reload();
      toast(on ? 'מצב בדיקה הופעל — הודעות יישלחו רק למספר הבדיקה' : 'מצב בדיקה כובה — הודעות יישלחו לתלמידים');
    } catch (e) { toast(errMsg(e)); }
  };
  const save = async () => {
    try { await api('/api/admin/sms-settings', { body: f }); setF({ token: '', username: '', source: '', adminPhone: '' }); reload(); toast('ההגדרות נשמרו'); }
    catch (e) { toast(errMsg(e)); }
  };
  return (
    <>
      <Line ok={st.sms.ready}>{st.sms.ready ? `SMS מוגדר (${st.sms.username}, שולח ${st.sms.source})` : 'SMS עדיין לא מוגדר'}</Line>
      <h3 style={{ margin: '16px 0 4px', fontSize: '1em' }}>הגדרות 019</h3>
      <p className="sub">נשמר מוצפן במסד הנתונים. שדה ריק לא משנה את הערך הקיים. הטוקן לא מוצג בחזרה.</p>
      <div className="grid">
        <label className="f">טוקן<input type="password" autoComplete="off" placeholder={st.sms.token ? `מוגדר (${st.sms.token})` : 'לא מוגדר'} value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} disabled={st.sms.fromEnv.token} /></label>
        <label className="f">שם משתמש<input autoComplete="off" placeholder={st.sms.username || 'לא מוגדר'} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} disabled={st.sms.fromEnv.username} /></label>
        <label className="f">שולח (מספר / שם)<input autoComplete="off" placeholder={st.sms.source || 'לא מוגדר'} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} disabled={st.sms.fromEnv.source} /></label>
        <label className="f">טלפון מנהל לדוחות<input type="tel" autoComplete="off" placeholder={st.sms.adminPhone || 'לא מוגדר'} value={f.adminPhone} onChange={(e) => setF({ ...f, adminPhone: e.target.value })} disabled={st.sms.fromEnv.adminPhone} /></label>
      </div>
      <div className="actions">
        <AsyncButton className="btn solid" onClick={save}>שמור הגדרות SMS</AsyncButton>
        <AsyncButton className="btn ghost" busyText="שולח…" disabled={!st.sms.ready || !st.sms.adminPhone}
          onClick={() => api('/api/admin/sms-test', { body: {} }).then(() => toast('הודעת בדיקה נשלחה')).catch((e) => toast(errMsg(e)))}>
          הודעת בדיקה למנהל
        </AsyncButton>
      </div>

      <h3 style={{ margin: '20px 0 4px', fontSize: '1em' }}>מצב בדיקה</h3>
      <p className="sub">כשמצב הבדיקה פעיל, כל שליחה (התחלה / לא ענו) שולחת הודעה לדוגמה אחת לכל נוסח — רק למספר הבדיקה. תלמידים לא מקבלים כלום.</p>
      {st.sms.testPhone ? (
        <>
          <Line ok={false}>מצב בדיקה פעיל — הודעות נשלחות רק ל-{st.sms.testPhone}</Line>
          <div className="actions"><AsyncButton className="btn solid" onClick={() => setTest(false)}>כבה מצב בדיקה</AsyncButton></div>
        </>
      ) : (
        <div className="grid">
          <label className="f">מספר נייד לבדיקה<input type="tel" inputMode="tel" autoComplete="off" placeholder="05X-XXXXXXX" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} /></label>
          <div className="f" style={{ justifyContent: 'flex-end' }}><AsyncButton className="btn solid" disabled={!testPhone.trim()} onClick={() => setTest(true)}>הפעל מצב בדיקה</AsyncButton></div>
        </div>
      )}
    </>
  );
}

/** קישור קבוע לראש הישיבה — צפייה בלבד, בלי סיסמה */
function RoshLink() {
  const { toast, dialog } = useUi();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { api<{ url: string }>('/api/admin/rosh-link').then((r) => setUrl(r.url)).catch(() => setUrl('')); }, []);
  const make = async (rotate: boolean) => {
    if (rotate) {
      const ok = await dialog({ title: 'החלפת הקישור', ok: 'החלף', body: <p>הקישור הנוכחי יפסיק לעבוד מיד, ותצטרך לשלוח לראש הישיבה את הקישור החדש. להמשיך?</p> });
      if (!ok) return;
    }
    try { const r = await api<{ url: string }>('/api/admin/rosh-link', { body: { rotate } }); setUrl(r.url); toast(rotate ? 'נוצר קישור חדש' : 'הקישור נוצר'); }
    catch (e) { toast(errMsg(e)); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url || ''); toast('הקישור הועתק'); } catch { toast('לא הצלחתי להעתיק — סמן את הקישור והעתק ידנית'); }
  };
  return (
    <div style={{ marginBottom: 18 }}>
      <p className="sub">קישור קבוע לצפייה בלבד בתוצאות הביקורות (בלי סיסמה, ובלי אפשרות לשנות כלום). מי שיש לו את הקישור — רואה.</p>
      {url === null ? <p className="sub">טוען…</p> : url ? (
        <>
          <input className="search" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="הקישור לראש הישיבה" dir="ltr" />
          <div className="actions">
            <button className="btn solid" onClick={copy}>העתק קישור</button>
            <a className="btn" href={url} target="_blank" rel="noreferrer">פתח</a>
            <button className="btn wa" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, '_blank')}>שלח בוואטסאפ</button>
            <AsyncButton className="btn danger" onClick={() => make(true)}>החלף קישור</AsyncButton>
          </div>
        </>
      ) : (
        <div className="actions"><AsyncButton className="btn solid" onClick={() => make(false)}>צור קישור</AsyncButton></div>
      )}
    </div>
  );
}

function Passwords({ st, reload }: { st: AdminStatus; reload: () => void }) {
  const { toast, dialog } = useUi();
  const [pw, setPw] = useState({ user: '', admin: '' });
  const save = async (role: 'user' | 'admin') => {
    const label = role === 'user' ? 'סיסמת הכניסה' : 'סיסמת המנהל';
    const ok = await dialog({
      title: `שינוי ${label}`, ok: 'שמור',
      body: <p>כל מי שמחובר כרגע עם {label} הישנה ינותק ויצטרך להיכנס שוב עם החדשה.</p>,
    });
    if (!ok) return;
    try {
      await api('/api/admin/passwords', { body: { role, password: pw[role] } });
      setPw({ ...pw, [role]: '' }); reload();
      toast(`${label} נשמרה`);
      if (role === 'admin') window.location.href = '/login';
    } catch (e) { toast(errMsg(e)); }
  };
  const Line = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <div className="okline"><span className={'dot ' + (ok ? 'on' : 'off')} aria-hidden="true" /><span>{ok ? '✓' : '⚠'} {children}</span></div>
  );
  return (
    <div style={{ marginBottom: 18 }}>
      <p className="sub">סיסמת כניסה — לכל מי שעושה ביקורות. סיסמת מנהל — נותנת גם גישה להגדרות, SMS ומחיקת ביקורות. שתיהן לפחות 6 תווים.</p>
      <Line ok={st.passwords.user}>{st.passwords.user ? 'סיסמת כניסה מוגדרת' : 'סיסמת כניסה עוד לא הוגדרה — אף אחד לא יכול להיכנס עם סיסמה'}</Line>
      <Line ok={st.passwords.admin}>{st.passwords.admin ? 'סיסמת מנהל מוגדרת' : 'סיסמת מנהל עוד לא הוגדרה'}</Line>
      <div className="grid" style={{ marginTop: 8 }}>
        {(['user', 'admin'] as const).map((role) => (
          <div key={role} className="f">
            <label className="f">{role === 'user' ? 'סיסמת כניסה חדשה' : 'סיסמת מנהל חדשה'}
              <PasswordInput value={pw[role]} onChange={(v) => setPw({ ...pw, [role]: v })} />
            </label>
            <AsyncButton className="btn solid" disabled={pw[role].length < 6} onClick={() => save(role)}>שמור</AsyncButton>
          </div>
        ))}
      </div>
    </div>
  );
}

function PasswordInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw">
      <input type={show ? 'text' : 'password'} autoComplete="new-password" minLength={6} value={value}
        onChange={(e) => onChange(e.target.value)} spellCheck={false} autoCapitalize="off" />
      <button type="button" className="pw-eye" onClick={() => setShow(!show)}
        aria-label={show ? 'הסתר סיסמה' : 'הצג סיסמה'} aria-pressed={show}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
          {show && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </span>
  );
}
