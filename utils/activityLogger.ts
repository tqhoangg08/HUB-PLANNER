import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type ActivityStatus = 'success' | 'error' | 'warning';

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
  session: Session | null;
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

const getDeviceInfo = () => {
  if (typeof navigator === 'undefined') return null;
  return navigator.userAgent || null;
};

const getCurrentPagePath = () => {
  if (typeof window === 'undefined') return null;
  return `${window.location.pathname}${window.location.search}`;
};

const normalizeAuditRole = (role?: string | null) => {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized === 'admin' || normalized === 'auditor' ? normalized : null;
};

const resolveAuditRole = async (userId: string, email?: string | null) => {
  const readRole = async (column: 'id' | 'user_id', value: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq(column, value)
      .limit(1)
      .maybeSingle();

    if (error) return null;
    return normalizeAuditRole(data?.role as string | undefined);
  };

  const directRole = await readRole('id', userId);
  if (directRole) return directRole;

  const userIdRole = await readRole('user_id', userId);
  if (userIdRole) return userIdRole;

  if (email) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (profile?.id) {
      const profileRole = await readRole('user_id', profile.id as string);
      if (profileRole) return profileRole;
    }
  }

  return null;
};

export const logActivity = async ({
  action,
  session,
  userRole,
  targetTable = null,
  targetId = null,
  pagePath = getCurrentPagePath(),
  status = 'success',
  metadata = null,
  oldData = null,
  newData = null,
  errorMessage = null,
}: ActivityLogInput) => {
  if (!supabase || !session?.user?.id) return;

  const metadataRole = normalizeAuditRole(
    (session.user.app_metadata?.role as string | undefined)
    || (session.user.user_metadata?.role as string | undefined)
  );
  const resolvedRole = normalizeAuditRole(userRole)
    || await resolveAuditRole(session.user.id, session.user.email)
    || metadataRole;
  if (!resolvedRole) return;

  const safeMetadata = {
    ...(toSafeJson(metadata || {}) as Record<string, JsonValue>),
    source: 'frontend',
  };

  const row = {
    user_id: session.user.id,
    user_email: session.user.email || null,
    user_role: resolvedRole,
    action,
    action_label: action,
    target_table: targetTable,
    target_id: targetId === null || targetId === undefined ? null : String(targetId),
    page_path: pagePath,
    status,
    metadata: safeMetadata,
    old_data: oldData ? toSafeJson(oldData) : null,
    new_data: newData ? toSafeJson(newData) : null,
    details: oldData || newData ? { old: toSafeJson(oldData), new: toSafeJson(newData) } : null,
    error_message: errorMessage,
    device_info: getDeviceInfo(),
  };

  const { error } = await supabase.from('activity_logs').insert(row);

  if (error && (error.code === 'PGRST204' || /column .* does not exist/i.test(error.message || ''))) {
    await supabase.from('activity_logs').insert({
      user_id: row.user_id,
      user_email: row.user_email,
      action: row.action,
      target_table: row.target_table,
      target_id: row.target_id,
      old_data: row.old_data,
      new_data: row.new_data,
      details: row.details,
      device_info: row.device_info,
    });
    return;
  }

  if (error) throw error;
};

export const logActivityQuietly = (input: ActivityLogInput) => {
  logActivity(input).catch(error => {
    console.warn('Activity log failed:', error);
  });
};
