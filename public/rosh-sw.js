/* Service worker של מסך ראש הישיבה — מציג התראות על ביקורות שנסגרו */
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
    for (const w of wins) if (w.url.startsWith(url)) { await w.focus(); w.postMessage({ type: 'refresh' }); return; }
    await self.clients.openWindow(url);
  })());
});
