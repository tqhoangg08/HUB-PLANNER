import { BetterAuthIdentityError, requireBetterAuthSession, type BetterAuthIdentityEnv } from './better-auth-identity.ts';
import {
  isProfileD1ShadowReadEnabled,
  isProfileD1ReadAuthority,
  isProfileD1WriteAuthority,
  isProfileD1ShadowWriteEligible,
  logProfileShadowWriteEvent,
  logProfileShadowMirrorFailure,
  mirrorAuthoritativeProfileToD1,
  observeProfileShadowRead,
  readProfileD1Authority,
  writeProfileD1Authority,
  type ProfileShadowEnv,
} from './profile-shadow.ts';

export interface PrivateProfileEnv extends BetterAuthIdentityEnv, ProfileShadowEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  PROFILE_D1_SHADOW_CANARY_USER_ID?: string;
}

interface PrivateProfileExecution {
  waitUntil(promise: Promise<unknown>): void;
}

const MAX_BODY_BYTES = 512 * 1024;
const PUBLIC_FIELDS = new Set([
  'full_name', 'avatar_url', 'bio', 'class_name', 'class_name_overridden',
  'profile_tags', 'public_profile_enabled', 'show_profile_stats', 'public_gpa',
  'public_completed_semesters', 'public_credits',
]);
const PRIVATE_FIELDS = new Set(['data']);
const PUBLIC_SOURCE_SELECT = [
  'id', 'student_code', 'full_name', 'avatar_url', 'bio', 'class_name',
  'class_name_overridden', 'profile_tags', 'public_profile_enabled',
  'show_profile_stats', 'public_gpa', 'public_completed_semesters',
  'public_credits', 'created_at', 'updated_at',
].join(',');
const PRIVATE_SOURCE_SELECT = [
  'user_id', 'data', 'student_name', 'cohort', 'major_name',
  'specialization_name', 'program_name', 'semesters', 'target_gpa',
  'total_credits_required', 'has_onboarded', 'lookback_seen', 'updated_at',
].join(',');
export class PrivateProfileError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PrivateProfileError';
    this.status = status;
  }
}

const config = (env: PrivateProfileEnv) => {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !key) throw new PrivateProfileError(503, 'Dịch vụ hồ sơ tạm thời chưa khả dụng.');
  return { url, key };
};

const sourceRequest = async (
  env: PrivateProfileEnv,
  path: string,
  init: RequestInit = {},
) => {
  const { url, key } = config(env);
  const response = await fetch(new URL(path, url), {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new PrivateProfileError(502, 'Không thể xử lý hồ sơ cá nhân.');
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) as unknown : null;
};

const firstRow = (value: unknown) => Array.isArray(value) && value[0] && typeof value[0] === 'object'
  ? value[0] as Record<string, unknown>
  : null;

export const readAuthoritativeProfile = async (env: PrivateProfileEnv, encodedUserId: string) => {
  const [publicRows, privateRows] = await Promise.all([
    sourceRequest(env, `/rest/v1/profiles?id=eq.${encodedUserId}&select=${PUBLIC_SOURCE_SELECT}`),
    sourceRequest(env, `/rest/v1/profile_private_data?user_id=eq.${encodedUserId}&select=${PRIVATE_SOURCE_SELECT}`),
  ]);
  return {
    publicRow: firstRow(publicRows),
    privateRow: firstRow(privateRows),
  };
};

const publicResponse = (row: Record<string, unknown> | null) => row ? {
  full_name: row.full_name,
  avatar_url: row.avatar_url,
  bio: row.bio,
  class_name: row.class_name,
  class_name_overridden: row.class_name_overridden,
  profile_tags: row.profile_tags,
  public_profile_enabled: row.public_profile_enabled,
  show_profile_stats: row.show_profile_stats,
  public_gpa: row.public_gpa,
  public_completed_semesters: row.public_completed_semesters,
  public_credits: row.public_credits,
} : null;

const privateResponse = (row: Record<string, unknown> | null) => row ? {
  data: row.data,
  updated_at: row.updated_at,
} : null;

const runShadowTask = async (
  task: Promise<unknown>,
  execution?: PrivateProfileExecution,
) => {
  if (execution) {
    execution.waitUntil(task);
    return;
  }
  await task;
};

const readBody = async (request: Request) => {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new PrivateProfileError(400, 'Dữ liệu hồ sơ vượt giới hạn.');
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new PrivateProfileError(400, 'Dữ liệu hồ sơ không hợp lệ.');
  }
};

const pick = (value: unknown, allowed: Set<string>) => {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PrivateProfileError(400, 'Dữ liệu hồ sơ không hợp lệ.');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([key]) => !allowed.has(key))) {
    throw new PrivateProfileError(400, 'Dữ liệu hồ sơ chứa trường không được phép.');
  }
  return Object.fromEntries(entries);
};

const invalid = () => new PrivateProfileError(400, 'Dữ liệu hồ sơ không hợp lệ.');

const validateNullableText = (value: unknown, maxLength: number) => {
  if (value === null) return;
  if (typeof value !== 'string' || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw invalid();
  }
};

const validatePublicProfile = (profile: Record<string, unknown>) => {
  for (const [key, value] of Object.entries(profile)) {
    if (key === 'full_name' || key === 'class_name') validateNullableText(value, 200);
    else if (key === 'avatar_url') validateNullableText(value, 2_048);
    else if (key === 'bio') validateNullableText(value, 4_000);
    else if (
      key === 'class_name_overridden' ||
      key === 'public_profile_enabled' ||
      key === 'show_profile_stats'
    ) {
      if (value !== null && typeof value !== 'boolean') throw invalid();
    } else if (key === 'profile_tags') {
      if (!Array.isArray(value) || value.length > 50 || JSON.stringify(value).length > 16_384) {
        throw invalid();
      }
    } else if (key === 'public_gpa') {
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10)) {
        throw invalid();
      }
    } else if (key === 'public_completed_semesters' || key === 'public_credits') {
      if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000)) {
        throw invalid();
      }
    }
  }
};

const validatePrivateProfile = (profile: Record<string, unknown>) => {
  if (!Object.hasOwn(profile, 'data')) return;
  const data = profile.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid();
};

export const mirrorProfileOwnerFromAuthoritativeSource = async (
  env: PrivateProfileEnv,
  userId: string,
) => {
  const source = await readAuthoritativeProfile(env, encodeURIComponent(userId));
  return mirrorAuthoritativeProfileToD1(env, userId, source.publicRow, source.privateRow);
};

export const mirrorProfileOwnerFromAuthoritativeSourceWithRetry = async (
  env: PrivateProfileEnv,
  userId: string,
  writer: 'worker_profile_api' | 'auth_edge' | 'courses_edge',
) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (attempt > 1) logProfileShadowWriteEvent('mirror_retry', writer, attempt);
    logProfileShadowWriteEvent('mirror_attempt', writer, attempt);
    try {
      const result = await mirrorProfileOwnerFromAuthoritativeSource(env, userId);
      logProfileShadowWriteEvent('mirror_success', writer, attempt);
      return result;
    } catch (error) {
      lastError = error;
      logProfileShadowWriteEvent('mirror_failure', writer, attempt);
    }
  }
  throw lastError;
};

export const handlePrivateProfile = async (
  request: Request,
  env: PrivateProfileEnv,
  execution?: PrivateProfileExecution,
) => {
  const identity = await requireBetterAuthSession(request, env);
  const userId = encodeURIComponent(identity.userId);
  if (request.method === 'GET') {
    if (isProfileD1ReadAuthority(env)) {
      try {
        const authority = await readProfileD1Authority(env, identity.userId);
        return {
          success: true,
          publicProfile: publicResponse(authority.publicRow),
          privateProfile: privateResponse(authority.privateRow),
        };
      } catch {
        // D1 is the explicit read authority. Never silently fall back to Supabase.
        throw new PrivateProfileError(503, 'Dịch vụ hồ sơ tạm thời chưa khả dụng.');
      }
    }
    const source = await readAuthoritativeProfile(env, userId);
    if (isProfileD1ShadowReadEnabled(env)) {
      await runShadowTask(
        observeProfileShadowRead(env, identity.userId, source.publicRow, source.privateRow),
        execution,
      );
    }
    return {
      success: true,
      publicProfile: publicResponse(source.publicRow),
      privateProfile: privateResponse(source.privateRow),
    };
  }
  if (request.method !== 'PATCH') throw new PrivateProfileError(405, 'Phương thức không được hỗ trợ.');
  const body = await readBody(request);
  if ('userId' in body || 'user_id' in body || 'id' in body) {
    throw new PrivateProfileError(400, 'Không cho phép chỉ định chủ sở hữu hồ sơ.');
  }
  const publicProfile = pick(body.publicProfile, PUBLIC_FIELDS);
  const privateProfile = pick(body.privateProfile, PRIVATE_FIELDS);
  validatePublicProfile(publicProfile);
  validatePrivateProfile(privateProfile);
  const hasPublicMutation = Object.keys(publicProfile).length > 0;
  const hasPrivateMutation = Object.keys(privateProfile).length > 0;
  if (!hasPublicMutation && !hasPrivateMutation) return { success: true };

  const now = new Date().toISOString();
  if (isProfileD1WriteAuthority(env)) {
    await writeProfileD1Authority(env, {
      userId: identity.userId,
      email: identity.email,
      publicProfile,
      privateProfile,
      now,
    });
    return { success: true };
  }
  const sourceBefore = await readAuthoritativeProfile(env, userId);
  if (!sourceBefore.publicRow) {
    const studentCode = identity.email.split('@')[0] || null;
    await sourceRequest(env, '/rest/v1/profiles?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: identity.userId,
        email: identity.email,
        student_code: studentCode,
        full_name: publicProfile.full_name ?? studentCode ?? 'Sinh viên HUB',
        ...publicProfile,
        updated_at: now,
      }),
    });
  } else if (hasPublicMutation) {
    await sourceRequest(env, `/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ...publicProfile, updated_at: now }),
    });
  }
  if (hasPrivateMutation) {
    await sourceRequest(env, '/rest/v1/profile_private_data?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: identity.userId,
        email: identity.email,
        ...privateProfile,
        updated_at: now,
      }),
    });
  }
  logProfileShadowWriteEvent('source_write', 'worker_profile_api');
  if (isProfileD1ShadowWriteEligible(env, identity.userId)) {
    const mirrorTask = mirrorProfileOwnerFromAuthoritativeSourceWithRetry(
      env,
      identity.userId,
      'worker_profile_api',
    )
      .catch(() => logProfileShadowMirrorFailure());
    await runShadowTask(mirrorTask, execution);
  }
  return { success: true };
};

export const privateProfileErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof PrivateProfileError
    ? error.status
    : 500;
