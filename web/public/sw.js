const CACHE = 'ats-shell-v1';
const SHELL = ['/', '/index.html', '/favicon.png', '/apple-touch-icon.png',
               '/icon-192.png', '/icon-512.png', '/brand/group.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache the API or anything cross-origin (the API lives on onrender.com). Always go to
  // the network so HR never sees a stale pipeline.
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) {
    return;
  }
  // Static assets: serve from cache, fall back to network, and refresh the cache in passing.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const live = fetch(e.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || live;
    })
  );
});
