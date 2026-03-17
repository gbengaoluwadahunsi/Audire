const CACHE = 'audire-v6';

const PRECACHE = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/logo.svg',
  '/manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
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
  if (url.origin !== self.location.origin || e.request.method !== 'GET') return;

  // Never cache: Vite dev URLs, node_modules, WASM, ONNX model files, API calls
  const skip = url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/@vite/') ||
    url.pathname.startsWith('/@react-refresh') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.onnx') ||
    url.pathname.includes('/onnx-community/') ||
    url.pathname.includes('pdf.worker');
  if (skip) return;

  // Navigation and HTML: network-first so deploys take effect immediately
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    e.respondWith(
      fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request).then((c) => c || caches.match('/index.html')).then((f) => f || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Static assets: cache-first (Vite hashes filenames, so stale cache is not an issue)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        const clone = res.clone();
        if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      });
    }).catch(() => new Response('', { status: 503 }))
  );
});
