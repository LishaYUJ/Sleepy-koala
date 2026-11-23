const CACHE_VERSION = 'sleepy-koala-v2'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('push', (event) => {
  let payload = {}
  try { payload = event.data?.json() || {} } catch { /* Show a safe fallback for malformed messages. */ }
  event.waitUntil(self.registration.showNotification('Sleepy Koala', {
    body: typeof payload.body === 'string' ? payload.body : 'Take a quiet moment to check in with your koala.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: typeof payload.tag === 'string' ? payload.tag : 'sleep-reminder',
    renotify: false,
    data: { url: '/dashboard' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL('/dashboard', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (existing) {
      await existing.navigate(target)
      await existing.focus()
    } else {
      await self.clients.openWindow(target)
    }
  })())
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
