import { handler } from '@/lib/http';
import { compactNumbers } from '@/lib/reviews';

export const dynamic = 'force-dynamic';

/** סגירת חורים ברצף מספרי הביקורות */
export const POST = handler(async (_req, user) => compactNumbers(user.email), { admin: true });
