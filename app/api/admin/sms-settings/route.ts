import { body, handler } from '@/lib/http';
import { audit } from '@/lib/db';
import { HttpError } from '@/lib/http';
import { SMS_TEST_KEY } from '@/lib/reviews';
import { deleteSetting, setSetting } from '@/lib/secure';
import { saveSmsSettings, toInternational972, validMobile, type SmsSettings } from '@/lib/sms';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req, user) => {
  const b = await body<Partial<SmsSettings> & { testPhone?: string; testOff?: boolean }>(req);
  if (b.testOff) {
    await deleteSetting(SMS_TEST_KEY);
    await audit(user.email, 'sms-test-mode', { on: false });
    return { ok: true };
  }
  if (b.testPhone) {
    if (!validMobile(toInternational972(b.testPhone))) throw new HttpError(400, 'מספר נייד לא תקין');
    await setSetting(SMS_TEST_KEY, b.testPhone.trim(), user.email);
    await audit(user.email, 'sms-test-mode', { on: true });
    return { ok: true };
  }
  await saveSmsSettings(b, user.email);
  await audit(user.email, 'sms-settings', { fields: Object.keys(b).filter((k) => (b as Record<string, string>)[k]) });
  return { ok: true };
}, { admin: true });
