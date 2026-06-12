self.addEventListener('install', function() {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', function(event) {
    if (event.request.mode !== 'navigate') return;

    event.respondWith((async function() {
        try {
            const request = new Request(event.request, {
                cache: 'no-store',
            });
            return await fetch(request);
        } catch (error) {
            const cached = await caches.match(event.request);
            return cached || caches.match('/index.html');
        }
    })());
});

self.addEventListener('push', function(event) {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (error) {
        data = {
            title: 'HUB Planner',
            body: event.data ? event.data.text() : 'Bạn có thông báo mới.',
        };
    }

    const title = data.title || 'HUB Planner';
    const options = {
        body: data.body || 'Bạn có thông báo mới.',
        icon: '/logo192.png',
        badge: '/logo192.png',
        vibrate: [100, 50, 100],
        data: { url: data.url || '/' },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
    const targetUrl = event.notification.data?.url || '/';
    event.notification.close();

    event.waitUntil((async () => {
        const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existingClient = windowClients.find((client) => new URL(client.url).origin === self.location.origin);

        if (existingClient) {
            await existingClient.focus();
            return existingClient.navigate(targetUrl);
        }

        return clients.openWindow(targetUrl);
    })());
});
