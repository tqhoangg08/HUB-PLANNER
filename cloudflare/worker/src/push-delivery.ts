import { sendWebPush, WebPushError, type NativeWebPushEnv, type StoredPushSubscription } from './web-push.ts';

export type PushCategory = 'system' | 'events' | 'lost_found' | 'schedule' | 'school';
export interface PushDeliveryEnv extends NativeWebPushEnv { DB: D1Database; }
export interface PushPayload { title: string; body: string; url: string; category: PushCategory; }
export interface PushDeliveryKey { type: 'school' | 'lost_found' | 'event'; id: string; }
export interface PushDeliveryResult {
  sent: number; failed: number; skipped: number; staleRemoved: number;
  targeted: number; hasMore: boolean;
}

const MAX_BATCH = 100;
interface SubscriptionWithPreference extends StoredPushSubscription { preference_enabled: number | null; }

const preferenceColumn = (category: PushCategory) => {
  if (!['system', 'events', 'lost_found', 'schedule', 'school'].includes(category)) throw new Error('Unsupported push category');
  return category;
};

export const deliverPushBatch = async (
  env: PushDeliveryEnv,
  payload: PushPayload,
  options: { userId?: string; limit?: number; fetcher?: typeof fetch; deliveryKey?: PushDeliveryKey } = {},
): Promise<PushDeliveryResult> => {
  const preference = preferenceColumn(payload.category);
  const limit = Math.max(1, Math.min(MAX_BATCH, Math.floor(options.limit || MAX_BATCH)));
  const bindings: unknown[] = [];
  const conditions: string[] = [];
  let deliveryJoin = '';
  if (options.deliveryKey) {
    deliveryJoin = `LEFT JOIN push_delivery_attempts a
      ON a.subscription_id = s.id AND a.source_type = ? AND a.source_id = ?`;
    bindings.push(options.deliveryKey.type, options.deliveryKey.id);
    conditions.push("(a.subscription_id IS NULL OR (a.state = 'failed' AND a.attempts < 3))");
  }
  if (options.userId) { conditions.push('s.user_id = ?'); bindings.push(options.userId); }
  bindings.push(limit + 1);
  const rows = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth,
            p.${preference} AS preference_enabled
       FROM push_subscriptions s
       LEFT JOIN notification_preferences p ON p.user_id = s.user_id
       ${deliveryJoin}
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY s.id ASC LIMIT ?`,
  ).bind(...bindings).all<SubscriptionWithPreference>();
  const candidates = rows.results || [];
  const batch = candidates.slice(0, limit);
  let sent = 0; let failed = 0; let skipped = 0; let staleRemoved = 0;

  for (let offset = 0; offset < batch.length; offset += 10) {
    const chunk = batch.slice(offset, offset + 10);
    const results = await Promise.all(chunk.map(async (subscription) => {
      if (subscription.preference_enabled === 0) return { state: 'skipped' as const, status: null };
      try {
        const status = await sendWebPush(env, subscription, payload, options.fetcher);
        return { state: 'sent' as const, status };
      } catch (error) {
        const status = error instanceof WebPushError ? error.statusCode || null : null;
        if (status === 404 || status === 410) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(subscription.id).run();
          return { state: 'stale' as const, status };
        }
        return { state: 'failed' as const, status };
      }
    }));
    if (options.deliveryKey) {
      await Promise.all(results.map((result, index) => env.DB.prepare(
        `INSERT INTO push_delivery_attempts
           (source_type, source_id, subscription_id, state, attempts, last_status, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(source_type, source_id, subscription_id) DO UPDATE SET
           state = excluded.state, attempts = push_delivery_attempts.attempts + 1,
           last_status = excluded.last_status, updated_at = excluded.updated_at`,
      ).bind(
        options.deliveryKey!.type, options.deliveryKey!.id, chunk[index].id,
        result.state, result.status, new Date().toISOString(),
      ).run()));
    }
    sent += results.filter((result) => result.state === 'sent').length;
    skipped += results.filter((result) => result.state === 'skipped').length;
    staleRemoved += results.filter((result) => result.state === 'stale').length;
    failed += results.filter((result) => result.state === 'failed').length;
  }
  return {
    sent, failed, skipped, staleRemoved, targeted: batch.length,
    hasMore: candidates.length > limit || (Boolean(options.deliveryKey) && failed > 0),
  };
};
