// const CACHE_NAME = 'ecotrack-v3';
// const ASSETS = [
//   '/',
//   '/index.html',
//   '/style.css',
//   '/script.js',
//   'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
//   'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
// ];

// self.addEventListener('install', (e) => {
//   self.skipWaiting(); // Activate immediately without waiting
//   e.waitUntil(
//     caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
//   );
// });

// self.addEventListener('activate', (e) => {
//   e.waitUntil(
//     caches.keys().then(keys =>
//       Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
//     ).then(() => self.clients.claim())
//   );
// });

// self.addEventListener('fetch', (e) => {
//   if (e.request.url.includes('/api/')) {
//     // Network-first for API calls
//     e.respondWith(
//       fetch(e.request).catch(() => caches.match(e.request))
//     );
//   } else {
//     // Network-first for all assets — fallback to cache only if offline
//     e.respondWith(
//       fetch(e.request)
//         .then(res => {
//           const clone = res.clone();
//           caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
//           return res;
//         })
//         .catch(() => caches.match(e.request))
//     );
//   }
// });
const CACHE_NAME = 'ecotrack-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap'
];


self.addEventListener('install', (e) => {
  self.skipWaiting(); // Activate immediately without waiting
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});


self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});


self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) {
    // Network-first for API calls
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  } else {
    // Network-first for all assets — fallback to cache only if offline
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // FIX: Only cache GET and HEAD requests to prevent "Request method 'POST' is unsupported" error
          if (e.request.method === 'GET' || e.request.method === 'HEAD') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
