// Lắng nghe sự kiện khi có Push gửi tới
self.addEventListener('push', function(event) {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/logo192.png', // Trỏ tới logo HUB Planner của sếp
            badge: '/logo192.png',
            vibrate: [100, 50, 100], // Rung điện thoại
            data: { url: data.url || '/' } // Link để click vào
        };

        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

// Lắng nghe sự kiện khi người dùng click vào thông báo
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Đóng thông báo
    event.waitUntil(
        clients.openWindow(event.notification.data.url) // Mở link
    );
});