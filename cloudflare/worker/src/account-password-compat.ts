import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface AccountPasswordCompatEnv extends BetterAuthIdentityEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

type SafePayload = Record<string, unknown>;

export class AccountPasswordCompatError extends Error {
  readonly status: number;
  readonly payload: SafePayload;

  constructor(status: number, message: string, payload: SafePayload = {}) {
    super(message);
    this.name = 'AccountPasswordCompatError';
    this.status = status;
    this.payload = { ...payload, error: message };
  }
}

const MAX_BODY_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024;
const ALLOWED_ACTIONS = new Set(['send-otp', 'verify-otp']);
const SAFE_RESPONSE_KEYS = new Set([
  'email',
  'created',
  'passwordUpdated',
  'expiresInSeconds',
  'retryAfterSeconds',
  'cooldownUntil',
  'error',
  'message',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const safePayload = (value: unknown): SafePayload => {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => SAFE_RESPONSE_KEYS.has(key)),
  );
};

const readBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new AccountPasswordCompatError(413, 'Dữ liệu gửi lên vượt giới hạn.');
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new AccountPasswordCompatError(400, 'Dữ liệu gửi lên không hợp lệ.');
  }
};

const readUpstreamPayload = async (response: Response) => {
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RESPONSE_BYTES) {
    throw new AccountPasswordCompatError(502, 'Phản hồi dịch vụ không hợp lệ.');
  }
  if (!raw) return {};
  try {
    return safePayload(JSON.parse(raw) as unknown);
  } catch {
    throw new AccountPasswordCompatError(502, 'Phản hồi dịch vụ không hợp lệ.');
  }
};

export const handleAccountPasswordCompat = async (
  request: Request,
  env: AccountPasswordCompatEnv,
) => {
  if (request.method !== 'POST') {
    throw new AccountPasswordCompatError(405, 'Phương thức không được hỗ trợ.');
  }
  const identity = await requireBetterAuthSession(request, env);
  const body = await readBody(request);
  const action = String(body.action || '');
  if (!ALLOWED_ACTIONS.has(action) || body.purpose !== 'forgot_password') {
    throw new AccountPasswordCompatError(400, 'Hành động không hợp lệ.');
  }

  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !serviceRoleKey) {
    throw new AccountPasswordCompatError(503, 'Dịch vụ mật khẩu tạm thời chưa sẵn sàng.');
  }

  const upstreamBody: Record<string, unknown> = {
    action,
    purpose: 'forgot_password',
    // The authenticated Better Auth identity is authoritative. Any email sent
    // by the browser is intentionally ignored.
    email: identity.email,
  };
  if (action === 'send-otp') {
    upstreamBody.turnstileToken = String(body.turnstileToken || '');
  } else {
    upstreamBody.otp = String(body.otp || '');
    upstreamBody.password = String(body.password || '');
    upstreamBody.confirmPassword = String(body.confirmPassword || '');
  }

  let response: Response;
  try {
    response = await fetch(new URL('/functions/v1/auth', base), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AccountPasswordCompatError(502, 'Không thể xử lý yêu cầu mật khẩu lúc này.');
  }

  const payload = await readUpstreamPayload(response);
  if (!response.ok) {
    const message = typeof payload.error === 'string'
      ? payload.error
      : typeof payload.message === 'string'
        ? payload.message
        : 'Không thể xử lý yêu cầu mật khẩu lúc này.';
    const status = [400, 401, 403, 404, 409, 413, 422, 429].includes(response.status)
      ? response.status
      : 502;
    throw new AccountPasswordCompatError(status, message, payload);
  }
  return payload;
};

export const accountPasswordCompatErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof AccountPasswordCompatError
    ? error.status
    : 500;
