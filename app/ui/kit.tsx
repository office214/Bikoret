'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/* ---------- קריאות לשרת ---------- */

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) { super(message); }
}

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method || (init?.body ? 'POST' : 'GET'),
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: init?.signal,
    cache: 'no-store',
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new ApiError(401, 'יש להתחבר מחדש');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error || `שגיאה ${res.status}`, json.data);
  return json as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/* ---------- סטטוסים ---------- */

export const STATUSES = ['נוכח', 'בישוב', 'חסר', 'לא ענה', 'נרשם'] as const;
export type Status = (typeof STATUSES)[number];
export const NO_ANSWER: Status = 'לא ענה';
export const TYPES = ['פנימית', 'חיצונית 00', 'חיצונית 02'];
export const typeLabel = (t: string) => t.replace(/^חיצונית/, 'ביקורת אמת').replace(/^פנימית$/, 'ביקורת פנימית');

export function Warn({ show = true }: { show?: boolean }) {
  return show ? <span className="warn-ic" aria-hidden="true">⚠ </span> : null;
}

export const pctText = (p: number | null | undefined) =>
  p === null || p === undefined ? '' : `${Math.round(Number(p) * 1000) / 10}%`;

export function Result({ passed }: { passed: boolean | null }) {
  if (passed === null || passed === undefined) return null;
  return passed ? <>עובר</> : <span className="fail"><Warn />נכשל</span>;
}

/* ---------- אייקונים ---------- */

const paths: Record<string, ReactNode> = {
  check: <path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
  print: <path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  gear: <><circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  msg: <path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
};
export function Icon({ name, size }: { name: keyof typeof paths | string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{paths[name]}</svg>;
}

/* ---------- הודעה קופצת + דיאלוג ---------- */

type ToastState = { msg: string; action?: { label: string; run: () => void } } | null;
type DialogOpts = { title: string; body: ReactNode | ((close: (v: unknown) => void) => ReactNode); ok?: string | false; cancel?: string | false; onOk?: () => unknown };
type UiCtx = { toast: (msg: string, action?: { label: string; run: () => void }) => void; dialog: (o: DialogOpts) => Promise<unknown> };

const Ctx = createContext<UiCtx>(null as never);
export const useUi = () => useContext(Ctx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [dlg, setDlg] = useState<(DialogOpts & { resolve: (v: unknown) => void }) | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  const showToast = useCallback((msg: string, action?: { label: string; run: () => void }) => {
    setToast({ msg, action });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), action ? 6000 : 4000);
  }, []);

  const dialog = useCallback((o: DialogOpts) => new Promise<unknown>((resolve) => setDlg({ ...o, resolve })), []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (dlg && !d.open) {
      d.showModal();
      const first = d.querySelector<HTMLElement>('.dlg-b input, .dlg-b select, .dlg-b button') || d.querySelector<HTMLElement>(dlg.cancel === false ? '[data-ok]' : '[data-cancel]');
      first?.focus();
    }
    if (!dlg && d.open) d.close();
  }, [dlg]);

  const close = (v: unknown) => { const r = dlg?.resolve; setDlg(null); r?.(v); };

  return (
    <Ctx.Provider value={{ toast: showToast, dialog }}>
      {children}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <span>{toast.msg}</span><span className="grow" />
          {toast.action && <button onClick={() => { setToast(null); toast.action!.run(); }}>{toast.action.label}</button>}
        </div>
      )}
      <dialog ref={ref} onCancel={(e) => { e.preventDefault(); close(false); }} aria-labelledby="dlg-title">
        {dlg && (
          <form method="dialog" onSubmit={(e) => { e.preventDefault(); close(dlg.onOk ? dlg.onOk() : true); }}>
            <div className="dlg-b"><h2 id="dlg-title">{dlg.title}</h2>{typeof dlg.body === 'function' ? dlg.body(close) : dlg.body}</div>
            <div className="dlg-a">
              {dlg.ok !== false && <button className="btn solid" type="submit" data-ok>{dlg.ok || 'אישור'}</button>}
              {dlg.cancel !== false && <button className="btn ghost" type="button" data-cancel onClick={() => close(false)}>{dlg.cancel || 'ביטול'}</button>}
            </div>
          </form>
        )}
      </dialog>
    </Ctx.Provider>
  );
}

/** כפתור שמציג "רגע…" בזמן פעולה אסינכרונית ומונע לחיצה כפולה */
export function AsyncButton({ onClick, children, busyText, className = 'btn', ...rest }: {
  onClick: () => Promise<unknown>; children: ReactNode; busyText?: string; className?: string; disabled?: boolean; 'aria-label'?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button className={className} disabled={busy || rest.disabled} aria-busy={busy} aria-label={rest['aria-label']}
      onClick={async () => { setBusy(true); try { await onClick(); } finally { setBusy(false); } }}>
      {busy ? busyText || 'רגע…' : children}
    </button>
  );
}
