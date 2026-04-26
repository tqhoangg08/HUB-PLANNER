import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MINUTES = 10;
const PUSH_SPACING_MINUTES = 10;

webpush.setVapidDetails(
  'mailto:admin@hotrosinhvienhub.id.vn',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const readBody = (body) => {
  if (!body) return {};
  if (typeof body !== 'string') return body;

  try {
    return JSON.parse(body || '{}');
  } catch {
    return {};
  }
};

const isAuthorized = (req, body) => {
  const token = req.query?.secret || body.secret || req.headers['x-secret-key'];
  const bearer = req.headers.authorization;

  if (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return true;
  return Boolean(process.env.MY_SECRET_SCRAPER_KEY && token === process.env.MY_SECRET_SCRAPER_KEY);
};

const retryAt = () => new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000).toISOString();

const enqueueRecentAnnouncements = async () => {
  const recentCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: announcements, error: announcementError } = await supabase
    .from('school_announcements')
    .select('id, title, link')
    .eq('is_new', true)
    .eq('is_hidden', false)
    .gte('created_at', recentCutoff)
    .order('created_at', { ascending: true })
    .limit(20);

  if (announcementError || !announcements?.length) {
    return { queued: 0, error: announcementError?.message };
  }

  const announcementIds = announcements.map((item) => item.id);
  const { data: queuedRows, error: queuedError } = await supabase
    .from('school_announcement_push_queue')
    .select('announcement_id')
    .in('announcement_id', announcementIds);

  if (queuedError) return { queued: 0, error: queuedError.message };

  const queuedIds = new Set((queuedRows || []).map((item) => item.announcement_id));
  const missingRows = announcements.filter((item) => !queuedIds.has(item.id));
  if (!missingRows.length) return { queued: 0 };

  const now = Date.now();
  const rows = missingRows.map((item, index) => ({
    announcement_id: item.id,
    title: item.title,
    link: item.link,
    scheduled_at: new Date(now + index * PUSH_SPACING_MINUTES * 60 * 1000).toISOString(),
  }));

  const { error } = await supabase
    .from('school_announcement_push_queue')
    .upsert(rows, { onConflict: 'announcement_id' });

  return { queued: error ? 0 : rows.length, error: error?.message };
};

const lostFoundBody = (item) => {
  const userName = item.user_name?.trim() || 'Một bạn HUB';
  const itemName = item.title?.trim() || 'một món đồ';
  const location = item.location?.trim() || 'khu vực HUB';
  const action = item.type === 'FOUND' ? 'vừa nhặt được' : 'vừa làm mất';
  return `${userName} ${action} ${itemName} ở ${location}.`;
};

const enqueueRecentLostFoundItems = async () => {
  const recentCutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data: items, error: itemError } = await supabase
    .from('lost_found_items')
    .select('id, title, location, user_name, type')
    .eq('status', 'approved')
    .eq('is_deleted', false)
    .gte('created_at', recentCutoff)
    .order('created_at', { ascending: true })
    .limit(20);

  if (itemError || !items?.length) {
    return { queued: 0, error: itemError?.message };
  }

  const itemIds = items.map((item) => item.id);
  const { data: queuedRows, error: queuedError } = await supabase
    .from('lost_found_push_queue')
    .select('lost_found_item_id')
    .in('lost_found_item_id', itemIds);

  if (queuedError) return { queued: 0, error: queuedError.message };

  const queuedIds = new Set((queuedRows || []).map((item) => item.lost_found_item_id));
  const missingRows = items.filter((item) => !queuedIds.has(item.id));
  if (!missingRows.length) return { queued: 0 };

  const now = Date.now();
  const rows = missingRows.map((item, index) => ({
    lost_found_item_id: item.id,
    title: item.type === 'FOUND' ? 'Có đồ vừa được nhặt' : 'Có bạn vừa báo mất đồ',
    body: lostFoundBody(item),
    url: '/lost-found',
    scheduled_at: new Date(now + index * PUSH_SPACING_MINUTES * 60 * 1000).toISOString(),
  }));

  const { error } = await supabase
    .from('lost_found_push_queue')
    .upsert(rows, { onConflict: 'lost_found_item_id' });

  return { queued: error ? 0 : rows.length, error: error?.message };
};

const loadSubscriptions = async () => {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, subscription');

  if (error) throw error;
  return data || [];
};

const sendPushToAll = async (subscriptions, payload) => {
  const results = await Promise.all(subscriptions.map(async (sub) => {
    try {
      const pushResponse = await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
      return { ok: true, id: sub.id, statusCode: pushResponse.statusCode };
    } catch (error) {
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
  return { sent, failed: results.length - sent, results };
};

const processQueue = async ({ table, select, payloadFor, emptyMessage, subscriptions }) => {
  const nowIso = new Date().toISOString();
  const { data: dueItems, error: dueError } = await supabase
    .from(table)
    .select(select)
    .is('sent_at', null)
    .is('failed_at', null)
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(1);

  if (dueError) return { success: false, sent: 0, error: dueError.message };

  const item = dueItems?.[0] || null;
  if (!item) return { success: true, sent: 0, message: emptyMessage };

  if (!subscriptions.length) {
    await supabase
      .from(table)
      .update({ sent_at: nowIso, last_error: 'No push subscriptions' })
      .eq('id', item.id);

    return { success: true, sent: 0, skipped: true, message: 'No subscriptions' };
  }

  const result = await sendPushToAll(subscriptions, payloadFor(item));

  if (result.sent > 0) {
    await supabase
      .from(table)
      .update({ sent_at: new Date().toISOString(), attempts: (item.attempts || 0) + 1 })
      .eq('id', item.id);

    return { success: true, ...result };
  }

  const attempts = (item.attempts || 0) + 1;
  await supabase
    .from(table)
    .update({
      attempts,
      scheduled_at: attempts >= MAX_ATTEMPTS ? nowIso : retryAt(),
      failed_at: attempts >= MAX_ATTEMPTS ? nowIso : null,
      last_error: result.results[0]?.message || 'Push failed',
    })
    .eq('id', item.id);

  return { success: false, attempts, ...result };
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = readBody(req.body);
  if (!isAuthorized(req, body)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const backfill = {
    announcements: await enqueueRecentAnnouncements(),
    lostFound: await enqueueRecentLostFoundItems(),
  };

  let subscriptions = [];
  try {
    subscriptions = await loadSubscriptions();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }

  const announcements = await processQueue({
    table: 'school_announcement_push_queue',
    select: 'id, title, link, attempts',
    subscriptions,
    emptyMessage: 'No due announcement push',
    payloadFor: (item) => ({
      title: 'Thông báo mới từ trường',
      body: item.title,
      url: item.link || '/dashboard',
    }),
  });

  const lostFound = await processQueue({
    table: 'lost_found_push_queue',
    select: 'id, title, body, url, attempts',
    subscriptions,
    emptyMessage: 'No due lost-found push',
    payloadFor: (item) => ({
      title: item.title,
      body: item.body,
      url: item.url || '/lost-found',
    }),
  });

  const ok = announcements.success && lostFound.success;
  return res.status(ok ? 200 : 502).json({
    success: ok,
    backfill,
    announcements,
    lostFound,
  });
}
