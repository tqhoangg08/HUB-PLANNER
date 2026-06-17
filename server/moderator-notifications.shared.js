import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const MODERATOR_ROLES = ['admin', 'auditor'];
const hasPushConfig = Boolean(process.env.VITE_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

if (hasPushConfig) {
  webpush.setVapidDetails(
    'mailto:admin@hotrosinhvienhub.id.vn',
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const normalizeText = (value) => String(value || '').trim();

export const getActorRole = async (request) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.id) return null;

  const userId = userData.user.id;

  const { data: primaryRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (primaryRole?.role) return String(primaryRole.role).trim();

  const { data: fallbackRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  return fallbackRole?.role ? String(fallbackRole.role).trim() : 'student';
};

export const getModeratorIds = async () => {
  const { data: rows, error } = await supabase
    .from('user_roles')
    .select('id, user_id, role')
    .in('role', MODERATOR_ROLES);

  if (error) throw error;

  return [...new Set((rows || []).map((row) => row.user_id || row.id).filter(Boolean))];
};

export const sendModeratorAlert = async ({
  title,
  body,
  url = '/',
  actorId = null,
  content = body,
  type = 'system_alert',
}) => {
  const receiverIds = await getModeratorIds();
  if (receiverIds.length === 0) {
    return { notified: 0, push: { sent: 0, failed: 0 }, receiverIds: [] };
  }

  const cleanContent = normalizeText(content || body || title || 'Có thông báo mới');
  const cleanUrl = normalizeText(url || '/');

  const { data: existingRows, error: existingError } = await supabase
    .from('notifications')
    .select('receiver_id')
    .in('receiver_id', receiverIds)
    .eq('type', type)
    .eq('content', cleanContent)
    .eq('link', cleanUrl);

  if (existingError) throw existingError;

  const existingReceivers = new Set((existingRows || []).map((row) => row.receiver_id));
  const notificationRows = receiverIds
    .filter((receiverId) => !existingReceivers.has(receiverId))
    .map((receiverId) => ({
      receiver_id: receiverId,
      actor_id: actorId || null,
      type,
      content: cleanContent,
      link: cleanUrl,
      is_read: false,
    }));

  if (notificationRows.length > 0) {
    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notificationRows);
    if (insertError) throw insertError;
  }

  let push = { sent: 0, failed: 0 };
  if (hasPushConfig) {
    const { data: subscriptions, error: subscriptionError } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, user_id, subscription')
      .in('user_id', receiverIds);

    if (subscriptionError) throw subscriptionError;

    const results = await Promise.all((subscriptions || []).map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify({
          title: title || 'HUB Planner',
          body: body || cleanContent,
          url: cleanUrl,
        }));
        return true;
      } catch (error) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
        console.error('Moderator push failed:', error);
        return false;
      }
    }));

    push = {
      sent: results.filter(Boolean).length,
      failed: results.length - results.filter(Boolean).length,
    };
  }

  return {
    notified: notificationRows.length,
    push,
    receiverIds,
  };
};
