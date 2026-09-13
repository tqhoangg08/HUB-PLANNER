import { deliverPushBatch, type PushDeliveryEnv, type PushPayload } from './push-delivery.ts';

export interface NotificationCronEnv extends PushDeliveryEnv {
  NOTIFICATION_REENABLE_CUTOFF?: string;
  NOTIFICATION_JOBS_ENABLED?: string;
}

export class NotificationCronError extends Error {
  readonly status: 503 | 502;
  constructor(status: 503 | 502, message: string) { super(message); this.name = 'NotificationCronError'; this.status = status; }
}

type QueueAction = 'status' | 'suppress_backlog' | 'dry_run' | 'process';
const TWO_HOURS = 2 * 60 * 60 * 1000;

const cutoff = (env: NotificationCronEnv) => {
  const value = String(env.NOTIFICATION_REENABLE_CUTOFF || '');
  if (!Number.isFinite(Date.parse(value))) throw new NotificationCronError(503, 'Notification cutoff is unavailable.');
  return new Date(Math.max(Date.parse(value), Date.now() - TWO_HOURS)).toISOString();
};

const enqueueRecent = async (env: NotificationCronEnv) => {
  const recent = cutoff(env);
  const now = Date.now();
  const announcements = await env.DB.prepare(
    `INSERT OR IGNORE INTO school_announcement_push_queue
       (announcement_id, title, link, scheduled_at)
     SELECT id, title, link,
            strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+' || ((ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) * 10) || ' minutes')
       FROM school_announcements
      WHERE COALESCE(is_hidden, 0) = 0 AND is_new = 1 AND created_at >= ?
      ORDER BY created_at, id LIMIT 20`,
  ).bind(new Date(now).toISOString(), recent).run();
  const lostFound = await env.DB.prepare(
    `INSERT OR IGNORE INTO lost_found_push_queue
       (lost_found_item_id, title, body, url, scheduled_at)
     SELECT id,
            CASE WHEN UPPER(type) = 'FOUND' THEN 'Có đồ vừa được nhặt' ELSE 'Có bạn vừa báo mất đồ' END,
            COALESCE(NULLIF(TRIM(user_name), ''), 'Một bạn HUB') ||
              CASE WHEN UPPER(type) = 'FOUND' THEN ' vừa nhặt được ' ELSE ' vừa làm mất ' END ||
              COALESCE(NULLIF(TRIM(title), ''), 'một món đồ') || ' ở ' ||
              COALESCE(NULLIF(TRIM(location), ''), 'khu vực HUB') || '.',
            '/lost-found',
            strftime('%Y-%m-%dT%H:%M:%fZ', ?, '+' || ((ROW_NUMBER() OVER (ORDER BY created_at, id) - 1) * 10) || ' minutes')
       FROM public_lost_found_items
      WHERE LOWER(COALESCE(status, '')) = 'approved'
        AND COALESCE(is_deleted, 0) = 0 AND created_at >= ?
      ORDER BY created_at, id LIMIT 20`,
  ).bind(new Date(now).toISOString(), recent).run();
  return { announcements: Number(announcements.meta?.changes || 0), lostFound: Number(lostFound.meta?.changes || 0) };
};

type QueueRow = { id: number; source_id: string | number; title: string; body?: string; url: string };
const CLAIM_LEASE_MS = 14 * 60_000;

const processQueue = async (
  env: NotificationCronEnv,
  table: 'school_announcement_push_queue' | 'lost_found_push_queue',
  sourceColumn: 'announcement_id' | 'lost_found_item_id',
  category: 'school' | 'lost_found',
) => {
  const bodyExpression = table === 'school_announcement_push_queue' ? 'title AS body' : 'body';
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT id, ${sourceColumn} AS source_id, title, ${bodyExpression},
            ${table === 'school_announcement_push_queue' ? "COALESCE(link, '/announcements')" : 'url'} AS url
       FROM ${table}
      WHERE sent_at IS NULL AND failed_at IS NULL AND scheduled_at <= ?
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
      ORDER BY scheduled_at, id LIMIT 1`,
  ).bind(now, now, now).first<QueueRow>();
  if (!row) return { success: true, queued: 0, sent: 0, state: 'idle' };
  const leaseExpiresAt = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();
  // The conditional update is the queue's atomic lease. Two scheduled
  // invocations may observe the same due row, but only one can deliver it.
  const claimed = await env.DB.prepare(
    `UPDATE ${table} SET lease_expires_at = ?
      WHERE id = ? AND sent_at IS NULL AND failed_at IS NULL
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
  ).bind(leaseExpiresAt, row.id, now, now).run();
  if (Number(claimed.meta?.changes || 0) !== 1) {
    return { success: true, queued: 0, sent: 0, state: 'claimed' };
  }
  const payload: PushPayload = {
    title: category === 'school' ? 'Thông báo mới từ HUB Planner' : row.title,
    body: String(row.body || row.title).slice(0, 240), url: row.url, category,
  };
  const result = await deliverPushBatch(env, payload, {
    deliveryKey: { type: category, id: String(row.source_id) }, limit: 100,
  });
  const completed = !result.hasMore && !result.retryAt;
  await env.DB.prepare(
    `UPDATE ${table}
        SET sent_count = sent_count + ?, failed_count = failed_count + ?,
            skipped_count = skipped_count + ?,
            attempts = CASE WHEN ? IS NULL THEN attempts ELSE attempts + 1 END,
            sent_at = CASE WHEN ? THEN ? ELSE sent_at END,
            next_retry_at = ?, lease_expires_at = NULL,
            last_error = CASE WHEN ? IS NOT NULL THEN 'DELIVERY_RETRY_PENDING' ELSE NULL END
      WHERE id = ?`,
  ).bind(
    result.sent, result.failed, result.skipped, result.retryAt, completed ? 1 : 0,
    new Date().toISOString(), result.retryAt, result.retryAt, row.id,
  ).run();
  return { success: completed || result.sent > 0, queued: 1, ...result, state: completed ? 'sent' : 'pending' };
};

const status = async (env: NotificationCronEnv) => {
  const [school, lost] = await Promise.all([
    env.DB.prepare('SELECT id FROM school_announcement_push_queue WHERE sent_at IS NULL AND failed_at IS NULL LIMIT 21').all(),
    env.DB.prepare('SELECT id FROM lost_found_push_queue WHERE sent_at IS NULL AND failed_at IS NULL LIMIT 21').all(),
  ]);
  return { success: true, pending: { announcements: school.results.length, lostFound: lost.results.length } };
};

export const runNotificationQueueControl = async (env: NotificationCronEnv, action: QueueAction) => {
  if (action === 'status') return status(env);
  if (action === 'suppress_backlog') {
    const cutoffIso = new Date(String(env.NOTIFICATION_REENABLE_CUTOFF || '')).toISOString();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO school_announcement_push_queue
        (announcement_id, title, link, scheduled_at, sent_at, last_error)
        SELECT id, title, link, ?, ?, 'PRE_CUTOVER_SUPPRESSED' FROM school_announcements WHERE created_at < ?`).bind(now, now, cutoffIso),
      env.DB.prepare(`INSERT OR IGNORE INTO lost_found_push_queue
        (lost_found_item_id, title, body, url, scheduled_at, sent_at, last_error)
        SELECT id, 'Thông báo tìm đồ', 'Thông báo lịch sử đã được bỏ qua.', '/lost-found', ?, ?, 'PRE_CUTOVER_SUPPRESSED'
        FROM public_lost_found_items WHERE created_at < ?`).bind(now, now, cutoffIso),
    ]);
    return { ...(await status(env)), suppressed: true };
  }
  const queued = await enqueueRecent(env);
  if (action === 'dry_run') return { success: true, queued, ...(await status(env)) };
  const [announcements, lostFound] = await Promise.all([
    processQueue(env, 'school_announcement_push_queue', 'announcement_id', 'school'),
    processQueue(env, 'lost_found_push_queue', 'lost_found_item_id', 'lost_found'),
  ]);
  return { success: announcements.success && lostFound.success, queued, announcements, lostFound };
};
