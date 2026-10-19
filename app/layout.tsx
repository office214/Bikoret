import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';

const heebo = Heebo({ subsets: ['hebrew', 'latin'], weight: ['400', '500', '700', '800'], variable: '--font-heebo', display: 'swap' });

export const metadata: Metadata = {
  title: 'ביקורת נוכחות',
  description: 'ביקורת נוכחות — ישיבה גבוהה',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'ביקורת' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#121821' }, { color: '#ffffff' }],
};

// מחיל את הגדרות התצוגה (גודל גופן / מצב כהה) לפני הציור — בלי הבהוב
const prefsScript = `try{var d=document.documentElement;d.setAttribute('data-size',localStorage.getItem('bk_size')||'normal');var t=localStorage.getItem('bk_theme');if(t)d.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: prefsScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
