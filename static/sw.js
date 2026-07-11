/* Shooter service worker — Web Push delivery for PWA / browser.
 * Plain JS served from /sw.js (scope "/"). Registered by the client push module.
 * Kept intentionally minimal: no offline caching here, only push + click. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: 'Shooter', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Shooter';
  const options = {
    body: payload.body || '',
    icon: '/pwa-192x192.png',
    badge: '/favicon.png',
    tag: payload.tag || undefined,
    renotify: Boolean(payload.tag),
    data: payload.data || {},
    timestamp: Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ('focus' in client) {
          try {
            await client.navigate(target);
          } catch (_) {
            /* cross-origin or navigation blocked — fall back to focus */
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })()
  );
});
