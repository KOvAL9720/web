const CACHE = 'klient-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/data.js',
  'js/app.js',
  'js/cloud.js',
  '../css/trainer.css',
  '../icons/icon.svg',
  '../icons/icon-192.png',
  '../icons/icon-512.png',
  '../icons/bg-gym.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const fromNetwork = (req) => fetch(req, { cache: 'no-cache' }).then((res) => {
  if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? 'index.html' : req, copy)); }
  return res;
});

// Stránka a súbory: okamžite z pamäte, nová verzia sa stiahne na pozadí a použije pri ďalšom spustení
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then((hit) => { const net = fromNetwork(req); if (hit) { e.waitUntil(net.catch(() => {})); return hit; } return net.catch(() => caches.match('index.html')); }));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => { const net = fromNetwork(req); if (!hit) return net; e.waitUntil(net.catch(() => {})); return hit; }));
});
