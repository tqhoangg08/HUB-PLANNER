export type WebErrorSource = 'frontend' | 'supabase' | 'parser' | 'otp' | 'auth' | 'unknown';
export type WebErrorLevel = 'error' | 'warn';

export type LogWebErrorInput = {
  source: WebErrorSource;
  action?: string;
  error: unknown;
  metadata?: Record<string, any>;
  level?: WebErrorLevel;
};

const LOG_TTL_MS = 60 * 1000;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_STACK_LENGTH = 3000;
const MAX_METADATA_DEPTH = 5;
const MAX_METADATA_ARRAY_LENGTH = 50;
const MAX_METADATA_STRING_LENGTH = 1000;
const MAX_TELEMETRY_BYTES = 8 * 1024;
const WEB_ERROR_TELEMETRY_PATH = '/api/public/v1/telemetry/web-errors';
const REDACTED = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
  'password',
  'otp',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'secret',
  'api_key',
  'apikey',
  'email_otp',
]);
const SENSITIVE_URL_PARAMS = new Set([
  'access_token',
  'refresh_token',
  'provider_token',
  'token',
  'id_token',
  'authorization',
  'code',
]);
const TRACKING_URL_PARAMS = new Set([
  'fbclid',
  'gclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
]);

const recentLogs = new Map<string, number>();

const truncate = (value: unknown, maxLength: number) => {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const getPagePath = () => {
  if (typeof window === 'undefined') return '';
  return sanitizeUrlLikeValue(`${window.location.pathname}${window.location.search}${window.location.hash}`);
};

const isSensitiveKey = (key: string) => SENSITIVE_KEYS.has(key.trim().toLowerCase());
const shouldSanitizeUrlValue = (key: string) => ['page_path', 'filename', 'url', 'href'].includes(key.trim().toLowerCase());

const sanitizeUrlLikeValue = (value: string) => {
  try {
    const base = typeof window === 'undefined' ? 'https://hotrosinhvienhub.id.vn' : window.location.origin;
    const url = new URL(value, base);
    url.hash = '';
    [...url.searchParams.keys()].forEach((key) => {
      const normalizedKey = key.toLowerCase();
      if (SENSITIVE_URL_PARAMS.has(normalizedKey) || TRACKING_URL_PARAMS.has(normalizedKey)) {
        url.searchParams.delete(key);
      }
    });

    const path = `${url.pathname}${url.search}`;
    return value.startsWith('http://') || value.startsWith('https://') ? `${url.origin}${path}` : path;
  } catch {
    return value.split('#')[0];
  }
};

export const sanitizeWebErrorMetadata = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (depth > MAX_METADATA_DEPTH) return '[Truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncate(value, MAX_METADATA_STRING_LENGTH);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message, MAX_MESSAGE_LENGTH),
    };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return value
      .slice(0, MAX_METADATA_ARRAY_LENGTH)
      .map((item) => sanitizeWebErrorMetadata(item, depth + 1, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, entry]) => {
      if (isSensitiveKey(key)) {
        acc[key] = REDACTED;
      } else if (shouldSanitizeUrlValue(key) && typeof entry === 'string') {
        acc[key] = truncate(sanitizeUrlLikeValue(entry), MAX_METADATA_STRING_LENGTH);
      } else {
        acc[key] = sanitizeWebErrorMetadata(entry, depth + 1, seen);
      }
      return acc;
    }, {});
  }

  return truncate(value, MAX_METADATA_STRING_LENGTH);
};

const normalizeError = (error: unknown) => {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: unknown }).code;
    return {
      name: error.name,
      message: truncate(error.message || error.name || 'Unknown error', MAX_MESSAGE_LENGTH),
      code: maybeCode ? truncate(maybeCode, 120) : null,
      stack: error.stack ? truncate(error.stack, MAX_STACK_LENGTH) : null,
    };
  }

  if (error && typeof error === 'object') {
    const errorObject = error as Record<string, unknown>;
    const message = errorObject.message || errorObject.error_description || errorObject.details || 'Unknown object error';
    return {
      name: errorObject.name ? truncate(errorObject.name, 120) : null,
      message: truncate(message || 'Unknown error', MAX_MESSAGE_LENGTH),
      code: errorObject.code ? truncate(errorObject.code, 120) : null,
      stack: errorObject.stack ? truncate(errorObject.stack, MAX_STACK_LENGTH) : null,
    };
  }

  return {
    name: null,
    message: truncate(error || 'Unknown error', MAX_MESSAGE_LENGTH),
    code: null,
    stack: null,
  };
};

const shouldSkipDuplicate = (key: string) => {
  const now = Date.now();
  const lastLoggedAt = recentLogs.get(key);
  if (lastLoggedAt && now - lastLoggedAt < LOG_TTL_MS) return true;

  recentLogs.set(key, now);
  recentLogs.forEach((timestamp, existingKey) => {
    if (now - timestamp > LOG_TTL_MS) recentLogs.delete(existingKey);
  });
  return false;
};

const isIgnorableFrontendNoise = (input: {
  source: WebErrorSource;
  action?: string;
  error: ReturnType<typeof normalizeError>;
  metadata?: Record<string, any>;
}) => {
  if (input.source !== 'frontend') return false;

  const message = String(input.error.message || '');
  const stack = String(input.error.stack || '');
  const filename = String(input.metadata?.filename || '');
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;

  if (
    message.includes('window.webkit.messageHandlers') &&
    stack.includes('setupIosCallbackHandler') &&
    /FBAN|FBIOS|FB_IAB|Instagram|Line\//i.test(userAgent)
  ) {
    return true;
  }

  return input.action === 'window_error' &&
    message === 'Script error.' &&
    (!filename || filename === '/' || filename === window.location.origin || filename === window.location.href);
};

const TELEMETRY_METADATA_KEYS = new Set([
  'page_path',
  'filename',
  'lineno',
  'colno',
  'surface',
  'stage',
  'import_type',
  'file_type',
  'file_size',
  'semester',
  'parser',
  'course_count',
  'semester_count',
]);

const telemetryMetadata = (metadata: Record<string, any>) => {
  const sanitized = sanitizeWebErrorMetadata(metadata);
  if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) return {};

  return Object.fromEntries(
    Object.entries(sanitized as Record<string, unknown>)
      .filter(([key]) => TELEMETRY_METADATA_KEYS.has(key.toLowerCase()))
      .filter(([, value]) =>
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      )
  );
};

const makeLogId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
};

export const logWebError = async ({
  source,
  action,
  error,
  metadata = {},
  level = 'error',
}: LogWebErrorInput): Promise<string | null> => {
  try {
    const normalizedError = normalizeError(error);
    if (isIgnorableFrontendNoise({ source, action, error: normalizedError, metadata })) return null;
    const pagePath = getPagePath();
    const duplicateKey = [source, action || '', normalizedError.message, pagePath].join('|');
    if (shouldSkipDuplicate(duplicateKey)) return null;

    const logId = makeLogId();
    const payload = {
      id: logId,
      level,
      source,
      action: action ? truncate(action, 120) : null,
      page_path: pagePath || null,
      error: {
        name: normalizedError.name,
        message: normalizedError.message,
        code: normalizedError.code,
      },
      metadata: telemetryMetadata(metadata),
    };
    const body = JSON.stringify(payload);
    if (new TextEncoder().encode(body).byteLength > MAX_TELEMETRY_BYTES) return null;

    const response = await fetch(WEB_ERROR_TELEMETRY_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      redirect: 'manual',
      keepalive: true,
      body,
    });
    return response.ok ? logId : null;
  } catch {
    // Logging must never become a new user-facing failure.
    return null;
  }
};

export const installGlobalWebErrorHandlers = () => {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    void logWebError({
      source: 'frontend',
      action: 'window_error',
      error: event.error || event.message,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        page_path: getPagePath(),
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    void logWebError({
      source: 'frontend',
      action: 'unhandled_promise_rejection',
      error: event.reason,
      metadata: {
        page_path: getPagePath(),
      },
    });
  });
};
