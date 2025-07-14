const CACHE_NAME = 'my-website-cache-v4'; // Increment version to ensure update
const CACHE_ASSETS = [
  '/my-website/', // Your root path for GitHub Pages
  '/my-website/index.html',
  '/my-website/style.css',
  '/my-website/app.js',
  '/my-website/manifest.json', // If you have one
];

// During the install phase, cache essential app shells
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching App Shell');
        return cache.addAll(CACHE_ASSETS);
      })
      .catch(err => console.error('Service Worker: Cache.addAll failed', err))
  );
});

// During the activate phase, clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker: Activated');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Intercept fetch requests
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Strategy for external CDN assets (TensorFlow.js, COCO-SSD model files)
  // Cache First: Try to serve from cache, otherwise fetch from network and cache for future use.
  if (
    url.origin === 'https://cdn.jsdelivr.net' || // For TensorFlow.js libraries
    url.origin === 'https://tfhub.dev' // For COCO-SSD model files
  ) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse; // Return cached version if available
        }
        // If not in cache, fetch from network
        return fetch(event.request).then(response => {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          // Clone the response because it's a stream and can only be consumed once
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache); // Cache the fetched response
          });
          return response;
        }).catch(error => {
          console.error('Service Worker: Fetch failed for external resource:', event.request.url, error);
          // You could return a fallback response here for external assets if needed,
          // but for models, failure means no detection.
        });
      })
    );
  } else {
    // Strategy for app-specific assets (index.html, style.css, app.js, etc.)
    // Stale While Revalidate: Serve from cache immediately, then update cache from network in background.
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            if (networkResponse.ok) { // Only cache successful responses
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // If network fails and there's no cache, or it's a navigation request,
            // fall back to the offline page or main index.html
            if (event.request.mode === 'navigate') {
              return caches.match('/my-website/index.html');
            }
            // For other requests, just let the error propagate
            return new Response('Network error or resource not found', { status: 503 });
          });

          return cachedResponse || fetchPromise; // Serve cached immediately, or wait for network
        });
      })
    );
  }
});
