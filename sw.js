/* ============================================================
   Behavior Log — Service Worker
   Caches the static shell for offline access.
   API requests always go to network.
   ============================================================ */

const CACHE_NAME = 'behavior-log-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './tasks.html',
  './reflection.html',
  './style.css',
  './script.js',
  './analysis.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* --- Install: cache the static shell --- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

/* --- Activate: remove old caches --- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* --- Fetch: cache-first for static, network-only for API --- */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API calls (Google Apps Script) always go to network
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('script.googleusercontent.com')) {
    return; // Let the browser handle it normally
  }

  // Google Fonts — network first, then cache
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets — cache first, then network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
