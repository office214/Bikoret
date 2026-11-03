import { body, handler, HttpError } from '@/lib/http';
import { activeRequests, adminApprove, adminCounter, sendDueReminders } from '@/lib/requests';
import { pushDevices } from '@/lib/push';

export const dynamic = 'force-dynamic';

/** בקשות פעילות של ראש הישיבה + כמה טלפונים רשומים להתראות */
export const GET = handler(async () => {
  await sendDueReminders().catch(() => 0);
  return { requests: await activeRequests(), devices: await pushDevices('admin') };
});

/** אישור בקשה, או הצעת מועד אחר */
export const POST = handler(async (req, user) => {
  const b = await body<{ id: number; action: 'approve' | 'counter'; date?: string; time?: string; reply?: string }>(req);
  const id = Number(b.id);
  try {
    if (b.action === 'approve') return { request: await adminApprove(id, user.email) };
    if (b.action === 'counter') return { request: await adminCounter(id, String(b.date), String(b.time), String(b.reply || ''), user.email) };
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : 'שגיאה');
  }
  throw new HttpError(400, 'פעולה לא מוכרת');
});
