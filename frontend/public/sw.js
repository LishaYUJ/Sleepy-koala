const CACHE_VERSION = 'sleepy-koala-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('sleepy-koala-') && key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      ),
    ),
  )
  self.clients.claim()
})
