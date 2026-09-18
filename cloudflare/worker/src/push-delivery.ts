import { sendWebPush, WebPushError, type NativeWebPushEnv, type StoredPushSubscription, type WebPushFailureClass } from './web-push.ts';

export type PushCategory = 'system' | 'events' | 'lost_found' | 'schedule' | 'school';
export interface PushDeliveryEnv extends NativeWebPushEnv { DB: D1Database; }
export interface PushPayload { title: string; body: string; url: string; category: PushCategory; }
export interface PushDeliveryKey { type: 'school' | 'lost_found' | 'event' | 'moderator' | 'schedule'; id: string; }
export interface PushDeliveryResult {
  sent: number; failed: number; skipped: number; staleRemoved: number;
  targeted: number; hasMore: boolean; retryAt: string | null;
  failureClasses: Partial<Record<WebPushFailureClass, number>>;
}
export interface SourceDeliveryProgress {
  continuation: boolean;
  retryAt: string | null;
  completed: boolean;
}
export interface PushDeliveryOptions {
  userId?: string;
  // This is resolved server-side (for example from an authenticated current
  // device fingerprint), never accepted as a caller-controlled recipient.
  subscriptionId?: string;
  limit?: number;
  fetcher?: typeof fetch;
  deliveryKey?: PushDeliveryKey;
  // Local deterministic tests may replace the transport. Runtime callers
  // leave this undefined and always use the native VAPID sender.
  sender?: (subscription: StoredPushSubscription, payload: PushPayload) => Promise<number>;
}

const MAX_BATCH = 100;
const RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000] as const;
interface SubscriptionWithPreference extends StoredPushSubscription {
  preference_enabled: number | null;
  delivery_attempts: number | null;
}

const nextDeferredRetryAt = async (env: PushDeliveryEnv, deliveryKey?: PushDeliveryKey) => {
  if (!deliveryKey) return null;
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT MIN(next_retry_at) AS retry_at
       FROM push_delivery_attempts
      WHERE source_type = ? AND source_id = ?
        AND state = 'failed' AND attempts < 3
        AND next_retry_at IS NOT NULL AND next_retry_at > ?`,
  ).bind(deliveryKey.type, deliveryKey.id, now).first<{ retry_at: string | null }>();
  return row?.retry_at || null;
};

const preferenceColumn = (category: PushCategory) => {
  if (!['system', 'events', 'lost_found', 'schedule', 'school'].includes(category)) throw new Error('Unsupported push category');
  return category;
};

// Source-level outboxes must not let a single failed target delay the next
// hundred never-attempted targets. Individual delivery rows retain backoff.
export const sourceDeliveryProgress = (result: Pick<PushDeliveryResult, 'hasMore' | 'retryAt'>): SourceDeliveryProgress => {
  const continuation = result.hasMore;
  const retryAt = continuation ? null : result.retryAt;
  return { continuation, retryAt, completed: !continuation && !retryAt };
};

export const deliverPushBatch = async (
  env: PushDeliveryEnv,
  payload: PushPayload,
  options: PushDeliveryOptions = {},
): Promise<PushDeliveryResult> => {
  const preference = preferenceColumn(payload.category);
  const limit = Math.max(1, Math.min(MAX_BATCH, Math.floor(options.limit || MAX_BATCH)));
  const joinBindings: unknown[] = [];
  const whereBindings: unknown[] = [];
  const conditions: string[] = [];
  let deliveryJoin = '';
  const now = new Date();
  const nowIso = now.toISOString();
  if (options.deliveryKey) {
    deliveryJoin = `LEFT JOIN push_delivery_attempts a
      ON a.subscription_id = s.id AND a.source_type = ? AND a.source_id = ?`;
    joinBindings.push(options.deliveryKey.type, options.deliveryKey.id);
    // A failed target is not selected again until its persisted backoff has
    // elapsed. Terminal outcomes are deliberately never reselected.
    conditions.push("(a.subscription_id IS NULL OR (a.state = 'failed' AND a.attempts < 3 AND (a.next_retry_at IS NULL OR a.next_retry_at <= ?)))");
    whereBindings.push(nowIso);
  }
  if (options.userId) { conditions.push('s.user_id = ?'); whereBindings.push(options.userId); }
  if (options.subscriptionId) { conditions.push('s.id = ?'); whereBindings.push(options.subscriptionId); }
  const rows = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth,
            ${options.deliveryKey ? 'a.attempts' : 'NULL'} AS delivery_attempts,
            p.${preference} AS preference_enabled
       FROM push_subscriptions s
       LEFT JOIN notification_preferences p ON p.user_id = s.user_id
       ${deliveryJoin}
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY s.id ASC LIMIT ?`,
  ).bind(...joinBindings, ...whereBindings, limit + 1).all<SubscriptionWithPreference>();
  const candidates = rows.results || [];
  const batch = candidates.slice(0, limit);
  let sent = 0; let failed = 0; let skipped = 0; let staleRemoved = 0;
  let retryAt: string | null = null;
  const failureClasses: Partial<Record<WebPushFailureClass, number>> = {};

  for (let offset = 0; offset < batch.length; offset += 10) {
    const chunk = batch.slice(offset, offset + 10);
    const results = await Promise.all(chunk.map(async (subscription) => {
      const nextAttempt = Math.max(0, Number(subscription.delivery_attempts || 0)) + 1;
      if (subscription.preference_enabled === 0) {
        return { state: 'skipped' as const, status: null, nextRetryAt: null };
      }
      try {
        const status = options.sender
          ? await options.sender(subscription, payload)
          : await sendWebPush(env, subscription, payload, options.fetcher);
        return { state: 'sent' as const, status, nextRetryAt: null };
      } catch (error) {
        const status = error instanceof WebPushError ? error.statusCode || null : null;
        const failureClass = error instanceof WebPushError ? error.failureClass : 'transport_network';
        if (status === 404 || status === 410) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(subscription.id).run();
          return { state: 'stale' as const, status, nextRetryAt: null, failureClass };
        }
        // This can only arise from the subscription's persisted endpoint or
        // encryption material. It cannot recover through retry, so clean it
        // up just like provider-confirmed 404/410 staleness.
        if (failureClass === 'subscription_endpoint_invalid' || failureClass === 'subscription_crypto_invalid') {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(subscription.id).run();
          return { state: 'stale' as const, status, nextRetryAt: null, failureClass };
        }
        const delay = RETRY_DELAYS_MS[Math.min(nextAttempt - 1, RETRY_DELAYS_MS.length - 1)];
        return { state: 'failed' as const, status, nextRetryAt: new Date(now.getTime() + delay).toISOString(), failureClass };
      }
    }));
    if (options.deliveryKey) {
      // Persist each bounded transport chunk atomically to reduce D1 round
      // trips without changing one-row-per-device dedupe semantics.
      await env.DB.batch(results.map((result, index) => env.DB.prepare(
        `INSERT INTO push_delivery_attempts
           (source_type, source_id, subscription_id, state, attempts, last_status, updated_at, next_retry_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(source_type, source_id, subscription_id) DO UPDATE SET
           state = excluded.state, attempts = push_delivery_attempts.attempts + 1,
           last_status = excluded.last_status, updated_at = excluded.updated_at,
           next_retry_at = excluded.next_retry_at
         WHERE push_delivery_attempts.state = 'failed'
           AND push_delivery_attempts.attempts < 3
           AND (push_delivery_attempts.next_retry_at IS NULL OR push_delivery_attempts.next_retry_at <= excluded.updated_at)`,
      ).bind(
        options.deliveryKey!.type, options.deliveryKey!.id, chunk[index].id,
        result.state, result.status, nowIso, result.nextRetryAt,
      )));
    }
    sent += results.filter((result) => result.state === 'sent').length;
    skipped += results.filter((result) => result.state === 'skipped').length;
    staleRemoved += results.filter((result) => result.state === 'stale').length;
    failed += results.filter((result) => result.state === 'failed').length;
    for (const result of results) {
      if (result.state === 'failed' && result.failureClass) {
        failureClasses[result.failureClass] = (failureClasses[result.failureClass] || 0) + 1;
      }
      if (result.nextRetryAt && (!retryAt || result.nextRetryAt < retryAt)) retryAt = result.nextRetryAt;
    }
  }
  // A continuation must drain subscriptions that have not been attempted yet
  // before the source-level state is deferred for any individual failure.
  // Existing failed rows retain their own persisted backoff; after the final
  // unseen/eligible batch, surface the earliest one so the caller can retry.
  const hasMore = candidates.length > limit;
  const deferredRetryAt = hasMore ? null : await nextDeferredRetryAt(env, options.deliveryKey);
  if (Object.keys(failureClasses).length) {
    console.warn('web_push_delivery_failures', {
      source_type: options.deliveryKey?.type || 'direct',
      failure_classes: failureClasses,
    });
  }
  return {
    sent, failed, skipped, staleRemoved, targeted: batch.length,
    hasMore,
    retryAt: hasMore ? null : retryAt || deferredRetryAt,
    failureClasses,
  };
};
