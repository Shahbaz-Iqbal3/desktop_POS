// Service Worker for POS Dashboard
const CACHE_NAME = 'pos-dashboard-cache-v1.0.12';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './style.css',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first for same-origin app shell files, so a fix or redesign
// pushed to the server is picked up as soon as the device is online;
// falls back to cache when offline. Everything else (fonts, Supabase,
// jsQR CDN) just passes through to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isSameOrigin = new URL(req.url).origin === self.location.origin;

  if (!isSameOrigin || req.method !== 'GET') {
    return; // let the browser handle it normally
  }

  event.respondWith(
    fetch(req)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return response;
      })
      .catch(() => caches.match(req))
  );
});

// Push notification handling
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: data.data || {},
    vibrate: [200, 100, 200],
    tag: data.data?.type || 'notification',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Try to focus an existing window
        for (const client of windowClients) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if none found
        return clients.openWindow(targetUrl);
      })
  );
});

// Network-first for same-origin app shell files, so a fix or redesign
// pushed to the server is picked up as soon as the device is online;
// falls back to cache when offline. Everything else (fonts, Supabase,
// jsQR CDN) just passes through to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isSameOrigin = new URL(req.url).origin === self.location.origin;

  if (!isSameOrigin || req.method !== 'GET') {
    return; // let the browser handle it normally
  }

  event.respondWith(
    fetch(req)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return response;
      })
      .catch(() => caches.match(req))
  );
});
