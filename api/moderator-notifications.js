import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { withLogging } from '../server/middleware.js';

webpush.setVapidDetails(
  'mailto:admin@hotrosinhvienhub.id.vn',
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MODERATOR_ROLES = ['admin', 'auditor'];

const truncate = (value, max = 96) => {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
};

const rowTitle = (row, fallback = 'Nội dung mới') => truncate(
  row?.title ||
  row?.event_name ||
  row?.subject_name ||
  row?.error_location ||
  row?.full_name ||
  row?.content ||
  fallback
);

const CONFIG = {
  event_pending: {
    table: 'events',
    select: 'id, title, status',
    valid: (row) => row?.status === 'pending',
    title: 'Sự kiện chờ duyệt',
    content: (row) => `Có sự kiện mới cần duyệt: ${rowTitle(row, 'Sự kiện mới')}`,
    link: (row) => `/events/edit/${row.id}`,
  },
  lost_found_pending: {
    table: 'lost_found_items',
    select: 'id, title, type, status, user_id',
    valid: (row) => row?.status === 'pending',
    title: 'Tin thất lạc chờ duyệt',
    content: (row) => `Có tin ${row?.type === 'FOUND' ? 'nhặt được đồ' : 'báo mất đồ'} cần duyệt: ${rowTitle(row, 'Tin mới')}`,
    link: () => '/lost-found',
  },
  course_report: {
    table: 'course_reports',
    select: 'id, course_code, subject_name, status, user_id',
    valid: (row) => !row?.status || row.status === 'pending',
    title: 'Báo cáo môn học mới',
    content: (row) => `Có báo cáo môn học mới: ${truncate(row?.course_code || row?.subject_name || 'Môn học')}`,
    link: () => '/admin-reports',
  },
  event_report: {
    table: 'event_reports',
    select: 'id, event_id, event_name, status, user_id',
    valid: (row) => !row?.status || row.status === 'pending',
    title: 'Báo cáo sự kiện mới',
    content: (row) => `Có báo cáo sự kiện mới: ${rowTitle(row, 'Sự kiện')}`,
    link: () => '/admin-reports',
  },
  bug_report: {
    table: 'bug_reports',
    select: 'id, error_location, status, user_id',
    valid: (row) => !row?.status || row.status === 'pending',
    title: 'Báo lỗi hệ thống mới',
    content: (row) => `Có báo lỗi hệ thống mới: ${rowTitle(row, 'Lỗi hệ thống')}`,
    link: () => '/admin-reports',
  },
  feedback: {
    table: 'feedback',
    select: 'id, type, content, status, user_id',
    valid: (row) => !row?.status || ['new', 'pending'].includes(row.status),
    title: 'Phản hồi mới',
    content: (row) => `Có phản hồi/góp ý mới: ${rowTitle(row, 'Phản hồi')}`,
    link: () => '/admin-reports',
  },
  ctv_request: {
    table: 'ctv_requests',
    select: 'id, full_name, status, user_id',
    valid: (row) => !row?.status || row.status === 'pending',
    title: 'Đơn CTV mới',
    content: (row) => `Có đơn xin CTV mới: ${rowTitle(row, 'Ứng viên')}`,
    link: () => '/admin-reports',
  },
  user_course_request: {
    table: 'user_course_requests',
    select: 'id, course_code, subject_name, status, user_id',
    valid: (row) => !row?.status || row.status === 'pending',
    title: 'Yêu cầu thêm môn mới',
    content: (row) => `Có yêu cầu thêm môn mới: ${truncate(row?.course_code || row?.subject_name || 'Môn học')}`,
    link: () => '/schedule',
  },
};

const parseBody = (req) => (
  typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
);

const getRequestUserId = async (req) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
};

const getModeratorIds = async () => {
  const { data: roleRows, error } = await supabase
    .from('user_roles')
    .select('id, user_id, role')
    .in('role', MODERATOR_ROLES);

  if (error) throw error;

  const roleIds = [...new Set((roleRows || []).map((row) => row.user_id || row.id).filter(Boolean))];
  if (roleIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id')
    .in('id', roleIds);

  if (profileError) throw profileError;
  return (profiles || []).map((profile) => profile.id);
};

const sendPushToModerators = async (receiverIds, payload) => {
  if (receiverIds.length === 0) return { sent: 0, failed: 0 };

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, user_id, subscription')
    .in('user_id', receiverIds);

  if (error) throw error;
  if (!subscriptions || subscriptions.length === 0) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  const results = await Promise.all(subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(sub.subscription, body);
      return true;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', sub.id);
      }
      console.error('Moderator push failed:', error);
      return false;
    }
  }));

  const sent = results.filter(Boolean).length;
  return { sent, failed: results.length - sent };
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = parseBody(req);
  const { kind, recordId } = body;
  const config = CONFIG[kind];

  if (!config || !recordId) {
    return res.status(400).json({ error: 'Missing notification kind or recordId' });
  }

  const { data: row, error } = await supabase
    .from(config.table)
    .select(config.select)
    .eq('id', recordId)
    .maybeSingle();

  if (error) throw error;
  if (!row) return res.status(404).json({ error: 'Record not found' });
  if (!config.valid(row)) return res.status(200).json({ success: true, skipped: true });

  const receiverIds = await getModeratorIds();
  if (receiverIds.length === 0) {
    return res.status(200).json({ success: true, notified: 0, push: { sent: 0, failed: 0 } });
  }

  const actorId = row.user_id || await getRequestUserId(req);
  const content = config.content(row);
  const link = config.link(row);

  const { data: existingRows, error: existingError } = await supabase
    .from('notifications')
    .select('receiver_id')
    .in('receiver_id', receiverIds)
    .eq('type', 'system_alert')
    .eq('content', content)
    .eq('link', link);

  if (existingError) throw existingError;

  const existingReceivers = new Set((existingRows || []).map((item) => item.receiver_id));
  const notificationRows = receiverIds
    .filter((receiverId) => !existingReceivers.has(receiverId))
    .map((receiverId) => ({
      receiver_id: receiverId,
      actor_id: actorId || null,
      type: 'system_alert',
      content,
      link,
      is_read: false,
    }));

  if (notificationRows.length > 0) {
    const { error: insertError } = await supabase
      .from('notifications')
      .insert(notificationRows);
    if (insertError) throw insertError;
  }

  const push = await sendPushToModerators(receiverIds, {
    title: config.title,
    body: content,
    url: link,
  });

  return res.status(200).json({
    success: true,
    notified: notificationRows.length,
    push,
  });
}

export default withLogging(handler);
