import { body, handler } from '@/lib/http';
import { pushPublicKey, removeSub, saveSub } from '@/lib/push';

export const dynamic = 'force-dynamic';

/* התראות לטלפון של המזכירות: בקשות מראש הישיבה ותזכורות */

export const GET = handler(async () => ({ publicKey: await pushPublicKey() }));

export const POST = handler(async (req) => {
  const { sub } = await body<{ sub: { endpoint: string; keys: { p256dh: string; auth: string } } }>(req);
  await saveSub('admin', sub, req.headers.get('user-agent') || '');
  return { ok: true };
});

export const DELETE = handler(async (req) => {
  const { endpoint } = await body<{ endpoint?: string }>(req).catch(() => ({ endpoint: '' }));
  if (endpoint) await removeSub('admin', String(endpoint));
  return { ok: true };
});
