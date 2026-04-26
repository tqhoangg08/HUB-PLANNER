import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 10;

webpush.setVapidDetails(
  'mailto:admin@hotrosinhvienhub.id.vn',
  process.env.VITE_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type QueueRow = {
  id: string;
  title: string;
  link: string;
  attempts: number | null;
};

const readBody = (body: unknown) => {
  if (!body) return {};
  if (typeof body !== 'string') return body as Record<string, unknown>;

  try {
    return JSON.parse(body || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
};

const isAuthorized = (req: VercelRequest, body: Record<string, unknown>) => {
  const token = req.query?.secret || body.secret || req.headers['x-secret-key'];
  const bearer = req.headers.authorization;

  if (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return true;
  return Boolean(process.env.MY_SECRET_SCRAPER_KEY && token === process.env.MY_SECRET_SCRAPER_KEY);
};

const retryAt = () => new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000).toISOString();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readBody(req.body);
  if (!isAuthorized(req, body)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const nowIso = new Date().toISOString();
  const { data: dueItems, error: dueError } = await supabase
    .from('school_announcement_push_queue')
    .select('id, title, link, attempts')
    .is('sent_at', null)
    .is('failed_at', null)
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(1);

  if (dueError) {
    return res.status(500).json({ error: dueError.message });
  }

  const item = (dueItems?.[0] || null) as QueueRow | null;
  if (!item) {
    return res.status(200).json({ success: true, sent: 0, message: 'No due announcement push' });
  }

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, subscription');

  if (subscriptionError) {
    return res.status(500).json({ error: subscriptionError.message });
  }

  if (!subscriptions || subscriptions.length === 0) {
    await supabase
      .from('school_announcement_push_queue')
      .update({ sent_at: nowIso, last_error: 'No push subscriptions' })
      .eq('id', item.id);

    return res.status(200).json({ success: true, sent: 0, skipped: true, message: 'No subscriptions' });
  }

  const payload = JSON.stringify({
    title: 'Thong bao moi tu truong',
    body: item.title,
    url: item.link || '/dashboard',
  });

  const results = await Promise.all(subscriptions.map(async (sub) => {
    try {
      const pushResponse = await webpush.sendNotification(sub.subscription, payload);
      return { ok: true, id: sub.id, statusCode: pushResponse.statusCode };
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('id', sub.id);
      }

      return {
        ok: false,
        id: sub.id,
        statusCode: error?.statusCode,
        message: error?.message,
      };
    }
  }));

  const sent = results.filter((result) => result.ok).length;
  const failed = results.length - sent;

  if (sent > 0) {
    await supabase
      .from('school_announcement_push_queue')
      .update({ sent_at: new Date().toISOString(), attempts: (item.attempts || 0) + 1 })
      .eq('id', item.id);

    return res.status(200).json({ success: true, sent, failed, results });
  }

  const attempts = (item.attempts || 0) + 1;
  await supabase
    .from('school_announcement_push_queue')
    .update({
      attempts,
      scheduled_at: attempts >= MAX_ATTEMPTS ? nowIso : retryAt(),
      failed_at: attempts >= MAX_ATTEMPTS ? nowIso : null,
      last_error: results[0]?.message || 'Push failed',
    })
    .eq('id', item.id);

  return res.status(502).json({ success: false, sent, failed, attempts, results });
}
