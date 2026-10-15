/* Minimal service worker: cache the app shell so it loads instantly / offline.
 * API calls are never cached (they must always hit the live backend). */
var CACHE = 'buildkhata-v50';
var SHELL = [
  './', 'index.html', 'app.html',
  'privacy.html', 'terms.html', 'refund.html', 'cookies.html', 'contact.html', 'about.html', 'dmca.html',
  'css/site.css', 'css/app.css',
  'js/config.js', 'js/icons.js', 'js/consent.js', 'js/api.js', 'js/site.js', 'js/voice.js', 'js/app.js',
  'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // never cache POSTs (API)
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;             // only our own static files
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match('app.html'); });
    })
  );
});
