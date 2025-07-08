const CACHE_NAME = "blind-aid-cache-v1";
const urlsToCache = [
  "/blindAid/index.html",
  "/blindAid/lib/tf.min.js",
  "/blindAid/lib/coco-ssd.min.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

