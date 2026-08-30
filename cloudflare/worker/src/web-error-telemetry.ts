const MAX_BODY_BYTES = 8 * 1024;
const RATE_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const MAX_RATE_BUCKETS = 2_048;

const SOURCES = new Set(['frontend', 'supabase', 'parser', 'otp', 'auth', 'unknown']);
const LEVELS = new Set(['error', 'warn']);
const TOP_LEVEL_KEYS = new Set([
  'id', 'level', 'source', 'action', 'page_path', 'error', 'metadata',
]);
const ERROR_KEYS = new Set(['name', 'message', 'code']);
const METADATA_KEYS = new Set([
  'page_path', 'filename', 'lineno', 'colno', 'surface', 'stage',
  'import_type', 'file_type', 'file_size', 'semester', 'parser',
  'course_count', 'semester_count',
]);
const SENSITIVE_VALUE = /\b(?:authorization|bearer|token|cookie|password|secret|apikey|api[_-]?key)\b|eyJ[a-zA-Z0-9_-]{10,}|@/i;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

type TelemetryResponse = {
  status: number;
  payload: Record<string, unknown>;
  allow?: string;
};

type SanitizedTelemetry = {
  id: string;
  level: string;
  source: string;
  action: string | null;
  page_path: string | null;
  error: { name: string | null; message: string | null; code: string | null };
  metadata: Record<string, string | number | boolean | null>;
};

const hasOnlyKeys = (value: Record<string, unknown>, allowed: Set<string>) =>
  Object.keys(value).every((key) => allowed.has(key));

const safeText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().slice(0, maxLength);
  if (!normalized) return null;
  return SENSITIVE_VALUE.test(normalized) ? '[redacted]' : normalized;
};

const safePath = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.startsWith('/')) return null;
  const path = value.split(/[?#]/, 1)[0].slice(0, 300);
  return path || null;
};

const sanitizeMetadata = (
  value: unknown
): Record<string, string | number | boolean | null> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  if (!hasOnlyKeys(record, METADATA_KEYS)) return null;

  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(record)) {
    if (item === null || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item as number | boolean | null;
    } else if (typeof item === 'string') {
      const value = key === 'page_path' ? safePath(item) : safeText(item, 240);
      if (value !== null) sanitized[key] = value;
    }
  }
  return sanitized;
};

const parseTelemetry = (value: unknown): SanitizedTelemetry | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!hasOnlyKeys(record, TOP_LEVEL_KEYS)) return null;

  const id = typeof record.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.id)
    ? record.id
    : null;
  if (!id || !SOURCES.has(String(record.source)) || !LEVELS.has(String(record.level))) {
    return null;
  }

  const errorValue = record.error;
  if (!errorValue || typeof errorValue !== 'object' || Array.isArray(errorValue)) return null;
  const errorRecord = errorValue as Record<string, unknown>;
  if (!hasOnlyKeys(errorRecord, ERROR_KEYS)) return null;
  const metadata = sanitizeMetadata(record.metadata);
  if (metadata === null) return null;

  return {
    id,
    level: String(record.level),
    source: String(record.source),
    action: safeText(record.action, 120),
    page_path: safePath(record.page_path),
    error: {
      name: safeText(errorRecord.name, 120),
      message: safeText(errorRecord.message, 320),
      code: safeText(errorRecord.code, 80),
    },
    metadata,
  };
};

const isRateLimited = (request: Request) => {
  const key = request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && rateBuckets.size >= MAX_RATE_BUCKETS) {
      for (const [existingKey, existingBucket] of rateBuckets) {
        if (existingBucket.resetAt <= now) rateBuckets.delete(existingKey);
      }
      if (rateBuckets.size >= MAX_RATE_BUCKETS) return true;
    }
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
};

/**
 * Receives a deliberately small, anonymous telemetry envelope. This endpoint
 * never reads cookies and never accepts arbitrary request-body fields.
 */
export const handleWebErrorTelemetry = async (
  request: Request
): Promise<TelemetryResponse> => {
  if (request.method !== 'POST') {
    return { status: 405, payload: { error: 'Chỉ hỗ trợ phương thức POST.' }, allow: 'POST, OPTIONS' };
  }
  if (!String(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    return { status: 415, payload: { error: 'Content-Type phải là application/json.' } };
  }
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { status: 413, payload: { error: 'Payload quá lớn.' } };
  }
  if (isRateLimited(request)) {
    return { status: 429, payload: { error: 'Quá nhiều yêu cầu.' } };
  }

  let parsed: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return { status: 413, payload: { error: 'Payload quá lớn.' } };
    }
    parsed = JSON.parse(raw);
  } catch {
    return { status: 400, payload: { error: 'Payload telemetry không hợp lệ.' } };
  }

  const telemetry = parseTelemetry(parsed);
  if (!telemetry) {
    return { status: 400, payload: { error: 'Payload telemetry không hợp lệ.' } };
  }

  // Worker observability receives only the sanitised allowlist envelope.
  console.warn(JSON.stringify({ event: 'web_error_telemetry', telemetry }));
  return { status: 202, payload: { success: true, id: telemetry.id } };
};

export const resetWebErrorTelemetryRateLimitForTest = () => rateBuckets.clear();
