import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface ActivityLogEnv extends BetterAuthIdentityEnv {
  DB: D1Database;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const digest = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', encoder.encode(value)),
)).map((part) => part.toString(16).padStart(2, '0')).join('');
const json = (value: unknown, fallback: string | null) =>
  value === undefined ? fallback : JSON.stringify(safeValue(value));

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
  const eventId = boundedText(body.eventId, 64);
  if (!eventId || !UUID.test(eventId)) throw new ActivityLogError(400, 'Mã nhật ký không hợp lệ.');
  const status = ['success', 'error', 'warning'].includes(String(body.status)) ? String(body.status) : 'success';
  const sourceKey = `runtime:${identity.userId}:${eventId}`;
  const now = new Date().toISOString();
  const row = [
    eventId, sourceKey, await digest(sourceKey), now,
    identity.userId, identity.email, identity.role, action, action,
    boundedText(body.targetTable, 128), boundedText(body.targetTable, 128),
    boundedText(body.targetId, 128), boundedText(body.targetId, 128),
    boundedText(body.pagePath, 500), status,
    json(body.metadata, '{}'), json(body.oldData, null), json(body.newData, null),
    json(body.oldData || body.newData ? { old: safeValue(body.oldData), new: safeValue(body.newData) } : null, null),
    boundedText(body.errorMessage, 1000), boundedText(request.headers.get('User-Agent'), 500),
  ];
  const result = await env.DB.prepare(`INSERT OR IGNORE INTO activity_logs (
    client_event_id,source_key,canonical_hash,created_at,user_id,user_email,user_role,action,action_label,
    target_table,table_name,target_id,record_id,page_path,status,metadata_json,old_data_json,new_data_json,
    details_json,error_message,device_info
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...row).run();
  return { success: true, skipped: Number(result.meta?.changes || 0) === 0 };
};

export const activityLogErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof ActivityLogError ? error.status : 500;
