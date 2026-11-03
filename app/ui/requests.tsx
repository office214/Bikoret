'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errMsg, useUi } from './kit';
import { PushToggle } from './push';
import { WhenDialog } from './when';

/* ---------- בקשות של ראש הישיבה לבצע ביקורת — הצד של המזכירות ---------- */

type Req = {
  id: number; at: string; asked_at: string; note: string; reply: string;
  status: 'pending' | 'counter' | 'approved'; label: string; asked_label: string; ymd: string; hhmm: string;
};

export const ADMIN_PUSH = { api: '/api/push', onLabel: 'התראות פעילות בטלפון הזה', offLabel: 'הפעלת התראות בטלפון הזה', testMsg: 'נשלחה התראת בדיקה לטלפון הזה' };

/** מצב הבקשות: נטען בכניסה, כל דקה, כשחוזרים לאפליקציה וכשלוחצים על התראה */
function useRequests() {
  const [list, setList] = useState<Req[] | null>(null);
  const [devices, setDevices] = useState(1);
  const reload = useCallback(async () => {
    try { const r = await api<{ requests: Req[]; devices: number }>('/api/requests'); setList(r.requests); setDevices(r.devices); } catch {}
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(() => { if (!document.hidden) reload(); }, 60_000);
    const onVis = () => { if (!document.hidden) reload(); };
    document.addEventListener('visibilitychange', onVis);
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'refresh') reload(); };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, [reload]);
  return { list, devices, reload };
}

/**
 * פס הבקשות במסך הביקורת. בקשה שמחכה לתשובה מוצגת תמיד; ביקורת מאושרת — רק במסך הבית
 * (כשאין ביקורת פתוחה), כדי לא להפריע באמצע ביקורת.
 */
export function RequestsBar({ showApproved, focus }: { showApproved: boolean; focus?: number }) {
  const { list, devices, reload } = useRequests();
  const { toast } = useUi();
  const [busy, setBusy] = useState(0);
  const [counter, setCounter] = useState<Req | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus && list?.some((r) => r.id === focus)) focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focus, list]);

  const approve = async (r: Req) => {
    if (busy) return; // לחיצה כפולה לא שולחת פעמיים (וגם השרת מאשר רק בקשה שעוד ממתינה)
    setBusy(r.id);
    try {
      const res = await api<{ request: Req | null }>('/api/requests', { body: { id: r.id, action: 'approve' } });
      toast(res.request ? 'אושר — ראש הישיבה קיבל הודעה. תזכורת תגיע שעה לפני' : 'הבקשה כבר טופלה');
      await reload();
    } catch (e) { toast(errMsg(e)); } finally { setBusy(0); }
  };

  const shown = (list || []).filter((r) => r.status !== 'approved' || showApproved);
  if (!shown.length) return null;
  return (
    <div className="reqs">
      {shown.map((r) => (
        <div key={r.id} ref={r.id === focus ? focusRef : undefined} className={'req ' + r.status + (r.id === focus ? ' focus' : '')} aria-busy={busy === r.id}>
          {r.status === 'pending' ? (
            <>
              <p className="req-t">ראש הישיבה מבקש ביקורת</p>
              <p className="req-when">{r.label}</p>
              {r.note && <p className="req-note">{r.note}</p>}
              <div className="req-a">
                <button className="btn solid" disabled={!!busy} onClick={() => approve(r)}>{busy === r.id ? 'שולח…' : '✓ אישור'}</button>
                <button className="btn" disabled={!!busy} onClick={() => setCounter(r)}>הצעת מועד אחר</button>
              </div>
            </>
          ) : r.status === 'counter' ? (
            <>
              <p className="req-t">הצעת מועד אחר — ממתין לתשובת ראש הישיבה</p>
              <p className="req-when">{r.label} <small>(ביקש: {r.asked_label})</small></p>
              <div className="req-a"><button className="btn ghost" disabled={!!busy} onClick={() => setCounter(r)}>שינוי ההצעה</button></div>
            </>
          ) : (
            <>
              <p className="req-t">ביקורת מתוכננת · לבקשת ראש הישיבה</p>
              <p className="req-when">{r.label}</p>
              {r.note && <p className="req-note">{r.note}</p>}
              <div className="req-a">
                <span className="req-hint">תזכורת תגיע שעה לפני</span>
                <button className="btn ghost" disabled={!!busy} onClick={() => setCounter(r)}>שינוי מועד</button>
              </div>
            </>
          )}
        </div>
      ))}
      {devices === 0 && (
        <div className="req-push">
          <span>כדי שבקשות ותזכורות יקפצו גם כשהאפליקציה סגורה:</span>
          <PushToggle {...ADMIN_PUSH} onRefresh={reload} />
        </div>
      )}
      {counter && (
        <WhenDialog
          title="הצעת מועד אחר לראש הישיבה"
          sub={`ראש הישיבה ביקש: ${counter.asked_label}`}
          initial={{ date: counter.ymd, time: counter.hhmm }}
          noteLabel="הודעה לראש הישיבה" initialNote={counter.status === 'counter' ? counter.reply : ''}
          submitLabel="שליחת ההצעה"
          onClose={() => setCounter(null)}
          onSubmit={async (w, reply) => {
            await api('/api/requests', { body: { id: counter.id, action: 'counter', ...w, reply } });
            setCounter(null);
            toast('ההצעה נשלחה לראש הישיבה');
            await reload();
          }} />
      )}
    </div>
  );
}
