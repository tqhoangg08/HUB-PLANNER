import {
  BetterAuthIdentityError,
  requireBetterAuthStaff,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

/**
 * Narrow, server-only read/write bridges for admin modules that have not yet
 * moved their data store into D1.  These are deliberately feature endpoints,
 * not a browser-accessible PostgREST proxy: every table, field and operation
 * is fixed in this module and every request is authorized from Better Auth.
 */
export interface AdminLegacyDataEnv extends BetterAuthIdentityEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

type AdminLegacyStatus = 400 | 401 | 403 | 404 | 405 | 413 | 502 | 503;

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

const ACTIVITY_COLUMNS = 'id,created_at,user_id,user_email,user_role,action,action_label,target_table,table_name,target_id,record_id,page_path,status,metadata,old_data,new_data,details,error_message,ip_address,device_info';
const LOST_FOUND_COLUMNS = 'id,created_at,type,title,description,location,contact_info,user_name,image_url,status,is_deleted,user_id';
const CANDIDATE_COLUMNS = 'id,source_name,post_url,raw_content,image_url,submitted_from,client_created_at,review_status,ai_is_event,ai_confidence,ai_reason,ai_result,approved_event_id,reviewed_at,created_at';

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

export const handleAdminLegacyData = async (
  request: Request,
  url: URL,
  env: AdminLegacyDataEnv,
) => {
  const pathname = url.pathname;

  if (pathname === '/api/admin/v1/reports') {
    const staff = await requireBetterAuthStaff(request, env);
    const table = reportTable(url.searchParams.get('kind'));
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
    const query = new URL('/rest/v1/activity_logs', 'https://supabase.invalid');
    query.searchParams.set('select', ACTIVITY_COLUMNS);
    query.searchParams.set('action', 'neq.view_page');
    query.searchParams.set('order', 'created_at.desc');
    query.searchParams.set('limit', String(size));
    query.searchParams.set('offset', String(offset));
    const response = await supabaseRequest(env, `${query.pathname}${query.search}`, {
      headers: { Prefer: 'count=exact' },
    });
    return { success: true, data: await response.json(), total: countFromRange(response.headers.get('content-range')) };
  }

  if (pathname === '/api/admin/v1/lost-found') {
    const staff = await requireBetterAuthStaff(request, env);
    if (request.method === 'GET') {
      const size = pageSize(url.searchParams.get('limit'), 24);
      const offset = page(url.searchParams.get('offset'));
      const type = String(url.searchParams.get('type') || '').toUpperCase();
      const id = Number(url.searchParams.get('id') || 0);
      const query = new URL('/rest/v1/lost_found_items', 'https://supabase.invalid');
      query.searchParams.set('select', LOST_FOUND_COLUMNS);
      query.searchParams.set('is_deleted', 'eq.false');
      if (type === 'FOUND' || type === 'LOST') query.searchParams.set('type', `eq.${type}`);
      if (Number.isSafeInteger(id) && id > 0) query.searchParams.set('id', `eq.${id}`);
      query.searchParams.set('order', 'created_at.desc');
      query.searchParams.set('limit', String(size));
      query.searchParams.set('offset', String(offset));
      const response = await supabaseRequest(env, `${query.pathname}${query.search}`, { headers: { Prefer: 'count=exact' } });
      return { success: true, data: await response.json(), total: countFromRange(response.headers.get('content-range')), role: staff.role };
    }
    await requireAdmin(request, env);
    if (request.method === 'POST') {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > 4_300_000) {
        throw new AdminLegacyDataError(413, 'Ảnh tìm đồ quá lớn.');
      }
      let upload: Record<string, unknown>;
      try { upload = JSON.parse(raw) as Record<string, unknown>; }
      catch { throw new AdminLegacyDataError(400, 'Dữ liệu ảnh không hợp lệ.'); }
      if (upload.operation !== 'upload-image') throw new AdminLegacyDataError(400, 'Thao tác tìm đồ không hợp lệ.');
      const contentType = String(upload.contentType || '').toLowerCase();
      const base64 = String(upload.base64 || '');
      if (!/^image\/(jpeg|png|webp|gif)$/.test(contentType) || !base64 || base64.length > 4_200_000) {
        throw new AdminLegacyDataError(400, 'Dữ liệu ảnh không hợp lệ.');
      }
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0)); }
      catch { throw new AdminLegacyDataError(400, 'Dữ liệu ảnh không hợp lệ.'); }
      if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new AdminLegacyDataError(413, 'Ảnh tìm đồ quá lớn.');
      const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
      const objectName = `admin-${crypto.randomUUID()}.${extension}`;
      const response = await supabaseRequest(env, `/storage/v1/object/lost_found_images/${objectName}`, {
        method: 'POST', headers: { 'Content-Type': contentType, 'x-upsert': 'false' }, body: bytes,
      });
      await response.body?.cancel();
      const { baseUrl } = readConfig(env);
      return { success: true, publicUrl: `${baseUrl.replace(/\/$/, '')}/storage/v1/object/public/lost_found_images/${objectName}` };
    }
    const body = await readBody(request);
    if (!isRecord(body) || !Number.isSafeInteger(Number(body.id)) || Number(body.id) <= 0) {
      throw new AdminLegacyDataError(400, 'Dữ liệu tìm đồ không hợp lệ.');
    }
    const id = Number(body.id);
    const patch: Record<string, unknown> = {};
    if (request.method === 'PATCH') {
      if (typeof body.status === 'string') patch.status = body.status.trim().slice(0, 32);
      if (body.is_deleted === true) patch.is_deleted = true;
      for (const field of ['title', 'description', 'location', 'contact_info', 'user_name', 'image_url']) {
        if (typeof body[field] === 'string' || body[field] === null) patch[field] = body[field];
      }
      if (Object.keys(patch).length === 0) throw new AdminLegacyDataError(400, 'Dữ liệu cập nhật không hợp lệ.');
      await supabaseRequest(env, `/rest/v1/lost_found_items?id=eq.${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      return { success: true };
    }
    throw new AdminLegacyDataError(405, 'Phương thức không được hỗ trợ.');
  }

  if (pathname === '/api/admin/v1/event-candidates') {
    const staff = await requireBetterAuthStaff(request, env);
    if (request.method === 'POST') {
      if (staff.role !== 'admin') throw new AdminLegacyDataError(403, 'Không có quyền thực hiện thao tác này.');
      const body = await readBody(request);
      const action = isRecord(body) && typeof body.action === 'string' ? body.action : '';
      const id = isRecord(body) && (typeof body.id === 'string' || typeof body.id === 'number') ? String(body.id) : '';
      if (!id || !ID_PATTERN.test(id)) throw new AdminLegacyDataError(400, 'Dữ liệu candidate không hợp lệ.');
      if (action === 'reject') {
        const response = await supabaseRequest(env, `/rest/v1/event_candidates?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({ review_status: 'rejected', reviewed_at: new Date().toISOString() }),
        });
        const rows = await response.json() as unknown[];
        return { success: true, candidate: rows[0] || null };
      }
      throw new AdminLegacyDataError(400, 'Thao tác candidate chưa được hỗ trợ bởi API quản trị.');
    }
    if (request.method !== 'GET') throw new AdminLegacyDataError(405, 'Phương thức không được hỗ trợ.');
    const query = new URL('/rest/v1/event_candidates', 'https://supabase.invalid');
    query.searchParams.set('select', CANDIDATE_COLUMNS);
    query.searchParams.set('order', 'created_at.desc');
    query.searchParams.set('limit', String(pageSize(url.searchParams.get('limit'), 200)));
    const status = String(url.searchParams.get('review_status') || 'all').trim();
    if (status && status !== 'all') query.searchParams.set('review_status', `eq.${encodeURIComponent(status)}`);
    const response = await supabaseRequest(env, `${query.pathname}${query.search}`);
    return { success: true, candidates: await response.json() };
  }

  throw new AdminLegacyDataError(404, 'Không tìm thấy endpoint quản trị.');
};

export const adminLegacyDataErrorStatus = (error: unknown) => {
  if (error instanceof AdminLegacyDataError || error instanceof BetterAuthIdentityError) return error.status;
  return 500;
};
