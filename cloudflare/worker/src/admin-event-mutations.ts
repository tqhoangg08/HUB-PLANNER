import {
  ADMIN_EVENT_SOURCE_COLUMNS,
  type AdminEventsEnv,
  type CoreAdminEventRow,
} from './admin-events.ts';
import { normalizeEventSearch } from './events.ts';
import type { StaffRole } from './auth.ts';

type MutationMode = 'create' | 'update';
type AdminEventMutationValue = string | number | boolean | null;

export type AdminEventMutationPayload = Record<string, AdminEventMutationValue>;

export interface AdminEventMutationResult {
  success: true;
  data: CoreAdminEventRow[];
  mirrorSynced: true;
  replayed?: boolean;
}

interface TextFieldRule { max: number; nullable?: boolean; requiredOnCreate?: boolean; }
interface StoredCreateMutation {
  user_id: string;
  status: 'pending' | 'completed';
  event_id: number | null;
  response_json: string | null;
}
interface D1StoredAdminEventRow extends Omit<
  CoreAdminEventRow,
  'close_on_full' | 'is_manually_closed' | 'is_deleted'
> {
  close_on_full: number;
  is_manually_closed: number;
  is_deleted: number;
}

const MAX_BODY_BYTES = 32 * 1024;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/;
const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
const DATE_FIELDS = new Set(['deadline', 'event_date', 'registration_start_date']);
const TIME_FIELDS = new Set(['deadline_time', 'event_time', 'registration_start_time']);
const BOOLEAN_FIELDS = new Set(['close_on_full', 'is_manually_closed', 'is_deleted']);
const ALLOWED_FIELDS = new Set([...Object.keys(TEXT_FIELDS), ...DATE_FIELDS, ...TIME_FIELDS, ...BOOLEAN_FIELDS]);

const PUBLIC_EVENT_COLUMNS = [
  'id', 'title', 'organizer', 'category', 'criteria', 'points', 'format',
  'deadline', 'deadline_time', 'close_on_full', 'description', 'link',
  'classification', 'location_type', 'status', 'is_manually_closed',
  'is_deleted', 'created_at', 'event_date', 'event_time',
  'registration_start_date', 'registration_start_time', 'image_url',
  'title_search', 'organizer_search',
] as const;

const PUBLIC_EVENT_PROJECTION_SQL = `
  INSERT INTO public_events (${PUBLIC_EVENT_COLUMNS.join(', ')})
  SELECT ${PUBLIC_EVENT_COLUMNS.join(', ')}
    FROM admin_events
   WHERE id = ?
     AND COALESCE(is_deleted, 0) = 0
     AND COALESCE(status, '') <> 'pending'
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    organizer = excluded.organizer,
    category = excluded.category,
    criteria = excluded.criteria,
    points = excluded.points,
    format = excluded.format,
    deadline = excluded.deadline,
    deadline_time = excluded.deadline_time,
    close_on_full = excluded.close_on_full,
    description = excluded.description,
    link = excluded.link,
    classification = excluded.classification,
    location_type = excluded.location_type,
    status = excluded.status,
    is_manually_closed = excluded.is_manually_closed,
    is_deleted = excluded.is_deleted,
    created_at = excluded.created_at,
    event_date = excluded.event_date,
    event_time = excluded.event_time,
    registration_start_date = excluded.registration_start_date,
    registration_start_time = excluded.registration_start_time,
    image_url = excluded.image_url,
    title_search = excluded.title_search,
    organizer_search = excluded.organizer_search`;

const PUBLIC_EVENT_DELETE_IF_HIDDEN_SQL = `
  DELETE FROM public_events
   WHERE id = ?
     AND NOT EXISTS (
       SELECT 1 FROM admin_events
        WHERE id = ?
          AND COALESCE(is_deleted, 0) = 0
          AND COALESCE(status, '') <> 'pending'
     )`;

const metadataStatement = (
  env: AdminEventsEnv,
  resource: 'admin_events' | 'events',
  table: 'admin_events' | 'public_events',
  now: string
) => env.DB.prepare(`
  INSERT INTO sync_metadata (
    resource, source_row_count, source_max_created_at, synced_at, visible_row_count
  )
  SELECT ?, COUNT(*), MAX(created_at), ?, COUNT(*) FROM ${table} WHERE 1
  ON CONFLICT(resource) DO UPDATE SET
    source_row_count = excluded.source_row_count,
    source_max_created_at = excluded.source_max_created_at,
    synced_at = excluded.synced_at,
    visible_row_count = excluded.visible_row_count`).bind(resource, now);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isValidCalendarDate = (value: string) => {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const toApiRow = (row: D1StoredAdminEventRow): CoreAdminEventRow => ({
  ...row,
  close_on_full: Boolean(row.close_on_full),
  is_manually_closed: Boolean(row.is_manually_closed),
  is_deleted: Boolean(row.is_deleted),
});

export class AdminEventMutationError extends Error {
  readonly status: 400 | 403 | 404 | 409 | 413 | 415 | 502 | 503;
  constructor(status: AdminEventMutationError['status'], message: string) {
    super(message);
    this.name = 'AdminEventMutationError';
    this.status = status;
  }
}

export const readAdminEventIdempotencyKey = (request: Request) => {
  const key = String(request.headers.get('Idempotency-Key') || '').trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new AdminEventMutationError(400, 'Mã chống tạo trùng không hợp lệ. Vui lòng tải lại trang và thử lại.');
  }
  return key.toLowerCase();
};

export const validateAdminEventMutationPayload = (value: unknown, mode: MutationMode): AdminEventMutationPayload => {
  if (!isRecord(value)) throw new AdminEventMutationError(400, 'Dữ liệu sự kiện không hợp lệ.');
  const entries = Object.entries(value);
  if (entries.length === 0) throw new AdminEventMutationError(400, 'Không có dữ liệu để cập nhật.');
  const payload: AdminEventMutationPayload = {};
  for (const [field, rawValue] of entries) {
    if (!ALLOWED_FIELDS.has(field)) throw new AdminEventMutationError(400, `Trường dữ liệu "${field}" không được hỗ trợ.`);
    const textRule = TEXT_FIELDS[field];
    if (textRule) {
      if (rawValue === null && textRule.nullable) { payload[field] = null; continue; }
      if (field === 'points' && typeof rawValue === 'number' && Number.isFinite(rawValue)) { payload[field] = String(rawValue); continue; }
      if (typeof rawValue !== 'string') throw new AdminEventMutationError(400, `Trường "${field}" phải là chuỗi.`);
      if (rawValue.length > textRule.max) throw new AdminEventMutationError(400, `Trường "${field}" vượt quá độ dài cho phép.`);
      payload[field] = field === 'title' ? rawValue.trim() : rawValue;
      continue;
    }
    if (DATE_FIELDS.has(field)) {
      if (rawValue === null || rawValue === '') payload[field] = null;
      else if (typeof rawValue === 'string' && isValidCalendarDate(rawValue)) payload[field] = rawValue;
      else throw new AdminEventMutationError(400, `Trường "${field}" không đúng định dạng YYYY-MM-DD.`);
      continue;
    }
    if (TIME_FIELDS.has(field)) {
      if (rawValue === null || rawValue === '') payload[field] = null;
      else if (typeof rawValue === 'string' && TIME_PATTERN.test(rawValue)) payload[field] = rawValue;
      else throw new AdminEventMutationError(400, `Trường "${field}" không đúng định dạng giờ.`);
      continue;
    }
    if (BOOLEAN_FIELDS.has(field)) {
      if (typeof rawValue !== 'boolean') throw new AdminEventMutationError(400, `Trường "${field}" phải là true hoặc false.`);
      payload[field] = rawValue;
    }
  }
  if (mode === 'create' && !String(payload.title || '').trim()) throw new AdminEventMutationError(400, 'Tên sự kiện không được để trống.');
  if ('title' in payload && !String(payload.title || '').trim()) throw new AdminEventMutationError(400, 'Tên sự kiện không được để trống.');
  if (mode === 'create' && 'is_deleted' in payload) throw new AdminEventMutationError(400, 'Không thể tạo mới một sự kiện đã bị xóa.');
  return payload;
};

export const readAdminEventMutationPayload = async (request: Request, mode: MutationMode) => {
  const contentType = String(request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new AdminEventMutationError(415, 'Yêu cầu phải sử dụng Content-Type application/json.');
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) throw new AdminEventMutationError(413, 'Dữ liệu gửi lên quá lớn.');
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) throw new AdminEventMutationError(413, 'Dữ liệu gửi lên quá lớn.');
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); }
  catch { throw new AdminEventMutationError(400, 'JSON gửi lên không hợp lệ.'); }
  return validateAdminEventMutationPayload(parsed, mode);
};

export const assertAdminEventMutationAllowed = (payload: AdminEventMutationPayload, role: StaffRole) => {
  if ('is_deleted' in payload && role !== 'admin') {
    throw new AdminEventMutationError(403, 'Chỉ quản trị viên được phép ẩn hoặc khôi phục sự kiện.');
  }
};

const readEventById = async (env: AdminEventsEnv, eventId: number) => {
  const row = await env.DB.prepare(`SELECT ${ADMIN_EVENT_SOURCE_COLUMNS.join(', ')} FROM admin_events WHERE id = ?`)
    .bind(eventId).first<D1StoredAdminEventRow>();
  return row ? toApiRow(row) : null;
};

const reserveCreateMutation = async (env: AdminEventsEnv, mutationId: string, userId: string): Promise<AdminEventMutationResult | null> => {
  let inserted: D1Result;
  try {
    inserted = await env.DB.prepare(`
      INSERT OR IGNORE INTO admin_event_mutations (
        mutation_id, user_id, operation, status, created_at
      ) VALUES (?, ?, 'create', 'pending', ?)`)
      .bind(mutationId, userId, new Date().toISOString()).run();
  } catch {
    throw new AdminEventMutationError(503, 'Bộ phận chống tạo trùng chưa sẵn sàng. Vui lòng thử lại sau.');
  }
  if (Number(inserted.meta?.changes || 0) > 0) return null;
  const stored = await env.DB.prepare(`
    SELECT user_id, status, event_id, response_json FROM admin_event_mutations
     WHERE mutation_id = ?`).bind(mutationId).first<StoredCreateMutation>();
  if (!stored || stored.user_id !== userId) throw new AdminEventMutationError(409, 'Mã yêu cầu đã được sử dụng. Vui lòng tải lại trang và thử lại.');
  if (stored.status === 'completed' && Number.isSafeInteger(Number(stored.event_id))) {
    const row = await readEventById(env, Number(stored.event_id));
    if (row) return { success: true, data: [row], mirrorSynced: true, replayed: true };
  }
  if (stored.status === 'completed' && stored.response_json) {
    try {
      const result = JSON.parse(stored.response_json) as AdminEventMutationResult;
      if (result?.success && result.data?.[0]) return { ...result, mirrorSynced: true, replayed: true };
    } catch { /* malformed legacy receipt remains non-replayable */ }
  }
  throw new AdminEventMutationError(409, 'Yêu cầu tạo sự kiện trước đang được xử lý. Hãy tải lại danh sách trước khi thử lại.');
};

const releaseCreateMutation = (env: AdminEventsEnv, mutationId: string, userId: string) =>
  env.DB.prepare(`DELETE FROM admin_event_mutations
    WHERE mutation_id = ? AND user_id = ? AND status = 'pending'`)
    .bind(mutationId, userId).run();

const allocateEventId = async (env: AdminEventsEnv) => {
  const row = await env.DB.prepare(`UPDATE core_event_id_sequence
    SET next_id = next_id + 1 WHERE singleton = 1
    RETURNING next_id - 1 AS id`).first<{ id: number }>();
  const id = Number(row?.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new AdminEventMutationError(503, 'Bộ cấp mã sự kiện D1 chưa sẵn sàng.');
  return id;
};

const payloadValue = (payload: AdminEventMutationPayload, field: string) => {
  const value = payload[field];
  if (BOOLEAN_FIELDS.has(field)) return value === true ? 1 : 0;
  return value === undefined ? null : value;
};

const createEvent = async (
  env: AdminEventsEnv,
  payload: AdminEventMutationPayload,
  eventId: number,
  mutationId: string,
  userId: string
) => {
  const now = new Date().toISOString();
  const values = [
    eventId, payloadValue(payload, 'title'), payloadValue(payload, 'organizer'),
    payloadValue(payload, 'category'), payloadValue(payload, 'criteria'),
    payloadValue(payload, 'points'), payloadValue(payload, 'format'),
    payloadValue(payload, 'deadline'), payloadValue(payload, 'deadline_time'),
    payloadValue(payload, 'close_on_full'), payloadValue(payload, 'description'),
    payloadValue(payload, 'link'), payloadValue(payload, 'classification'),
    payload.location_type ?? 'Trong trường', payload.status ?? 'Sắp diễn ra',
    payloadValue(payload, 'is_manually_closed'), 0, now,
    payloadValue(payload, 'event_date'), payloadValue(payload, 'event_time'),
    payloadValue(payload, 'registration_start_date'), payloadValue(payload, 'registration_start_time'),
    payloadValue(payload, 'image_url'), null, null, null, null,
    normalizeEventSearch(payload.title), normalizeEventSearch(payload.organizer),
    mutationId, userId,
  ];
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO admin_events (
      id, title, organizer, category, criteria, points, format, deadline,
      deadline_time, close_on_full, description, link, classification,
      location_type, status, is_manually_closed, is_deleted, created_at,
      event_date, event_time, registration_start_date, registration_start_time,
      image_url, contribution_link, contributor_note, section, score,
      title_search, organizer_search
    ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM admin_event_mutations
        WHERE mutation_id = ? AND user_id = ? AND status = 'pending')
      RETURNING ${ADMIN_EVENT_SOURCE_COLUMNS.join(', ')}`).bind(...values),
    env.DB.prepare(PUBLIC_EVENT_PROJECTION_SQL).bind(eventId),
    env.DB.prepare(PUBLIC_EVENT_DELETE_IF_HIDDEN_SQL).bind(eventId, eventId),
    env.DB.prepare(`UPDATE admin_event_mutations
      SET status = 'completed', event_id = ?, completed_at = ?
      WHERE mutation_id = ? AND user_id = ? AND status = 'pending'`)
      .bind(eventId, now, mutationId, userId),
    metadataStatement(env, 'admin_events', 'admin_events', now),
    metadataStatement(env, 'events', 'public_events', now),
  ]);
  const row = results[0]?.results?.[0] as D1StoredAdminEventRow | undefined;
  if (!row) throw new AdminEventMutationError(409, 'Yêu cầu tạo sự kiện không còn hiệu lực. Vui lòng tải lại trang.');
  return toApiRow(row);
};

const updateEvent = async (env: AdminEventsEnv, payload: AdminEventMutationPayload, eventId: number) => {
  const clauses: string[] = [];
  const values: AdminEventMutationValue[] = [];
  for (const [field, value] of Object.entries(payload)) {
    clauses.push(`${field} = ?`);
    values.push(BOOLEAN_FIELDS.has(field) ? (value === true ? 1 : 0) : value);
  }
  if ('title' in payload) { clauses.push('title_search = ?'); values.push(normalizeEventSearch(payload.title)); }
  if ('organizer' in payload) { clauses.push('organizer_search = ?'); values.push(normalizeEventSearch(payload.organizer)); }
  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE admin_events SET ${clauses.join(', ')} WHERE id = ?
      RETURNING ${ADMIN_EVENT_SOURCE_COLUMNS.join(', ')}`).bind(...values, eventId),
    env.DB.prepare(PUBLIC_EVENT_PROJECTION_SQL).bind(eventId),
    env.DB.prepare(PUBLIC_EVENT_DELETE_IF_HIDDEN_SQL).bind(eventId, eventId),
    metadataStatement(env, 'admin_events', 'admin_events', now),
    metadataStatement(env, 'events', 'public_events', now),
  ]);
  const row = results[0]?.results?.[0] as D1StoredAdminEventRow | undefined;
  if (!row) throw new AdminEventMutationError(404, 'Không tìm thấy sự kiện cần cập nhật.');
  return toApiRow(row);
};

export const rollbackD1AdminEventCreate = async (
  env: AdminEventsEnv,
  eventId: number,
  mutationId: string,
  userId: string
) => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM event_push_deliveries WHERE event_id = ?').bind(eventId),
    env.DB.prepare('DELETE FROM public_events WHERE id = ?').bind(eventId),
    env.DB.prepare('DELETE FROM admin_events WHERE id = ?').bind(eventId),
    env.DB.prepare(`DELETE FROM admin_event_mutations
      WHERE mutation_id = ? AND user_id = ? AND event_id = ?`).bind(mutationId, userId, eventId),
  ]);
};

export const cleanupAdminEventMutations = async (env: AdminEventsEnv) => {
  const result = await env.DB.prepare(`DELETE FROM admin_event_mutations
    WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')`).run();
  return Number(result.meta?.changes || 0);
};

export const mutateAdminEvent = async (
  env: AdminEventsEnv,
  mode: MutationMode,
  payload: AdminEventMutationPayload,
  eventId?: number,
  _fetcher: typeof fetch = fetch,
  createRequest?: { mutationId: string; userId: string }
): Promise<AdminEventMutationResult> => {
  if (mode === 'update' && (!Number.isSafeInteger(eventId) || Number(eventId) <= 0)) {
    throw new AdminEventMutationError(400, 'Mã sự kiện không hợp lệ.');
  }
  if (mode === 'create' && !createRequest) throw new AdminEventMutationError(400, 'Thiếu mã chống tạo trùng cho yêu cầu tạo sự kiện.');
  if (mode === 'update') {
    const row = await updateEvent(env, payload, Number(eventId));
    return { success: true, data: [row], mirrorSynced: true };
  }
  const request = createRequest!;
  const replay = await reserveCreateMutation(env, request.mutationId, request.userId);
  if (replay) return replay;
  try {
    const id = await allocateEventId(env);
    const row = await createEvent(env, payload, id, request.mutationId, request.userId);
    return { success: true, data: [row], mirrorSynced: true };
  } catch (error) {
    try { await releaseCreateMutation(env, request.mutationId, request.userId); }
    catch (releaseError) {
      console.error(JSON.stringify({
        event: 'admin_event_idempotency_release_failed',
        error: releaseError instanceof Error ? releaseError.message : String(releaseError),
      }));
    }
    if (error instanceof AdminEventMutationError) throw error;
    throw new AdminEventMutationError(503, 'Dịch vụ lưu sự kiện D1 tạm thời không khả dụng.');
  }
};
