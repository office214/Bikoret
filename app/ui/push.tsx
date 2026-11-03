'use client';

import { useEffect, useState } from 'react';

/* ---------- התראות במחשב הזה (Web Push) ---------- */

type NState = 'loading' | 'unsupported' | 'denied' | 'off' | 'on' | 'busy';

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export function BellIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 15v1h15v-1L18 12.5V9a6 6 0 0 0-6-6zm-2 15a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>;
}

/** כפתור הפעלת התראות במכשיר הזה. api = נקודת ההרשמה (GET מפתח / POST / DELETE), ו-api/test לבדיקה */
export function PushToggle({ api, onLabel, offLabel, testMsg, onRefresh }: { api: string; onLabel: string; offLabel: string; testMsg: string; onRefresh?: () => void }) {
  const [st, setSt] = useState<NState>('loading');
  const [msg, setMsg] = useState('');

  const current = async () => {
    const reg = await navigator.serviceWorker.getRegistration('/');
    return reg ? reg.pushManager.getSubscription() : null;
  };

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setSt('unsupported'); return; }
    if (Notification.permission === 'denied') { setSt('denied'); return; }
    current().then((sub) => setSt(sub && Notification.permission === 'granted' ? 'on' : 'off')).catch(() => setSt('off'));
    // לחיצה על התראה כשהמסך כבר פתוח — מרעננים את הנתונים
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'refresh') onRefresh?.(); };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enable = async () => {
    setSt('busy'); setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setSt(perm === 'denied' ? 'denied' : 'off'); return; }
      const reg = await navigator.serviceWorker.register('/rosh-sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch(api, { cache: 'no-store' })).json();
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON() }) });
      if (!r.ok) throw new Error((await r.json()).error || 'שגיאה');
      setSt('on'); setMsg('ההתראות הופעלו');
    } catch (e) { setSt('off'); setMsg(e instanceof Error ? e.message : String(e)); }
  };

  const test = async () => {
    setMsg('');
    const sub = await current();
    const r = await fetch(`${api}/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub?.endpoint }) });
    setMsg(r.ok ? testMsg : 'שליחת הבדיקה נכשלה');
  };

  const disable = async () => {
    setSt('busy');
    const sub = await current();
    if (sub) {
      await fetch(api, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setSt('off'); setMsg('ההתראות בוטלו');
  };

  if (st === 'loading' || st === 'unsupported') return null;
  return (
    <div className="rnotify">
      {st === 'on' ? (
        <>
          <span className="on"><BellIcon /> {onLabel}</span>
          <button onClick={test}>שלח התראת בדיקה</button>
          <button onClick={disable}>בטל</button>
        </>
      ) : st === 'denied' ? (
        <span className="off">ההתראות חסומות בדפדפן — אפשר לאשר אותן בהגדרות האתר (ליד שורת הכתובת)</span>
      ) : (
        <button className="primary" onClick={enable} disabled={st === 'busy'}><BellIcon /> {st === 'busy' ? 'רגע…' : offLabel}</button>
      )}
      {msg && <span className="msg">{msg}</span>}
    </div>
  );
}
