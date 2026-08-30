import {
  readProfileD1Authority,
  writeProfileD1Authority,
  type ProfileShadowEnv,
} from './profile-shadow.ts';

export interface ProfileAuthorityInternalEnv extends ProfileShadowEnv {
  PROFILE_D1_SHADOW_INTERNAL_ENABLED?: string;
  PROFILE_D1_SHADOW_MIRROR_SECRET?: string;
}

type InternalStatus = 400 | 401 | 403 | 404 | 405 | 413 | 503;

export class ProfileAuthorityInternalError extends Error {
  readonly status: InternalStatus;

  constructor(status: InternalStatus, message: string) {
    super(message);
    this.name = 'ProfileAuthorityInternalError';
    this.status = status;
  }
}

const MAX_BODY_BYTES = 32 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;
const MAX_MAP_USERS = 200;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const SCHOOL_EMAIL_PATTERN = /^[a-z0-9._-]{3,64}@st\.buh\.edu\.vn$/i;
const encoder = new TextEncoder();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeUserId = (value: unknown) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ProfileAuthorityInternalError(400, 'Invalid payload.');
  }
  return value.toLowerCase();
};

const bytesToHex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const hmacHex = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToHex(new Uint8Array(signature));
};

const timingSafeHexEqual = (left: string, right: string) => {
  if (!HEX_SHA256_PATTERN.test(left) || !HEX_SHA256_PATTERN.test(right)) return false;
  const a = encoder.encode(left.toLowerCase());
  const b = encoder.encode(right.toLowerCase());
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    difference |= (a[index] || 0) ^ (b[index] || 0);
  }
  return difference === 0;
};

const readBoundedBody = async (request: Request) => {
  const declared = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ProfileAuthorityInternalError(413, 'Payload too large.');
  }
  const body = await request.text();
  if (encoder.encode(body).byteLength > MAX_BODY_BYTES) {
    throw new ProfileAuthorityInternalError(413, 'Payload too large.');
  }
  return body;
};

const authenticateInternalRequest = async (
  request: Request,
  secret: string,
  body: string,
  now: number,
) => {
  const timestamp = request.headers.get('X-Hub-Profile-Mirror-Timestamp') || '';
  const nonce = request.headers.get('X-Hub-Profile-Mirror-Nonce') || '';
  const provided = request.headers.get('X-Hub-Profile-Mirror-Signature') || '';
  const seconds = Number(timestamp);
  if (
    !/^\d{10}$/.test(timestamp)
    || !Number.isSafeInteger(seconds)
    || Math.abs(Math.floor(now / 1_000) - seconds) > MAX_CLOCK_SKEW_SECONDS
    || !UUID_PATTERN.test(nonce)
    || !HEX_SHA256_PATTERN.test(provided)
  ) throw new ProfileAuthorityInternalError(401, 'Unauthorized.');
  const expected = await hmacHex(secret, `${timestamp}.${nonce}.${body}`);
  if (!timingSafeHexEqual(expected, provided)) {
    throw new ProfileAuthorityInternalError(401, 'Unauthorized.');
  }
};

type AuthorityOperation =
  | { writer: 'auth_edge'; operation: 'ensure_student_profile'; userId: string; email: string }
  | { writer: 'auth_edge'; operation: 'delete_profile'; userId: string }
  | { writer: 'auth_edge'; operation: 'resolve_student_identity'; studentCode: string }
  | { writer: 'courses_edge'; operation: 'read_profile_map'; userIds: string[] };

const parseOperation = (bodyText: string): AuthorityOperation => {
  let value: unknown;
  try {
    value = JSON.parse(bodyText) as unknown;
  } catch {
    throw new ProfileAuthorityInternalError(400, 'Invalid payload.');
  }
  if (!isRecord(value)) throw new ProfileAuthorityInternalError(400, 'Invalid payload.');
  const writer = value.writer;
  const operation = value.operation;
  if (writer === 'auth_edge' && operation === 'ensure_student_profile') {
    if (Object.keys(value).some((key) => !['writer', 'operation', 'userId', 'email'].includes(key))) {
      throw new ProfileAuthorityInternalError(400, 'Invalid payload.');
    }
    const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
    if (!SCHOOL_EMAIL_PATTERN.test(email)) throw new ProfileAuthorityInternalError(400, 'Invalid payload.');
    return { writer, operation, userId: normalizeUserId(value.userId), email };
  }
  if (writer === 'auth_edge' && operation === 'delete_profile') {
    if (Object.keys(value).some((key) => !['writer', 'operation', 'userId'].includes(key))) {
      throw new ProfileAuthorityInternalError(400, 'Invalid payload.');
    }
    return { writer, operation, userId: normalizeUserId(value.userId) };
  }
  if (writer === 'auth_edge' && operation === 'resolve_student_identity') {
    if (Object.keys(value).some((key) => !['writer', 'operation', 'studentCode'].includes(key))) {
      throw new ProfileAuthorityInternalError(400, 'Invalid payload.');
    }
    const studentCode = typeof value.studentCode === 'string'
      ? value.studentCode.trim().toLowerCase()
      : '';
    if (!/^[a-z0-9._-]{3,64}$/.test(studentCode)) {
      throw new ProfileAuthorityInternalError(400, 'Invalid payload.');
    }
    return { writer, operation, studentCode };
  }
  if (writer === 'courses_edge' && operation === 'read_profile_map') {
    if (Object.keys(value).some((key) => !['writer', 'operation', 'userIds'].includes(key))) {
      throw new ProfileAuthorityInternalError(400, 'Invalid payload.');
    }
    if (!Array.isArray(value.userIds) || value.userIds.length > MAX_MAP_USERS) {
      throw new ProfileAuthorityInternalError(400, 'Invalid payload.');
    }
    return { writer, operation, userIds: [...new Set(value.userIds.map(normalizeUserId))] };
  }
  throw new ProfileAuthorityInternalError(403, 'Forbidden.');
};

export const handleProfileAuthorityInternal = async (
  request: Request,
  env: ProfileAuthorityInternalEnv,
  now = Date.now(),
) => {
  if (env.PROFILE_D1_SHADOW_INTERNAL_ENABLED !== 'true') {
    throw new ProfileAuthorityInternalError(404, 'Not found.');
  }
  if (request.method !== 'POST') throw new ProfileAuthorityInternalError(405, 'Method not allowed.');
  const secret = String(env.PROFILE_D1_SHADOW_MIRROR_SECRET || '');
  if (secret.length < 32) throw new ProfileAuthorityInternalError(503, 'Profile authority unavailable.');
  const body = await readBoundedBody(request);
  await authenticateInternalRequest(request, secret, body, now);
  const operation = parseOperation(body);

  if (operation.operation === 'ensure_student_profile') {
    const existing = await readProfileD1Authority(env, operation.userId);
    if (!existing.publicRow) {
      await writeProfileD1Authority(env, {
        userId: operation.userId,
        email: operation.email,
        publicProfile: {},
        privateProfile: {},
      });
    }
    return { success: true };
  }

  if (operation.operation === 'delete_profile') {
    if (!env.DB) throw new ProfileAuthorityInternalError(503, 'Profile authority unavailable.');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM user_profile_private WHERE user_id = ?').bind(operation.userId),
      env.DB.prepare('DELETE FROM user_profiles WHERE user_id = ?').bind(operation.userId),
    ]);
    return { success: true };
  }

  if (operation.operation === 'resolve_student_identity') {
    if (!env.DB) throw new ProfileAuthorityInternalError(503, 'Profile authority unavailable.');
    const row = await env.DB.prepare(
      'SELECT user_id, student_code FROM user_profiles WHERE student_code = ?',
    ).bind(operation.studentCode).first<{ user_id: string; student_code: string }>();
    if (!row || !UUID_PATTERN.test(row.user_id) || row.student_code !== operation.studentCode) {
      throw new ProfileAuthorityInternalError(404, 'Not found.');
    }
    return {
      success: true,
      data: {
        userId: row.user_id.toLowerCase(),
        email: `${row.student_code}@st.buh.edu.vn`,
      },
    };
  }

  if (!env.DB) throw new ProfileAuthorityInternalError(503, 'Profile authority unavailable.');
  const rows = await Promise.all(operation.userIds.map(async (userId) => {
    const row = await env.DB!.prepare(
      'SELECT user_id, student_code, full_name FROM user_profiles WHERE user_id = ?',
    ).bind(userId).first<{ user_id: string; student_code: string | null; full_name: string | null }>();
    if (!row || row.user_id.toLowerCase() !== userId) return null;
    return {
      id: userId,
      full_name: row.full_name,
      student_code: row.student_code,
      email: row.student_code ? `${row.student_code}@st.buh.edu.vn` : null,
    };
  }));
  return { success: true, data: rows.filter(Boolean) };
};

export const profileAuthorityInternalErrorStatus = (error: unknown) =>
  error instanceof ProfileAuthorityInternalError ? error.status : 500;
