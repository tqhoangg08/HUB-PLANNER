import { BetterAuthIdentityError, requireBetterAuthSession, type BetterAuthIdentityEnv } from './better-auth-identity.ts';
import { deliverPushBatch, type PushDeliveryEnv } from './push-delivery.ts';
import { classifyWebPushProvider, type WebPushFailureClass } from './web-push.ts';

export interface PushTestEnv extends BetterAuthIdentityEnv, PushDeliveryEnv {}

export class PushTestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, message: string, code = 'PUSH_TEST_FAILED') {
    super(message); this.name = 'PushTestError'; this.status = status; this.code = code;
  }
}

const readBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1024) throw new PushTestError(413, 'Yêu cầu quá lớn.');
  if (!raw.trim()) return { currentDeviceFingerprint: null as string | null };
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new PushTestError(400, 'Yêu cầu không hợp lệ.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new PushTestError(400, 'Không cho phép chỉ định người nhận.');
  }
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => key !== 'currentDeviceFingerprint')) {
    throw new PushTestError(400, 'Không cho phép chỉ định người nhận.');
  }
  const fingerprint = record.currentDeviceFingerprint;
  if (fingerprint === undefined) return { currentDeviceFingerprint: null as string | null };
  if (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint)) {
    throw new PushTestError(400, 'Thiết bị hiện tại không hợp lệ.', 'INVALID_CURRENT_DEVICE');
  }
  return { currentDeviceFingerprint: fingerprint };
};

const endpointFingerprint = async (endpoint: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const testFailureCode = (failureClasses: Partial<Record<WebPushFailureClass, number>>) => {
  if (failureClasses.transport_timeout) return 'PUSH_TRANSPORT_TIMEOUT';
  if (failureClasses.transport_network) return 'PUSH_TRANSPORT_NETWORK';
  if (failureClasses.vapid_configuration) return 'PUSH_VAPID_CONFIGURATION';
  if (failureClasses.subscription_endpoint_invalid || failureClasses.subscription_crypto_invalid) return 'PUSH_SUBSCRIPTION_INVALID';
  if (failureClasses.provider_http) return 'PUSH_PROVIDER_HTTP';
  return 'PUSH_DELIVERY_FAILED';
};

export const handlePushTest = async (request: Request, env: PushTestEnv) => {
  if (request.method !== 'POST') throw new PushTestError(405, 'Phương thức không được hỗ trợ.');
  const body = await readBody(request);
  const identity = await requireBetterAuthSession(request, env);
  let subscriptionId: string | undefined;
  let provider: ReturnType<typeof classifyWebPushProvider> | undefined;
  if (body.currentDeviceFingerprint) {
    // The client can only nominate a hash minted by the server during its own
    // subscription registration. Resolve it within the authenticated owner's
    // rows; it never selects a recipient across users.
    const devices = await env.DB.prepare(
      'SELECT id, endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50',
    ).bind(identity.userId).all<{ id: string; endpoint: string }>();
    for (const device of devices.results || []) {
      if (await endpointFingerprint(device.endpoint) === body.currentDeviceFingerprint) {
        subscriptionId = device.id;
        provider = classifyWebPushProvider(device.endpoint);
        break;
      }
    }
    if (!subscriptionId) throw new PushTestError(404, 'Thiết bị hiện tại chưa được đăng ký nhận thông báo.', 'CURRENT_DEVICE_NOT_FOUND');
  }
  const result = await deliverPushBatch(env, {
    title: 'Thông báo thử từ HUB Planner',
    body: 'Thiết bị của bạn đã nhận Web Push thành công.',
    url: '/dashboard',
    category: 'system',
  }, { userId: identity.userId, subscriptionId, limit: subscriptionId ? 1 : 50 });
  if (result.targeted < 1) throw new PushTestError(404, 'Tài khoản chưa có thiết bị nhận thông báo đang hoạt động.', 'NO_ACTIVE_SUBSCRIPTION');
  if (result.sent < 1) throw new PushTestError(502, 'Không có thiết bị nào nhận được thông báo thử.', testFailureCode(result.failureClasses));
  return {
    success: true,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
    targeted: result.targeted,
    targeting: subscriptionId ? 'authenticated_user_current_device' : 'authenticated_user_active_subscriptions',
    ...(provider ? { provider } : {}),
  };
};

export const pushTestErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof PushTestError ? error.status : 500;
