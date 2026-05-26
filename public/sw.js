const CACHE_NAME = 'mainland-v4'
const PRECACHE_URLS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './sw.js']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) return

  const isAsset =
    requestUrl.pathname.includes('/assets/') ||
    requestUrl.pathname.endsWith('.js') ||
    requestUrl.pathname.endsWith('.css')

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && !isAsset) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) {
          return cached
        }
        if (isAsset) {
          return new Response('', { status: 504, statusText: 'Asset unavailable' })
        }
        return caches.match('./')
      }),
  )
})
