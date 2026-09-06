export type BetterAuthRole = 'user' | 'admin' | 'auditor';

export interface BetterAuthIdentity {
  userId: string;
  email: string;
  role: BetterAuthRole;
}

export interface BetterAuthIdentityEnv {
  AUTH_SERVICE?: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
}

type BetterAuthIdentityStatus = 401 | 403 | 503;
type BetterAuthIdentityErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'AUTH_SERVICE_UNAVAILABLE'
  | 'AUTH_SERVICE_RESPONSE_INVALID';

const INTERNAL_AUTH_ORIGIN = 'https://auth-service.internal';
const INTERNAL_SESSION_PATH = '/internal/auth/session';
const INTERNAL_STAFF_PATH = '/internal/auth/staff';
const MAX_COOKIE_BYTES = 16_384;
const MAX_AUTH_RESPONSE_BYTES = 4_096;
const AUTH_SERVICE_TIMEOUT_MS = 5_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCEPTED_ROLES = new Set<BetterAuthRole>(['user', 'admin', 'auditor']);

const PRIVATE_JSON_SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
} satisfies HeadersInit;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isBetterAuthRole = (value: unknown): value is BetterAuthRole =>
  typeof value === 'string' && ACCEPTED_ROLES.has(value as BetterAuthRole);

const isValidEmail = (value: unknown): value is string =>
  typeof value === 'string' &&
  value === value.trim() &&
  value.length >= 3 &&
  value.length <= 320 &&
  value.includes('@') &&
  !/[\u0000-\u001f\u007f]/.test(value);

const parseIdentity = (value: unknown): BetterAuthIdentity | null => {
  if (!isRecord(value)) return null;
  if (typeof value.userId !== 'string' || !UUID_PATTERN.test(value.userId)) {
    return null;
  }
  if (!isValidEmail(value.email) || !isBetterAuthRole(value.role)) return null;
  return {
    userId: value.userId,
    email: value.email,
    role: value.role,
  };
};

const readBoundedJson = async (response: Response): Promise<unknown> => {
  const declaredLength = Number(response.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUTH_RESPONSE_BYTES) {
    return null;
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AUTH_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(joined)) as unknown;
  } catch {
    return null;
  }
};

export class BetterAuthIdentityError extends Error {
  readonly status: BetterAuthIdentityStatus;
  readonly code: BetterAuthIdentityErrorCode;

  constructor(
    status: BetterAuthIdentityStatus,
    code: BetterAuthIdentityErrorCode
  ) {
    super(code);
    this.name = 'BetterAuthIdentityError';
    this.status = status;
    this.code = code;
  }
}

const requireInternalIdentity = async (
  request: Request,
  env: BetterAuthIdentityEnv,
  internalPath: typeof INTERNAL_SESSION_PATH | typeof INTERNAL_STAFF_PATH
): Promise<BetterAuthIdentity> => {
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie || cookie.length > MAX_COOKIE_BYTES) {
    throw new BetterAuthIdentityError(401, 'UNAUTHENTICATED');
  }
  if (!env.AUTH_SERVICE) {
    throw new BetterAuthIdentityError(503, 'AUTH_SERVICE_UNAVAILABLE');
  }

  const headers = new Headers({ Accept: 'application/json' });
  headers.set('Cookie', cookie);
  const versionOverrides = request.headers.get('Cloudflare-Workers-Version-Overrides');
  if (versionOverrides) {
    // Keep an isolated public/auth candidate pair on the same override during
    // service-binding canaries. Production requests normally have no header.
    headers.set('Cloudflare-Workers-Version-Overrides', versionOverrides);
  }
  const internalRequest = new Request(
    new URL(internalPath, INTERNAL_AUTH_ORIGIN),
    {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(AUTH_SERVICE_TIMEOUT_MS),
    }
  );

  let response: Response;
  try {
    response = await env.AUTH_SERVICE.fetch(internalRequest);
  } catch {
    throw new BetterAuthIdentityError(503, 'AUTH_SERVICE_UNAVAILABLE');
  }

  if (response.status === 401) {
    throw new BetterAuthIdentityError(401, 'UNAUTHENTICATED');
  }
  if (response.status === 403) {
    throw new BetterAuthIdentityError(403, 'FORBIDDEN');
  }
  if (!response.ok) {
    throw new BetterAuthIdentityError(503, 'AUTH_SERVICE_UNAVAILABLE');
  }

  const identity = parseIdentity(await readBoundedJson(response));
  if (!identity) {
    throw new BetterAuthIdentityError(503, 'AUTH_SERVICE_RESPONSE_INVALID');
  }
  return identity;
};

export const requireBetterAuthSession = (
  request: Request,
  env: BetterAuthIdentityEnv
) => requireInternalIdentity(request, env, INTERNAL_SESSION_PATH);

export const requireBetterAuthStaff = async (
  request: Request,
  env: BetterAuthIdentityEnv
): Promise<BetterAuthIdentity & { role: 'admin' | 'auditor' }> => {
  const identity = await requireInternalIdentity(
    request,
    env,
    INTERNAL_STAFF_PATH
  );
  if (identity.role !== 'admin' && identity.role !== 'auditor') {
    throw new BetterAuthIdentityError(403, 'FORBIDDEN');
  }
  return identity as BetterAuthIdentity & { role: 'admin' | 'auditor' };
};

const privateJson = (
  payload: unknown,
  status: number,
  cors: HeadersInit,
  extraHeaders: HeadersInit = {}
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      ...PRIVATE_JSON_SECURITY_HEADERS,
      ...cors,
      ...extraHeaders,
    },
  });

export const handleBetterAuthMeRequest = async (
  request: Request,
  env: BetterAuthIdentityEnv,
  cors: HeadersInit
): Promise<Response> => {
  if (request.method !== 'GET') {
    return privateJson(
      { error: 'Chỉ hỗ trợ phương thức GET.' },
      405,
      cors,
      { Allow: 'GET, OPTIONS' }
    );
  }

  try {
    const identity = await requireBetterAuthSession(request, env);
    return privateJson(identity, 200, cors);
  } catch (error) {
    const status =
      error instanceof BetterAuthIdentityError ? error.status : 503;
    const message =
      status === 401
        ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
        : status === 403
          ? 'Không có quyền truy cập.'
          : 'Dịch vụ xác thực tạm thời chưa sẵn sàng.';
    return privateJson({ error: message }, status, cors);
  }
};
