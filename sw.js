/* Offline support: every page and asset is cached as it is fetched, so the most
   recent version stays available with no connection. Navigations are network-first
   (fresh when online) and fall back to the cached copy the moment the network fails. */
var VERSION = 'v5';
var CACHE = 'life-hub-' + VERSION;

var PRECACHE = [
  'index.html',
  'nutrition.html',
  'dailies.html',
  'exercise.html',
  'events.html',
  'budgeting.html',
  'gifts.html',
  'focus.html',
  'whimsy.html',
  'offline.html',
  'css/app.css',
  'js/config.js',
  'js/auth.js',
  'js/db.js',
  'js/sync.js',
  'js/app.js',
  'js/nutrition.js',
  'js/section.js',
  'icons/icon.svg',
  'manifest.webmanifest'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      var base = self.registration.scope;
      return Promise.all(PRECACHE.map(function (path) {
        return cache.add(new Request(base + path, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match(self.registration.scope + 'offline.html');
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      var network = fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});
