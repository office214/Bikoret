import { getUser } from '@/lib/auth';
import App from './ui/App';
import { LoginScreen } from './ui/loginScreen';

export const dynamic = 'force-dynamic';

// לא מחובר — מסך הכניסה מוצג כאן ישירות (בלי הפניה ל-/login): סינונים כמו נטספרק
// חוסמים לפעמים כתובת שמפנה מיד לכתובת אחרת
export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getUser();
  if (!user) return <LoginScreen error={(await searchParams).error} />;
  return <App user={user} />;
}
