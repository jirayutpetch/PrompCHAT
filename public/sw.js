self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (event) { var data = event.data ? event.data.json() : { title: 'PrompCHAT', body: 'มีข้อความใหม่เข้ามา' }; event.waitUntil(self.registration.showNotification(data.title || 'PrompCHAT', { body: data.body || 'มีข้อความใหม่เข้ามา', icon: '/favicon.svg', badge: '/favicon.svg', data: data.url || '/' })); });
self.addEventListener('notificationclick', function (event) { event.notification.close(); event.waitUntil(self.clients.openWindow(event.notification.data || '/')); });
