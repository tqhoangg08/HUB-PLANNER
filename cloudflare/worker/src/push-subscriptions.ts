import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface PushSubscriptionEnv extends BetterAuthIdentityEnv { DB: D1Database; }

export class PushSubscriptionError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, message: string, code = 'PUSH_SUBSCRIPTION_FAILED') {
    super(message); this.name = 'PushSubscriptionError'; this.status = status; this.code = code;
  }
}

const MAX_BODY_BYTES = 16 * 1024;
const readBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new PushSubscriptionError(413, 'Dữ liệu thiết bị quá lớn.');
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new PushSubscriptionError(400, 'Dữ liệu thiết bị không hợp lệ.'); }
};

const endpointFingerprint = async (endpoint: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const readSubscription = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PushSubscriptionError(400, 'Subscription không hợp lệ.', 'INVALID_PUSH_SUBSCRIPTION');
  }
  const subscription = value as Record<string, unknown>;
  const endpoint = String(subscription.endpoint || '').trim();
  const keys = subscription.keys;
  if (!endpoint || endpoint.length > 4096 || !endpoint.startsWith('https://')) {
    throw new PushSubscriptionError(400, 'Endpoint thông báo không hợp lệ.', 'INVALID_PUSH_ENDPOINT');
  }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    throw new PushSubscriptionError(400, 'Khóa đăng ký thông báo không hợp lệ.', 'INVALID_PUSH_KEYS');
  }
  const p256dh = String((keys as Record<string, unknown>).p256dh || '');
  const auth = String((keys as Record<string, unknown>).auth || '');
  const base64Url = /^[A-Za-z0-9_-]+$/;
  if (p256dh.length < 40 || p256dh.length > 256 || !base64Url.test(p256dh)
    || auth.length < 8 || auth.length > 128 || !base64Url.test(auth)) {
    throw new PushSubscriptionError(400, 'Khóa đăng ký thông báo không hợp lệ.', 'INVALID_PUSH_KEYS');
  }
  return { endpoint, p256dh, auth };
};

export const handlePushSubscription = async (request: Request, env: PushSubscriptionEnv) => {
  const identity = await requireBetterAuthSession(request, env);
  if (request.method === 'GET') {
    const rows = await env.DB.prepare(
      'SELECT id, endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50',
    ).bind(identity.userId).all<{ id: string; endpoint: string }>();
    return { success: true, data: rows.results || [] };
  }
  if (request.method !== 'POST' && request.method !== 'DELETE') throw new PushSubscriptionError(405, 'Phương thức không được hỗ trợ.');
  const body = await readBody(request);
  if ('userId' in body || 'user_id' in body || 'role' in body) throw new PushSubscriptionError(400, 'Không cho phép chỉ định chủ sở hữu.');
  const subscription = readSubscription(body.subscription);
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
      .bind(identity.userId, subscription.endpoint).run();
    return { success: true };
  }
  const startedAt = Number.isFinite(Date.parse(String(body.bindingStartedAt || '')))
    ? new Date(String(body.bindingStartedAt)).toISOString() : new Date().toISOString();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, binding_started_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       binding_started_at = excluded.binding_started_at, updated_at = excluded.updated_at
     WHERE push_subscriptions.binding_started_at <= excluded.binding_started_at`,
  ).bind(crypto.randomUUID(), identity.userId, subscription.endpoint, subscription.p256dh,
    subscription.auth, startedAt, now, now).run();
  const verified = await env.DB.prepare(
    'SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ? LIMIT 1',
  ).bind(identity.userId, subscription.endpoint).first<{ id: string }>();
  if (!verified?.id) throw new PushSubscriptionError(409, 'Thiết bị đã được liên kết bằng một yêu cầu mới hơn.', 'STALE_PUSH_BINDING');
  return { success: true, currentDeviceMatched: true, fingerprint: await endpointFingerprint(subscription.endpoint) };
};

export const pushSubscriptionErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof PushSubscriptionError ? error.status : 500;
