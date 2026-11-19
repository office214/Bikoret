import { body, handler, HttpError } from '@/lib/http';
import { audit } from '@/lib/db';
import { saveWaRecipients, waRecipients, type WaRecipient } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

/** הנמענים לעדכון בוואטסאפ אחרי סגירת ביקורת */
export const GET = handler(async () => ({ recipients: await waRecipients() }), { admin: true });

export const POST = handler(async (req, user) => {
  const b = await body<{ recipients?: WaRecipient[] }>(req);
  if (!Array.isArray(b.recipients)) throw new HttpError(400, 'חסרה רשימת נמענים');
  try {
    const recipients = await saveWaRecipients(b.recipients, user.email);
    await audit(user.email, 'wa-recipients', { count: recipients.length });
    return { recipients };
  } catch (e) { throw new HttpError(400, e instanceof Error ? e.message : String(e)); }
}, { admin: true });
