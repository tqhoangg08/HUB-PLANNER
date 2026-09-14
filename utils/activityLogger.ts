import { privateApiRequest } from './privateApi';

export type ActivityStatus = 'success' | 'error' | 'warning';

type ActivitySession = {
  user: {
    id: string;
    email?: string | null;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  };
};

export type ActivityAction =
  | 'login'
  | 'logout'
  | 'view_page'
  | 'create_course_schedule'
  | 'update_course_schedule'
  | 'delete_course_schedule'
  | 'approve_course_request'
  | 'reject_course_request'
  | 'create_event'
  | 'update_event'
  | 'delete_event'
  | 'send_notification'
  | 'update_profile'
  | string;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ActivityLogInput {
  action: ActivityAction;
  session: ActivitySession | null;
  userRole?: string | null;
  targetTable?: string | null;
  targetId?: string | number | null;
  pagePath?: string | null;
  status?: ActivityStatus;
  metadata?: Record<string, unknown> | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  errorMessage?: string | null;
}

const SENSITIVE_KEY_PATTERN = /password|token|secret|apikey|api_key|authorization|refresh|access|otp|passcode/i;

const toSafeJson = (value: unknown, depth = 0): JsonValue => {
  if (depth > 5) return '[Max depth]';
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).map(item => toSafeJson(item, depth + 1));
  if (typeof value !== 'object') return String(value);

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, JsonValue>>((acc, [key, item]) => {
    // Security: never persist credentials, tokens, OTPs, or secrets into audit metadata.
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      acc[key] = '[REDACTED]';
      return acc;
    }
    acc[key] = toSafeJson(item, depth + 1);
    return acc;
  }, {});
};

const getCurrentPagePath = () => {
  if (typeof window === 'undefined') return null;
  return `${window.location.pathname}${window.location.search}`;
};

export const logActivity = async ({
  action,
  session,
  userRole: _userRole,
  targetTable = null,
  targetId = null,
  pagePath = getCurrentPagePath(),
  status = 'success',
  metadata = null,
  oldData = null,
  newData = null,
  errorMessage = null,
}: ActivityLogInput) => {
  if (!session?.user?.id) return;
  if (action === 'view_page') return;

  const safeMetadata = {
    ...(toSafeJson(metadata || {}) as Record<string, JsonValue>),
    source: 'frontend',
  };

  const row = {
    // This survives a bounded retry but differs for a distinct user action.
    // The server owns the actor; the id is only an idempotency key.
    eventId: crypto.randomUUID(),
    action,
    targetTable,
    targetId: targetId === null || targetId === undefined ? null : String(targetId),
    pagePath,
    status,
    metadata: safeMetadata,
    oldData: oldData ? toSafeJson(oldData) : null,
    newData: newData ? toSafeJson(newData) : null,
    errorMessage,
  };
  await privateApiRequest('/api/private/v1/activity-log', {
    method: 'POST',
    body: JSON.stringify(row),
  });
};

export const logActivityQuietly = (input: ActivityLogInput) => {
  logActivity(input).catch(error => {
    console.warn('Activity log failed:', error);
  });
};
