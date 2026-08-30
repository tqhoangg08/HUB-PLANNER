import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface ActivityLogEnv extends BetterAuthIdentityEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export class ActivityLogError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ActivityLogError';
    this.status = status;
  }
}

const MAX_BODY_BYTES = 32 * 1024;
const SENSITIVE_KEY = /password|token|secret|api.?key|authorization|refresh|access|otp|passcode/i;

const safeValue = (value: unknown, depth = 0): unknown => {
  if (depth > 5) return '[Max depth]';
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => safeValue(item, depth + 1));
  if (!value || typeof value !== 'object') return String(value ?? '');
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : safeValue(item, depth + 1),
  ]));
};

const boundedText = (value: unknown, max: number) => {
  if (value === null || value === undefined) return null;
  return String(value).trim().slice(0, max) || null;
};

const readBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new ActivityLogError(413, 'Dữ liệu nhật ký quá lớn.');
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new ActivityLogError(400, 'Dữ liệu nhật ký không hợp lệ.');
  }
};

export const handleActivityLog = async (request: Request, env: ActivityLogEnv) => {
  if (request.method !== 'POST') throw new ActivityLogError(405, 'Chỉ hỗ trợ phương thức POST.');
  const identity = await requireBetterAuthSession(request, env);
  const body = await readBody(request);
  const action = boundedText(body.action, 100);
  if (!action || action === 'view_page') return { success: true, skipped: true };
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !key) throw new ActivityLogError(503, 'Dịch vụ nhật ký chưa sẵn sàng.');
  const row = {
    user_id: identity.userId,
    user_email: identity.email,
    user_role: identity.role,
    action,
    action_label: action,
    target_table: boundedText(body.targetTable, 128),
    target_id: boundedText(body.targetId, 128),
    page_path: boundedText(body.pagePath, 500),
    status: ['success', 'error', 'warning'].includes(String(body.status)) ? body.status : 'success',
    metadata: safeValue(body.metadata),
    old_data: safeValue(body.oldData),
    new_data: safeValue(body.newData),
    error_message: boundedText(body.errorMessage, 1000),
    device_info: boundedText(request.headers.get('User-Agent'), 500),
  };
  const response = await fetch(`${base}/rest/v1/activity_logs`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new ActivityLogError(502, 'Không thể ghi nhật ký hoạt động.');
  await response.body?.cancel();
  return { success: true };
};

export const activityLogErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof ActivityLogError ? error.status : 500;
