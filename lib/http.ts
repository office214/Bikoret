import { NextResponse } from 'next/server';
import { getUser, type User } from './auth';

export class HttpError extends Error {
  constructor(public status: number, message: string, public data?: unknown) {
    super(message);
  }
}

/** עוטף route handler: בדיקת התחברות, הרשאת מנהל, וטיפול אחיד בשגיאות */
export function handler<C = unknown>(
  fn: (req: Request, user: User, ctx: C) => Promise<unknown>,
  opts: { admin?: boolean } = {},
) {
  return async (req: Request, ctx: C) => {
    try {
      const user = await getUser();
      if (!user) throw new HttpError(401, 'יש להתחבר מחדש');
      if (opts.admin && !user.admin) throw new HttpError(403, 'פעולה זו מותרת למנהלים בלבד');
      const result = await fn(req, user, ctx);
      return NextResponse.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message, data: e.data }, { status: e.status });
      }
      console.error(e);
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'בקשה לא תקינה');
  }
}
