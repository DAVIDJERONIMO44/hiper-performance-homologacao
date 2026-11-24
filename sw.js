// HIPER PERFORMANCE v1.2. Only public shell files are cached.
// Imported training plans and backups remain exclusively in the device's IndexedDB.
const CACHE = 'hiper-homologacao-shell-v1.2.0';
const SCOPE = self.registration.scope;
const SHELL = ['','index.html','app.js','style.css','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new URL(path, SCOPE).href))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('hiper-homologacao-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;
  // Private JSON and backups are never requested over the network.
  event.respondWith(caches.open(CACHE).then(async cache => {
    const key = request.mode === 'navigate' ? new URL('index.html', SCOPE).href : request;
    return (await cache.match(key)) || fetch(request);
  }));
});
