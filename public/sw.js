// Network first, so updates show straight away. The cached copy is only used offline.
// API responses are never cached.
const CACHE = 'rs-companion-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      // Offline: the cached copy, or the app shell for a page load, or a plain network error.
      .catch(async () => (await caches.match(e.request))
        || (e.request.mode === 'navigate' && (await caches.match(self.registration.scope, { ignoreSearch: true })))
        || Response.error()),
  );
});
