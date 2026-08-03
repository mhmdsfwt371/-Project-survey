/* Nusuk Survey — offline shell cache */
const CACHE = 'nusuk-survey-v11.6';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: 'reload', credentials: 'same-origin' }))
                .catch(function () { /* skip */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
                             .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function fetchWithTimeout(req, ms) {
  return new Promise(function (resolve, reject) {
    const t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    fetch(req).then(function (res) { clearTimeout(t); resolve(res); },
                    function (err) { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;

  // Firebase / Google APIs: network only, never cached (auth + live channels)
  if (req.url.indexOf('googleapis.com') !== -1 || req.url.indexOf('firebaseapp.com') !== -1 || req.url.indexOf('firebaseio.com') !== -1) {
    e.respondWith(fetch(req).catch(function () { return new Response('', { status: 504 }); }));
    return;
  }

  // map tiles: network only, never cached
  if (req.url.indexOf('basemaps.cartocdn.com') !== -1) {
    e.respondWith(fetch(req).catch(function () { return new Response('', { status: 504 }); }));
    return;
  }

  // the app itself (navigations + index.html): NETWORK FIRST with 3.5s timeout,
  // fall back to cache — so new versions arrive on next open, and offline still works
  const isShellPage = req.mode === 'navigate'
    || req.url.indexOf('index.html') !== -1
    || req.url.indexOf('manifest.webmanifest') !== -1;   /* اسم التطبيق وأيقونته */
  if (isShellPage) {
    e.respondWith(
      fetchWithTimeout(new Request(req.url, { cache: 'reload', credentials: 'same-origin' }), 3500).then(function (res) {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // sw.js نفسه: شبكة فقط، أبدًا من الكاش — فحص النسخة يعتمد عليه،
  // وتقديمه من الكاش يعني أن التطبيق لا يرى نسخة جديدة أبدًا.
  if (req.url.indexOf('sw.js') !== -1) {
    e.respondWith(fetch(new Request(req.url, { cache: 'reload' }))
      .catch(function () { return new Response('', { status: 504 }); }));
    return;
  }

  // everything else (libs, icons): cache first, then network
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return new Response('', { status: 504 }); });
    })
  );
});
