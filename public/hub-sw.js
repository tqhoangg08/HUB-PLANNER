const catalogueResources = new Set(['', 'filter-options', 'course-detail']);

const catalogueUrl = request => {
    const url = new URL(request.url);
    if (request.method === 'GET' && request.mode !== 'navigate' && url.origin === self.location.origin &&
        (url.pathname === '/api/courses' || url.pathname === '/courses') &&
        catalogueResources.has(url.searchParams.get('resource') || '')) return url;
    return null;
};

// Old running clients ask Workbox to activate immediately. Wait until their tabs have closed.
self.addEventListener('message', function(event) {
    if (event.data?.type === 'SKIP_WAITING') event.stopImmediatePropagation();
});

self.addEventListener('activate', function(event) {
    event.waitUntil((async function() {
        for (const name of await caches.keys()) {
            // An earlier activation task may have removed this cache.
            if (!await caches.has(name)) continue;
            const cache = await caches.open(name);
            for (const request of await cache.keys()) {
                if (!catalogueUrl(request)) continue;
                const response = await cache.match(request);
                if (response?.headers.get('Content-Type')?.includes('application/json')) {
                    await cache.delete(request);
                }
            }
        }
    })().catch(() => {}));
});

self.addEventListener('fetch', function(event) {
    const url = catalogueUrl(event.request);
    if (url) {
        url.pathname = '/api/courses';
        const headers = new Headers(event.request.headers);
        headers.delete('Authorization');
        headers.delete('apikey');
        headers.delete('Cookie');
        if (event.request.cache === 'reload' || event.request.cache === 'no-cache' ||
            (!headers.has('X-Hub-Catalogue-Cache') && headers.get('Cache-Control')?.toLowerCase().includes('no-cache'))) {
            url.searchParams.set('refresh', '1');
        }
        headers.set('X-Hub-Catalogue-Cache', 'v1');
        event.respondWith(fetch(url.href, {
            method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers,
            signal: event.request.signal,
        }));
        return;
    }
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
