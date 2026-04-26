import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

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

const lostFoundPayload = (item) => {
  const userName = item.user_name?.trim() || 'Một bạn HUB';
  const itemName = item.title?.trim() || 'một món đồ';
  const location = item.location?.trim() || 'khu vực HUB';
  const isFound = item.type === 'FOUND';

  return {
    title: isFound ? 'Có đồ vừa được nhặt' : 'Có bạn vừa báo mất đồ',
    body: `${userName} ${isFound ? 'vừa nhặt được' : 'vừa làm mất'} ${itemName} ở ${location}.`,
    url: '/lost-found',
  };
};

const getActorRole = async (req) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) return null;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  return roleData?.role || 'student';
};

const sendPushToAll = async (payload) => {
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, subscription');

  if (error) throw error;
  if (!subscriptions?.length) return { sent: 0, failed: 0, results: [], skipped: true };

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const role = await getActorRole(req);
  if (!['admin', 'editor'].includes(role || '')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const body = readBody(req.body);
  const itemId = Number(body.id);
  if (!Number.isFinite(itemId)) {
    return res.status(400).json({ error: 'Missing lost-found item id' });
  }

  const { data: existingItem, error: existingError } = await supabase
    .from('lost_found_items')
    .select('id, title, location, user_name, type, status, is_deleted')
    .eq('id', itemId)
    .maybeSingle();

  if (existingError) return res.status(500).json({ error: existingError.message });
  if (!existingItem || existingItem.is_deleted) return res.status(404).json({ error: 'Not found' });

  let item = existingItem;
  if (existingItem.status !== 'approved') {
    const { data: approvedItem, error: approveError } = await supabase
      .from('lost_found_items')
      .update({ status: 'approved' })
      .eq('id', itemId)
      .select('id, title, location, user_name, type, status, is_deleted')
      .single();

    if (approveError) return res.status(500).json({ error: approveError.message });
    item = approvedItem;
  }

  const { data: queueRow, error: queueReadError } = await supabase
    .from('lost_found_push_queue')
    .select('id, sent_at, attempts')
    .eq('lost_found_item_id', item.id)
    .maybeSingle();

  if (queueReadError) return res.status(500).json({ error: queueReadError.message });
  if (queueRow?.sent_at) {
    return res.status(200).json({ success: true, approved: true, alreadySent: true, sent: 0 });
  }

  const payload = lostFoundPayload(item);
  const nowIso = new Date().toISOString();
  let queueId = queueRow?.id;

  if (queueId) {
    const { error: queueUpdateError } = await supabase
      .from('lost_found_push_queue')
      .update({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        scheduled_at: nowIso,
      })
      .eq('id', queueId);

    if (queueUpdateError) return res.status(500).json({ error: queueUpdateError.message });
  } else {
    const { data: insertedQueue, error: queueInsertError } = await supabase
      .from('lost_found_push_queue')
      .insert({
        lost_found_item_id: item.id,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        scheduled_at: nowIso,
      })
      .select('id')
      .single();

    if (queueInsertError) return res.status(500).json({ error: queueInsertError.message });
    queueId = insertedQueue.id;
  }

  const pushResult = await sendPushToAll(payload);
  await supabase
    .from('lost_found_push_queue')
    .update({
      sent_at: new Date().toISOString(),
      attempts: (queueRow?.attempts || 0) + 1,
      last_error: pushResult.sent > 0 ? null : 'No push subscriptions',
    })
    .eq('id', queueId);

  return res.status(200).json({
    success: true,
    approved: true,
    ...pushResult,
  });
}
