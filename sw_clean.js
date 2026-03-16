var CACHE_NAME = 'cave-a-vin-v2';

var ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k){ return k !== CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {

  if (e.request.method !== 'GET') return;

  if (
    e.request.url.includes('stripe.com') ||
    e.request.url.includes('googleapis.com')
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached){

      if (cached) return cached;

      return fetch(e.request).then(function(response){

        if (!response || response.status !== 200) {
          return response;
        }

        var clone = response.clone();

        caches.open(CACHE_NAME).then(function(cache){
          cache.put(e.request, clone);
        });

        return response;

      });

    })
  );

});
