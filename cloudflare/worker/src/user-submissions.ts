import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

interface UserSubmissionEnv extends BetterAuthIdentityEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const PROTECTED_ACTIONS = new Set([
  'verify-only',
  'feedback',
  'donation',
  'canva-pro-request',
  'lost-found',
  'event-contribution',
  'bug-report',
  'course-report',
  'event-report',
]);
const MODERATOR_KINDS = new Set([
  'event_pending',
  'lost_found_pending',
  'course_report',
  'event_report',
  'bug_report',
  'feedback',
  'ctv_request',
  'user_course_request',
]);

export class UserSubmissionError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UserSubmissionError';
    this.status = status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readJsonBody = async (request: Request) => {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new UserSubmissionError(413, 'Dữ liệu gửi lên vượt giới hạn.');
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (!isRecord(value)) throw new Error();
    return value;
  } catch {
    throw new UserSubmissionError(400, 'Dữ liệu gửi lên không hợp lệ.');
  }
};

const optionalBetterAuthIdentity = async (
  request: Request,
  env: BetterAuthIdentityEnv,
): Promise<BetterAuthIdentity | null> => {
  const cookie = request.headers.get('Cookie') || '';
  const hasBetterAuthSession = /(?:^|;\s*)(?:__Secure-)?hubplanner_auth(?:_integration_stage2)?\.session_token=/i.test(cookie);
  if (!hasBetterAuthSession) return null;
  return requireBetterAuthSession(request, env);
};

const sourceConfig = (env: UserSubmissionEnv) => {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = String(env.SUPABASE_ANON_KEY || '');
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !anonKey || !serviceRoleKey) {
    throw new UserSubmissionError(503, 'Dịch vụ gửi nội dung tạm thời chưa sẵn sàng.');
  }
  return { url, anonKey, serviceRoleKey };
};

const safeUpstreamError = (status: number) => {
  if (status === 400 || status === 409 || status === 422) {
    return new UserSubmissionError(status, 'Dữ liệu gửi lên không hợp lệ.');
  }
  if (status === 401 || status === 403) {
    return new UserSubmissionError(status, 'Xác minh bảo mật không thành công.');
  }
  return new UserSubmissionError(502, 'Không thể xử lý yêu cầu lúc này.');
};

const callSupabaseFunction = async (
  env: UserSubmissionEnv,
  functionName: string,
  body: Record<string, unknown>,
) => {
  const { url, anonKey } = sourceConfig(env);
  const response = await fetch(
    new URL(`/functions/v1/${functionName}`, url),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const responseText = await response.text();
  if (!response.ok) throw safeUpstreamError(response.status);
  try {
    return responseText ? JSON.parse(responseText) as unknown : {};
  } catch {
    throw new UserSubmissionError(502, 'Phản hồi dịch vụ không hợp lệ.');
  }
};

const cleanPayloadOwner = (
  value: unknown,
  identity: BetterAuthIdentity | null,
) => {
  const payload = isRecord(value) ? { ...value } : {};
  delete payload.userId;
  delete payload.user_id;
  delete payload.ownerId;
  delete payload.owner_id;
  if (identity) payload.user_id = identity.userId;
  return payload;
};

export const handleProtectedSubmission = async (
  request: Request,
  env: UserSubmissionEnv,
) => {
  if (request.method !== 'POST') {
    throw new UserSubmissionError(405, 'Phương thức không được hỗ trợ.');
  }
  const body = await readJsonBody(request);
  const action = String(body.action || '');
  if (!PROTECTED_ACTIONS.has(action)) {
    throw new UserSubmissionError(400, 'Hành động không hợp lệ.');
  }
  const identity = await optionalBetterAuthIdentity(request, env);
  return callSupabaseFunction(env, 'auth?resource=protected-submit', {
    action,
    turnstileToken: String(body.turnstileToken || ''),
    payload: cleanPayloadOwner(body.payload, identity),
  });
};

const text = (value: unknown, max: number) => String(value || '').trim().slice(0, max);

export const handleCtvRegistration = async (
  request: Request,
  env: UserSubmissionEnv,
) => {
  if (request.method !== 'POST') {
    throw new UserSubmissionError(405, 'Phương thức không được hỗ trợ.');
  }
  const body = await readJsonBody(request);
  if ('userId' in body || 'user_id' in body || 'ownerId' in body || 'owner_id' in body) {
    throw new UserSubmissionError(400, 'Không cho phép chỉ định người gửi.');
  }
  const identity = await optionalBetterAuthIdentity(request, env);
  const row = {
    full_name: text(body.full_name, 200),
    student_batch: text(body.student_batch, 80),
    major: text(body.major, 200),
    contact_info: text(body.contact_info, 300),
    user_id: identity?.userId || null,
    status: 'pending',
  };
  if (!row.full_name || !row.student_batch || !row.major || !row.contact_info) {
    throw new UserSubmissionError(400, 'Vui lòng nhập đầy đủ thông tin đăng ký.');
  }
  const { url, serviceRoleKey } = sourceConfig(env);
  const response = await fetch(new URL('/rest/v1/ctv_requests?select=id', url), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify([row]),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    if (response.status === 409) {
      throw new UserSubmissionError(409, 'Thông tin liên hệ này đã được gửi trước đó.');
    }
    throw new UserSubmissionError(502, 'Không thể gửi đăng ký lúc này.');
  }
  const rows = await response.json() as Array<{ id?: unknown }>;
  return { success: true, id: rows?.[0]?.id };
};

export const handleModeratorNotification = async (
  request: Request,
  env: UserSubmissionEnv,
) => {
  if (request.method !== 'POST') {
    throw new UserSubmissionError(405, 'Phương thức không được hỗ trợ.');
  }
  const body = await readJsonBody(request);
  const kind = String(body.kind || '');
  const recordId = Number(body.recordId);
  if (!MODERATOR_KINDS.has(kind) || !Number.isSafeInteger(recordId) || recordId <= 0) {
    throw new UserSubmissionError(400, 'Thông tin thông báo không hợp lệ.');
  }
  return callSupabaseFunction(env, 'moderator-notifications', { kind, recordId });
};

export const userSubmissionErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof UserSubmissionError
    ? error.status
    : 500;
