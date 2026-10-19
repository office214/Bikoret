import { handler } from '@/lib/http';
import { db } from '@/lib/db';
import { sheetsConnectedEmail, googleConfigured } from '@/lib/google';
import { smsSettings } from '@/lib/sms';
import { getSetting } from '@/lib/secure';
import { SMS_TEST_KEY } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

const mask = (v: string, keep = 4) => (!v ? '' : v.length <= keep ? '•'.repeat(v.length) : '••••' + v.slice(-keep));

export const GET = handler(async () => {
  const sql = await db();
  const [counts] = await sql`
    select count(*) filter (where imported)::int as imported,
           count(*) filter (where status = 'closed')::int as closed,
           max(number)::int as last_number
    from reviews`;
  const s = await smsSettings();
  return {
    google: googleConfigured(),
    sheetsEmail: await sheetsConnectedEmail(),
    reviews: counts,
    sms: {
      token: mask(s.token), username: s.username, source: s.source, adminPhone: s.adminPhone,
      fromEnv: s.fromEnv, ready: !!(s.token && s.username && s.source), testPhone: await getSetting(SMS_TEST_KEY),
    },
  };
});
