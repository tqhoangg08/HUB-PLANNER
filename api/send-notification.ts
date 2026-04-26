import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

webpush.setVapidDetails(
    'mailto:admin@hotrosinhvienhub.id.vn',
    process.env.VITE_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
);

const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const requestBody = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { title, body, url, targetUserId } = requestBody;

    let query = supabase
        .from('push_subscriptions')
        .select('id, endpoint, user_id, subscription');

    if (targetUserId) {
        query = query.eq('user_id', targetUserId);
    }

    const { data: subscriptions, error } = await query;

    if (error) {
        return res.status(500).json({ error: error.message });
    }

    if (!subscriptions || subscriptions.length === 0) {
        return res.status(404).json({ error: 'Khong tim thay nguoi nhan' });
    }

    const payload = JSON.stringify({
        title: title || 'HUB Planner',
        body: body || 'Bạn có thông báo mới.',
        url: url || '/',
    });

    const results = await Promise.all(subscriptions.map(async (sub) => {
        try {
            const pushResponse = await webpush.sendNotification(sub.subscription, payload);

            return {
                id: sub.id,
                endpoint: sub.endpoint || sub.subscription?.endpoint,
                ok: true,
                statusCode: pushResponse.statusCode,
            };
        } catch (err: any) {
            console.error('Push delivery failed:', err);

            if (err?.statusCode === 404 || err?.statusCode === 410) {
                await supabase
                    .from('push_subscriptions')
                    .delete()
                    .eq('id', sub.id);
            }

            return {
                id: sub.id,
                endpoint: sub.endpoint || sub.subscription?.endpoint,
                ok: false,
                statusCode: err?.statusCode,
                body: err?.body,
                message: err?.message,
            };
        }
    }));

    const sent = results.filter(result => result.ok).length;
    const failed = results.length - sent;

    return res.status(sent > 0 ? 200 : 502).json({
        success: sent > 0,
        message: `Da gui ${sent}/${subscriptions.length} thiet bi`,
        sent,
        failed,
        results,
    });
}
