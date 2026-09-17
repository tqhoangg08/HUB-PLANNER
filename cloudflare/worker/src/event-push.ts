import { deliverPushBatch, sourceDeliveryProgress, type PushDeliveryEnv, type PushDeliveryOptions } from './push-delivery.ts';
import { publishPushEvent, type PushEventQueueEnv } from './push-events.ts';

export interface EventPushEnv extends PushDeliveryEnv, PushEventQueueEnv { EVENT_PUSH_CUTOFF?: string; }
export interface PublicEventPushCandidate {
  id: number; title: string; status: string | null; is_deleted: number | boolean | null; created_at: string;
}

const BLOCKED_EVENT_STATES = new Set(['pending', 'draft', 'rejected', 'deleted', 'hidden']);
const CLAIM_LEASE_MS = 9 * 60_000;
const clean = (value: unknown) => String(value || '').trim();

export const eventPushCutoff = (env: EventPushEnv) => {
  const value = clean(env.EVENT_PUSH_CUTOFF);
  if (!Number.isFinite(Date.parse(value))) throw new Error('Event push cutoff is unavailable.');
  return new Date(value).toISOString();
};

export const isEventPushEligible = (event: PublicEventPushCandidate, cutoffIso: string) => {
  const createdAt = Date.parse(clean(event.created_at));
  const cutoff = Date.parse(cutoffIso);
  const status = clean(event.status).toLowerCase();
  return Number.isSafeInteger(Number(event.id)) && Number(event.id) > 0 && Boolean(clean(event.title))
    && !Boolean(event.is_deleted) && !BLOCKED_EVENT_STATES.has(status)
    && Number.isFinite(createdAt) && Number.isFinite(cutoff) && createdAt >= cutoff;
};

export const buildEventPushPayload = (event: PublicEventPushCandidate) => ({
  title: 'Sự kiện mới trên HUB Planner',
  body: clean(event.title).slice(0, 240),
  url: `/events/${Number(event.id)}`,
  category: 'events' as const,
});

const readNextCandidate = async (env: EventPushEnv) => {
  const cutoffIso = eventPushCutoff(env);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT e.id, e.title, e.status, e.is_deleted, e.created_at
       FROM public_events e
       LEFT JOIN event_push_deliveries d ON d.event_id = e.id
      WHERE (d.event_id IS NULL
          OR (d.state = 'sending' AND (d.lease_expires_at IS NULL OR d.lease_expires_at <= ?))
          OR (d.state = 'failed' AND (d.lease_expires_at IS NULL OR d.lease_expires_at <= ?)
              AND (d.next_retry_at IS NULL OR d.next_retry_at <= ?)))
        AND e.created_at >= ? AND COALESCE(e.is_deleted, 0) = 0
        AND LOWER(COALESCE(e.status, '')) NOT IN ('pending', 'draft', 'rejected', 'deleted', 'hidden')
      ORDER BY e.created_at, e.id LIMIT 1`,
  ).bind(now, now, now, cutoffIso).first<PublicEventPushCandidate>();
  return row && isEventPushEligible(row, cutoffIso) ? row : null;
};

const readEventById = async (env: EventPushEnv, eventId: string | number) => {
  const row = await env.DB.prepare(
    `SELECT id, title, status, is_deleted, created_at
       FROM public_events WHERE id = ?`,
  ).bind(eventId).first<PublicEventPushCandidate>();
  return row;
};

const reserveEvent = async (env: EventPushEnv, event: PublicEventPushCandidate) => {
  const now = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO event_push_deliveries
       (event_id, event_created_at, state, attempted_at, attempts, lease_expires_at)
     VALUES (?, ?, 'sending', ?, 1, ?)`,
  ).bind(event.id, event.created_at, now, leaseExpiresAt).run();
  if (Number(inserted.meta?.changes || 0) === 1) return true;
  const claimed = await env.DB.prepare(
    `UPDATE event_push_deliveries SET lease_expires_at = ?, attempted_at = ?
      WHERE event_id = ?
        AND ((state = 'sending' AND (lease_expires_at IS NULL OR lease_expires_at <= ?))
          OR (state = 'failed' AND (lease_expires_at IS NULL OR lease_expires_at <= ?)
              AND (next_retry_at IS NULL OR next_retry_at <= ?)))`,
  ).bind(leaseExpiresAt, now, event.id, now, now, now).run();
  return Number(claimed.meta?.changes || 0) === 1;
};

const completeEvent = async (
  env: EventPushEnv,
  eventId: number,
  result: { sent: number; failed: number; skipped: number; hasMore: boolean; retryAt: string | null },
) => {
  const now = new Date().toISOString();
  // Queue continuation always wins over per-subscription retry timing. The
  // failed subscription rows keep their own backoff while remaining devices
  // receive this source notification immediately in bounded batches.
  const { continuation, retryAt: effectiveRetryAt, completed: terminal } = sourceDeliveryProgress(result);
  const state = terminal ? 'complete' : effectiveRetryAt ? 'failed' : 'sending';
  await env.DB.prepare(
    `UPDATE event_push_deliveries
        SET state = CASE WHEN ? = 'complete'
                           THEN CASE WHEN sent_count + ? > 0 THEN 'sent' ELSE 'skipped' END
                         ELSE ? END,
            sent_at = CASE WHEN ? = 'complete' THEN ? ELSE sent_at END,
            sent_count = sent_count + ?, failed_count = failed_count + ?, skipped_count = skipped_count + ?,
            last_error = CASE WHEN ? IS NULL THEN NULL ELSE 'DELIVERY_RETRY_PENDING' END,
            next_retry_at = ?, lease_expires_at = NULL
      WHERE event_id = ?`,
  ).bind(state, result.sent, state, state, now, result.sent, result.failed, result.skipped, effectiveRetryAt, effectiveRetryAt, eventId).run();
};

const processEventPushCandidate = async (
  env: EventPushEnv,
  event: PublicEventPushCandidate | null,
  fetcher: typeof fetch = fetch,
  sender?: PushDeliveryOptions['sender'],
) => {
  const cutoffIso = eventPushCutoff(env);
  if (!event || !isEventPushEligible(event, cutoffIso)) return { success: true, queued: 0, sent: 0, state: 'idle' as const, hasMore: false, retryAt: null };
  if (!(await reserveEvent(env, event))) return { success: true, queued: 0, sent: 0, state: 'deduplicated' as const };
  try {
    const result = await deliverPushBatch(env, buildEventPushPayload(event), {
      deliveryKey: { type: 'event', id: String(event.id) }, limit: 100, fetcher, sender,
    });
    await completeEvent(env, event.id, result);
    const { continuation, retryAt: effectiveRetryAt } = sourceDeliveryProgress(result);
    const state = continuation ? 'sending' as const : effectiveRetryAt ? 'failed' as const : result.sent > 0 ? 'sent' as const : 'skipped' as const;
    return { success: state !== 'failed' || result.sent > 0, queued: 1, sent: result.sent, state, hasMore: result.hasMore, retryAt: effectiveRetryAt };
  } catch {
    await env.DB.prepare(
      `UPDATE event_push_deliveries
          SET state = 'failed', next_retry_at = ?, lease_expires_at = NULL,
              last_error = 'PUSH_TRANSPORT_FAILED'
        WHERE event_id = ?`,
    ).bind(new Date(Date.now() + 15 * 60_000).toISOString(), event.id).run();
    return { success: false, queued: 1, sent: 0, state: 'failed' as const, hasMore: false, retryAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  }
};

export const processEventPushItem = async (
  env: EventPushEnv,
  eventId: string | number,
  fetcher: typeof fetch = fetch,
  sender?: PushDeliveryOptions['sender'],
) => processEventPushCandidate(env, await readEventById(env, eventId), fetcher, sender);

// Queue signal after a durable mutation. The public_events row remains the
// fallback authority if Queue transport fails, so this function never writes.
export const signalNewPublicEvent = async (
  env: Pick<EventPushEnv, 'EVENT_PUSH_CUTOFF' | 'PUSH_EVENTS_QUEUE'>,
  event: PublicEventPushCandidate,
  previous?: PublicEventPushCandidate | null,
) => {
  if (!env.PUSH_EVENTS_QUEUE) return false;
  try {
    const cutoff = eventPushCutoff(env as EventPushEnv);
    return isEventPushEligible(event, cutoff) && !isEventPushEligible(previous || { ...event, id: 0 }, cutoff)
      ? publishPushEvent(env, { v: 1, type: 'event', sourceId: event.id })
      : false;
  } catch {
    // A post-commit signal configuration fault must never roll back or report
    // failure for an otherwise successful event mutation; recovery retains
    // authority in public_events once the cutoff is repaired.
    console.warn('event_push_signal_unavailable');
    return false;
  }
};

export const runEventPush = async (env: EventPushEnv, fetcher: typeof fetch = fetch) =>
  processEventPushCandidate(env, await readNextCandidate(env), fetcher);
