const CACHE_NAME = 'blind-aid-cache-v2';
const urlsToCache = [
  '/blindAid/index.html',
  '/blindAid/style.css',
  '/blindAid/app.js',
  '/blindAid/lib/tf.min.js',
  '/blindAid/lib/coco-ssd.min.js'
];

// Install: cache all necessary files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(oldKey => caches.delete(oldKey))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: serve from cache first, then network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
