import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentity,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface PushSubscriptionEnv extends BetterAuthIdentityEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export class PushSubscriptionError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.name = 'PushSubscriptionError'; this.status = status; }
}

const MAX_BODY_BYTES = 16 * 1024;
const readUpstreamErrorCode = async (response: Response) => {
  const payload = await response.json().catch(() => null) as { code?: unknown } | null;
  const code = typeof payload?.code === 'string' && /^[A-Z0-9_]{3,16}$/i.test(payload.code)
    ? payload.code
    : 'unknown';
  return code;
};
const readBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new PushSubscriptionError(413, 'Dữ liệu thiết bị quá lớn.');
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new PushSubscriptionError(400, 'Dữ liệu thiết bị không hợp lệ.'); }
};

const config = (env: PushSubscriptionEnv) => {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !key) throw new PushSubscriptionError(503, 'Dịch vụ thông báo chưa sẵn sàng.');
  return { base, key };
};

const source = async (env: PushSubscriptionEnv, path: string, init: RequestInit = {}) => {
  const { base, key } = config(env);
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', ...init.headers },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const upstreamCode = await readUpstreamErrorCode(response);
    console.error(JSON.stringify({
      event: 'push_subscription_storage_rejected',
      method: String(init.method || 'GET').toUpperCase(),
      status: response.status,
      upstreamCode,
    }));
    throw new PushSubscriptionError(502, 'Không thể đồng bộ thiết bị nhận thông báo.');
  }
  return response;
};

type StoredSubscription = { id?: unknown };
type LegacyPushOwner = { id?: unknown; email?: unknown; student_code?: unknown };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

const readLegacyOwnerRows = async (env: PushSubscriptionEnv, filter: string) => {
  const response = await source(env, `/rest/v1/profiles?${filter}&select=id,email,student_code&limit=2`);
  return await response.json() as LegacyPushOwner[];
};

// push_subscriptions still references the legacy Supabase auth.users table.
// Better Auth is authoritative for the browser session, while an exact
// profile bridge supplies the corresponding legacy owner without trusting a
// client-provided id or using fuzzy email matching.
export const resolveLegacyPushOwner = async (
  env: PushSubscriptionEnv,
  identity: BetterAuthIdentity,
) => {
  const byId = await readLegacyOwnerRows(env, `id=eq.${encodeURIComponent(identity.userId)}`);
  const directId = typeof byId[0]?.id === 'string' && UUID_PATTERN.test(byId[0].id)
    ? byId[0].id
    : '';
  if (directId) return directId;

  const email = normalizeEmail(identity.email);
  const candidates = await readLegacyOwnerRows(env, `email=eq.${encodeURIComponent(email)}`);
  const exact = candidates.filter((row) => normalizeEmail(row.email) === email);
  if (exact.length === 1 && typeof exact[0].id === 'string' && UUID_PATTERN.test(exact[0].id)) {
    return exact[0].id;
  }

  const studentMatch = email.match(/^([^@]+)@st\.buh\.edu\.vn$/);
  if (!studentMatch) return null;
  const studentCode = studentMatch[1];
  const studentCandidates = await readLegacyOwnerRows(
    env,
    `student_code=eq.${encodeURIComponent(studentCode)}`,
  );
  const exactStudent = studentCandidates.filter((row) => String(row.student_code || '').trim() === studentCode);
  return exactStudent.length === 1 && typeof exactStudent[0].id === 'string' && UUID_PATTERN.test(exactStudent[0].id)
    ? exactStudent[0].id
    : null;
};

const findStoredSubscription = async (env: PushSubscriptionEnv, endpoint: string) => {
  const response = await source(
    env,
    `/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&select=id&limit=1`,
  );
  const rows = await response.json() as StoredSubscription[];
  const id = typeof rows?.[0]?.id === 'string' ? rows[0].id : '';
  return id;
};

const persistSubscription = async (
  env: PushSubscriptionEnv,
  owner: string,
  endpoint: string,
  subscription: Record<string, unknown>,
) => {
  const writeBody = JSON.stringify({ user_id: owner, endpoint, subscription });
  const existingId = await findStoredSubscription(env, endpoint);

  if (existingId) {
    const response = await source(env, `/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(existingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: writeBody,
    });
    await response.body?.cancel();
    return;
  }

  const { base, key } = config(env);
  const response = await fetch(`${base}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: writeBody,
    signal: AbortSignal.timeout(8_000),
  });
  if (response.ok) {
    await response.body?.cancel();
    return;
  }

  // Another tab may have inserted the same endpoint after the lookup. Resolve
  // that bounded race with one authoritative lookup/update, without relying on
  // PostgREST ON CONFLICT inference for the table's partial unique index.
  const upstreamCode = await readUpstreamErrorCode(response);
  const racedId = await findStoredSubscription(env, endpoint);
  if (!racedId) {
    console.error(JSON.stringify({ event: 'push_subscription_storage_rejected', method: 'POST', status: response.status, upstreamCode }));
    throw new PushSubscriptionError(502, 'Không thể đồng bộ thiết bị nhận thông báo.');
  }
  const retry = await source(env, `/rest/v1/push_subscriptions?id=eq.${encodeURIComponent(racedId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: writeBody,
  });
  await retry.body?.cancel();
};

export const handlePushSubscription = async (request: Request, env: PushSubscriptionEnv) => {
  const identity = await requireBetterAuthSession(request, env);
  const resolvedOwner = await resolveLegacyPushOwner(env, identity);
  if (!resolvedOwner) throw new PushSubscriptionError(409, 'Chưa thể liên kết thiết bị với tài khoản hiện tại.');
  const owner = encodeURIComponent(resolvedOwner);
  if (request.method === 'GET') {
    const response = await source(env, `/rest/v1/push_subscriptions?user_id=eq.${owner}&select=id,endpoint&limit=50`);
    return { success: true, data: await response.json() };
  }
  if (request.method !== 'POST' && request.method !== 'DELETE') throw new PushSubscriptionError(405, 'Phương thức không được hỗ trợ.');
  const body = await readBody(request);
  if ('userId' in body || 'user_id' in body || 'role' in body) throw new PushSubscriptionError(400, 'Không cho phép chỉ định chủ sở hữu.');
  const subscription = body.subscription;
  if (!subscription || typeof subscription !== 'object' || Array.isArray(subscription)) throw new PushSubscriptionError(400, 'Subscription không hợp lệ.');
  const endpoint = String((subscription as Record<string, unknown>).endpoint || '').trim();
  if (!endpoint || endpoint.length > 4096 || !endpoint.startsWith('https://')) throw new PushSubscriptionError(400, 'Endpoint thông báo không hợp lệ.');
  if (request.method === 'DELETE') {
    const response = await source(env, `/rest/v1/push_subscriptions?user_id=eq.${owner}&endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
    await response.body?.cancel();
    return { success: true };
  }
  const startedAt = Number.isFinite(Date.parse(String(body.bindingStartedAt || '')))
    ? new Date(String(body.bindingStartedAt)).toISOString()
    : new Date().toISOString();
  const stored = { ...(subscription as Record<string, unknown>), __hubBindingStartedAt: startedAt };
  await persistSubscription(env, resolvedOwner, endpoint, stored);
  return { success: true };
};

export const pushSubscriptionErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof PushSubscriptionError ? error.status : 500;
