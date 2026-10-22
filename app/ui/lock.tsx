'use client';

import { useEffect, useState, type ReactNode } from 'react';

/*
 * נעילה בכל פתיחה: עוגיית הכניסה נשמרת בטלפון גם כשסוגרים את האפליקציה,
 * לכן מסמנים את הכניסה ב-sessionStorage — שנמחק כשהלשונית/האפליקציה נסגרת.
 * בנוסף ננעל אחרי 30 דקות ברקע.
 */
const KEY = 'bk_open';
const HIDDEN_KEY = 'bk_hidden_at';
const IDLE_MS = 30 * 60_000;

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

/** טופס הכניסה — מסמן פתיחה לפני השליחה הרגילה */
export function LoginForm({ children }: { children: ReactNode }) {
  return <form className="card" method="post" action="/api/auth/password" onSubmit={markOpened}>{children}</form>;
}

export function GoogleLink() {
  return <a href="/api/auth/login" onClick={markOpened} style={{ color: 'inherit' }}>כניסת מנהל עם Google</a>;
}
