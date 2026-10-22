import type { MetadataRoute } from 'next';

// מאפשר "הוספה למסך הבית" עם אייקון ושם
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ביקורת נוכחות',
    short_name: 'ביקורת',
    lang: 'he',
    dir: 'rtl',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1e3a5f',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
