// Momento's service worker: shows push notifications (likes, reactions, joins) when Momento isn't
// open, and opens the right page when one is tapped. It doesn't cache pages or photos.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Momento', {
    body: data.body || 'Something new on Momento',
    icon: data.icon || 'assets/momento-icon.png',
    badge: 'assets/momento-icon.png',
    tag: data.tag,
    data: { url: data.url || './albums.html' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './albums.html', self.registration.scope).href;
  e.waitUntil((async () => {
    // Use a Momento tab that's already open, if there is one
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (new URL(c.url).origin === new URL(url).origin && 'focus' in c) { await c.navigate?.(url).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
