import { body, handler } from '@/lib/http';
import { audit } from '@/lib/db';
import { saveSmsSettings, type SmsSettings } from '@/lib/sms';

export const dynamic = 'force-dynamic';

export const POST = handler(async (req, user) => {
  const b = await body<Partial<SmsSettings>>(req);
  await saveSmsSettings(b, user.email);
  await audit(user.email, 'sms-settings', { fields: Object.keys(b).filter((k) => (b as Record<string, string>)[k]) });
  return { ok: true };
}, { admin: true });
