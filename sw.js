const CACHE = 'leve-v6';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/engine.js',
  './js/deadlift.js',
  './js/hipthrust.js',
  './js/press.js',
  './js/pull.js',
  './js/dip.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: sempre fresco quando c'è rete, offline usa la cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // no-cache: chiede sempre al server se il file è cambiato, invece di usare la cache HTTP del browser
    fetch(e.request.url, { cache: 'no-cache' })
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
