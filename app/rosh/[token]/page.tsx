import type { Metadata } from 'next';
import { checkRoshToken } from '@/lib/reviews';
import RoshView from '../RoshView';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  return {
    title: 'ביקורות — ראש הישיבה',
    robots: { index: false, follow: false },
    manifest: `/api/rosh/${token}/manifest`,
    referrer: 'no-referrer',
  };
}

export default async function RoshPage({ params }: Props) {
  const { token } = await params;
  if (!(await checkRoshToken(token))) {
    return <div className="login"><div className="card"><h1>ביקורות</h1><p className="sub">הקישור אינו בתוקף. בקשו קישור חדש ממזכירות הישיבה.</p></div></div>;
  }
  return <RoshView token={token} />;
}
