import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import { resolveLegacyPushOwner, type PushSubscriptionEnv } from './push-subscriptions.ts';

export interface PushTestEnv extends BetterAuthIdentityEnv, PushSubscriptionEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export class PushTestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PushTestError';
    this.status = status;
  }
}

const MAX_BODY_BYTES = 1_024;

const readEmptyBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new PushTestError(413, 'Yêu cầu quá lớn.');
  }
  if (!raw.trim()) return;

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new PushTestError(400, 'Yêu cầu không hợp lệ.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0) {
    throw new PushTestError(400, 'Không cho phép chỉ định người nhận.');
  }
};

const readCount = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
};

export const handlePushTest = async (request: Request, env: PushTestEnv) => {
  if (request.method !== 'POST') {
    throw new PushTestError(405, 'Phương thức không được hỗ trợ.');
  }

  await readEmptyBody(request);
  const identity = await requireBetterAuthSession(request, env);
  let owner: string | null;
  try {
    owner = await resolveLegacyPushOwner(env, identity);
  } catch {
    throw new PushTestError(502, 'Không thể xác định thiết bị của tài khoản hiện tại.');
  }
  if (!owner) throw new PushTestError(404, 'Tài khoản chưa có thiết bị nhận thông báo đang hoạt động.');
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || serviceKey.length < 32) {
    throw new PushTestError(503, 'Dịch vụ thông báo chưa sẵn sàng.');
  }

  let response: Response;
  try {
    response = await fetch(new URL('/functions/v1/push', base), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resource: 'send',
        targetUserId: owner,
        title: 'Thông báo thử từ HUB Planner',
        body: 'Thiết bị của bạn đã nhận Web Push thành công.',
        url: '/dashboard',
        category: 'system',
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new PushTestError(502, 'Không thể kết nối dịch vụ gửi thông báo.');
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.status === 404) {
    throw new PushTestError(404, 'Tài khoản chưa có thiết bị nhận thông báo đang hoạt động.');
  }
  if (!response.ok || !payload) {
    throw new PushTestError(502, 'Không thể gửi thông báo thử.');
  }

  const sent = readCount(payload.sent);
  const failed = readCount(payload.failed);
  const skipped = readCount(payload.skipped);
  if (sent < 1) {
    throw new PushTestError(502, 'Không có thiết bị nào nhận được thông báo thử.');
  }

  // Deliberately discard provider details because the upstream response can
  // contain subscription endpoints and row identifiers.
  return {
    success: true,
    sent,
    failed,
    skipped,
    targeted: sent + failed,
    targeting: 'authenticated_user_active_subscriptions',
  };
};

export const pushTestErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof PushTestError ? error.status : 500;
