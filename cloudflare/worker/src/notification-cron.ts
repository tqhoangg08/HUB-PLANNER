import { deliverPushBatch, sourceDeliveryProgress, type PushDeliveryEnv, type PushDeliveryOptions, type PushPayload } from './push-delivery.ts';
import { publishPushEvent, type PushEventMessage, type PushEventQueueEnv, type PushEventType } from './push-events.ts';

export type { PushEventMessage, PushEventType } from './push-events.ts';

export interface NotificationCronEnv extends PushDeliveryEnv, PushEventQueueEnv {
  NOTIFICATION_REENABLE_CUTOFF?: string;
  NOTIFICATION_JOBS_ENABLED?: string;
}

export class NotificationCronError extends Error {
  readonly status: 503 | 502;
  constructor(status: 503 | 502, message: string) { super(message); this.name = 'NotificationCronError'; this.status = status; }
}

type QueueAction = 'status' | 'suppress_backlog' | 'dry_run' | 'process';
type OutboxTable = 'school_announcement_push_queue' | 'lost_found_push_queue';
type SourceColumn = 'announcement_id' | 'lost_found_item_id';
type QueueRow = { id: number; source_id: string | number; title: string; body?: string; url: string };
export type OutboxProcessResult = {
  success: boolean; queued: number; sent: number; state: 'idle' | 'claimed' | 'sent' | 'pending';
  hasMore?: boolean; retryAt?: string | null;
};

const tableFor = (type: Extract<PushEventType, 'school' | 'lost_found'>): { table: OutboxTable; sourceColumn: SourceColumn; category: Extract<PushEventType, 'school' | 'lost_found'> } =>
  type === 'school'
    ? { table: 'school_announcement_push_queue', sourceColumn: 'announcement_id', category: 'school' }
    : { table: 'lost_found_push_queue', sourceColumn: 'lost_found_item_id', category: 'lost_found' };

export const enqueueSchoolAnnouncementPush = async (
  env: NotificationCronEnv,
  announcement: { id: string | number; title: string; link: string | null },
) => {
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO school_announcement_push_queue
       (announcement_id, title, link, scheduled_at) VALUES (?, ?, ?, ?)`,
  ).bind(announcement.id, announcement.title, announcement.link, new Date().toISOString()).run();
  const created = Number(inserted.meta?.changes || 0) === 1;
  return { inserted: created, signaled: created ? await publishPushEvent(env, { v: 1, type: 'school', sourceId: announcement.id }) : false };
};

export const lostFoundPushPayload = (item: { id: string | number; title: string; type: string; userName: string | null; location: string | null }) => ({
  id: item.id,
  title: String(item.type).toUpperCase() === 'FOUND' ? 'Có đồ vừa được nhặt' : 'Có bạn vừa báo mất đồ',
  body: `${String(item.userName || '').trim() || 'Một bạn HUB'}${String(item.type).toUpperCase() === 'FOUND' ? ' vừa nhặt được ' : ' vừa làm mất '}${String(item.title || '').trim() || 'một món đồ'} ở ${String(item.location || '').trim() || 'khu vực HUB'}.`,
  url: '/lost-found',
});

export const enqueueLostFoundPush = async (
  env: NotificationCronEnv,
  item: { id: string | number; title: string; type: string; userName: string | null; location: string | null },
) => {
  const payload = lostFoundPushPayload(item);
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO lost_found_push_queue
       (lost_found_item_id, title, body, url, scheduled_at) VALUES (?, ?, ?, ?, ?)`,
  ).bind(payload.id, payload.title, payload.body, payload.url, new Date().toISOString()).run();
  const created = Number(inserted.meta?.changes || 0) === 1;
  return { inserted: created, signaled: created ? await publishPushEvent(env, { v: 1, type: 'lost_found', sourceId: item.id }) : false };
};

const CLAIM_LEASE_MS = 14 * 60_000;

const findDueRow = async (env: NotificationCronEnv, type: Extract<PushEventType, 'school' | 'lost_found'>, sourceId?: string | number) => {
  const { table, sourceColumn } = tableFor(type);
  const bodyExpression = table === 'school_announcement_push_queue' ? 'title AS body' : 'body';
  const now = new Date().toISOString();
  const exact = sourceId === undefined ? '' : ` AND ${sourceColumn} = ?`;
  const bindings: Array<string | number> = [now, now, now];
  if (sourceId !== undefined) bindings.push(sourceId);
  return env.DB.prepare(
    `SELECT id, ${sourceColumn} AS source_id, title, ${bodyExpression},
            ${table === 'school_announcement_push_queue' ? "COALESCE(link, '/announcements')" : 'url'} AS url
       FROM ${table}
      WHERE sent_at IS NULL AND failed_at IS NULL AND scheduled_at <= ?
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)${exact}
      ORDER BY scheduled_at, id LIMIT 1`,
  ).bind(...bindings).first<QueueRow>();
};

export const processNotificationOutboxItem = async (
  env: NotificationCronEnv,
  type: Extract<PushEventType, 'school' | 'lost_found'>,
  sourceId?: string | number,
  fetcher: typeof fetch = fetch,
  sender?: PushDeliveryOptions['sender'],
): Promise<OutboxProcessResult> => {
  const { table, sourceColumn, category } = tableFor(type);
  const row = await findDueRow(env, type, sourceId);
  if (!row) return { success: true, queued: 0, sent: 0, state: 'idle' };
  const now = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();
  // Shared atomic lease: fallback cron and duplicate Queue messages race
  // safely, with exactly one winner allowed to deliver this outbox item.
  const claimed = await env.DB.prepare(
    `UPDATE ${table} SET lease_expires_at = ?
      WHERE id = ? AND ${sourceColumn} = ? AND sent_at IS NULL AND failed_at IS NULL
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
  ).bind(leaseExpiresAt, row.id, row.source_id, now, now).run();
  if (Number(claimed.meta?.changes || 0) !== 1) return { success: true, queued: 0, sent: 0, state: 'claimed' };

  const payload: PushPayload = {
    title: category === 'school' ? 'Thông báo mới từ HUB Planner' : row.title,
    body: String(row.body || row.title).slice(0, 240), url: row.url, category,
  };
  const result = await deliverPushBatch(env, payload, {
    deliveryKey: { type: category, id: String(row.source_id) }, limit: 100, fetcher, sender,
  });
  const { continuation, retryAt: effectiveRetryAt, completed } = sourceDeliveryProgress(result);
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
    new Date().toISOString(), effectiveRetryAt, effectiveRetryAt, row.id,
  ).run();
  return {
    success: completed || result.sent > 0, queued: 1, sent: result.sent,
    state: completed ? 'sent' : 'pending', hasMore: continuation, retryAt: effectiveRetryAt,
  };
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
        SELECT id, 'Thông báo tìm đồ', 'Thông báo lịch sử đã được bỏ qua.', '/lost-found', ?, ?, 'PRE_CUTOVER_SUPP'
        FROM public_lost_found_items WHERE created_at < ?`).bind(now, now, cutoffIso),
    ]);
    return { ...(await status(env)), suppressed: true };
  }
  if (action === 'dry_run') return { ...(await status(env)), recovery: true };
  // New content owns enqueue + Queue signal. The cron only recovers pending
  // outbox records and makes no D1 write on an empty/no-op invocation.
  const [announcements, lostFound] = await Promise.all([
    processNotificationOutboxItem(env, 'school'),
    processNotificationOutboxItem(env, 'lost_found'),
  ]);
  return { success: announcements.success && lostFound.success, announcements, lostFound, recovery: true };
};
