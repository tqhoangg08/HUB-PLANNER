import {
  BetterAuthIdentityError,
  requireBetterAuthStaff,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import {
  ProfileShadowError,
  readProfileD1Authority,
  writeProfileD1Authority,
  type ProfileShadowEnv,
} from './profile-shadow.ts';

export interface StaffProfileEnv extends BetterAuthIdentityEnv, ProfileShadowEnv {}

type StaffProfileStatus = 400 | 401 | 403 | 404 | 405 | 413 | 422 | 503;

export class StaffProfileError extends Error {
  readonly status: StaffProfileStatus;

  constructor(status: StaffProfileStatus, message: string) {
    super(message);
    this.name = 'StaffProfileError';
    this.status = status;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_MAP_USERS = 200;
const MAX_PAGE_SIZE = 500;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readBody = async (request: Request) => {
  const declared = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new StaffProfileError(413, 'Payload quá lớn.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new StaffProfileError(413, 'Payload quá lớn.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new StaffProfileError(400, 'Payload không hợp lệ.');
  }
};

const normalizeUserId = (value: unknown) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new StaffProfileError(400, 'User ID không hợp lệ.');
  }
  return value.toLowerCase();
};

const parseMapRequest = (body: unknown) => {
  if (!isRecord(body)) throw new StaffProfileError(400, 'Payload không hợp lệ.');
  const keys = Object.keys(body);
  if (keys.some((key) => !['action', 'userIds', 'mode'].includes(key)) || body.action !== 'map') {
    throw new StaffProfileError(400, 'Payload không hợp lệ.');
  }
  if (!Array.isArray(body.userIds) || body.userIds.length > MAX_MAP_USERS) {
    throw new StaffProfileError(400, 'Danh sách người dùng không hợp lệ.');
  }
  if (body.mode !== undefined && body.mode !== 'full' && body.mode !== 'summary') {
    throw new StaffProfileError(400, 'Chế độ đọc không hợp lệ.');
  }
  return [...new Set(body.userIds.map(normalizeUserId))];
};

const parsePagedRequest = (body: Record<string, unknown>, action: 'search' | 'export-page') => {
  const allowed = action === 'search'
    ? ['action', 'query', 'limit', 'offset']
    : ['action', 'limit', 'offset'];
  if (Object.keys(body).some((key) => !allowed.includes(key)) || body.action !== action) {
    throw new StaffProfileError(400, 'Payload không hợp lệ.');
  }
  const limit = Number(body.limit ?? (action === 'search' ? 80 : 500));
  const offset = Number(body.offset ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE || !Number.isInteger(offset) || offset < 0) {
    throw new StaffProfileError(400, 'Phân trang không hợp lệ.');
  }
  const query = action === 'search' && typeof body.query === 'string'
    ? body.query.trim().slice(0, 100)
    : '';
  if (action === 'search' && query.length < 2) {
    throw new StaffProfileError(400, 'Từ khóa tìm kiếm quá ngắn.');
  }
  return { query, limit, offset };
};

const parsePublicMapRequest = (body: Record<string, unknown>) => {
  if (Object.keys(body).some((key) => !['action', 'userIds'].includes(key)) || body.action !== 'public-map') {
    throw new StaffProfileError(400, 'Payload không hợp lệ.');
  }
  if (!Array.isArray(body.userIds) || body.userIds.length > MAX_MAP_USERS) {
    throw new StaffProfileError(400, 'Danh sách người dùng không hợp lệ.');
  }
  return [...new Set(body.userIds.map(normalizeUserId))];
};

const parsedJsonObject = (value: string | null) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    throw new StaffProfileError(503, 'Dữ liệu hồ sơ D1 không hợp lệ.');
  }
};

const parseUpdateRequest = (body: unknown) => {
  if (!isRecord(body)) throw new StaffProfileError(400, 'Payload không hợp lệ.');
  const keys = Object.keys(body);
  if (keys.some((key) => !['userId', 'privateProfile'].includes(key))) {
    throw new StaffProfileError(400, 'Payload chứa trường không được phép.');
  }
  if (!isRecord(body.privateProfile) || Object.keys(body.privateProfile).some((key) => key !== 'data')) {
    throw new StaffProfileError(422, 'Chỉ dữ liệu hồ sơ học tập được phép cập nhật.');
  }
  if (!Object.hasOwn(body.privateProfile, 'data') || !isRecord(body.privateProfile.data)) {
    throw new StaffProfileError(422, 'Dữ liệu hồ sơ học tập không hợp lệ.');
  }
  return {
    userId: normalizeUserId(body.userId),
    privateProfile: { data: body.privateProfile.data },
  };
};

export const handleStaffProfile = async (
  request: Request,
  env: StaffProfileEnv,
) => {
  const staff = await requireBetterAuthStaff(request, env);
  if (request.method === 'POST') {
    const body = await readBody(request);
    if (!isRecord(body)) throw new StaffProfileError(400, 'Payload không hợp lệ.');
    if (body.action === 'map') {
      const userIds = parseMapRequest(body);
      const rows = await Promise.all(userIds.map(async (userId) => {
        const profile = await readProfileD1Authority(env, userId);
        if (!profile.publicRow) return null;
        return {
          user_id: userId,
          email: null,
          data: profile.privateRow?.data ?? null,
          password_set_at: null,
          updated_at: profile.privateRow?.updated_at ?? null,
        };
      }));
      return { success: true, data: rows.filter(Boolean) };
    }

    if (!env.DB) throw new StaffProfileError(503, 'Dịch vụ hồ sơ D1 chưa sẵn sàng.');
    if (body.action === 'public-map') {
      const userIds = parsePublicMapRequest(body);
      const rows = await Promise.all(userIds.map((userId) => env.DB!.prepare(
        'SELECT user_id AS id, student_code, full_name, class_name, created_at, updated_at FROM user_profiles WHERE user_id = ?',
      ).bind(userId).first()));
      return { success: true, data: rows.filter(Boolean) };
    }

    if (body.action === 'search') {
      const { query, limit, offset } = parsePagedRequest(body, 'search');
      const like = `%${query.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
      const result = await env.DB.prepare(`SELECT p.user_id AS id, p.student_code, p.full_name,
        p.created_at, p.updated_at, q.student_name, q.program_name, q.cohort,
        q.major_name, q.specialization_name
        FROM user_profiles p LEFT JOIN user_profile_private q ON q.user_id = p.user_id
        WHERE p.student_code LIKE ? ESCAPE '\\' OR p.full_name LIKE ? ESCAPE '\\'
        ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`).bind(like, like, limit, offset).all();
      const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM user_profiles
        WHERE student_code LIKE ? ESCAPE '\\' OR full_name LIKE ? ESCAPE '\\'`)
        .bind(like, like).first<{ total: number }>();
      return { success: true, data: result.results || [], total: Number(count?.total || 0) };
    }

    if (body.action === 'export-page') {
      const { limit, offset } = parsePagedRequest(body, 'export-page');
      const result = await env.DB.prepare(`SELECT p.user_id, p.student_code, p.full_name,
        p.class_name, q.data_json, q.student_name, q.cohort, q.program_name,
        q.major_name, q.specialization_name, q.semesters_json, q.updated_at
        FROM user_profiles p INNER JOIN user_profile_private q ON q.user_id = p.user_id
        ORDER BY p.user_id LIMIT ? OFFSET ?`).bind(limit, offset).all<Record<string, unknown>>();
      return {
        success: true,
        data: (result.results || []).map((row) => ({
          ...row,
          email: row.student_code ? `${row.student_code}@st.buh.edu.vn` : null,
          data: parsedJsonObject(typeof row.data_json === 'string' ? row.data_json : null),
          semesters: (() => {
            const data = parsedJsonObject(typeof row.data_json === 'string' ? row.data_json : null);
            return Array.isArray(data?.semesters) ? data.semesters : [];
          })(),
          data_json: undefined,
          semesters_json: undefined,
        })),
      };
    }
    throw new StaffProfileError(400, 'Thao tác hồ sơ không hợp lệ.');
  }

  if (request.method === 'PATCH') {
    if (staff.role !== 'admin') throw new StaffProfileError(403, 'Không có quyền cập nhật hồ sơ.');
    const input = parseUpdateRequest(await readBody(request));
    const existing = await readProfileD1Authority(env, input.userId);
    if (!existing.publicRow) throw new StaffProfileError(404, 'Không tìm thấy hồ sơ.');
    await writeProfileD1Authority(env, {
      userId: input.userId,
      publicProfile: {},
      privateProfile: input.privateProfile,
    });
    return { success: true };
  }

  throw new StaffProfileError(405, 'Phương thức không được hỗ trợ.');
};

export const staffProfileErrorStatus = (error: unknown) => {
  if (error instanceof StaffProfileError || error instanceof BetterAuthIdentityError) return error.status;
  if (error instanceof ProfileShadowError) return 503;
  return 500;
};
