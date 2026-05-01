/* ── LemComics Service Worker ─────────────────────────────
   Cache-first cho static assets, network-only cho Supabase.
   Bump CACHE_NAME khi deploy để force update.
──────────────────────────────────────────────────────────── */
const CACHE_NAME = 'lemcomics-v5';

const PRECACHE = [
  './index.html',
  './js/theme.js',
  './js/state.js',
  './js/auth.js',
  './js/db.js',
  './js/translate.js',
  './js/pdf-module.js',
  './js/user-db.js',
  './js/announce.js',
  './js/infinite-scroll.js',
  './js/follow.js',
  './js/reader-enhance.js',
  './js/user-app.js',
  './js/comments.js',
  './js/donate.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Bỏ qua non-GET và Supabase API
  if (e.request.method !== 'GET') return;
  if (url.includes('.supabase.co') || url.includes('supabase.io')) return;
  // Bỏ qua CDN (luôn cần mạng để lấy version mới nhất)
  if (url.includes('cdn.jsdelivr.net') || url.includes('cdnjs.cloudflare.com')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
