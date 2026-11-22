const version = '__VERSION__';
const cacheName = `liuyao-offline-${version}`;
const files = __FILES__;
const scope = self.registration.scope;
const index = new URL('index.html', scope).href;
const shell = new URL(`app-shell-${version}.html`, scope).href;
const manifest = new URL('app.webmanifest', scope).href;
const assets = new Set(files.map(file => new URL(file, scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const older = (await caches.keys()).filter(name => name.startsWith('liuyao-offline-') && name !== cacheName);
    // Keep one previous cache for tabs that are still finishing their current task.
    await Promise.all(older.slice(0, -1).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'GET_APP_VERSION') {
    event.source?.postMessage({ type: 'APP_VERSION', version });
  }
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const rootNavigation = request.mode === 'navigate' &&
    (url.pathname === new URL(scope).pathname || url.pathname === new URL(index).pathname) &&
    url.origin === new URL(scope).origin;
  const versionedAsset = url.origin === new URL(scope).origin &&
    url.pathname.startsWith(new URL(scope).pathname + 'assets/');
  if (!rootNavigation && !assets.has(request.url) && !versionedAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    if (rootNavigation) {
      const cached = await cache.match(shell);
      if (!cached) return fetch(request);
      // Hosts can redirect .html URLs to extensionless routes. Navigation requests
      // reject cached redirected responses; return a fresh response without that
      // redirect metadata while retaining the cached document and its headers.
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers: cached.headers,
      });
    }
    if (request.url === manifest) {
      const cached = await cache.match(request);
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        return response.ok ? response : cached ?? response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    }
    return (await cache.match(request)) ?? (versionedAsset ? await caches.match(request) : undefined) ?? fetch(request);
  })());
});
