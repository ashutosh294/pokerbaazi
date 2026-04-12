const CACHE_NAME = 'poker-tracker-v3';

// HTML aur SW kabhi cache nahi hoga — hamesha network se
const NEVER_CACHE = ['/index.html', '/', '/sw.js'];

// Sirf fonts cache hongi
const CACHE_ONLY = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  self.skipWaiting(); // Turant activate ho
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k)))) // Sab purane cache delete
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Supabase — hamesha network
  if (url.hostname.includes('supabase.co')) return;

  // HTML files — hamesha network, kabhi cache nahi
  if (NEVER_CACHE.includes(url.pathname) || request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Fonts — cache first
  if (CACHE_ONLY.some(h => url.hostname.includes(h))) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Baaki sab — network first, cache fallback
  event.respondWith(
    fetch(request)
      .then(res => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
