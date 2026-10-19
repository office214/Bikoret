import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import App from './ui/App';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getUser();
  if (!user) redirect('/login');
  return <App user={user} />;
}
