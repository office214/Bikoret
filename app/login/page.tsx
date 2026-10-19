import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  setup: 'הכניסה עם גוגל עדיין לא הוגדרה (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
  forbidden: 'לחשבון הזה אין הרשאה להיכנס למערכת.',
  admin: 'רק מנהל יכול לחבר את מסד התלמידים.',
  scope: 'לא התקבלה הרשאת קריאה לגיליונות. נסה שוב ואשר את כל ההרשאות.',
  state: 'פג תוקף הבקשה. נסה שוב.',
  denied: 'הכניסה בוטלה.',
  token: 'הכניסה נכשלה. נסה שוב.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error && (await getUser())) redirect('/');
  return (
    <div className="login">
      <div className="card">
        <h1>ביקורת נוכחות</h1>
        <p className="sub">כניסה עם חשבון הגוגל של הישיבה</p>
        <a className="btn solid" style={{ width: '100%' }} href="/api/auth/login">כניסה עם Google</a>
        {error && <p className="err" role="alert">{ERRORS[error] || 'הכניסה נכשלה.'}</p>}
      </div>
    </div>
  );
}
