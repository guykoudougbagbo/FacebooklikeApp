// Shows the page's notifications and opens the post when one is tapped.
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'GenZ', {
      body: data.body || 'Nouvelle publication',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      lang: 'fr',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin)
  const url = target.origin === self.location.origin ? target.href : self.location.origin
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url === url)
      return open ? open.focus() : self.clients.openWindow(url)
    }),
  )
})
