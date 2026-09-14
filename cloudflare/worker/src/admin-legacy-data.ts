import {
  BetterAuthIdentityError,
  requireBetterAuthStaff,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import type { AdminEventsEnv } from './admin-events.ts';

/**
 * Narrow, server-only read/write bridges for admin modules that have not yet
 * moved their data store into D1.  These are deliberately feature endpoints,
 * not a browser-accessible PostgREST proxy: every table, field and operation
 * is fixed in this module and every request is authorized from Better Auth.
 */
export interface AdminLegacyDataEnv extends BetterAuthIdentityEnv, AdminEventsEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

type AdminLegacyStatus = 400 | 401 | 403 | 404 | 405 | 409 | 413 | 415 | 502 | 503;

export class AdminLegacyDataError extends Error {
  readonly status: AdminLegacyStatus;

  constructor(status: AdminLegacyStatus, message: string) {
    super(message);
    this.name = 'AdminLegacyDataError';
    this.status = status;
  }
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_PAGE_SIZE = 100;
const ID_PATTERN = /^[a-zA-Z0-9-]{1,128}$/;
const REPORT_TABLES = new Set([
  'course_reports',
  'bug_reports',
  'ctv_requests',
  'event_reports',
  'feedback',
  'canva_pro_requests',
]);

const REPORT_COLUMNS: Record<string, string> = {
  course_reports: 'id,user_id,status,created_at,full_name,student_code,email,subject_name,course_code,error_description,suggested_correction',
  bug_reports: 'id,user_id,status,created_at,full_name,student_code,email,error_location,description',
  ctv_requests: 'id,user_id,status,created_at,full_name,student_code,email,student_batch,major,contact_info',
  event_reports: 'id,user_id,status,created_at,full_name,student_code,email,event_id,event_name,organizer,issue_description',
  feedback: 'id,user_id,status,created_at,full_name,student_code,email,type,content,contact',
  canva_pro_requests: 'id,user_id,status,created_at,email,full_name,student_batch,major,note,reviewed_at',
};

// Protected reports and CTV applications are D1-authoritative.  Keep their
// response shape stable so the existing admin/auditor screen needs no client
// migration, while activity history remains on its separate legacy authority.
const D1_REPORT_KINDS: Record<string, string> = {
  course_reports: 'course_reports',
  bug_reports: 'bug_reports',
  ctv_requests: 'ctv_requests',
  event_reports: 'event_reports',
  feedback: 'feedback',
  canva_pro_requests: 'canva_pro_requests',
};
const D1_REPORT_COLUMNS = `id,user_id,status,created_at,
  json_extract(payload_json,'$.full_name') AS full_name,
  json_extract(payload_json,'$.student_code') AS student_code,
  json_extract(payload_json,'$.email') AS email,
  json_extract(payload_json,'$.subject_name') AS subject_name,
  json_extract(payload_json,'$.course_code') AS course_code,
  json_extract(payload_json,'$.error_description') AS error_description,
  json_extract(payload_json,'$.suggested_correction') AS suggested_correction,
  json_extract(payload_json,'$.error_location') AS error_location,
  json_extract(payload_json,'$.description') AS description,
  json_extract(payload_json,'$.student_batch') AS student_batch,
  json_extract(payload_json,'$.major') AS major,
  json_extract(payload_json,'$.contact_info') AS contact_info,
  json_extract(payload_json,'$.event_id') AS event_id,
  json_extract(payload_json,'$.event_name') AS event_name,
  json_extract(payload_json,'$.organizer') AS organizer,
  json_extract(payload_json,'$.issue_description') AS issue_description,
  json_extract(payload_json,'$.type') AS type,
  json_extract(payload_json,'$.content') AS content,
  json_extract(payload_json,'$.contact') AS contact,
  json_extract(payload_json,'$.note') AS note`;

const ACTIVITY_COLUMNS = `id,created_at,user_id,user_email,user_role,action,action_label,target_table,table_name,target_id,record_id,page_path,status,
  metadata_json,old_data_json,new_data_json,details_json,error_message,ip_address,device_info`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readConfig = (env: AdminLegacyDataEnv) => {
  const baseUrl = String(env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!baseUrl || !serviceRoleKey) {
    throw new AdminLegacyDataError(503, 'Dịch vụ dữ liệu quản trị tạm thời chưa sẵn sàng.');
  }
  return { baseUrl, serviceRoleKey };
};

const supabaseRequest = async (
  env: AdminLegacyDataEnv,
  path: string,
  init: RequestInit = {},
) => {
  const { baseUrl, serviceRoleKey } = readConfig(env);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(new URL(path, baseUrl), {
      ...init,
      headers: {
        Accept: 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...init.headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new AdminLegacyDataError(
        response.status >= 400 && response.status < 500 ? 400 : 502,
        'Không thể xử lý dữ liệu quản trị.',
      );
    }
    return response;
  } catch (error) {
    if (error instanceof AdminLegacyDataError) throw error;
    throw new AdminLegacyDataError(503, 'Dịch vụ dữ liệu quản trị tạm thời chưa sẵn sàng.');
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const readBody = async (request: Request) => {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new AdminLegacyDataError(413, 'Dữ liệu gửi lên quá lớn.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new AdminLegacyDataError(413, 'Dữ liệu gửi lên quá lớn.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AdminLegacyDataError(400, 'Dữ liệu gửi lên không hợp lệ.');
  }
};

const page = (value: string | null, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const pageSize = (value: string | null, fallback = 30) =>
  Math.max(1, Math.min(MAX_PAGE_SIZE, page(value, fallback)));

const countFromRange = (value: string | null) => {
  const match = String(value || '').match(/\/(\d+)$/);
  return match ? Number(match[1]) + 1 : 0;
};


const requireAdmin = async (request: Request, env: AdminLegacyDataEnv) => {
  const staff = await requireBetterAuthStaff(request, env);
  if (staff.role !== 'admin') {
    throw new AdminLegacyDataError(403, 'Không có quyền thực hiện thao tác này.');
  }
  return staff;
};


const reportTable = (value: string | null) => {
  const table = String(value || '').trim();
  if (!REPORT_TABLES.has(table)) throw new AdminLegacyDataError(404, 'Không tìm thấy loại báo cáo.');
  return table;
};

const parseJson = (value: unknown) => {
  if (typeof value !== 'string') return value ?? null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
};

const activityRow = (row: Record<string, unknown>) => {
  const { metadata_json, old_data_json, new_data_json, details_json, ...rest } = row;
  return {
    ...rest,
    metadata: parseJson(metadata_json),
    old_data: parseJson(old_data_json),
    new_data: parseJson(new_data_json),
    details: parseJson(details_json),
  };
};

const isRecordId = (value: unknown) => typeof value === 'string' && ID_PATTERN.test(value);

const handleD1Report = async (
  request: Request,
  url: URL,
  env: AdminLegacyDataEnv,
  table: string,
  staff: Awaited<ReturnType<typeof requireBetterAuthStaff>>,
) => {
  const kind = D1_REPORT_KINDS[table];
  if (request.method === 'GET') {
    const size = pageSize(url.searchParams.get('limit'));
    const offset = page(url.searchParams.get('offset'));
    const [rows, count] = await Promise.all([
      env.DB.prepare(`SELECT ${D1_REPORT_COLUMNS} FROM protected_submissions WHERE kind=? ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(kind, size, offset).all(),
      env.DB.prepare('SELECT COUNT(*) AS total FROM protected_submissions WHERE kind=?').bind(kind).first<{ total: number }>(),
    ]);
    return { success: true, data: rows.results || [], total: Number(count?.total || 0), role: staff.role };
  }
  const body = await readBody(request);
  if (!isRecord(body)) throw new AdminLegacyDataError(400, 'Dữ liệu báo cáo không hợp lệ.');
  if (request.method === 'POST') {
    if (staff.role !== 'admin' || body.operation !== 'resolve-all') throw new AdminLegacyDataError(403, 'Không có quyền thực hiện thao tác này.');
    const status = typeof body.status === 'string' ? body.status.trim().slice(0, 32) : '';
    if (!status) throw new AdminLegacyDataError(400, 'Trạng thái báo cáo không hợp lệ.');
    const result = await env.DB.prepare(`UPDATE protected_submissions SET status=?,updated_at=?
      WHERE kind=? AND status NOT IN ('ok','resolved','contacted','approved','rejected') AND status IS NOT ?`)
      .bind(status, new Date().toISOString(), kind, status).run();
    return { success: true, updated: Number(result.meta?.changes || 0) };
  }
  const id = typeof body.id === 'string' || typeof body.id === 'number' ? String(body.id) : '';
  if (!isRecordId(id)) throw new AdminLegacyDataError(400, 'Dữ liệu báo cáo không hợp lệ.');
  if (request.method === 'PATCH') {
    const status = typeof body.status === 'string' ? body.status.trim().slice(0, 32) : '';
    if (!status) throw new AdminLegacyDataError(400, 'Trạng thái báo cáo không hợp lệ.');
    // Auditor/admin moderation is idempotent: a same-status replay does not
    // update the timestamp or create extra D1 writes.
    await env.DB.prepare('UPDATE protected_submissions SET status=?,updated_at=? WHERE id=? AND kind=? AND status IS NOT ?')
      .bind(status, new Date().toISOString(), id, kind, status).run();
    const row = await env.DB.prepare(`SELECT ${D1_REPORT_COLUMNS} FROM protected_submissions WHERE id=? AND kind=?`).bind(id, kind).first();
    if (!row) throw new AdminLegacyDataError(404, 'Không tìm thấy dữ liệu quản trị.');
    return { success: true, data: row };
  }
  if (request.method === 'DELETE') {
    if (staff.role !== 'admin') throw new AdminLegacyDataError(403, 'Không có quyền thực hiện thao tác này.');
    await env.DB.prepare('DELETE FROM protected_submissions WHERE id=? AND kind=?').bind(id, kind).run();
    return { success: true };
  }
  throw new AdminLegacyDataError(405, 'Phương thức không được hỗ trợ.');
};

export const handleAdminLegacyData = async (
  request: Request,
  url: URL,
  env: AdminLegacyDataEnv,
) => {
  const pathname = url.pathname;

  if (pathname === '/api/admin/v1/reports') {
    const staff = await requireBetterAuthStaff(request, env);
    const table = reportTable(url.searchParams.get('kind'));
    if (D1_REPORT_KINDS[table]) return handleD1Report(request, url, env, table, staff);
    if (request.method === 'GET') {
      const size = pageSize(url.searchParams.get('limit'));
      const offset = page(url.searchParams.get('offset'));
      const query = new URL(`/rest/v1/${table}`, 'https://supabase.invalid');
      query.searchParams.set('select', REPORT_COLUMNS[table]);
      query.searchParams.set('order', 'created_at.desc');
      query.searchParams.set('limit', String(size));
      query.searchParams.set('offset', String(offset));
      const response = await supabaseRequest(env, `${query.pathname}${query.search}`, {
        headers: { Prefer: 'count=exact' },
      });
      return { success: true, data: await response.json(), total: countFromRange(response.headers.get('content-range')), role: staff.role };
    }

    await requireAdmin(request, env);
    const body = await readBody(request);
    if (!isRecord(body)) {
      throw new AdminLegacyDataError(400, 'Dữ liệu báo cáo không hợp lệ.');
    }
    if (request.method === 'POST') {
      if (body.operation !== 'resolve-all') throw new AdminLegacyDataError(400, 'Thao tác báo cáo không hợp lệ.');
      const status = typeof body.status === 'string' ? body.status.trim().slice(0, 32) : '';
      if (!status) throw new AdminLegacyDataError(400, 'Trạng thái báo cáo không hợp lệ.');
      const query = new URL(`/rest/v1/${table}`, 'https://supabase.invalid');
      query.searchParams.set('status', 'not.in.(ok,resolved,contacted,approved,rejected)');
      const response = await supabaseRequest(env, `${query.pathname}${query.search}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ status }),
      });
      const rows = await response.json() as unknown[];
      return { success: true, updated: rows.length };
    }
    const id = typeof body.id === 'string' || typeof body.id === 'number' ? String(body.id) : '';
    if (!ID_PATTERN.test(id)) throw new AdminLegacyDataError(400, 'Dữ liệu báo cáo không hợp lệ.');
    if (request.method === 'PATCH') {
      const status = typeof body.status === 'string' ? body.status.trim().slice(0, 32) : '';
      if (!status) throw new AdminLegacyDataError(400, 'Trạng thái báo cáo không hợp lệ.');
      const response = await supabaseRequest(env, `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ status }),
      });
      const rows = await response.json() as unknown[];
      return { success: true, data: rows[0] || null };
    }
    if (request.method === 'DELETE') {
      const response = await supabaseRequest(env, `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
      await response.body?.cancel();
      return { success: true };
    }
    throw new AdminLegacyDataError(405, 'Phương thức không được hỗ trợ.');
  }

  if (pathname === '/api/admin/v1/activity') {
    await requireAdmin(request, env);
    if (request.method !== 'GET') throw new AdminLegacyDataError(405, 'Phương thức không được hỗ trợ.');
    const size = pageSize(url.searchParams.get('limit'), 25);
    const offset = page(url.searchParams.get('offset'));
    const [rows, count] = await Promise.all([
      env.DB.prepare(`SELECT ${ACTIVITY_COLUMNS} FROM activity_logs
        WHERE action <> 'view_page' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).bind(size, offset).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT COUNT(*) AS total FROM activity_logs WHERE action <> 'view_page'`).first<{ total: number }>(),
    ]);
    return { success: true, data: (rows.results || []).map(activityRow), total: Number(count?.total || 0) };
  }

  throw new AdminLegacyDataError(404, 'Không tìm thấy endpoint quản trị.');
};

export const adminLegacyDataErrorStatus = (error: unknown) => {
  if (error instanceof AdminLegacyDataError || error instanceof BetterAuthIdentityError) return error.status;
  return 500;
};
