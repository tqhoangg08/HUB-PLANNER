import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Cấu hình VAPID
webpush.setVapidDetails(
    'mailto:admin@hotrosinhvienhub.id.vn', // Email của sếp
    process.env.VITE_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
);

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { title, body, url, targetUserId } = req.body;

    // Lấy địa chỉ của sinh viên từ Supabase
    let query = supabase.from('push_subscriptions').select('subscription');
    if (targetUserId) {
        query = query.eq('user_id', targetUserId); // Gửi riêng 1 người
    } // Nếu không truyền targetUserId sẽ gửi cho TOÀN BỘ sinh viên đã đăng ký

    const { data: subscriptions } = await query;

    if (!subscriptions || subscriptions.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy người nhận' });
    }

    const payload = JSON.stringify({ title, body, url });

    // Bắn thông báo hàng loạt
    const sendPromises = subscriptions.map(sub => 
        webpush.sendNotification(sub.subscription, payload)
            .catch(err => {
                // Nếu báo lỗi (do sinh viên thu hồi quyền), sếp có thể xóa record này khỏi DB
                console.error('Lỗi gửi tới 1 device:', err);
            })
    );

    await Promise.all(sendPromises);
    res.status(200).json({ success: true, message: `Đã gửi ${subscriptions.length} thông báo` });
}