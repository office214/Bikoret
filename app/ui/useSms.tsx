'use client';

import { useEffect, useState } from 'react';
import { api, errMsg, useUi, Warn } from './kit';

/** פותח את וואטסאפ עם ההודעה מוכנה — בוחרים את הקבוצה ולוחצים שלח */
export function openWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/**
 * הודעת פתיחת הביקורת לקבוצת הוואטסאפ. כשיש וואטסאפ ישיר וקבוצה נבחרה — נשלחת ישר מהמספר של מזכירות הגבוהה;
 * אחרת (או אם השליחה נכשלה) — נפתח WhatsApp עם ההודעה מוכנה, כמו קודם.
 */
export function GroupWa({ reviewId, text, close, className = 'btn wa', label = 'הודעה לקבוצת הוואטסאפ' }: {
  reviewId?: number; text: string; close?: (v: unknown) => void; className?: string; label?: string;
}) {
  const { toast } = useUi();
  const [cfg, setCfg] = useState<{ direct: boolean; group: string | null } | null>(null);
  const [state, setState] = useState<'' | 'busy' | 'sent' | 'failed'>('');
  useEffect(() => {
    if (!reviewId) { setCfg({ direct: false, group: null }); return; }
    api<{ direct: boolean; group: string | null }>(`/api/review/${reviewId}/wa`).then(setCfg).catch(() => setCfg({ direct: false, group: null }));
  }, [reviewId]);
  const direct = !!(cfg?.direct && cfg.group);
  const go = async () => {
    if (!direct) { openWhatsApp(text); close?.(true); return; }
    setState('busy');
    try {
      await api(`/api/review/${reviewId}/wa`, { body: { kind: 'group' } });
      setState('sent'); toast(`נשלח לקבוצה "${cfg!.group}" ✓`);
    } catch (e) {
      setState('failed');
      toast(`${errMsg(e)} — אפשר לשלוח ידנית`, { label: 'פתיחה ב-WhatsApp', run: () => openWhatsApp(text) });
    }
  };
  return (
    <button type="button" className={className + (state === 'sent' ? ' ghost' : '')} style={close ? { marginTop: 14, width: '100%' } : undefined}
      disabled={!text || !cfg || state === 'busy' || state === 'sent'} aria-busy={state === 'busy'} onClick={go}>
      {state === 'busy' ? 'שולח לקבוצה…' : state === 'sent' ? `✓ נשלח לקבוצה` : direct ? `${label} (${cfg!.group})` : label}
    </button>
  );
}

import type { ReviewState } from './App';

/* ---------- SMS ---------- */

export function useSms(rv: ReviewState) {
  const { dialog, toast } = useUi();
  return async (kind: 'start' | 'noanswer', count: number, reviewId?: number) => {
    const id = reviewId ?? rv.review?.id;
    if (!id) return;
    const label = kind === 'start' ? 'סמס התחלה' : 'סמס לא ענו';
    if (!count) { toast('אין תלמידים שמסומנים "לא ענה"'); return; }
    const ok = await dialog({
      title: kind === 'start' ? 'לשלוח הודעת פתיחת ביקורת?' : 'לשלוח הודעה למי שלא ענה?',
      body: rv.smsTest
        ? <p><Warn />מצב בדיקה: תישלח הודעה לדוגמה <b>רק למספר הבדיקה</b> (במקום ל-{count} תלמידים).</p>
        : <p>יישלח ל-<b>{count}</b> תלמידים שמסומנים &quot;לא ענה&quot;, בעברית או באנגלית לפי המסד.</p>,
      ok: 'שלח', cancel: kind === 'start' ? 'לא עכשיו' : 'ביטול',
    });
    if (!ok) return;
    const send = async (force: boolean): Promise<void> => {
      try {
        await rv.waitSaved();
        const r = await api<{ target: number; sent: number; missing: string[]; errors: string[]; test?: { phone: string; messages: number }; groupText: string }>(`/api/review/${id}/sms`, { body: { kind, force } });
        if (r.test) {
          await dialog({ title: 'בדיקת SMS', cancel: false, ok: 'סגור', body: (close) => (
            <>
              <p>נשלחו {r.test!.messages} הודעות לדוגמה ל-{r.test!.phone}.{r.errors.length ? ` שגיאה: ${r.errors.join(' | ')}` : ''}<br />לתלמידים לא נשלח דבר.</p>
              {kind === 'start' && <GroupWa reviewId={id} text={r.groupText} close={close} label="שלח גם לקבוצת הוואטסאפ" />}
            </>
          ) });
          return;
        }
        await dialog({
          title: `דוח ${label}`, cancel: false, ok: 'סגור',
          body: (close) => (
            <>
              <div className="twrap"><table><tbody>
                <tr><td>נשלחו</td><td className="num">{r.sent}</td></tr>
                <tr><td>ללא מספר נייד</td><td className="num">{r.missing.length}</td></tr>
                <tr><td>שגיאות</td><td className="num">{r.errors.length}</td></tr>
              </tbody></table></div>
              {r.missing.length > 0 && <p className="sub">ללא מספר: {r.missing.join(' · ')}</p>}
              {r.errors.length > 0 && <p className="sub">{r.errors.join(' | ')}</p>}
              {kind === 'start' && <GroupWa reviewId={id} text={r.groupText} close={close} label="שלח גם לקבוצת הוואטסאפ" />}
            </>
          ),
        });
      } catch (e) {
        const err = e as { status?: number };
        if (err.status === 409 && !force) {
          const again = await dialog({ title: 'נשלח כבר', body: <p>{errMsg(e)}. לשלוח שוב?</p>, ok: 'שלח שוב' });
          if (again) return send(true);
          return;
        }
        toast(errMsg(e));
      }
    };
    await send(false);
  };
}

