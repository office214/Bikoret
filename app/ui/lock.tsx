'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/*
 * נעילה בכל פתיחה: עוגיית הכניסה נשמרת בטלפון גם כשסוגרים את האפליקציה,
 * לכן מסמנים את הכניסה ב-sessionStorage — שנמחק כשהלשונית/האפליקציה נסגרת.
 * בנוסף ננעל אחרי שעה ברקע.
 */
const KEY = 'bk_open';
const HIDDEN_KEY = 'bk_hidden_at';
const IDLE_MS = 60 * 60_000;

/** נקרא ברגע השליחה של טופס הכניסה */
export function markOpened() {
  try { sessionStorage.setItem(KEY, '1'); sessionStorage.removeItem(HIDDEN_KEY); } catch {}
}

function lock() {
  try { sessionStorage.removeItem(KEY); sessionStorage.removeItem(HIDDEN_KEY); } catch {}
  fetch('/api/auth/logout', { method: 'POST', redirect: 'manual' }).finally(() => window.location.replace('/login'));
}

export function LockGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let opened = false;
    try { opened = sessionStorage.getItem(KEY) === '1'; } catch {}
    if (!opened) { lock(); return; }
    setOk(true);
    const onVis = () => {
      try {
        if (document.visibilityState === 'hidden') { sessionStorage.setItem(HIDDEN_KEY, String(Date.now())); return; }
        const at = Number(sessionStorage.getItem(HIDDEN_KEY) || 0);
        sessionStorage.removeItem(HIDDEN_KEY);
        if (at && Date.now() - at > IDLE_MS) lock();
      } catch {}
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return ok ? <>{children}</> : null;
}

const NAME_KEY = 'bk_name';

/**
 * טופס הכניסה. המקלדת לא נפתחת לבד — כדי שאפשר יהיה ללחוץ ישר על Google.
 * Enter בשם עובר לסיסמה, Enter בסיסמה נכנס. השם האחרון נזכר במכשיר.
 */
export function LoginForm({ error }: { error?: ReactNode }) {
  const pw = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  useEffect(() => { try { setName(localStorage.getItem(NAME_KEY) || ''); } catch {} }, []);

  // בטלפון הדפדפן מחזיר לפעמים את הסמן לשדה (חזרה לדף, שחזור לשונית, מילוי אוטומטי)
  // ואז המקלדת קופצת. עד שהמשתמש נוגע במסך — מורידים כל פוקוס משדות.
  useEffect(() => {
    let touched = false;
    const blur = () => {
      const el = document.activeElement;
      if (!touched && el instanceof HTMLInputElement) el.blur();
    };
    const onTouch = () => { touched = true; };
    const onShow = () => { touched = false; blur(); };
    const onVis = () => { if (document.visibilityState === 'visible') onShow(); };
    const timers = [0, 150, 400, 900].map((ms) => setTimeout(blur, ms));
    document.addEventListener('focusin', blur);
    document.addEventListener('pointerdown', onTouch, true);
    document.addEventListener('keydown', onTouch, true);
    window.addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      timers.forEach(clearTimeout);
      document.removeEventListener('focusin', blur);
      document.removeEventListener('pointerdown', onTouch, true);
      document.removeEventListener('keydown', onTouch, true);
      window.removeEventListener('pageshow', onShow);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return (
    <form className="card" method="post" action="/api/auth/password"
      onSubmit={() => { markOpened(); try { localStorage.setItem(NAME_KEY, name.trim()); } catch {} }}>
      <h1>ביקורת נוכחות</h1>
      <p className="sub">הקלד את שמך ואת סיסמת הכניסה</p>
      <label className="f" style={{ textAlign: 'right' }}>שם
        <input name="name" autoComplete="name" required maxLength={40} enterKeyHint="next"
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pw.current?.focus(); } }} />
      </label>
      <label className="f" style={{ textAlign: 'right', marginTop: 10 }}>סיסמה
        <input ref={pw} name="password" type="password" autoComplete="current-password" required enterKeyHint="go" />
      </label>
      <button className="btn solid" type="submit" style={{ width: '100%', marginTop: 16 }}>כניסה</button>
      {error}
      <div className="or"><span>או</span></div>
      <a className="btn" href="/api/auth/login" onClick={markOpened} style={{ width: '100%' }}>כניסת מנהל עם Google</a>
    </form>
  );
}
