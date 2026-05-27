self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}

  const title = data.title || 'HydroSense';
  const options = {
    body: data.message || 'New notification',
    icon: '/logo.png',
    badge: '/badge.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      id: data.id || null,
      type: data.type || 'notification',
    },
    tag: `hs-${data.id || Date.now()}`,
    requireInteraction: data.priority === 'urgent',
    silent: false,
  };

  if (data.priority === 'urgent') {
    options.requireInteraction = true;
    options.vibrate = [300, 150, 300, 150, 300];
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  const id = event.notification.data?.id;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'notification_click', id, url });
          return;
        }
      }
      if (clients.openWindow) {
        clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  // Track dismissals for analytics
});
