import { BetterAuthIdentityError, requireBetterAuthStaff, type BetterAuthIdentityEnv } from './better-auth-identity.ts';

export interface AdminInternalAccountsEnv extends BetterAuthIdentityEnv {}
export class AdminInternalAccountsError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 405 | 409 | 429 | 503;
  constructor(status: 400 | 401 | 403 | 404 | 405 | 409 | 429 | 503, message: string) { super(message); this.status = status; }
}
const INTERNAL_ORIGIN = 'https://auth-service.internal';
const MAX_BODY = 16 * 1024;

const requireAdmin = async (request: Request, env: AdminInternalAccountsEnv) => {
  const identity = await requireBetterAuthStaff(request, env);
  if (identity.role !== 'admin') throw new AdminInternalAccountsError(403, 'Không có quyền quản lý tài khoản nội bộ.');
  return identity;
};

const readBoundedBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) throw new AdminInternalAccountsError(400, 'Dữ liệu không hợp lệ.');
  try { const value = JSON.parse(raw); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : (() => { throw new Error(); })(); }
  catch { throw new AdminInternalAccountsError(400, 'Dữ liệu không hợp lệ.'); }
};

const authProxy = async (request: Request, env: AdminInternalAccountsEnv, body?: Record<string, unknown>) => {
  if (!env.AUTH_SERVICE) throw new AdminInternalAccountsError(503, 'Dịch vụ xác thực chưa sẵn sàng.');
  const headers = new Headers({ Accept: 'application/json' });
  const cookie = request.headers.get('Cookie'); if (!cookie) throw new AdminInternalAccountsError(401, 'Phiên đăng nhập không hợp lệ.');
  headers.set('Cookie', cookie);
  if (body) headers.set('Content-Type', 'application/json');
  const override = request.headers.get('Cloudflare-Workers-Version-Overrides'); if (override) headers.set('Cloudflare-Workers-Version-Overrides', override);
  let response: Response;
  try { response = await env.AUTH_SERVICE.fetch(new Request(new URL('/internal/admin-internal-accounts' + (request.method === 'GET' ? new URL(request.url).search : ''), INTERNAL_ORIGIN), { method: request.method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8_000) })); }
  catch { throw new AdminInternalAccountsError(503, 'Dịch vụ xác thực chưa sẵn sàng.'); }
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new AdminInternalAccountsError(response.status === 400 || response.status === 404 || response.status === 409 ? response.status : response.status === 401 ? 401 : response.status === 403 ? 403 : 503, typeof payload.error === 'string' ? payload.error : 'Không thể xử lý tài khoản nội bộ.');
  return payload;
};

export const handleAdminInternalAccounts = async (request: Request, _url: URL, env: AdminInternalAccountsEnv) => {
  await requireAdmin(request, env);
  if (request.method === 'GET') return authProxy(request, env);
  if (request.method === 'POST') return authProxy(request, env, await readBoundedBody(request));
  throw new AdminInternalAccountsError(405, 'Phương thức không được hỗ trợ.');
};

export const adminInternalAccountsErrorStatus = (error: unknown) => error instanceof AdminInternalAccountsError || error instanceof BetterAuthIdentityError ? error.status : 500;
