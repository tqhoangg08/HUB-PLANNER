import { BetterAuthIdentityError, requireBetterAuthSession, type BetterAuthIdentityEnv } from './better-auth-identity.ts';
import { deliverPushBatch, type PushDeliveryEnv } from './push-delivery.ts';

export interface PushTestEnv extends BetterAuthIdentityEnv, PushDeliveryEnv {}

export class PushTestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'PushTestError'; this.status = status; }
}

const readEmptyBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1024) throw new PushTestError(413, 'Yêu cầu quá lớn.');
  if (!raw.trim()) return;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { throw new PushTestError(400, 'Yêu cầu không hợp lệ.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0) {
    throw new PushTestError(400, 'Không cho phép chỉ định người nhận.');
  }
};

export const handlePushTest = async (request: Request, env: PushTestEnv) => {
  if (request.method !== 'POST') throw new PushTestError(405, 'Phương thức không được hỗ trợ.');
  await readEmptyBody(request);
  const identity = await requireBetterAuthSession(request, env);
  const result = await deliverPushBatch(env, {
    title: 'Thông báo thử từ HUB Planner',
    body: 'Thiết bị của bạn đã nhận Web Push thành công.',
    url: '/dashboard',
    category: 'system',
  }, { userId: identity.userId, limit: 50 });
  if (result.targeted < 1) throw new PushTestError(404, 'Tài khoản chưa có thiết bị nhận thông báo đang hoạt động.');
  if (result.sent < 1) throw new PushTestError(502, 'Không có thiết bị nào nhận được thông báo thử.');
  return {
    success: true,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
    targeted: result.targeted,
    targeting: 'authenticated_user_active_subscriptions',
  };
};

export const pushTestErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof PushTestError ? error.status : 500;
