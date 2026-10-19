import { handler, HttpError } from '@/lib/http';
import { send019, smsSettings, toInternational972 } from '@/lib/sms';

export const dynamic = 'force-dynamic';

export const POST = handler(async () => {
  const s = await smsSettings();
  if (!s.adminPhone) throw new HttpError(400, 'לא הוגדר טלפון מנהל');
  await send019(s, [toInternational972(s.adminPhone)], 'בדיקת מערכת ביקורת ✅');
  return { ok: true };
}, { admin: true });
