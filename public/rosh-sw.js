/* Service worker להתראות: המחשב של ראש הישיבה (ביקורת נסגרה, תשובות לבקשות) והטלפון של המזכירות (בקשות ותזכורות) */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'ביקורת נסגרה', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'ביקורת נסגרה', {
    body: d.body || '',
    dir: 'rtl', lang: 'he',
    icon: '/icon-192.png', badge: '/icon-192.png',
    tag: d.tag || 'bikoret',
    renotify: true,
    requireInteraction: true, // נשארת על המסך עד שסוגרים אותה
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // חלון פתוח של אותו מסך (מסך ראש הישיבה / האפליקציה) — מביאים לקדמה ומרעננים
    const path = new URL(url).pathname;
    for (const w of wins) if (new URL(w.url).pathname === path) { await w.focus(); w.postMessage({ type: 'refresh', url }); return; }
    await self.clients.openWindow(url);
  })());
});
