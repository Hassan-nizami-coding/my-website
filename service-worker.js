const CACHE_NAME = "blind-aid-cache-v1";
const urlsToCache = [
  "/my-website/index.html",
  "/my-website/style.css", // Added style.css to cache
  "/my-website/app.js",     // Added app.js to cache
  "/my-website/lib/tf.min.js",
  "/my-website/lib/coco-ssd.min.js"
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
