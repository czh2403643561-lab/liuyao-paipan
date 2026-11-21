const cacheName = 'liuyao-offline-__VERSION__';
const files = __FILES__;
const scope = self.registration.scope;
const index = new URL('index.html', scope).href;
const assets = new Set(files.map(file => new URL(file, scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('liuyao-offline-') && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const rootNavigation = request.mode === 'navigate' &&
    (url.pathname === new URL(scope).pathname || url.pathname === new URL(index).pathname) &&
    url.origin === new URL(scope).origin;
  if (!rootNavigation && !assets.has(request.url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(rootNavigation ? scope : request)) ?? fetch(request);
  })());
});
