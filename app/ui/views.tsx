'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, AsyncButton, errMsg, NO_ANSWER, pctText, Result, STATUSES, TYPES, typeLabel, useUi, Warn } from './kit';
import type { ReviewState } from './App';
import { useSms } from './useSms';

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
    const data = await api<{ entries: { id: string; last_name: string; first_name: string; status: string }[] }>(`/api/history/${r.id}`).catch((e) => ({ error: errMsg(e) }));
    const groups = new Map<string, string[]>();
    if ('entries' in data) data.entries.forEach((e) => {
      if (!groups.has(e.status)) groups.set(e.status, []);
      groups.get(e.status)!.push(`${e.last_name} ${e.first_name}`);
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
      body: <p><Warn />הביקורת מ-{r.date_heb} ({r.total} תלמידים) ותוצאותיה יימחקו לצמיתות. אי אפשר לבטל.</p>,
    });
    if (!ok) return;
    try {
      await api(`/api/history/${r.id}`, { method: 'DELETE' });
      setRows((prev) => prev && prev.filter((x) => x.id !== r.id));
      toast(`ביקורת #${r.number} נמחקה`);
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
  const [hist, setHist] = useState<{ id: number; number: number; date_heb: string; time: string; type: string; status: string; imported: boolean }[] | null>(null);

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
                  <tbody>{hist.map((h) => <tr key={h.id}><td className="num">{h.number}</td><td>{h.date_heb}</td><td>{h.time}</td><td>{typeLabel(h.type)}</td><td><Warn show={h.status === NO_ANSWER} />{h.status}</td></tr>)}</tbody>
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

type PrintData = { reviews: PrintReview[]; rows: { last: string; first: string; statuses: string[] }[] };
const REPORTS = [
  { kind: 'cover', label: 'שער — סיכום' },
  { kind: 'all', label: 'כללי' },
  { kind: 'missing', label: 'חסר / לא ענה' },
  { kind: 'bishuv', label: 'בישוב' },
  { kind: 'nirsham', label: 'נרשם' },
];

export function PrintView() {
  const [kind, setKind] = useState('everything');
  const [count, setCount] = useState(3);
  const [data, setData] = useState<PrintData | null>(null);
  const [err, setErr] = useState('');

  // נתון אחד מהשרת (כל התלמידים), והסינונים נעשים כאן — מהיר יותר מ-5 קריאות
  useEffect(() => {
    setData(null); setErr('');
    api<PrintData>(`/api/print?kind=all&count=${count}`).then(setData).catch((e) => setErr(errMsg(e)));
  }, [count]);

  const kinds = kind === 'everything' ? REPORTS.map((r) => r.kind) : [kind];
  const landscape = count > 4;

  return (
    <>
      {landscape && <style>{'@media print { @page { size: A4 landscape; } }'}</style>}
      <div className="card no-print">
        <h2>הדפסה</h2>
        <p className="sub">תלמידי הביקורת הנוכחית, לפי הביקורות האחרונות שנסגרו.{landscape ? ' יודפס לרוחב הדף.' : ''}</p>
        <div className="grid">
          <label className="f">דוח
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="everything">הכל (שער, כללי, חסר/לא ענה, בישוב, נרשם)</option>
              {REPORTS.map((r) => <option key={r.kind} value={r.kind}>{r.label}</option>)}
            </select>
          </label>
          <label className="f">מספר ביקורות
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>{Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}</select>
          </label>
        </div>
        <div className="actions"><button className="btn solid" onClick={() => window.print()} disabled={!data?.reviews.length}>הדפס</button></div>
      </div>
      <div id="printArea">
        {err ? <div className="empty">{err}</div> : !data ? <div className="loading">טוען…</div> : !data.reviews.length ? <div className="empty">אין ביקורות סגורות.</div> : (
          kinds.map((k) => <PrintReport key={k} kind={k} data={data} />)
        )}
      </div>
    </>
  );
}

function PrintReport({ kind, data }: { kind: string; data: PrintData }) {
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
  return (
    <section className="print-section">
      <h2>{title}</h2>
      <div className="twrap">
        <table>
          <thead>
            {summary.slice(cover ? 0 : 1).map(([label, get]) => (
              <tr key={label}><th colSpan={cover ? 1 : 2}>{label}</th>{data.reviews.map((r) => <th key={r.id} className="num">{get(r)}</th>)}</tr>
            ))}
            {!cover && <tr><th>שם משפחה</th><th>שם פרטי</th>{data.reviews.map((r) => <th key={r.id} className="num">{r.date_heb}</th>)}</tr>}
          </thead>
          {!cover && (
            <tbody>{rows.map((row, i) => <tr key={i}><td>{row.last}</td><td>{row.first}</td>{row.statuses.map((st, j) => <td key={j} className="num">{st}</td>)}</tr>)}</tbody>
          )}
        </table>
      </div>
    </section>
  );
}

/* ======================= ניהול ======================= */

type AdminStatus = {
  google: boolean; sheetsEmail: string;
  reviews: { imported: number; closed: number; last_number: number | null };
  sms: { token: string; username: string; source: string; adminPhone: string; ready: boolean; fromEnv: Record<string, boolean>; testPhone: string };
};

export function AdminView({ user, rv, counts, goReview }: { user: { admin: boolean }; rv: ReviewState; counts: Record<string, number>; goReview: () => void }) {
  const { toast, dialog } = useUi();
  const sms = useSms(rv);
  const [st, setSt] = useState<AdminStatus | null>(null);
  const r = rv.review;
  const [meta, setMeta] = useState({ date_heb: r?.date_heb || '', time: r?.time || '', type: r?.type || 'פנימית' });
  useEffect(() => { setMeta({ date_heb: r?.date_heb || '', time: r?.time || '', type: r?.type || 'פנימית' }); }, [r?.id, r?.date_heb, r?.time, r?.type]);

  const loadStatus = useCallback(() => api<AdminStatus>('/api/admin/status').then(setSt).catch(() => {}), []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const saveMeta = async () => {
    try { await api(`/api/review/${r!.id}`, { method: 'PATCH', body: meta }); await rv.reload(); toast('הפרטים נשמרו'); }
    catch (e) { toast(errMsg(e)); }
  };

  const close = async () => {
    if (!r) return;
    const pct = counts.all ? Math.round(((counts['נוכח'] + counts['בישוב']) / counts.all) * 1000) / 10 : 0;
    const ok = await dialog({
      title: 'סגירת ביקורת', ok: 'סגור ושמור',
      body: (
        <>
          <p>{[meta.date_heb, meta.time, meta.type].join(' · ')}</p>
          <div className="twrap"><table><tbody>
            {STATUSES.map((s) => <tr key={s}><td><Warn show={s === NO_ANSWER} />{s}</td><td className="num">{counts[s]}</td></tr>)}
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

  return (
    <>
      {r && (
        <>
          <div className="card">
            <h2>SMS</h2>
            <p className="sub">נשלח רק למי שמסומן &quot;לא ענה&quot; ({counts[NO_ANSWER]}).</p>
            <div className="actions">
              <AsyncButton className="btn solid" busyText="שולח…" onClick={() => sms('start', counts[NO_ANSWER])}>סמס התחלה</AsyncButton>
              <AsyncButton className="btn" busyText="שולח…" onClick={() => sms('noanswer', counts[NO_ANSWER])}>סמס לא ענו</AsyncButton>
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
      )}

      {!r && <div className="card"><p className="sub" style={{ margin: 0 }}>אין ביקורת פתוחה. ביקורת חדשה נפתחת ממסך הבית (לשונית ביקורת).</p></div>}
      {user.admin && st && <Setup st={st} reload={() => { loadStatus(); rv.reload(); }} />}

      <div className="card">
        <form action="/api/auth/logout" method="post"><button className="btn ghost">יציאה מהמערכת</button></form>
      </div>
    </>
  );
}

function Setup({ st, reload }: { st: AdminStatus; reload: () => void }) {
  const { toast, dialog } = useUi();
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
  const importHist = async () => {
    const ok = await dialog({ title: 'ייבוא היסטוריה', body: <p>ייבוא כל הביקורות מגליון &quot;מסד&quot; בקובץ &quot;ביקורת&quot;. ביקורות שכבר יובאו לא ייובאו שוב.</p>, ok: 'ייבא' });
    if (!ok) return;
    try {
      const r = await api<{ imported: number; skipped: number; entries: number }>('/api/admin/import', { body: {} });
      toast(`יובאו ${r.imported} ביקורות (${r.entries} רשומות)${r.skipped ? `, ${r.skipped} כבר היו קיימות` : ''}`);
      reload();
    } catch (e) { toast(errMsg(e)); }
  };

  const Line = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <div className="okline"><span className={'dot ' + (ok ? 'on' : 'off')} aria-hidden="true" /><span>{ok ? '✓' : '⚠'} {children}</span></div>
  );

  return (
    <div className="card">
      <h2>הגדרות מערכת</h2>
      <p className="sub">מוצג רק למנהלים.</p>
      <Line ok={!!st.sheetsEmail}>{st.sheetsEmail ? `מסד התלמידים מחובר דרך ${st.sheetsEmail}` : 'מסד התלמידים עדיין לא מחובר'}</Line>
      <Line ok={st.reviews.imported > 0}>{st.reviews.imported ? `יובאו ${st.reviews.imported} ביקורות מהגיליון הישן` : 'ההיסטוריה עדיין לא יובאה'}</Line>
      <Line ok={st.sms.ready}>{st.sms.ready ? `SMS מוגדר (${st.sms.username}, שולח ${st.sms.source})` : 'SMS עדיין לא מוגדר'}</Line>
      <div className="actions">
        <a className="btn solid" href="/api/auth/login?connect=1">{st.sheetsEmail ? 'חיבור מחדש למסד' : 'חיבור למסד התלמידים'}</a>
        <AsyncButton className="btn" busyText="מייבא…" onClick={importHist} disabled={!st.sheetsEmail}>ייבוא היסטוריה</AsyncButton>
      </div>

      <h3 style={{ margin: '20px 0 4px', fontSize: '1em' }}>הגדרות SMS (019)</h3>
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

      <h3 style={{ margin: '20px 0 4px', fontSize: '1em' }}>מצב בדיקת SMS</h3>
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
    </div>
  );
}
