const CACHE_NAME = 'connect-daet-v3'
const STATIC_ASSET_ROOTS = ['/manifest.webmanifest', '/icon', '/logo']

self.addEventListener('install', (event) => {
  // Do NOT precache HTML routes here. Precacheing pages like '/',
  // '/user/dashboard' means the service worker can serve stale HTML forever,
  // which shows up as the page "flickering/reloading" on every visit.
  event.waitUntil(caches.open(CACHE_NAME))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('push', (event) => {
  console.log('PUSH RECEIVED', event.data?.text())
  let payload = {}

  try {
    payload = event.data ? JSON.parse(event.data.text()) : {}
  } catch {
    console.warn('Push payload was not valid JSON; treating it as plain text.')
    payload = { body: event.data?.text() || '' }
  }

  const title = payload.title || 'CONNECT-Daet'
  const options = {
    body: payload.body || payload.message || 'You have a new notification.',
    icon: payload.icon || '/logo.png',
    badge: payload.badge || '/logo.png',
    timestamp: Date.now(),
    requireInteraction: true,
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
    data: {
      url: payload.url || payload.link || '/',
      ...(payload.data || {}),
    },
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log('SYSTEM NOTIFICATION SHOWN', title))
      .catch((error) => console.error('SYSTEM NOTIFICATION FAILED', error))
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.openWindow(new URL(targetUrl, self.location.origin).href)
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('PUSH SUBSCRIPTION CHANGED')
  // The public VAPID key belongs in the app bundle, not in this static worker.
  // Ask an open app client to create and persist the replacement subscription.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }))
    })
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const { request } = event

  // Never serve or cache full HTML page navigations from the cache. Let them go
  // to the network so users always get the fresh version (fixes stale-page
  // flicker). We only cache static assets.
  if (request.mode === 'navigate') {
    return
  }

  const isPwaAsset = STATIC_ASSET_ROOTS.some((root) => request.url.includes(root))
  const isAppChunk = request.url.includes('/_next/')

  if (isPwaAsset) {
    // Cache-first for PWA install assets (manifest + icons + logo). These never
    // change at runtime so they are safe to serve straight from cache.
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached

        return fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const clone = response.clone()
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
            }
            return response
          })
          .catch(() => Response.error())
      })
    )
    return
  }

  if (isAppChunk) {
    // Network-first for application JS/CSS. Dev chunk URLs are NOT content-hashed,
    // so a cache-first strategy serves stale code after every source change. Always
    // try the network first so the browser receives the latest compiled bundle; if
    // offline, fall back to the last cached copy.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
    )
    return
  }
})
