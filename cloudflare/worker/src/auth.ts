export type StaffRole = 'admin' | 'auditor';

export interface StaffAuthEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export interface AuthenticatedIdentity {
  userId: string;
  email: string | null;
}

export interface StaffIdentity extends AuthenticatedIdentity {
  role: StaffRole;
}

interface RequireAuthenticatedOptions {
  fetcher?: typeof fetch;
}

interface RequireStaffOptions extends RequireAuthenticatedOptions {
  allowedRoles?: readonly StaffRole[];
}

type StaffAuthStatus = 401 | 403 | 503;

const AUTH_TIMEOUT_MS = 5_000;
const MAX_BEARER_TOKEN_LENGTH = 8_192;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export class StaffAuthError extends Error {
  readonly status: StaffAuthStatus;

  constructor(status: StaffAuthStatus, message: string) {
    super(message);
    this.name = 'StaffAuthError';
    this.status = status;
  }
}

export const readBearerToken = (request: Request): string | null => {
  const authorization = String(request.headers.get('Authorization') || '').trim();
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  const token = match?.[1] || '';
  if (!token || token.length > MAX_BEARER_TOKEN_LENGTH) return null;
  return token;
};

export const buildSupabaseAuthUserUrl = (baseUrl: string) =>
  new URL('/auth/v1/user', baseUrl.replace(/\/$/, ''));

export const buildSupabaseStaffRoleUrl = (
  baseUrl: string,
  userId: string,
  allowedRoles: readonly StaffRole[]
) => {
  const url = new URL('/rest/v1/user_roles', baseUrl.replace(/\/$/, ''));
  url.searchParams.set('select', 'role');
  url.searchParams.set('or', `(id.eq.${userId},user_id.eq.${userId})`);
  url.searchParams.set('role', `in.(${allowedRoles.join(',')})`);
  url.searchParams.set('limit', '1');
  return url;
};

const fetchWithTimeout = async (
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit
) => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort('staff-auth-timeout'),
    AUTH_TIMEOUT_MS
  );

  try {
    return await fetcher(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const readUserAuthConfig = (env: StaffAuthEnv) => {
  const supabaseUrl = String(env.SUPABASE_URL || '').trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !anonKey) {
    throw new StaffAuthError(503, 'Cấu hình xác thực người dùng chưa đầy đủ.');
  }
  return { supabaseUrl, anonKey };
};

export const requireAuthenticatedUser = async (
  request: Request,
  env: StaffAuthEnv,
  options: RequireAuthenticatedOptions = {}
): Promise<AuthenticatedIdentity> => {
  const token = readBearerToken(request);
  if (!token) {
    throw new StaffAuthError(401, 'Thiếu hoặc sai access token.');
  }

  const fetcher = options.fetcher || fetch;
  const { supabaseUrl, anonKey } = readUserAuthConfig(env);

  let userResponse: Response;
  try {
    userResponse = await fetchWithTimeout(
      fetcher,
      buildSupabaseAuthUserUrl(supabaseUrl),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
        },
      }
    );
  } catch {
    throw new StaffAuthError(503, 'Dịch vụ xác thực tạm thời không khả dụng.');
  }

  if (!userResponse.ok) {
    throw new StaffAuthError(
      userResponse.status === 401 || userResponse.status === 403 ? 401 : 503,
      userResponse.status === 401 || userResponse.status === 403
        ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
        : 'Dịch vụ xác thực tạm thời không khả dụng.'
    );
  }

  const userPayload = await readJson(userResponse);
  const userId = isRecord(userPayload) ? String(userPayload.id || '').trim() : '';
  if (!UUID_PATTERN.test(userId)) {
    throw new StaffAuthError(401, 'Phiên đăng nhập không hợp lệ.');
  }

  return {
    userId,
    email:
      isRecord(userPayload) && typeof userPayload.email === 'string'
        ? userPayload.email
        : null,
  };
};

export const requireStaffRole = async (
  identity: AuthenticatedIdentity,
  env: StaffAuthEnv,
  options: RequireStaffOptions = {}
): Promise<StaffIdentity> => {
  const allowedRoles = options.allowedRoles?.length
    ? [...new Set(options.allowedRoles)]
    : (['admin', 'auditor'] as const);
  const fetcher = options.fetcher || fetch;
  const supabaseUrl = String(env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new StaffAuthError(503, 'Cấu hình xác thực quản trị chưa đầy đủ.');
  }

  let roleResponse: Response;
  try {
    roleResponse = await fetchWithTimeout(
      fetcher,
      buildSupabaseStaffRoleUrl(
        supabaseUrl,
        identity.userId,
        allowedRoles
      ),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
  } catch {
    throw new StaffAuthError(503, 'Không thể kiểm tra quyền quản trị.');
  }

  if (!roleResponse.ok) {
    throw new StaffAuthError(503, 'Không thể kiểm tra quyền quản trị.');
  }

  const rolePayload = await readJson(roleResponse);
  const roleValue =
    Array.isArray(rolePayload) && isRecord(rolePayload[0])
      ? String(rolePayload[0].role || '').trim().toLowerCase()
      : '';
  const role = allowedRoles.find((candidate) => candidate === roleValue);
  if (!role) {
    throw new StaffAuthError(403, 'Tài khoản không có quyền truy cập.');
  }

  return {
    ...identity,
    role,
  };
};

export const requireStaff = async (
  request: Request,
  env: StaffAuthEnv,
  options: RequireStaffOptions = {}
): Promise<StaffIdentity> => {
  const identity = await requireAuthenticatedUser(request, env, options);
  return requireStaffRole(identity, env, options);
};
