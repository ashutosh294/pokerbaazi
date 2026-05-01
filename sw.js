const CACHE_NAME = 'poker-tracker-v8';
const NEVER_CACHE = ['/index.html', '/', '/sw.js'];
const CACHE_ONLY = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const SYNC_TAG = 'poker-session-sync';
const DB_NAME = 'poker-offline';
const DB_VERSION = 1;

// ── IndexedDB helpers ────────────────────────────────────
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending'))
        db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}
async function savePending(payload) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('pending', 'readwrite');
    tx.objectStore('pending').add({ payload, at: Date.now() });
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}
async function getPending() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('pending', 'readonly');
    const req = tx.objectStore('pending').getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function deletePending(id) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction('pending', 'readwrite');
    tx.objectStore('pending').delete(id);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

// ── Install ───────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());

// ── Activate ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co')) return;
  if (NEVER_CACHE.includes(url.pathname) || request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
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

// ── Background Sync ───────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(syncPendingSessions());
  }
});

async function syncPendingSessions() {
  const pending = await getPending();
  for (const item of pending) {
    try {
      const { url, method, headers, body } = item.payload;
      const res = await fetch(url, { method, headers, body });
      if (res.ok) {
        await deletePending(item.id);
        // Notify all clients
        const clients = await self.clients.matchAll();
        clients.forEach(c => c.postMessage({ type: 'SYNC_SUCCESS', id: item.id }));
      }
    } catch (e) {
      // Will retry next time
      console.warn('[SW] Sync failed:', e);
    }
  }
}

// ── Message handler ───────────────────────────────────────
self.addEventListener('message', async event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Save offline request
  if (event.data?.type === 'SAVE_OFFLINE') {
    await savePending(event.data.payload);
    // Register sync
    if (self.registration.sync) {
      await self.registration.sync.register(SYNC_TAG);
    }
    event.ports[0]?.postMessage({ saved: true });
  }
  // Get pending count
  if (event.data?.type === 'GET_PENDING') {
    const pending = await getPending();
    event.ports[0]?.postMessage({ count: pending.length });
  }
});
