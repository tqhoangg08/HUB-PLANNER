import {
  mirrorProfileOwnerFromAuthoritativeSourceWithRetry,
  type PrivateProfileEnv,
} from './private-profile.ts';
import {
  getProfileShadowWritePercent,
  isProfileD1ShadowWriteEligible,
  type ProfileShadowWriter,
} from './profile-shadow.ts';

export interface ProfileShadowInternalEnv extends PrivateProfileEnv {
  PROFILE_D1_SHADOW_INTERNAL_ENABLED?: string;
  PROFILE_D1_SHADOW_MIRROR_SECRET?: string;
  PROFILE_D1_SHADOW_CANARY_USER_ID?: string;
}

type ProfileShadowInternalStatus = 400 | 401 | 403 | 404 | 405 | 413 | 503;

export class ProfileShadowInternalError extends Error {
  readonly status: ProfileShadowInternalStatus;

  constructor(status: ProfileShadowInternalStatus, message: string) {
    super(message);
    this.name = 'ProfileShadowInternalError';
    this.status = status;
  }
}

const MAX_BODY_BYTES = 512;
const MAX_CLOCK_SKEW_SECONDS = 300;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const encoder = new TextEncoder();

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
  const leftBytes = encoder.encode(left.toLowerCase());
  const rightBytes = encoder.encode(right.toLowerCase());
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
};

const timingSafeTextEqual = (left: string, right: string) => {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return difference === 0;
};

const readBoundedBody = async (request: Request) => {
  const declared = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ProfileShadowInternalError(413, 'Payload too large.');
  }
  if (!request.body) throw new ProfileShadowInternalError(400, 'Invalid payload.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new ProfileShadowInternalError(413, 'Payload too large.');
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
};

const WRITERS = new Set<ProfileShadowWriter>(['auth_edge', 'courses_edge']);

const parsePayload = (bodyText: string) => {
  let body: unknown;
  try {
    body = JSON.parse(bodyText) as unknown;
  } catch {
    throw new ProfileShadowInternalError(400, 'Invalid payload.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ProfileShadowInternalError(400, 'Invalid payload.');
  }
  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length !== 2 || !Object.hasOwn(body, 'userId') || !Object.hasOwn(body, 'writer')) {
    throw new ProfileShadowInternalError(400, 'Invalid payload.');
  }
  const userId = (body as Record<string, unknown>).userId;
  const writer = (body as Record<string, unknown>).writer;
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
    throw new ProfileShadowInternalError(400, 'Invalid payload.');
  }
  if (typeof writer !== 'string' || !WRITERS.has(writer as ProfileShadowWriter)) {
    throw new ProfileShadowInternalError(400, 'Invalid payload.');
  }
  return { userId: userId.toLowerCase(), writer: writer as ProfileShadowWriter };
};

export const handleProfileShadowInternalMirror = async (
  request: Request,
  env: ProfileShadowInternalEnv,
  now = Date.now(),
) => {
  if (env.PROFILE_D1_SHADOW_INTERNAL_ENABLED !== 'true') {
    throw new ProfileShadowInternalError(404, 'Not found.');
  }
  if (request.method !== 'POST') {
    throw new ProfileShadowInternalError(405, 'Method not allowed.');
  }
  const secret = String(env.PROFILE_D1_SHADOW_MIRROR_SECRET || '');
  const hasStage4cPercent = getProfileShadowWritePercent(env) !== null;
  const canaryUserId = String(env.PROFILE_D1_SHADOW_CANARY_USER_ID || '').toLowerCase();
  if (secret.length < 32 || (!hasStage4cPercent && !UUID_PATTERN.test(canaryUserId))) {
    throw new ProfileShadowInternalError(503, 'Mirror unavailable.');
  }

  const timestamp = request.headers.get('X-Hub-Profile-Mirror-Timestamp') || '';
  const nonce = request.headers.get('X-Hub-Profile-Mirror-Nonce') || '';
  const providedSignature = request.headers.get('X-Hub-Profile-Mirror-Signature') || '';
  const timestampSeconds = Number(timestamp);
  if (
    !/^\d{10}$/.test(timestamp) ||
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(Math.floor(now / 1_000) - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS ||
    !UUID_PATTERN.test(nonce) ||
    !HEX_SHA256_PATTERN.test(providedSignature)
  ) {
    throw new ProfileShadowInternalError(401, 'Unauthorized.');
  }

  const bodyText = await readBoundedBody(request);
  const expectedSignature = await hmacHex(secret, `${timestamp}.${nonce}.${bodyText}`);
  if (!timingSafeHexEqual(expectedSignature, providedSignature)) {
    throw new ProfileShadowInternalError(401, 'Unauthorized.');
  }

  const { userId, writer } = parsePayload(bodyText);
  const eligible = hasStage4cPercent
    ? isProfileD1ShadowWriteEligible(env, userId)
    : timingSafeTextEqual(userId, canaryUserId);
  if (!eligible) {
    throw new ProfileShadowInternalError(403, 'Forbidden.');
  }
  const result = await mirrorProfileOwnerFromAuthoritativeSourceWithRetry(env, userId, writer);
  if (result.status === 'disabled') {
    throw new ProfileShadowInternalError(503, 'Mirror unavailable.');
  }
  return { success: true, mirrorStatus: result.status };
};

export const profileShadowInternalErrorStatus = (error: unknown) =>
  error instanceof ProfileShadowInternalError ? error.status : 500;
