import {
  makePrivateProfileShadowProjection,
  makeProfileShadowProjection,
} from '../../../scripts/profile-shadow-projection.mjs';

export interface ProfileShadowEnv {
  DB?: D1Database;
  PROFILE_READ_AUTHORITY?: string;
  PROFILE_WRITE_AUTHORITY?: string;
  PROFILE_D1_SHADOW_READ_ENABLED?: string;
  PROFILE_D1_SHADOW_WRITE_ENABLED?: string;
  PROFILE_D1_SHADOW_WRITE_PERCENT?: string;
  PROFILE_D1_SHADOW_CANARY_USER_ID?: string;
}

type SourceRow = Record<string, unknown> | null;

interface D1ProfileRow {
  user_id: string;
  canonical_hash: string;
  row_version: number;
}

interface D1PrivateProfileRow extends D1ProfileRow {
  data_json: string;
}

interface D1AuthorityPublicRow {
  user_id: string;
  student_code: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  class_name: string | null;
  class_name_overridden: number;
  profile_tags_json: string;
  public_profile_enabled: number;
  show_profile_stats: number;
  public_gpa: number | null;
  public_completed_semesters: number | null;
  public_credits: number | null;
  created_at: string;
  updated_at: string;
}

interface D1AuthorityPrivateRow {
  user_id: string;
  data_json: string;
  student_name: string | null;
  cohort: string | null;
  major_name: string | null;
  specialization_name: string | null;
  program_name: string | null;
  semesters_json: string | null;
  target_gpa: number | null;
  total_credits_required: number | null;
  has_onboarded: number | null;
  lookback_seen_json: string | null;
  updated_at: string;
}

export interface ProfileShadowMetrics {
  PROFILE_SHADOW_READ_TOTAL: 1;
  PROFILE_SHADOW_MATCH: 0 | 1;
  PROFILE_SHADOW_MISMATCH: 0 | 1;
  PROFILE_SHADOW_MISSING_D1: 0 | 1;
  PROFILE_SHADOW_MISSING_SOURCE: 0 | 1;
}

export interface ProfileShadowComparison {
  status: 'match' | 'mismatch' | 'shadow_read_failed';
  metrics: ProfileShadowMetrics;
}

export class ProfileShadowError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'ProfileShadowError';
    this.code = code;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const fail = (code: string): never => {
  throw new ProfileShadowError(code);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeUuid = (value: unknown) => {
  if (typeof value !== 'string') return fail('PROFILE_SHADOW_OWNER_INVALID');
  const normalized = value.toLowerCase();
  if (!UUID_PATTERN.test(normalized)) return fail('PROFILE_SHADOW_OWNER_INVALID');
  return normalized;
};

const nullableText = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return fail('PROFILE_SHADOW_TEXT_INVALID');
  return value;
};

const nullableStudentCode = (value: unknown) => {
  const normalized = nullableText(value);
  if (normalized !== null && !normalized.trim()) return fail('PROFILE_SHADOW_STUDENT_CODE_INVALID');
  return normalized;
};

const requiredTimestamp = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return fail('PROFILE_SHADOW_TIMESTAMP_INVALID');
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return fail('PROFILE_SHADOW_TIMESTAMP_INVALID');
  return new Date(parsed).toISOString();
};

const nullableBoolean = (value: unknown) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'boolean') return fail('PROFILE_SHADOW_BOOLEAN_INVALID');
  return value ? 1 : 0;
};

const requiredBoolean = (value: unknown) => {
  const normalized = nullableBoolean(value);
  if (normalized === null) return fail('PROFILE_SHADOW_BOOLEAN_INVALID');
  return normalized;
};

const nullableNumber = (
  value: unknown,
  options: { integer?: boolean; nonnegative?: boolean } = {},
) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail('PROFILE_SHADOW_NUMBER_INVALID');
  if (options.integer && !Number.isInteger(value)) return fail('PROFILE_SHADOW_NUMBER_INVALID');
  if (options.nonnegative && value < 0) return fail('PROFILE_SHADOW_NUMBER_INVALID');
  return value;
};

const canonicalJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalJsonValue(value[key])]),
    );
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) return value;
  return fail('PROFILE_SHADOW_JSON_INVALID');
};

const canonicalJsonText = (value: unknown, expectedType: 'array' | 'object') => {
  const canonical = canonicalJsonValue(value);
  if (expectedType === 'array' && !Array.isArray(canonical)) {
    return fail('PROFILE_SHADOW_JSON_INVALID');
  }
  if (expectedType === 'object' && !isRecord(canonical)) {
    return fail('PROFILE_SHADOW_JSON_INVALID');
  }
  return JSON.stringify(canonical);
};

const nullableJsonText = (value: unknown, expectedType: 'array' | 'object') =>
  value === null || value === undefined ? null : canonicalJsonText(value, expectedType);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const withHash = async <T extends Record<string, unknown>>(projection: T) => ({
  ...projection,
  canonical_hash: await sha256(JSON.stringify(projection)),
});

export const projectSourcePublicProfile = async (row: SourceRow) => {
  if (row === null) return null;
  return withHash(makeProfileShadowProjection({
    user_id: normalizeUuid(row.id),
    student_code: nullableStudentCode(row.student_code),
    full_name: nullableText(row.full_name),
    avatar_url: nullableText(row.avatar_url),
    bio: nullableText(row.bio),
    class_name: nullableText(row.class_name),
    class_name_overridden: requiredBoolean(row.class_name_overridden),
    profile_tags_json: canonicalJsonText(row.profile_tags, 'array'),
    public_profile_enabled: requiredBoolean(row.public_profile_enabled),
    show_profile_stats: requiredBoolean(row.show_profile_stats),
    public_gpa: nullableNumber(row.public_gpa, { nonnegative: true }),
    public_completed_semesters: nullableNumber(row.public_completed_semesters, {
      integer: true,
      nonnegative: true,
    }),
    public_credits: nullableNumber(row.public_credits, { integer: true, nonnegative: true }),
    created_at: requiredTimestamp(row.created_at),
    updated_at: requiredTimestamp(row.updated_at),
  }));
};

export const projectSourcePrivateProfile = async (row: SourceRow) => {
  if (row === null) return null;
  return withHash(makePrivateProfileShadowProjection({
    user_id: normalizeUuid(row.user_id),
    data_json: canonicalJsonText(row.data, 'object'),
    student_name: nullableText(row.student_name),
    cohort: nullableText(row.cohort),
    major_name: nullableText(row.major_name),
    specialization_name: nullableText(row.specialization_name),
    program_name: nullableText(row.program_name),
    semesters_json: nullableJsonText(row.semesters, 'array'),
    target_gpa: nullableNumber(row.target_gpa, { nonnegative: true }),
    total_credits_required: nullableNumber(row.total_credits_required, {
      integer: true,
      nonnegative: true,
    }),
    has_onboarded: nullableBoolean(row.has_onboarded),
    lookback_seen_json: nullableJsonText(row.lookback_seen, 'object'),
    updated_at: requiredTimestamp(row.updated_at),
  }));
};

const d1RowsForOwner = async (db: D1Database, userId: string) => {
  const publicRow = await db.prepare(
    'SELECT user_id, canonical_hash, row_version FROM user_profiles WHERE user_id = ?',
  ).bind(userId).first<D1ProfileRow>();
  const privateRow = await db.prepare(
    'SELECT user_id, data_json, canonical_hash, row_version FROM user_profile_private WHERE user_id = ?',
  ).bind(userId).first<D1PrivateProfileRow>();
  return { publicRow, privateRow };
};

const metrics = (
  match: boolean,
  missingD1: boolean,
  missingSource: boolean,
): ProfileShadowMetrics => ({
  PROFILE_SHADOW_READ_TOTAL: 1,
  PROFILE_SHADOW_MATCH: match ? 1 : 0,
  PROFILE_SHADOW_MISMATCH: match ? 0 : 1,
  PROFILE_SHADOW_MISSING_D1: missingD1 ? 1 : 0,
  PROFILE_SHADOW_MISSING_SOURCE: missingSource ? 1 : 0,
});

const logComparison = (comparison: ProfileShadowComparison) => {
  console.log(JSON.stringify({
    event: 'profile_shadow_read_compare',
    status: comparison.status,
    metrics: comparison.metrics,
  }));
};

export const compareProfileShadowRead = async (
  env: ProfileShadowEnv,
  userId: string,
  sourcePublicRow: SourceRow,
  sourcePrivateRow: SourceRow,
): Promise<ProfileShadowComparison> => {
  const db = env.DB;
  if (!db) throw new ProfileShadowError('PROFILE_SHADOW_D1_UNAVAILABLE');
  const ownerId = normalizeUuid(userId);
  const [sourcePublic, sourcePrivate] = await Promise.all([
    projectSourcePublicProfile(sourcePublicRow),
    projectSourcePrivateProfile(sourcePrivateRow),
  ]);
  const { publicRow, privateRow } = await d1RowsForOwner(db, ownerId);
  const missingD1 = Boolean((sourcePublic && !publicRow) || (sourcePrivate && !privateRow));
  const missingSource = Boolean((publicRow && !sourcePublic) || (privateRow && !sourcePrivate));
  const ownerMismatch = Boolean(
    (publicRow && publicRow.user_id !== ownerId) ||
    (privateRow && privateRow.user_id !== ownerId) ||
    (sourcePublic && sourcePublic.user_id !== ownerId) ||
    (sourcePrivate && sourcePrivate.user_id !== ownerId),
  );
  const hashMismatch = Boolean(
    (sourcePublic && publicRow && sourcePublic.canonical_hash !== publicRow.canonical_hash) ||
    (sourcePrivate && privateRow && sourcePrivate.canonical_hash !== privateRow.canonical_hash),
  );
  const invalidVersion = Boolean(
    (publicRow && (!Number.isInteger(publicRow.row_version) || publicRow.row_version < 1)) ||
    (privateRow && (!Number.isInteger(privateRow.row_version) || privateRow.row_version < 1)),
  );
  const invalidRelationship = Boolean(sourcePrivate && !sourcePublic);
  const match = !(missingD1 || missingSource || ownerMismatch || hashMismatch || invalidVersion || invalidRelationship);
  return {
    status: match ? 'match' : 'mismatch',
    metrics: metrics(match, missingD1, missingSource),
  };
};

export const observeProfileShadowRead = async (
  env: ProfileShadowEnv,
  userId: string,
  sourcePublicRow: SourceRow,
  sourcePrivateRow: SourceRow,
) => {
  try {
    const comparison = await compareProfileShadowRead(env, userId, sourcePublicRow, sourcePrivateRow);
    logComparison(comparison);
    return comparison;
  } catch {
    const comparison: ProfileShadowComparison = {
      status: 'shadow_read_failed',
      metrics: metrics(false, false, false),
    };
    logComparison(comparison);
    return comparison;
  }
};

export const isProfileD1ShadowReadEnabled = (env: ProfileShadowEnv) =>
  env.PROFILE_D1_SHADOW_READ_ENABLED === 'true';

export const isProfileD1ReadAuthority = (env: ProfileShadowEnv) =>
  String(env.PROFILE_READ_AUTHORITY || 'supabase').toLowerCase() === 'd1';

export const isProfileD1WriteAuthority = (env: ProfileShadowEnv) =>
  String(env.PROFILE_WRITE_AUTHORITY || 'supabase').toLowerCase() === 'd1';

const parseStoredJson = (value: string, expectedType: 'array' | 'object') => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (expectedType === 'array' ? Array.isArray(parsed) : isRecord(parsed)) return parsed;
  } catch {
    // Fail closed: an invalid authoritative D1 row must never trigger a Supabase fallback.
  }
  return fail('PROFILE_D1_AUTHORITY_JSON_INVALID');
};

export const readProfileD1Authority = async (env: ProfileShadowEnv, userId: string) => {
  const db = env.DB;
  if (!db) throw new ProfileShadowError('PROFILE_D1_AUTHORITY_UNAVAILABLE');
  const ownerId = normalizeUuid(userId);
  const [publicRow, privateRow] = await Promise.all([
    db.prepare(`SELECT user_id, full_name, avatar_url, bio, class_name,
      class_name_overridden, profile_tags_json, public_profile_enabled,
      show_profile_stats, public_gpa, public_completed_semesters, public_credits
      FROM user_profiles WHERE user_id = ?`).bind(ownerId).first<D1AuthorityPublicRow>(),
    db.prepare(`SELECT user_id, data_json, updated_at
      FROM user_profile_private WHERE user_id = ?`).bind(ownerId).first<D1AuthorityPrivateRow>(),
  ]);
  if (publicRow && normalizeUuid(publicRow.user_id) !== ownerId) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_OWNER_MISMATCH');
  }
  if (privateRow && normalizeUuid(privateRow.user_id) !== ownerId) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_OWNER_MISMATCH');
  }
  if (privateRow && !publicRow) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_RELATIONSHIP_INVALID');
  }
  console.log(JSON.stringify({
    event: 'profile_authoritative_read',
    authority: 'd1',
    metrics: {
      PROFILE_AUTHORITATIVE_READ_SUPABASE_CALLS: 0,
      PROFILE_READ_D1_CALLS: 2,
    },
  }));
  return {
    publicRow: publicRow ? {
      full_name: publicRow.full_name,
      avatar_url: publicRow.avatar_url,
      bio: publicRow.bio,
      class_name: publicRow.class_name,
      class_name_overridden: publicRow.class_name_overridden === 1,
      profile_tags: parseStoredJson(publicRow.profile_tags_json, 'array'),
      public_profile_enabled: publicRow.public_profile_enabled === 1,
      show_profile_stats: publicRow.show_profile_stats === 1,
      public_gpa: publicRow.public_gpa,
      public_completed_semesters: publicRow.public_completed_semesters,
      public_credits: publicRow.public_credits,
    } : null,
    privateRow: privateRow ? {
      data: parseStoredJson(privateRow.data_json, 'object'),
      updated_at: privateRow.updated_at,
    } : null,
  };
};

const AUTHORITY_PUBLIC_SELECT = `SELECT user_id, student_code, full_name, avatar_url, bio,
  class_name, class_name_overridden, profile_tags_json, public_profile_enabled,
  show_profile_stats, public_gpa, public_completed_semesters, public_credits,
  created_at, updated_at FROM user_profiles WHERE user_id = ?`;

const AUTHORITY_PRIVATE_SELECT = `SELECT user_id, data_json, student_name, cohort,
  major_name, specialization_name, program_name, semesters_json, target_gpa,
  total_credits_required, has_onboarded, lookback_seen_json, updated_at
  FROM user_profile_private WHERE user_id = ?`;

const jsonFromStored = (value: string | null, expectedType: 'array' | 'object') => {
  if (value === null) return null;
  return parseStoredJson(value, expectedType);
};

const authorityPublicAsSource = (row: D1AuthorityPublicRow) => ({
  id: row.user_id,
  student_code: row.student_code,
  full_name: row.full_name,
  avatar_url: row.avatar_url,
  bio: row.bio,
  class_name: row.class_name,
  class_name_overridden: row.class_name_overridden === 1,
  profile_tags: jsonFromStored(row.profile_tags_json, 'array'),
  public_profile_enabled: row.public_profile_enabled === 1,
  show_profile_stats: row.show_profile_stats === 1,
  public_gpa: row.public_gpa,
  public_completed_semesters: row.public_completed_semesters,
  public_credits: row.public_credits,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const authorityPrivateAsSource = (row: D1AuthorityPrivateRow) => ({
  user_id: row.user_id,
  data: jsonFromStored(row.data_json, 'object'),
  student_name: row.student_name,
  cohort: row.cohort,
  major_name: row.major_name,
  specialization_name: row.specialization_name,
  program_name: row.program_name,
  semesters: jsonFromStored(row.semesters_json, 'array'),
  target_gpa: row.target_gpa,
  total_credits_required: row.total_credits_required,
  has_onboarded: row.has_onboarded === null ? null : row.has_onboarded === 1,
  lookback_seen: jsonFromStored(row.lookback_seen_json, 'object'),
  updated_at: row.updated_at,
});

const hasSemesterSubjects = (value: unknown) => {
  if (!isRecord(value) || !Array.isArray(value.semesters)) return false;
  return value.semesters.some((semester) =>
    isRecord(semester) && Array.isArray(semester.subjects) && semester.subjects.length > 0);
};

export const canonicalizePrivateProfileSemesters = (
  existingData: unknown,
  incomingData: unknown,
) => {
  if (!isRecord(incomingData)) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_DATA_INVALID');
  }
  const canonicalIncoming = canonicalJsonValue(incomingData);
  if (!isRecord(canonicalIncoming)) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_DATA_INVALID');
  }
  const canonicalExisting = existingData === null || existingData === undefined
    ? null
    : canonicalJsonValue(existingData);
  if (canonicalExisting !== null && !isRecord(canonicalExisting)) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_DATA_INVALID');
  }

  // Match the authoritative Supabase guard: a sparse/empty client payload
  // cannot erase an existing transcript with subjects. The guarded data then
  // becomes the sole input for the derived semesters_json column in D1.
  const existingSemesters = isRecord(canonicalExisting) ? canonicalExisting.semesters : null;
  const data = hasSemesterSubjects(canonicalExisting) && !hasSemesterSubjects(canonicalIncoming)
    ? { ...canonicalIncoming, semesters: existingSemesters }
    : canonicalIncoming;
  const rawSemesters = Object.hasOwn(data, 'semesters') ? data.semesters : null;
  if (rawSemesters !== null && rawSemesters !== undefined && !Array.isArray(rawSemesters)) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_SEMESTERS_INVALID');
  }
  return {
    data: canonicalJsonValue(data) as Record<string, unknown>,
    semesters: rawSemesters === null || rawSemesters === undefined
      ? null
      : canonicalJsonValue(rawSemesters),
  };
};

export const writeProfileD1Authority = async (
  env: ProfileShadowEnv,
  input: {
    userId: string;
    email?: string;
    publicProfile: Record<string, unknown>;
    privateProfile: Record<string, unknown>;
    now?: string;
  },
) => {
  const db = env.DB;
  if (!db) throw new ProfileShadowError('PROFILE_D1_AUTHORITY_UNAVAILABLE');
  const ownerId = normalizeUuid(input.userId);
  const now = requiredTimestamp(input.now || new Date().toISOString());
  const [storedPublic, storedPrivate] = await Promise.all([
    db.prepare(AUTHORITY_PUBLIC_SELECT).bind(ownerId).first<D1AuthorityPublicRow>(),
    db.prepare(AUTHORITY_PRIVATE_SELECT).bind(ownerId).first<D1AuthorityPrivateRow>(),
  ]);
  if (storedPublic && normalizeUuid(storedPublic.user_id) !== ownerId) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_OWNER_MISMATCH');
  }
  if (storedPrivate && normalizeUuid(storedPrivate.user_id) !== ownerId) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_OWNER_MISMATCH');
  }
  if (storedPrivate && !storedPublic) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_RELATIONSHIP_INVALID');
  }

  const studentCode = input.email?.split('@')[0] || null;
  if (!storedPublic && !studentCode) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_EMAIL_REQUIRED');
  }
  const publicSource = {
    ...(storedPublic ? authorityPublicAsSource(storedPublic) : {
      id: ownerId,
      student_code: studentCode,
      full_name: studentCode || 'Sinh viên HUB',
      avatar_url: null,
      bio: null,
      class_name: null,
      class_name_overridden: false,
      profile_tags: [],
      public_profile_enabled: false,
      show_profile_stats: false,
      public_gpa: null,
      public_completed_semesters: null,
      public_credits: null,
      created_at: now,
      updated_at: now,
    }),
    ...input.publicProfile,
    id: ownerId,
    updated_at: now,
  };
  const publicProjection = await projectSourcePublicProfile(publicSource);
  if (!publicProjection || publicProjection.user_id !== ownerId) {
    throw new ProfileShadowError('PROFILE_D1_AUTHORITY_OWNER_INVALID');
  }

  let privateProjection: Awaited<ReturnType<typeof projectSourcePrivateProfile>> = null;
  let compatibilityPrivateProfile = input.privateProfile;
  if (Object.keys(input.privateProfile).length > 0) {
    const storedPrivateSource = storedPrivate ? authorityPrivateAsSource(storedPrivate) : null;
    const normalizedSemesters = Object.hasOwn(input.privateProfile, 'data')
      ? canonicalizePrivateProfileSemesters(storedPrivateSource?.data, input.privateProfile.data)
      : null;
    const privateSource = {
      ...(storedPrivateSource || {
        user_id: ownerId,
        data: {},
        student_name: null,
        cohort: null,
        major_name: null,
        specialization_name: null,
        program_name: null,
        semesters: null,
        target_gpa: null,
        total_credits_required: null,
        has_onboarded: null,
        lookback_seen: null,
        updated_at: now,
      }),
      ...input.privateProfile,
      ...(normalizedSemesters ? {
        data: normalizedSemesters.data,
        semesters: normalizedSemesters.semesters,
      } : {}),
      user_id: ownerId,
      updated_at: now,
    };
    privateProjection = await projectSourcePrivateProfile(privateSource);
    if (!privateProjection || privateProjection.user_id !== ownerId) {
      throw new ProfileShadowError('PROFILE_D1_AUTHORITY_OWNER_INVALID');
    }
    if (privateProjection.data_json === '{}' && storedPrivate?.data_json && storedPrivate.data_json !== '{}') {
      throw new ProfileShadowError('PROFILE_D1_AUTHORITY_EMPTY_PRIVATE_OVERWRITE_REJECTED');
    }
    if (normalizedSemesters) {
      compatibilityPrivateProfile = {
        ...input.privateProfile,
        data: normalizedSemesters.data,
      };
    }
  }

  const statements: D1PreparedStatement[] = [db.prepare(PUBLIC_UPSERT_SQL).bind(
    publicProjection.user_id,
    publicProjection.student_code,
    publicProjection.full_name,
    publicProjection.avatar_url,
    publicProjection.bio,
    publicProjection.class_name,
    publicProjection.class_name_overridden,
    publicProjection.profile_tags_json,
    publicProjection.public_profile_enabled,
    publicProjection.show_profile_stats,
    publicProjection.public_gpa,
    publicProjection.public_completed_semesters,
    publicProjection.public_credits,
    publicProjection.created_at,
    publicProjection.updated_at,
    publicProjection.canonical_hash,
  )];
  if (privateProjection) {
    statements.push(db.prepare(PRIVATE_UPSERT_SQL).bind(
      privateProjection.user_id,
      privateProjection.data_json,
      privateProjection.student_name,
      privateProjection.cohort,
      privateProjection.major_name,
      privateProjection.specialization_name,
      privateProjection.program_name,
      privateProjection.semesters_json,
      privateProjection.target_gpa,
      privateProjection.total_credits_required,
      privateProjection.has_onboarded,
      privateProjection.lookback_seen_json,
      privateProjection.updated_at,
      privateProjection.canonical_hash,
    ));
  }
  await db.batch(statements);
  console.log(JSON.stringify({
    event: 'profile_authoritative_write',
    authority: 'd1',
    metrics: {
      PROFILE_AUTHORITATIVE_WRITE_SUPABASE_CALLS: 0,
      PROFILE_AUTHORITATIVE_WRITE_D1_CALLS: statements.length,
    },
  }));
  return {
    status: 'written' as const,
    statements: statements.length,
    compatibilityPrivateProfile,
  };
};

export const isProfileD1ShadowWriteEnabled = (env: ProfileShadowEnv) =>
  env.PROFILE_D1_SHADOW_WRITE_ENABLED === 'true';

const ROLLOUT_LEVELS = new Set([0, 1, 5, 25, 100]);

export const getProfileShadowWritePercent = (env: ProfileShadowEnv) => {
  const raw = env.PROFILE_D1_SHADOW_WRITE_PERCENT;
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && ROLLOUT_LEVELS.has(value) ? value : 0;
};

export const getProfileShadowCohortBucket = (userId: string) => {
  const ownerId = normalizeUuid(userId);
  return Number.parseInt(ownerId.replaceAll('-', '').slice(0, 8), 16) % 100;
};

export const isProfileD1ShadowWriteEligible = (env: ProfileShadowEnv, userId: string) => {
  if (!isProfileD1ShadowWriteEnabled(env)) return false;
  const ownerId = normalizeUuid(userId);
  const canaryUserId = String(env.PROFILE_D1_SHADOW_CANARY_USER_ID || '').toLowerCase();
  if (UUID_PATTERN.test(canaryUserId) && timingSafeOwnerEqual(ownerId, canaryUserId)) return true;
  const percent = getProfileShadowWritePercent(env);
  if (percent !== null) return percent === 100 || getProfileShadowCohortBucket(ownerId) < percent;

  // Stage 4B compatibility only. Stage 4C always configures an explicit percent.
  return false;
};

const timingSafeOwnerEqual = (left: string, right: string) => {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
};

export type ProfileShadowWriter = 'worker_profile_api' | 'auth_edge' | 'courses_edge';
export type ProfileShadowWriteEvent =
  | 'source_write'
  | 'mirror_attempt'
  | 'mirror_success'
  | 'mirror_failure'
  | 'mirror_retry'
  | 'owner_rejection'
  | 'validation_rejection';

export const logProfileShadowWriteEvent = (
  event: ProfileShadowWriteEvent,
  writer: ProfileShadowWriter,
  attempt = 1,
) => {
  const level = event === 'mirror_failure' || event === 'owner_rejection' || event === 'validation_rejection'
    ? 'error'
    : 'log';
  console[level](JSON.stringify({
    event: `profile_shadow_${event}`,
    writer,
    attempt,
    metrics: {
      PROFILE_SOURCE_WRITES: event === 'source_write' ? 1 : 0,
      PROFILE_MIRROR_ATTEMPTS: event === 'mirror_attempt' ? 1 : 0,
      PROFILE_MIRROR_SUCCESSES: event === 'mirror_success' ? 1 : 0,
      PROFILE_MIRROR_FAILURES: event === 'mirror_failure' ? 1 : 0,
      PROFILE_MIRROR_RETRIES: event === 'mirror_retry' ? 1 : 0,
      PROFILE_OWNER_REJECTIONS: event === 'owner_rejection' ? 1 : 0,
      PROFILE_VALIDATION_REJECTIONS: event === 'validation_rejection' ? 1 : 0,
    },
  }));
};

const PUBLIC_UPSERT_SQL = `INSERT INTO user_profiles (
  user_id, student_code, full_name, avatar_url, bio, class_name,
  class_name_overridden, profile_tags_json, public_profile_enabled,
  show_profile_stats, public_gpa, public_completed_semesters, public_credits,
  created_at, updated_at, canonical_hash, row_version
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
ON CONFLICT(user_id) DO UPDATE SET
  student_code=excluded.student_code, full_name=excluded.full_name,
  avatar_url=excluded.avatar_url, bio=excluded.bio, class_name=excluded.class_name,
  class_name_overridden=excluded.class_name_overridden,
  profile_tags_json=excluded.profile_tags_json,
  public_profile_enabled=excluded.public_profile_enabled,
  show_profile_stats=excluded.show_profile_stats, public_gpa=excluded.public_gpa,
  public_completed_semesters=excluded.public_completed_semesters,
  public_credits=excluded.public_credits, created_at=excluded.created_at,
  updated_at=excluded.updated_at, canonical_hash=excluded.canonical_hash,
  row_version=user_profiles.row_version + 1
WHERE user_profiles.canonical_hash <> excluded.canonical_hash
  AND user_profiles.updated_at <= excluded.updated_at`;

const PRIVATE_UPSERT_SQL = `INSERT INTO user_profile_private (
  user_id, data_json, student_name, cohort, major_name, specialization_name,
  program_name, semesters_json, target_gpa, total_credits_required,
  has_onboarded, lookback_seen_json, updated_at, canonical_hash, row_version
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
ON CONFLICT(user_id) DO UPDATE SET
  data_json=excluded.data_json, student_name=excluded.student_name,
  cohort=excluded.cohort, major_name=excluded.major_name,
  specialization_name=excluded.specialization_name,
  program_name=excluded.program_name, semesters_json=excluded.semesters_json,
  target_gpa=excluded.target_gpa,
  total_credits_required=excluded.total_credits_required,
  has_onboarded=excluded.has_onboarded,
  lookback_seen_json=excluded.lookback_seen_json,
  updated_at=excluded.updated_at, canonical_hash=excluded.canonical_hash,
  row_version=user_profile_private.row_version + 1
WHERE user_profile_private.canonical_hash <> excluded.canonical_hash
  AND user_profile_private.updated_at <= excluded.updated_at`;

export const mirrorAuthoritativeProfileToD1 = async (
  env: ProfileShadowEnv,
  userId: string,
  sourcePublicRow: SourceRow,
  sourcePrivateRow: SourceRow,
) => {
  // Transitional only: Supabase remains authoritative. This writes a D1
  // SHADOW MIRROR and must never be used as an authority selector.
  if (!isProfileD1ShadowWriteEnabled(env)) return { status: 'disabled' as const };
  const db = env.DB;
  if (!db) throw new ProfileShadowError('PROFILE_SHADOW_D1_UNAVAILABLE');
  const ownerId = normalizeUuid(userId);
  const [publicProjection, privateProjection] = await Promise.all([
    projectSourcePublicProfile(sourcePublicRow),
    projectSourcePrivateProfile(sourcePrivateRow),
  ]);
  if (!publicProjection) {
    if (privateProjection) throw new ProfileShadowError('PROFILE_SHADOW_OWNER_RELATIONSHIP_INVALID');
    return { status: 'no_source_profile' as const };
  }
  if (publicProjection.user_id !== ownerId || privateProjection?.user_id !== ownerId && privateProjection !== null) {
    throw new ProfileShadowError('PROFILE_SHADOW_OWNER_INVALID');
  }

  if (privateProjection?.data_json === '{}') {
    const existing = await db.prepare(
      'SELECT data_json FROM user_profile_private WHERE user_id = ?',
    ).bind(ownerId).first<{ data_json: string }>();
    if (existing?.data_json && existing.data_json !== '{}') {
      throw new ProfileShadowError('PROFILE_SHADOW_EMPTY_PRIVATE_OVERWRITE_REJECTED');
    }
  }

  const statements: D1PreparedStatement[] = [db.prepare(PUBLIC_UPSERT_SQL).bind(
    publicProjection.user_id,
    publicProjection.student_code,
    publicProjection.full_name,
    publicProjection.avatar_url,
    publicProjection.bio,
    publicProjection.class_name,
    publicProjection.class_name_overridden,
    publicProjection.profile_tags_json,
    publicProjection.public_profile_enabled,
    publicProjection.show_profile_stats,
    publicProjection.public_gpa,
    publicProjection.public_completed_semesters,
    publicProjection.public_credits,
    publicProjection.created_at,
    publicProjection.updated_at,
    publicProjection.canonical_hash,
  )];
  if (privateProjection) {
    statements.push(db.prepare(PRIVATE_UPSERT_SQL).bind(
      privateProjection.user_id,
      privateProjection.data_json,
      privateProjection.student_name,
      privateProjection.cohort,
      privateProjection.major_name,
      privateProjection.specialization_name,
      privateProjection.program_name,
      privateProjection.semesters_json,
      privateProjection.target_gpa,
      privateProjection.total_credits_required,
      privateProjection.has_onboarded,
      privateProjection.lookback_seen_json,
      privateProjection.updated_at,
      privateProjection.canonical_hash,
    ));
  }
  await db.batch(statements);
  return { status: 'mirrored' as const };
};

export const logProfileShadowMirrorFailure = () => {
  console.error(JSON.stringify({
    event: 'profile_shadow_mirror_failed',
    metrics: { PROFILE_SHADOW_MIRROR_FAILURE: 1 },
  }));
};
