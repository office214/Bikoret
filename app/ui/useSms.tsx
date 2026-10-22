'use client';

import { api, errMsg, useUi, Warn } from './kit';

/** פותח את וואטסאפ עם ההודעה מוכנה — בוחרים את הקבוצה ולוחצים שלח */
export function openWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

function WaButton({ text, close }: { text: string; close: (v: unknown) => void }) {
  return (
    <button type="button" className="btn wa" style={{ marginTop: 14, width: '100%' }}
      onClick={() => { openWhatsApp(text); close(true); }}>
      שלח גם לקבוצת הוואטסאפ
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
              {kind === 'start' && <WaButton text={r.groupText} close={close} />}
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
              {kind === 'start' && <WaButton text={r.groupText} close={close} />}
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

