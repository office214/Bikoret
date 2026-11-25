// the same as ../whatsapp: an internet filter in the office blocks addresses with "whatsapp" + "groups" in them, so the screen uses this one
import { body, handler, HttpError } from '@/lib/http';
import { audit } from '@/lib/db';
import { relayGroups, saveWaGroup, saveWaRecipients, waDirect, waGroup, waRecipients, type WaGroup, type WaRecipient } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** הנמענים לעדכון בוואטסאפ אחרי סגירת ביקורת, וקבוצת הוואטסאפ של הודעת הפתיחה */
export const GET = handler(async (req) => {
  const wantGroups = new URL(req.url).searchParams.get('g');
  let groups: WaGroup[] | undefined, groupsError: string | undefined;
  if (wantGroups && waDirect()) { try { groups = await relayGroups(wantGroups === 'fresh'); } catch (e) { groupsError = e instanceof Error ? e.message : String(e); } }
  return { recipients: await waRecipients(), group: await waGroup(), direct: waDirect(), groups, groupsError };
}, { admin: true });

export const POST = handler(async (req, user) => {
  const b = await body<{ recipients?: WaRecipient[]; group?: WaGroup | null }>(req);
  if (b.group !== undefined) { await saveWaGroup(b.group, user.email); await audit(user.email, 'wa-group', { name: b.group?.name || null }); }
  if (b.recipients !== undefined) {
    if (!Array.isArray(b.recipients)) throw new HttpError(400, 'חסרה רשימת נמענים');
    try { await saveWaRecipients(b.recipients, user.email); await audit(user.email, 'wa-recipients', { count: b.recipients.length }); }
    catch (e) { throw new HttpError(400, e instanceof Error ? e.message : String(e)); }
  }
  return { recipients: await waRecipients(), group: await waGroup(), direct: waDirect() };
}, { admin: true });
