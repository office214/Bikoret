import { LoginScreen } from '../ui/loginScreen';

export const dynamic = 'force-dynamic';

// כתובת ישנה — נשארת לקישורים ישנים; הכניסה עצמה מוצגת עכשיו בכתובת הראשית
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <LoginScreen error={error} />;
}
