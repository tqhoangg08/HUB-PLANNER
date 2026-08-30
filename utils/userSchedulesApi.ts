const READ_TIMEOUT_MS = 6_000;
const WRITE_TIMEOUT_MS = 15_000;
const MAX_SCHEDULE_REVISION = Number.MAX_SAFE_INTEGER - 1;

type ScheduleMutationResult = {
  mirrorSynced: boolean;
  changed: boolean;
  revision?: number;
  count?: number;
};

/**
 * A private schedule response deliberately carries two opaque identifiers:
 * `id` identifies the course data, while `user_schedule_id` identifies the
 * owner-scoped schedule row. Row mutations must use the latter exclusively.
 */
export type UserScheduleMutationTarget = {
  user_schedule_id?: unknown;
  semester?: unknown;
};

export class ScheduleApiError extends Error {
  readonly status: number;

  constructor(
    status: number,
    message: string,
  ) {
    super(message);
    this.status = status;
    this.name = 'ScheduleApiError';
  }
}

export class ScheduleRevisionConflictError extends ScheduleApiError {
  constructor() {
    super(409, 'Lịch đã thay đổi. Hệ thống đã tải lại dữ liệu mới; vui lòng kiểm tra và lưu lại.');
    this.name = 'ScheduleRevisionConflictError';
  }
}

const revisionsBySemester = new Map<string, number>();
const pendingMutationKeys = new Map<string, string>();

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
  );
};

const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value));

const createMutationKey = () => {
  const secureCrypto = globalThis.crypto;
  if (!secureCrypto) throw new Error('Trình duyệt không hỗ trợ tạo khóa yêu cầu an toàn.');
  if (typeof secureCrypto.randomUUID === 'function') return secureCrypto.randomUUID();
  const bytes = secureCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
};

const recordRevisions = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [semester, revisionValue] of Object.entries(value)) {
    const revision = Number(revisionValue);
    if (
      semester.length > 0 &&
      semester.length <= 64 &&
      Number.isSafeInteger(revision) &&
      revision >= 0 &&
      revision <= MAX_SCHEDULE_REVISION
    ) {
      revisionsBySemester.set(semester, revision);
    }
  }
};

const revisionFor = (semester: string) => {
  const revision = revisionsBySemester.get(semester) ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > MAX_SCHEDULE_REVISION) {
    throw new Error('Phiên bản lịch cá nhân không hợp lệ. Vui lòng tải lại trang.');
  }
  return revision;
};

const revisionForMutation = async (semester: string) => {
  // A mutation must be based on a collection read from the D1 authority.
  // Refresh before the first write for a semester instead of guessing a
  // revision from an older browser state.
  if (!revisionsBySemester.has(semester)) {
    await fetchCloudflareUserSchedules();
  }
  return revisionFor(semester);
};

const readErrorMessage = async (response: Response) => {
  if (response.status === 401) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  }
  if (response.status === 403) {
    return 'Bạn không có quyền xem lịch cá nhân này.';
  }
  if (response.status === 503) {
    return 'Tính năng lịch cá nhân tạm thời chưa khả dụng. Vui lòng thử lại sau.';
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    try {
      const payload = await response.json();
      if (
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        typeof payload.error === 'string' &&
        payload.error.length <= 240
      ) {
        return payload.error;
      }
    } catch {
      // Keep the fixed fallback for invalid client-error bodies.
    }
  }
  return 'Không thể xử lý lịch cá nhân.';
};

const authenticatedRequest = async (
  path: string,
  init: RequestInit = {},
  timeoutMs = READ_TIMEOUT_MS
) => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort('user-schedule-timeout'),
    timeoutMs
  );
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');

  try {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const response = await fetch(normalizedPath, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: 'include',
      redirect: 'manual',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ScheduleApiError(response.status, await readErrorMessage(response));
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') throw error;
    throw new Error(
      'Cloudflare phản hồi quá chậm. Vui lòng kiểm tra mạng và thử lại.'
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

const readMutationResult = async (response: Response): Promise<ScheduleMutationResult> => {
  const payload = await response.json();
  if (!payload?.success) {
    throw new Error('Cloudflare trả về kết quả lưu lịch không hợp lệ.');
  }
  const revision = Number(payload.revision);
  return {
    mirrorSynced: payload.mirrorSynced === true,
    changed: payload.changed === true,
    ...(Number.isSafeInteger(revision) && revision >= 0 && revision <= MAX_SCHEDULE_REVISION
      ? { revision }
      : {}),
    ...(Number.isSafeInteger(Number(payload.count)) && Number(payload.count) >= 0
      ? { count: Number(payload.count) }
      : {}),
  };
};

const refreshScheduleRevisions = async () => {
  try {
    await fetchCloudflareUserSchedules();
  } catch {
    // Preserve the original CAS error. The UI performs the visible refresh.
  }
};

const runD1CompatibleMutation = async (
  operation: string,
  semester: string,
  path: string,
  init: RequestInit,
) => {
  const expectedRevision = await revisionForMutation(semester);
  const fingerprint = canonicalJson({ operation, semester, path, expectedRevision, body: init.body || null });
  const idempotencyKey = pendingMutationKeys.get(fingerprint) || createMutationKey();
  pendingMutationKeys.set(fingerprint, idempotencyKey);
  const headers = new Headers(init.headers);
  headers.set('If-Match', `"${expectedRevision}"`);
  headers.set('Idempotency-Key', idempotencyKey);

  try {
    const response = await authenticatedRequest(path, { ...init, headers }, WRITE_TIMEOUT_MS);
    const result = await readMutationResult(response);
    if (result.revision !== undefined) revisionsBySemester.set(semester, result.revision);
    pendingMutationKeys.delete(fingerprint);
    return result;
  } catch (error) {
    if (error instanceof ScheduleApiError && error.status === 409) {
      pendingMutationKeys.delete(fingerprint);
      await refreshScheduleRevisions();
      throw new ScheduleRevisionConflictError();
    }
    if (error instanceof ScheduleApiError && [400, 403, 404, 422].includes(error.status)) {
      pendingMutationKeys.delete(fingerprint);
    }
    // Transport and server failures retain the same key for an exact retry.
    throw error;
  }
};

export const isScheduleRevisionConflict = (error: unknown) =>
  error instanceof ScheduleRevisionConflictError;

export const fetchCloudflareUserSchedules = async (userId?: string) => {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  const response = await authenticatedRequest(
    `/api/user/v1/schedules${suffix}`
  );
  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error('Cloudflare trả về lịch cá nhân không hợp lệ.');
  }
  // CAS state belongs only to the authenticated owner's mutation surface.
  // A privileged read of someone else must never seed the caller's tokens.
  if (!userId) recordRevisions(payload.revisions);
  return payload.data as Record<string, unknown>[];
};

export const addCloudflareUserSchedule = async (
  courseId: string,
  semester: string
) => {
  return runD1CompatibleMutation(
    'add',
    semester,
    `/api/user/v1/schedules/courses/${encodeURIComponent(courseId)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ semester }),
    },
  );
};

export const removeCloudflareUserSchedule = async (courseId: string, semester: string) => {
  const params = new URLSearchParams({ semester });
  return runD1CompatibleMutation(
    'delete',
    semester,
    `/api/user/v1/schedules/courses/${encodeURIComponent(courseId)}?${params.toString()}`,
    { method: 'DELETE' },
  );
};

const userScheduleRowMutationTarget = (target: UserScheduleMutationTarget) => {
  const scheduleId = typeof target?.user_schedule_id === 'string'
    ? target.user_schedule_id.trim()
    : '';
  const semester = typeof target?.semester === 'string'
    ? target.semester.trim()
    : '';
  if (!scheduleId || !semester) {
    throw new Error('Không xác định được dòng lịch cá nhân để cập nhật. Vui lòng tải lại lịch.');
  }
  return { scheduleId, semester };
};

export const updateCloudflareUserSchedule = async (
  target: UserScheduleMutationTarget,
  customData: Record<string, unknown>
) => {
  const { scheduleId, semester } = userScheduleRowMutationTarget(target);
  return runD1CompatibleMutation(
    'update_custom_data',
    semester,
    `/api/user/v1/schedules/entries/${encodeURIComponent(scheduleId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ customData }),
    },
  );
};

export const replaceCloudflareUserScheduleSemester = async (
  semester: string,
  courseIds: string[],
  rows?: Array<Record<string, unknown>>
) => {
  const result = await runD1CompatibleMutation(
    rows ? 'pdf_import' : 'replace_all',
    semester,
    '/api/user/v1/schedules/replace',
    {
      method: 'PUT',
      body: JSON.stringify(rows ? { semester, rows } : { semester, courseIds }),
    },
  );
  if (result.count === undefined) {
    throw new Error('Cloudflare trả về kết quả nhập lịch không hợp lệ.');
  }
  return {
    count: result.count,
    mirrorSynced: result.mirrorSynced,
  };
};
