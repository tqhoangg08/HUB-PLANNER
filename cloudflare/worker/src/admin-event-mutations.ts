import {
  ADMIN_EVENT_SOURCE_COLUMNS,
  mirrorAdminEventRow,
  type AdminEventsEnv,
  type SupabaseAdminEventRow,
} from './admin-events.ts';
import {
  mirrorPublicEventRow,
  type SupabaseEventRow,
} from './events.ts';
import type { StaffRole } from './auth.ts';

type MutationMode = 'create' | 'update';

type AdminEventMutationValue = string | number | boolean | null;

export type AdminEventMutationPayload = Record<
  string,
  AdminEventMutationValue
>;

export interface AdminEventMutationResult {
  success: true;
  data: SupabaseAdminEventRow[];
  mirrorSynced: boolean;
  replayed?: boolean;
}

interface TextFieldRule {
  max: number;
  nullable?: boolean;
  requiredOnCreate?: boolean;
}

const MAX_BODY_BYTES = 32 * 1024;
const SUPABASE_WRITE_TIMEOUT_MS = 8_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TEXT_FIELDS: Record<string, TextFieldRule> = {
  title: { max: 300, requiredOnCreate: true },
  organizer: { max: 300, nullable: true },
  category: { max: 120, nullable: true },
  criteria: { max: 20, nullable: true },
  points: { max: 40, nullable: true },
  format: { max: 80, nullable: true },
  description: { max: 10_000, nullable: true },
  link: { max: 2_048, nullable: true },
  classification: { max: 120, nullable: true },
  location_type: { max: 80, nullable: true },
  status: { max: 80, nullable: true },
  image_url: { max: 2_048, nullable: true },
};

const DATE_FIELDS = new Set([
  'deadline',
  'event_date',
  'registration_start_date',
]);
const TIME_FIELDS = new Set([
  'deadline_time',
  'event_time',
  'registration_start_time',
]);
const BOOLEAN_FIELDS = new Set([
  'close_on_full',
  'is_manually_closed',
  'is_deleted',
]);
const ALLOWED_FIELDS = new Set([
  ...Object.keys(TEXT_FIELDS),
  ...DATE_FIELDS,
  ...TIME_FIELDS,
  ...BOOLEAN_FIELDS,
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isValidCalendarDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

export class AdminEventMutationError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 413 | 415 | 502 | 503;

  constructor(
    status: 400 | 403 | 404 | 409 | 413 | 415 | 502 | 503,
    message: string
  ) {
    super(message);
    this.name = 'AdminEventMutationError';
    this.status = status;
  }
}

export const readAdminEventIdempotencyKey = (request: Request) => {
  const key = String(request.headers.get('Idempotency-Key') || '').trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new AdminEventMutationError(
      400,
      'Mã chống tạo trùng không hợp lệ. Vui lòng tải lại trang và thử lại.'
    );
  }
  return key.toLowerCase();
};

export const validateAdminEventMutationPayload = (
  value: unknown,
  mode: MutationMode
): AdminEventMutationPayload => {
  if (!isRecord(value)) {
    throw new AdminEventMutationError(400, 'Dữ liệu sự kiện không hợp lệ.');
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new AdminEventMutationError(400, 'Không có dữ liệu để cập nhật.');
  }

  const payload: AdminEventMutationPayload = {};
  for (const [field, rawValue] of entries) {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new AdminEventMutationError(
        400,
        `Trường dữ liệu "${field}" không được hỗ trợ.`
      );
    }

    const textRule = TEXT_FIELDS[field];
    if (textRule) {
      if (rawValue === null && textRule.nullable) {
        payload[field] = null;
        continue;
      }
      if (
        field === 'points' &&
        typeof rawValue === 'number' &&
        Number.isFinite(rawValue)
      ) {
        payload[field] = String(rawValue);
        continue;
      }
      if (typeof rawValue !== 'string') {
        throw new AdminEventMutationError(
          400,
          `Trường "${field}" phải là chuỗi.`
        );
      }
      if (rawValue.length > textRule.max) {
        throw new AdminEventMutationError(
          400,
          `Trường "${field}" vượt quá độ dài cho phép.`
        );
      }
      payload[field] = field === 'title' ? rawValue.trim() : rawValue;
      continue;
    }

    if (DATE_FIELDS.has(field)) {
      if (rawValue === null || rawValue === '') {
        payload[field] = null;
      } else if (
        typeof rawValue === 'string' &&
        isValidCalendarDate(rawValue)
      ) {
        payload[field] = rawValue;
      } else {
        throw new AdminEventMutationError(
          400,
          `Trường "${field}" không đúng định dạng YYYY-MM-DD.`
        );
      }
      continue;
    }

    if (TIME_FIELDS.has(field)) {
      if (rawValue === null || rawValue === '') {
        payload[field] = null;
      } else if (
        typeof rawValue === 'string' &&
        TIME_PATTERN.test(rawValue)
      ) {
        payload[field] = rawValue;
      } else {
        throw new AdminEventMutationError(
          400,
          `Trường "${field}" không đúng định dạng giờ.`
        );
      }
      continue;
    }

    if (BOOLEAN_FIELDS.has(field)) {
      if (typeof rawValue !== 'boolean') {
        throw new AdminEventMutationError(
          400,
          `Trường "${field}" phải là true hoặc false.`
        );
      }
      payload[field] = rawValue;
    }
  }

  if (mode === 'create' && !String(payload.title || '').trim()) {
    throw new AdminEventMutationError(400, 'Tên sự kiện không được để trống.');
  }
  if ('title' in payload && !String(payload.title || '').trim()) {
    throw new AdminEventMutationError(400, 'Tên sự kiện không được để trống.');
  }
  if (mode === 'create' && 'is_deleted' in payload) {
    throw new AdminEventMutationError(
      400,
      'Không thể tạo mới một sự kiện đã bị xóa.'
    );
  }

  return payload;
};

export const readAdminEventMutationPayload = async (
  request: Request,
  mode: MutationMode
) => {
  const contentType = String(request.headers.get('Content-Type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    throw new AdminEventMutationError(
      415,
      'Yêu cầu phải sử dụng Content-Type application/json.'
    );
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new AdminEventMutationError(413, 'Dữ liệu gửi lên quá lớn.');
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw new AdminEventMutationError(413, 'Dữ liệu gửi lên quá lớn.');
  }

  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new AdminEventMutationError(400, 'JSON gửi lên không hợp lệ.');
  }
  return validateAdminEventMutationPayload(value, mode);
};

export const assertAdminEventMutationAllowed = (
  payload: AdminEventMutationPayload,
  role: StaffRole
) => {
  if ('is_deleted' in payload && role !== 'admin') {
    throw new AdminEventMutationError(
      403,
      'Chỉ quản trị viên được phép ẩn hoặc khôi phục sự kiện.'
    );
  }
};

export const buildSupabaseAdminEventMutationUrl = (
  baseUrl: string,
  eventId?: number
) => {
  const url = new URL('/rest/v1/events', baseUrl.replace(/\/$/, ''));
  url.searchParams.set('select', ADMIN_EVENT_SOURCE_COLUMNS.join(','));
  if (eventId !== undefined) url.searchParams.set('id', `eq.${eventId}`);
  return url;
};

const readSupabaseConfig = (env: AdminEventsEnv) => {
  const supabaseUrl = String(env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new AdminEventMutationError(
      503,
      'Cấu hình lưu sự kiện trên máy chủ chưa đầy đủ.'
    );
  }
  return { supabaseUrl, serviceRoleKey };
};

const writeSupabaseAdminEvent = async (
  env: AdminEventsEnv,
  mode: MutationMode,
  payload: AdminEventMutationPayload,
  eventId?: number,
  fetcher: typeof fetch = fetch
) => {
  const { supabaseUrl, serviceRoleKey } = readSupabaseConfig(env);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort('admin-event-write-timeout'),
    SUPABASE_WRITE_TIMEOUT_MS
  );

  let response: Response;
  try {
    response = await fetcher(
      buildSupabaseAdminEventMutationUrl(supabaseUrl, eventId),
      {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );
  } catch {
    throw new AdminEventMutationError(
      503,
      'Dịch vụ lưu sự kiện tạm thời không khả dụng.'
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new AdminEventMutationError(
      response.status >= 400 && response.status < 500 ? 400 : 502,
      response.status >= 400 && response.status < 500
        ? 'Dữ liệu sự kiện không hợp lệ hoặc bị từ chối.'
        : 'Dịch vụ lưu sự kiện đang gặp lỗi.'
    );
  }

  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    rows = null;
  }
  if (!Array.isArray(rows) || rows.length === 0 || !isRecord(rows[0])) {
    throw new AdminEventMutationError(
      mode === 'update' ? 404 : 502,
      mode === 'update'
        ? 'Không tìm thấy sự kiện cần cập nhật.'
        : 'Dịch vụ lưu sự kiện không trả về dữ liệu hợp lệ.'
    );
  }

  const row = rows[0] as unknown as SupabaseAdminEventRow;
  if (!Number.isSafeInteger(Number(row.id)) || !String(row.title || '').trim()) {
    throw new AdminEventMutationError(
      502,
      'Dịch vụ lưu sự kiện không trả về dữ liệu hợp lệ.'
    );
  }
  return row;
};

interface StoredCreateMutation {
  user_id: string;
  status: 'pending' | 'completed';
  response_json: string | null;
}

const reserveCreateMutation = async (
  env: AdminEventsEnv,
  mutationId: string,
  userId: string
): Promise<AdminEventMutationResult | null> => {
  let insertResult: D1Result;
  try {
    insertResult = await env.DB.prepare(
      `INSERT OR IGNORE INTO admin_event_mutations (
         mutation_id, user_id, operation, status, created_at
       ) VALUES (?, ?, 'create', 'pending', ?)`
    )
      .bind(mutationId, userId, new Date().toISOString())
      .run();
  } catch {
    throw new AdminEventMutationError(
      503,
      'Bộ phận chống tạo trùng chưa sẵn sàng. Vui lòng thử lại sau.'
    );
  }

  if (Number(insertResult.meta?.changes || 0) > 0) return null;

  const stored = await env.DB.prepare(
    `SELECT user_id, status, response_json
       FROM admin_event_mutations
      WHERE mutation_id = ?`
  )
    .bind(mutationId)
    .first<StoredCreateMutation>();

  if (!stored || stored.user_id !== userId) {
    throw new AdminEventMutationError(
      409,
      'Mã yêu cầu đã được sử dụng. Vui lòng tải lại trang và thử lại.'
    );
  }
  if (stored.status === 'completed' && stored.response_json) {
    try {
      const result = JSON.parse(stored.response_json) as AdminEventMutationResult;
      if (result?.success && Array.isArray(result.data) && result.data[0]) {
        return { ...result, replayed: true };
      }
    } catch {
      // A malformed stored response is handled as an incomplete request below.
    }
  }

  throw new AdminEventMutationError(
    409,
    'Yêu cầu tạo sự kiện trước đang được xử lý. Hãy tải lại danh sách trước khi thử lại.'
  );
};

const completeCreateMutation = async (
  env: AdminEventsEnv,
  mutationId: string,
  userId: string,
  result: AdminEventMutationResult
) => {
  const updateResult = await env.DB.prepare(
    `UPDATE admin_event_mutations
        SET status = 'completed',
            event_id = ?,
            response_json = ?,
            completed_at = ?
      WHERE mutation_id = ?
        AND user_id = ?
        AND status = 'pending'`
  )
    .bind(
      Number(result.data[0].id),
      JSON.stringify(result),
      new Date().toISOString(),
      mutationId,
      userId
    )
    .run();
  if (Number(updateResult.meta?.changes || 0) !== 1) {
    throw new Error('Could not complete the create mutation reservation.');
  }
};

const updateCompletedCreateMutation = async (
  env: AdminEventsEnv,
  mutationId: string,
  userId: string,
  result: AdminEventMutationResult
) => {
  await env.DB.prepare(
    `UPDATE admin_event_mutations
        SET response_json = ?
      WHERE mutation_id = ?
        AND user_id = ?
        AND status = 'completed'`
  )
    .bind(JSON.stringify(result), mutationId, userId)
    .run();
};

const releaseCreateMutation = async (
  env: AdminEventsEnv,
  mutationId: string,
  userId: string
) => {
  await env.DB.prepare(
    `DELETE FROM admin_event_mutations
      WHERE mutation_id = ?
        AND user_id = ?
        AND status = 'pending'`
  )
    .bind(mutationId, userId)
    .run();
};

export const cleanupAdminEventMutations = async (env: AdminEventsEnv) => {
  const result = await env.DB.prepare(
    `DELETE FROM admin_event_mutations
      WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')`
  ).run();
  return Number(result.meta?.changes || 0);
};

export const mutateAdminEvent = async (
  env: AdminEventsEnv,
  mode: MutationMode,
  payload: AdminEventMutationPayload,
  eventId?: number,
  fetcher: typeof fetch = fetch,
  createRequest?: { mutationId: string; userId: string }
): Promise<AdminEventMutationResult> => {
  if (
    mode === 'update' &&
    (!Number.isSafeInteger(eventId) || Number(eventId) <= 0)
  ) {
    throw new AdminEventMutationError(400, 'Mã sự kiện không hợp lệ.');
  }

  if (mode === 'create' && !createRequest) {
    throw new AdminEventMutationError(
      400,
      'Thiếu mã chống tạo trùng cho yêu cầu tạo sự kiện.'
    );
  }

  if (mode === 'create' && createRequest) {
    const replay = await reserveCreateMutation(
      env,
      createRequest.mutationId,
      createRequest.userId
    );
    if (replay) return replay;
  }

  let row: SupabaseAdminEventRow;
  try {
    row = await writeSupabaseAdminEvent(
      env,
      mode,
      payload,
      eventId,
      fetcher
    );
  } catch (error) {
    if (mode === 'create' && createRequest) {
      try {
        await releaseCreateMutation(
          env,
          createRequest.mutationId,
          createRequest.userId
        );
      } catch (releaseError) {
        console.error(JSON.stringify({
          event: 'admin_event_idempotency_release_failed',
          error:
            releaseError instanceof Error
              ? releaseError.message
              : String(releaseError),
        }));
      }
    }
    throw error;
  }

  const provisionalResult: AdminEventMutationResult = {
    success: true,
    data: [row],
    mirrorSynced: false,
  };
  if (mode === 'create' && createRequest) {
    try {
      await completeCreateMutation(
        env,
        createRequest.mutationId,
        createRequest.userId,
        provisionalResult
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: 'admin_event_idempotency_complete_failed',
        eventId: Number(row.id),
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  let mirrorSynced = true;
  try {
    await mirrorAdminEventRow(env, row);
    await mirrorPublicEventRow(env, row as SupabaseEventRow);
  } catch (error) {
    mirrorSynced = false;
    console.error(JSON.stringify({
      event: 'admin_event_targeted_mirror_failed',
      eventId: Number(row.id),
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  const result: AdminEventMutationResult = {
    success: true,
    data: [row],
    mirrorSynced,
  };
  if (mode === 'create' && createRequest) {
    try {
      await updateCompletedCreateMutation(
        env,
        createRequest.mutationId,
        createRequest.userId,
        result
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: 'admin_event_idempotency_result_update_failed',
        eventId: Number(row.id),
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  return result;
};
