'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, AsyncButton, errMsg, Icon, NO_ANSWER, STATUSES, UiProvider, useUi, Warn, type Status } from './kit';
import { AdminView, HistoryView, PrintView } from './views';
import { useSms } from './useSms';
import { typeLabel } from './kit';
import { LockGate } from './lock';

type User = { email: string; name: string; admin: boolean };
export type Review = { id: number; number: number | null; session: string; type: string; date_heb: string; time: string };
export type Entry = { id: string; last_name: string; first_name: string; status: Status };
type Tab = 'review' | 'history' | 'print' | 'admin';

export default function App({ user }: { user: User }) {
  return <LockGate><UiProvider><Shell user={user} /></UiProvider></LockGate>;
}

/* ---------- סנכרון הביקורת הפתוחה ---------- */

function useReview() {
  const [review, setReview] = useState<Review | null>(null);
  const [entries, setEntries] = useState<Map<string, Entry>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [smsTest, setSmsTest] = useState(false);
  const [session, setSession] = useState('');
  const [groupText, setGroupText] = useState('');
  const [sync, setSync] = useState<{ text: string; err?: boolean }>({ text: 'טוען…' });
  const pending = useRef(new Map<string, Status>());
  const since = useRef<string>('');
  const reviewId = useRef<number | null>(null);
  const inflight = useRef(false);

  const load = useCallback(async (full = false) => {
    const q = !full && since.current && reviewId.current ? `?since=${encodeURIComponent(since.current)}` : '';
    const r = await api<{ review: Review | null; entries: Entry[]; full: boolean; now: string; smsTest: boolean; session: string; groupText?: string }>(`/api/review${q}`);
    since.current = r.now;
    setSmsTest(r.smsTest);
    setSession(r.session);
    setGroupText(r.groupText || '');
    if ((r.review?.id ?? null) !== reviewId.current && !r.full) return load(true);
    reviewId.current = r.review?.id ?? null;
    setReview(r.review);
    setEntries((prev) => {
      const next = r.full ? new Map<string, Entry>() : new Map(prev);
      for (const e of r.entries) {
        const p = pending.current.get(e.id);
        next.set(e.id, { id: e.id, last_name: e.last_name, first_name: e.first_name, status: p ?? e.status });
      }
      return next;
    });
    setLoaded(true);
  }, []);

  // שליחת הסימונים שממתינים — כל סימון נשמר בנפרד, עם ניסיון חוזר אוטומטי
  const flush = useCallback(async () => {
    if (inflight.current || !reviewId.current) return;
    inflight.current = true;
    try {
      while (pending.current.size) {
        setSync({ text: 'שומר…' });
        const batch = [...pending.current.entries()];
        const results = await Promise.allSettled(batch.map(([id, status]) =>
          api(`/api/review/${reviewId.current}/mark`, { body: { studentId: id, status } })));
        let failed = false;
        results.forEach((res, i) => {
          const [id, status] = batch[i];
          if (res.status === 'fulfilled' || (res.reason as { status?: number })?.status === 409 || (res.reason as { status?: number })?.status === 400) {
            if (pending.current.get(id) === status) pending.current.delete(id);
          } else failed = true;
        });
        if (failed) {
          setSync({ text: 'לא נשמר — מנסה שוב', err: true });
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      setSync({ text: 'נשמר' });
    } finally {
      inflight.current = false;
    }
  }, []);

  const mark = useCallback((id: string, status: Status) => {
    pending.current.set(id, status);
    setEntries((prev) => {
      const e = prev.get(id);
      if (!e) return prev;
      const next = new Map(prev);
      next.set(id, { ...e, status });
      return next;
    });
    void flush();
  }, [flush]);

  const markAll = useCallback(async (ids: string[], status: Status) => {
    if (!reviewId.current) return;
    setEntries((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => { const e = next.get(id); if (e) next.set(id, { ...e, status }); });
      return next;
    });
    setSync({ text: 'שומר…' });
    await api(`/api/review/${reviewId.current}/mark`, { body: { ids, status } });
    setSync({ text: 'נשמר' });
  }, []);

  useEffect(() => {
    load(true).then(() => setSync({ text: 'מעודכן' })).catch((e) => setSync({ text: errMsg(e), err: true }));
    // רענון כל 4 שניות — רואים סימונים של מבקרים אחרים כמעט מיד
    const t = setInterval(() => {
      if (document.hidden || pending.current.size || inflight.current) return;
      load().catch(() => setSync({ text: 'אין חיבור', err: true }));
    }, 4000);
    const full = setInterval(() => { if (!document.hidden && !pending.current.size) load(true).catch(() => {}); }, 60000);
    const onVis = () => { if (!document.hidden) load().catch(() => {}); };
    document.addEventListener('visibilitychange', onVis);
    const onUnload = (e: BeforeUnloadEvent) => { if (pending.current.size) e.preventDefault(); };
    window.addEventListener('beforeunload', onUnload);
    return () => { clearInterval(t); clearInterval(full); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('beforeunload', onUnload); };
  }, [load]);

  const waitSaved = useCallback(async () => {
    await flush();
    while (pending.current.size || inflight.current) await new Promise((r) => setTimeout(r, 200));
  }, [flush]);

  return { review, entries, loaded, sync, smsTest, session, groupText, mark, markAll, reload: () => load(true), waitSaved };
}
export type ReviewState = ReturnType<typeof useReview>;

/* ---------- מעטפת ---------- */

function Shell({ user }: { user: User }) {
  const rv = useReview();
  const [tab, setTab] = useState<Tab>('review');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [query, setQuery] = useState('');
  const { toast } = useUi();

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get('tab') === 'admin') setTab('admin');
    if (p.get('connected')) toast('מסד התלמידים חובר בהצלחה');
    if (p.size) window.history.replaceState(null, '', '/');
  }, [toast]);

  const list = useMemo(() => [...rv.entries.values()], [rv.entries]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.length };
    STATUSES.forEach((s) => (c[s] = 0));
    list.forEach((e) => c[e.status]++);
    return c;
  }, [list]);

  const go = (t: Tab) => { setTab(t); window.scrollTo(0, 0); if (t === 'review') rv.reload().catch(() => {}); };

  const cycleSize = () => {
    const sizes = ['normal', 'large', 'xlarge'];
    const cur = document.documentElement.getAttribute('data-size') || 'normal';
    const next = sizes[(sizes.indexOf(cur) + 1) % 3];
    document.documentElement.setAttribute('data-size', next);
    try { localStorage.setItem('bk_size', next); } catch {}
    toast('גודל גופן: ' + ({ normal: 'רגיל', large: 'גדול', xlarge: 'גדול מאוד' } as Record<string, string>)[next]);
  };
  const toggleTheme = () => {
    const root = document.documentElement;
    const dark = root.getAttribute('data-theme') === 'dark' || (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', dark ? 'light' : 'dark');
    try { localStorage.setItem('bk_theme', dark ? 'light' : 'dark'); } catch {}
  };

  const r = rv.review;
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--hdr', `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="app">
      <header className="top" ref={headerRef}>
        <div className="bar">
          <div className="grow">
            <h1>{r ? `${typeLabel(r.type)} · ${r.session}` : 'ביקורת נוכחות'}</h1>
            <div className="meta">{r ? [r.date_heb, r.time].filter(Boolean).join(' · ') : user.name}</div>
          </div>
          <span className={'sync' + (rv.sync.err ? ' err' : '')} role="status" aria-live="polite">{rv.sync.text}</span>
          <button className="ibtn" onClick={cycleSize} aria-label="שינוי גודל גופן">א+</button>
          <button className="ibtn" onClick={toggleTheme} aria-label="מעבר בין מצב כהה למצב בהיר"><Icon name="moon" /></button>
        </div>
        {tab === 'review' && r && (
          <div className="tools">
            <div className="stats" role="group" aria-label="סינון לפי סטטוס">
              {(['all', ...STATUSES] as const).map((s) => (
                <button key={s} className={'stat' + (s === NO_ANSWER ? ' warn' : '')} aria-pressed={filter === s} onClick={() => setFilter(s)}>
                  <span className="n">{s === NO_ANSWER && counts[s] ? <small aria-hidden="true">⚠ </small> : ''}{counts[s]}</span>
                  <span className="l">{s === 'all' ? 'הכל' : s}</span>
                </button>
              ))}
            </div>
            <div className="progress" aria-hidden="true"><i style={{ width: `${counts.all ? ((counts.all - counts[NO_ANSWER]) / counts.all) * 100 : 0}%` }} /></div>
            <div className="row2">
              <label className="sr-only" htmlFor="search">חיפוש תלמיד</label>
              <input id="search" className="search" type="search" placeholder="חיפוש תלמיד" autoComplete="off" enterKeyHint="search"
                value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
              <NoAnswerButton rv={rv} count={counts[NO_ANSWER]} />
            </div>
          </div>
        )}
      </header>

      <main>
        {rv.smsTest && <div className="banner" role="note"><Warn />מצב בדיקת SMS פעיל — הודעות נשלחות רק למספר הבדיקה, לא לתלמידים.</div>}
        {tab === 'review' && rv.loaded && !rv.review && <Home rv={rv} />}
        {tab === 'review' && <ReviewList rv={rv} filter={filter} query={query} />}
        {tab === 'history' && <HistoryView admin={user.admin} />}
        {tab === 'print' && <PrintView />}
        {tab === 'admin' && <AdminView user={user} rv={rv} counts={counts} goReview={() => go('review')} />}
      </main>

      <nav className="tabs" role="tablist" aria-label="מסכים">
        {([['review', 'check', 'ביקורת'], ['history', 'chart', 'תוצאות'], ['print', 'print', 'הדפסה'], ['admin', 'gear', 'ניהול']] as const).map(([t, ic, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => go(t)}><Icon name={ic} />{label}</button>
        ))}
      </nav>
    </div>
  );
}

/* ---------- רשימת התלמידים ---------- */

function ReviewList({ rv, filter, query }: { rv: ReviewState; filter: 'all' | Status; query: string }) {
  const { toast, dialog } = useUi();
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const q = query.trim();
    return [...rv.entries.values()].filter((e) =>
      (filter === 'all' || e.status === filter) && (!q || `${e.last_name} ${e.first_name}`.includes(q)));
  }, [rv.entries, filter, query]);

  // כמה "לא ענה" נשארו בכל אות — לפי כל התלמידים, בלי קשר לסינון/חיפוש
  const left = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of rv.entries.values()) {
      const l = (e.last_name || e.first_name).charAt(0);
      m.set(l, (m.get(l) || 0) + (e.status === NO_ANSWER ? 1 : 0));
    }
    return m;
  }, [rv.entries]);

  if (!rv.loaded) return <div className="loading">טוען את הביקורת…</div>;
  if (!rv.review) return null;

  // בלי הודעה קופצת על כל סימון — טעות מתקנים בלחיצה על הכפתור הנכון
  const setStatus = (e: Entry, s: Status, _silent = false) => {
    if (e.status === s) return;
    rv.mark(e.id, s);
  };

  const onKey = (ev: React.KeyboardEvent, e: Entry) => {
    const step = ({ ArrowLeft: 1, ArrowRight: -1, ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[ev.key];
    if (!step) return;
    ev.preventDefault();
    const next = STATUSES[(STATUSES.indexOf(e.status) + step + 5) % 5];
    setStatus(e, next, true);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-id="${e.id}"][aria-checked="true"]`)?.focus());
  };

  const noAnswer = [...rv.entries.values()].filter((e) => e.status === NO_ANSWER);
  const bulk = async () => {
    const ok = await dialog({ title: 'סימון כנוכחים', body: <p>לסמן <b>{noAnswer.length}</b> תלמידים שלא ענו כ&quot;נוכח&quot;?</p>, ok: 'סמן' });
    if (!ok) return;
    const ids = noAnswer.map((e) => e.id);
    try {
      await rv.markAll(ids, 'נוכח');
      toast(`${ids.length} סומנו כנוכחים`, { label: 'בטל', run: () => rv.markAll(ids, NO_ANSWER).catch(() => {}) });
    } catch (e) { toast(errMsg(e)); rv.reload(); }
  };

  if (!visible.length) return <div className="empty">אין תלמידים שמתאימים לסינון.</div>;

  const groups: [string, Entry[]][] = [];
  for (const e of visible) {
    const l = (e.last_name || e.first_name).charAt(0);
    if (!groups.length || groups[groups.length - 1][0] !== l) groups.push([l, []]);
    groups[groups.length - 1][1].push(e);
  }

  return (
    <div ref={listRef} className="list-wrap">
      <AlphaIndex letters={groups.map((g) => g[0])} left={left} />
      {groups.map(([letter, items]) => {
        const n = left.get(letter) || 0;
        return (
        <section key={letter} aria-label={`אות ${letter}`} data-letter={letter}>
          <h3 className={'letter' + (n ? '' : ' done')} id={`L-${letter}`}>
            {letter}
            {n
              ? <span className="left-n" aria-label={`${n} לא ענו`}>{n}</span>
              : <span className="done-ic" role="img" aria-label="הושלם"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9" /></svg></span>}
          </h3>
          <ul className="list">
            {items.map((e) => <StudentRow key={e.id} e={e} onSet={setStatus} onKey={onKey} />)}
          </ul>
        </section>
        );
      })}
      {noAnswer.length > 0 && filter === 'all' && !query && (
        <div className="bulk"><button className="btn ghost" onClick={bulk}>סמן את כל מי שלא ענה כנוכח ({noAnswer.length})</button></div>
      )}
    </div>
  );
}

const StudentRow = memoRow(function StudentRow({ e, onSet, onKey }: {
  e: Entry; onSet: (e: Entry, s: Status) => void; onKey: (ev: React.KeyboardEvent, e: Entry) => void;
}) {
  const na = e.status === NO_ANSWER;
  const labelId = `lbl-${e.id}`;
  return (
    <li className={'stu' + (na ? ' noans' : '')}>
      <div className="stu-name" id={labelId}>
        {e.last_name} {e.first_name}
      </div>
      <div className="seg" role="radiogroup" aria-labelledby={labelId}>
        {STATUSES.map((s) => (
          <button key={s} role="radio" aria-checked={e.status === s} tabIndex={e.status === s ? 0 : -1} data-id={e.id}
            className={s === NO_ANSWER ? 'na' : undefined}
            onClick={() => onSet(e, s)} onKeyDown={(ev) => onKey(ev, e)}>{s}</button>
        ))}
      </div>
    </li>
  );
});

/* ---------- פס אותיות בצד + בועת אות בגלילה ---------- */

function AlphaIndex({ letters, left }: { letters: string[]; left: Map<string, number> }) {
  const bar = useRef<HTMLDivElement>(null);
  const [bubble, setBubble] = useState('');
  const [active, setActive] = useState(false);
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = useCallback((l: string) => {
    setBubble(l);
    clearTimeout(hide.current);
    hide.current = setTimeout(() => setBubble(''), 650);
  }, []);

  // בזמן גלילה — בועה עם האות של הקטע הנוכחי
  useEffect(() => {
    let raf = 0;
    let lastY = window.scrollY;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const fast = Math.abs(window.scrollY - lastY) > 40;
        lastY = window.scrollY;
        if (!fast && !active) return;
        const hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr')) || 0;
        let cur = '';
        document.querySelectorAll<HTMLElement>('section[data-letter]').forEach((sec) => {
          if (sec.getBoundingClientRect().top - hdr <= 8) cur = sec.dataset.letter || '';
        });
        if (cur) flash(cur);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [flash, active]);

  const pick = (clientY: number) => {
    const el = bar.current;
    if (!el || !letters.length) return;
    const r = el.getBoundingClientRect();
    const i = Math.min(letters.length - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * letters.length)));
    const l = letters[i];
    // גוללים לתחילת הקטע ולא לכותרת: הכותרת דביקה, והמיקום שלה הוא מיקום ה"נעיצה" (סוף הקטע)
    const sec = document.querySelector<HTMLElement>(`section[data-letter="${CSS.escape(l)}"]`);
    if (sec) {
      const hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr')) || 0;
      window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - hdr, behavior: 'instant' });
    }
    flash(l);
  };

  if (letters.length < 4) return null;
  return (
    <>
      <div ref={bar} className={'alpha' + (active ? ' active' : '')} aria-hidden="true"
        onPointerDown={(e) => { setActive(true); e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientY); }}
        onPointerMove={(e) => { if (active) pick(e.clientY); }}
        onPointerUp={() => setActive(false)} onPointerCancel={() => setActive(false)}>
        {letters.map((l) => <span key={l} className={left.get(l) ? 'left' : 'done'}>{l}</span>)}
      </div>
      <div className={'bubble' + (bubble ? ' show' : '')} aria-hidden="true">{bubble}</div>
    </>
  );
}

// רינדור מחדש רק של השורה שהשתנתה — חשוב לרשימה של 150 תלמידים בטלפון
function memoRow<T extends { e: Entry }>(C: React.FC<T>) {
  return memo(C, (a, b) => a.e === b.e);
}

function NoAnswerButton({ rv, count }: { rv: ReviewState; count: number }) {
  const sms = useSms(rv);
  return (
    <AsyncButton className="btn ghost" busyText="שולח…" disabled={!count} onClick={() => sms('noanswer', count)}
      aria-label={`שליחת SMS ל-${count} תלמידים שלא ענו`}>
      <Icon name="msg" size={18} /> ללא ענו ({count})
    </AsyncButton>
  );
}

/* ---------- מסך הבית: בחירת סוג ביקורת ---------- */

const START_TYPES = [
  { type: 'פנימית', title: 'פנימית', sub: 'כל התלמידים', urgent: false },
  { type: 'חיצונית 00', title: 'אמת 00', sub: 'תלמידי 00', urgent: true },
  { type: 'חיצונית 02', title: 'אמת 02', sub: 'תלמידי 02', urgent: true },
];

function Home({ rv }: { rv: ReviewState }) {
  const { toast } = useUi();
  const sms = useSms(rv);
  const [busy, setBusy] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // גודל הריבועים לפי המקום שבאמת נשאר על המסך (אחרי כותרת, באנרים וסרגל תחתון) — בלי גלילה
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const GAP = 12;
    const fit = () => {
      // המקום מתחילת הריבועים ועד סוף המסך, פחות מה שהדף שומר מתחתיהם (ריווח מעל הסרגל התחתון)
      const pad = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).paddingBottom) || 0 : 0);
      const below = pad(box.closest('main')) + pad(box.closest('.app'));
      const avail = window.innerHeight - (box.getBoundingClientRect().top + window.scrollY) - below;
      const size = Math.max(96, Math.min(box.clientWidth, (avail - GAP * 2) / 3));
      box.style.setProperty('--sq-size', `${Math.floor(size)}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(document.body);
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit); };
  }, []);

  const start = async (type: string) => {
    if (busy) return;
    setBusy(type);
    try {
      const res = await api<{ id: number; count: number; skipped: { name: string; reason: string }[] }>('/api/review', { body: { type } });
      await rv.reload();
      if (res.skipped.length) toast(`${res.skipped.length} תלמידים לא נטענו (חסרה ת"ז או כפילות)`);
      await sms('start', res.count, res.id);
    } catch (e) {
      if ((e as { status?: number }).status === 409) { toast('כבר נפתחה ביקורת — מציג אותה'); await rv.reload(); }
      else toast(errMsg(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="home">
      <p className="sub">ביקורת חדשה · {rv.session || '…'} (נקבע לפי השעה)</p>
      <div className="starts" ref={boxRef}>
        {START_TYPES.map((t) => (
          <button key={t.type} className={'start' + (t.urgent ? ' urgent' : '')} onClick={() => start(t.type)} disabled={!!busy} aria-busy={busy === t.type}
            aria-label={`ביקורת ${t.title} — ${t.sub}`}>
            <span className="k">{t.urgent && <span className="siren" aria-hidden="true" />}ביקורת</span>
            <span className="t">{busy === t.type ? 'טוען…' : t.title}</span>
            <span className="s">{t.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
