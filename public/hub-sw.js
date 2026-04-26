// Lang nghe su kien khi co Push gui toi
self.addEventListener('push', function(event) {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (error) {
        data = {
            title: 'HUB Planner',
            body: event.data ? event.data.text() : 'Ban co thong bao moi.',
        };
    }

    const title = data.title || 'HUB Planner';
    const options = {
        body: data.body || 'Ban co thong bao moi.',
        icon: '/logo192.png',
        badge: '/logo192.png',
        vibrate: [100, 50, 100],
        data: { url: data.url || '/' },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

// Lang nghe su kien khi nguoi dung click vao thong bao
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
