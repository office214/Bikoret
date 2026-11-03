import { body, handler, HttpError } from '@/lib/http';
import { sendPush } from '@/lib/push';

export const dynamic = 'force-dynamic';

/** התראת בדיקה — רק לטלפון ששלח את הבקשה */
export const POST = handler(async (req) => {
  const { endpoint } = await body<{ endpoint?: string }>(req);
  if (!endpoint) throw new HttpError(400, 'המכשיר לא רשום');
  return sendPush('admin', { title: 'בדיקת התראות', body: 'ההתראות עובדות. כך תגיע בקשה מראש הישיבה.', url: '/', tag: 'bikoret-test' }, String(endpoint));
});
