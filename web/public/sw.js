const CACHE = 'ats-shell-v2';   // bumped: forces every browser to drop the buggy v1 worker
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
  const req = e.request;
  const url = new URL(req.url);

  // Only ever touch same-origin GETs for static files. Everything else — POSTs (uploads, logins),
  // the API, anything cross-origin — is left completely alone: no respondWith, so the browser
  // handles it normally. This is what stops the SW interfering with the JD upload.
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api')) {
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      const live = fetch(req).then((res) => {
        // Clone BEFORE the body is read. Reading and cloning race otherwise, which threw
        // "Response body is already used". Only cache real, basic (same-origin) 200s.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || live;
    })
  );
});
