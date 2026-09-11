import { deliverPushBatch, type PushDeliveryEnv } from './push-delivery.ts';

export interface EventPushEnv extends PushDeliveryEnv { EVENT_PUSH_CUTOFF?: string; }
export interface PublicEventPushCandidate {
  id: number; title: string; status: string | null; is_deleted: number | boolean | null; created_at: string;
}

const BLOCKED_EVENT_STATES = new Set(['pending', 'draft', 'rejected', 'deleted', 'hidden']);
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
  const row = await env.DB.prepare(
    `SELECT e.id, e.title, e.status, e.is_deleted, e.created_at
       FROM public_events e
       LEFT JOIN event_push_deliveries d ON d.event_id = e.id
      WHERE (d.event_id IS NULL OR d.state IN ('sending', 'failed'))
        AND e.created_at >= ? AND COALESCE(e.is_deleted, 0) = 0
        AND LOWER(COALESCE(e.status, '')) NOT IN ('pending', 'draft', 'rejected', 'deleted', 'hidden')
      ORDER BY e.created_at, e.id LIMIT 1`,
  ).bind(cutoffIso).first<PublicEventPushCandidate>();
  return row && isEventPushEligible(row, cutoffIso) ? row : null;
};

const reserveEvent = async (env: EventPushEnv, event: PublicEventPushCandidate) => {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO event_push_deliveries
       (event_id, event_created_at, state, attempted_at, attempts)
     VALUES (?, ?, 'sending', ?, 1)`,
  ).bind(event.id, event.created_at, new Date().toISOString()).run();
  const row = await env.DB.prepare(
    `SELECT event_id FROM event_push_deliveries WHERE event_id = ? AND state IN ('sending', 'failed')`,
  ).bind(event.id).first();
  return Boolean(row);
};

const completeEvent = async (env: EventPushEnv, eventId: number, state: 'sent' | 'skipped' | 'failed', reason: string | null) => {
  await env.DB.prepare(
    `UPDATE event_push_deliveries SET state = ?, sent_at = ?, last_error = ? WHERE event_id = ?`,
  ).bind(state, new Date().toISOString(), reason, eventId).run();
};

export const runEventPush = async (env: EventPushEnv, fetcher: typeof fetch = fetch) => {
  const event = await readNextCandidate(env);
  if (!event) return { success: true, queued: 0, sent: 0, state: 'idle' as const };
  if (!(await reserveEvent(env, event))) return { success: true, queued: 0, sent: 0, state: 'deduplicated' as const };
  try {
    const result = await deliverPushBatch(env, buildEventPushPayload(event), {
      deliveryKey: { type: 'event', id: String(event.id) }, limit: 100, fetcher,
    });
    if (result.hasMore) {
      await env.DB.prepare(
        `UPDATE event_push_deliveries SET state = 'sending',
          sent_count = sent_count + ?, failed_count = failed_count + ?,
          skipped_count = skipped_count + ?, last_error = 'DELIVERY_RETRY_PENDING'
          WHERE event_id = ?`,
      ).bind(result.sent, result.failed, result.skipped, event.id).run();
      return { success: result.sent > 0, queued: 1, sent: result.sent, state: 'sending' as const };
    }
    await completeEvent(env, event.id, result.sent > 0 ? 'sent' : 'skipped', null);
    return { success: true, queued: 1, sent: result.sent, state: result.sent > 0 ? 'sent' as const : 'skipped' as const };
  } catch {
    await completeEvent(env, event.id, 'failed', 'PUSH_TRANSPORT_FAILED');
    return { success: false, queued: 1, sent: 0, state: 'failed' as const };
  }
};
