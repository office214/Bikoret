'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDays, dayLabel, hebMonth, hebNum, nowIL, WEEKDAYS } from '@/lib/hebcal';

/* ---------- לוח חודש עברי (מימין לשמאל) + בחירת שעה ---------- */

export type When = { date: string; time: string };

const HOURS = Array.from({ length: 17 }, (_, i) => String(i + 7).padStart(2, '0')); // 07–23
const MINUTES = ['00', '15', '30', '45'];

export function HebCalendar({ value, onChange }: { value: string; onChange: (ymd: string) => void }) {
  const today = nowIL().ymd;
  const [anchor, setAnchor] = useState(value || today);
  const m = useMemo(() => hebMonth(anchor), [anchor]);
  const canPrev = m.first > today;
  const lead = m.days[0].weekday; // ימים ריקים לפני ה-1 בחודש

  return (
    <div className="hcal">
      <div className="hcal-h">
        <button type="button" className="hcal-nav" onClick={() => setAnchor(addDays(m.first, -1))} disabled={!canPrev} aria-label="החודש הקודם">›</button>
        <b aria-live="polite">{m.title}</b>
        <button type="button" className="hcal-nav" onClick={() => setAnchor(addDays(m.last, 1))} aria-label="החודש הבא">‹</button>
      </div>
      <div className="hcal-grid" role="grid" aria-label={m.title}>
        {WEEKDAYS.map((w, i) => <span key={w} className={'hcal-w' + (i === 6 ? ' shab' : '')} aria-hidden="true">{w === 'ש׳' ? 'שבת' : w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={'e' + i} />)}
        {m.days.map((d) => {
          const past = d.ymd < today;
          const shab = d.weekday === 6;
          return (
            <button key={d.ymd} type="button" role="gridcell"
              className={'hcal-d' + (d.ymd === today ? ' today' : '') + (shab ? ' shab' : '')}
              aria-selected={value === d.ymd} disabled={past || shab}
              aria-label={dayLabel(d.ymd) + (d.ymd === today ? ' (היום)' : '')}
              onClick={() => onChange(d.ymd)}>
              <span className="hd">{hebNum(d.day)}</span>
              <span className="gd">{d.greg}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TimePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const [h, mm] = (value || '11:00').split(':');
  return (
    <div className="tpick">
      <label>שעה
        <select value={h} onChange={(e) => onChange(`${e.target.value}:${mm}`)}>
          {HOURS.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
      <span aria-hidden="true">:</span>
      <label>דקות
        <select value={MINUTES.includes(mm) ? mm : '00'} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
          {MINUTES.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </label>
    </div>
  );
}

/**
 * חלון קטן לבחירת מועד: לוח עברי + שעה + הערה (לא חובה).
 * הכפתור ננעל בזמן השליחה — לחיצה כפולה לא שולחת פעמיים.
 */
export function WhenDialog({ title, sub, initial, noteLabel, initialNote = '', submitLabel, onSubmit, onClose }: {
  title: string; sub?: string; initial?: Partial<When>; noteLabel?: string; initialNote?: string; submitLabel: string;
  onSubmit: (w: When, note: string) => Promise<void>; onClose: () => void;
}) {
  const [date, setDate] = useState(initial?.date || '');
  const [time, setTime] = useState(initial?.time || '11:00');
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', esc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose, busy]);

  const send = async () => {
    if (busy) return;
    if (!date) { setErr('יש לבחור תאריך בלוח'); return; }
    const now = nowIL();
    if (date === now.ymd && time <= now.hhmm) { setErr('השעה הזו כבר עברה היום'); return; }
    setBusy(true); setErr('');
    try { await onSubmit({ date, time }, note.trim()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  return (
    <div className="rcard-bg center when-bg" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <section className="rnote when" role="dialog" aria-modal="true" aria-label={title}>
        <header className="rcard-h">
          <div>
            <h2>{title}</h2>
            {sub && <p className="rosh-sub">{sub}</p>}
          </div>
          <button className="rcard-x" onClick={onClose} disabled={busy} aria-label="סגירה">✕</button>
        </header>
        <HebCalendar value={date} onChange={(d) => { setDate(d); setErr(''); }} />
        <div className="when-row">
          <span className="when-sel">{date ? dayLabel(date) : 'לא נבחר תאריך'}</span>
          <TimePicker value={time} onChange={(t) => { setTime(t); setErr(''); }} />
        </div>
        {noteLabel && (
          <label className="when-note">{noteLabel}
            <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="לא חובה" />
          </label>
        )}
        {err && <p className="when-err" role="alert">{err}</p>}
        <div className="rnote-actions">
          <button className="btn solid" onClick={send} disabled={busy} aria-busy={busy}>{busy ? 'שולח…' : submitLabel}</button>
          <button className="btn ghost" onClick={onClose} disabled={busy}>ביטול</button>
        </div>
      </section>
    </div>
  );
}
