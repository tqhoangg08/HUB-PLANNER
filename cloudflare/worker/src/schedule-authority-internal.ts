import {
  cleanupD1UserSchedulesForAccount,
  updateD1UserScheduleCustomDataFromInternal,
} from './d1-user-schedule-mutations.ts';
import { parseUserScheduleId, UserScheduleError } from './user-schedules.ts';

export interface ScheduleAuthorityInternalEnv {
  DB: D1Database;
  SCHEDULE_D1_INTERNAL_ENABLED?: string;
  SCHEDULE_D1_INTERNAL_SECRET?: string;
  PROFILE_D1_SHADOW_MIRROR_SECRET?: string;
  SCHEDULE_WRITE_MODE?: string;
}

type InternalStatus = 400 | 401 | 404 | 405 | 413 | 503;

export class ScheduleAuthorityInternalError extends Error {
  readonly status: InternalStatus;
  constructor(status: InternalStatus, message: string) {
    super(message);
    this.name = 'ScheduleAuthorityInternalError';
    this.status = status;
  }
}

const MAX_BODY_BYTES = 272 * 1024;
const MAX_CLOCK_SKEW_SECONDS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const encoder = new TextEncoder();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const bytesToHex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const hmacHex = async (secret: string, body: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body))));
};

const timingSafeEqual = (left: string, right: string) => {
  if (!HEX_SHA256_PATTERN.test(left) || !HEX_SHA256_PATTERN.test(right)) return false;
  const a = encoder.encode(left.toLowerCase());
  const b = encoder.encode(right.toLowerCase());
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
};

const authenticate = async (request: Request, secret: string, body: string, now: number) => {
  const timestamp = request.headers.get('X-Hub-Schedule-Internal-Timestamp') || '';
  const nonce = request.headers.get('X-Hub-Schedule-Internal-Nonce') || '';
  const provided = request.headers.get('X-Hub-Schedule-Internal-Signature') || '';
  const seconds = Number(timestamp);
  if (!/^\d{10}$/.test(timestamp) || !Number.isSafeInteger(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > MAX_CLOCK_SKEW_SECONDS || !UUID_PATTERN.test(nonce) || !HEX_SHA256_PATTERN.test(provided)) {
    throw new ScheduleAuthorityInternalError(401, 'Unauthorized.');
  }
  const expected = await hmacHex(secret, `${timestamp}.${nonce}.${body}`);
  if (!timingSafeEqual(expected, provided)) throw new ScheduleAuthorityInternalError(401, 'Unauthorized.');
};

export const handleScheduleAuthorityInternal = async (
  request: Request,
  env: ScheduleAuthorityInternalEnv,
  now = Date.now(),
) => {
  if (env.SCHEDULE_D1_INTERNAL_ENABLED !== 'true') throw new ScheduleAuthorityInternalError(404, 'Not found.');
  if (env.SCHEDULE_WRITE_MODE !== 'd1') throw new ScheduleAuthorityInternalError(503, 'Schedule authority unavailable.');
  if (request.method !== 'POST') throw new ScheduleAuthorityInternalError(405, 'Method not allowed.');
  const secret = String(env.SCHEDULE_D1_INTERNAL_SECRET || env.PROFILE_D1_SHADOW_MIRROR_SECRET || '');
  if (secret.length < 32) throw new ScheduleAuthorityInternalError(503, 'Schedule authority unavailable.');
  const declaredLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new ScheduleAuthorityInternalError(413, 'Payload too large.');
  const body = await request.text();
  if (encoder.encode(body).byteLength > MAX_BODY_BYTES) throw new ScheduleAuthorityInternalError(413, 'Payload too large.');
  await authenticate(request, secret, body, now);
  let payload: unknown;
  try { payload = JSON.parse(body) as unknown; } catch { throw new ScheduleAuthorityInternalError(400, 'Invalid payload.'); }
  if (!isRecord(payload)) throw new ScheduleAuthorityInternalError(400, 'Invalid payload.');
  if (
    Object.keys(payload).every((key) => ['writer', 'operation', 'userId'].includes(key)) &&
    payload.writer === 'auth_edge' &&
    payload.operation === 'delete_user_schedules' &&
    typeof payload.userId === 'string' && UUID_PATTERN.test(payload.userId)
  ) {
    return cleanupD1UserSchedulesForAccount(env, payload.userId.toLowerCase());
  }
  if (
    Object.keys(payload).every((key) => ['writer', 'operation', 'userId', 'scheduleId'].includes(key)) &&
    payload.writer === 'courses_edge' &&
    payload.operation === 'authorize_user_schedule_custom_data' &&
    typeof payload.userId === 'string' && UUID_PATTERN.test(payload.userId) &&
    typeof payload.scheduleId === 'string' && UUID_PATTERN.test(payload.scheduleId)
  ) {
    const row = await env.DB.prepare('SELECT id FROM user_schedules WHERE id = ? AND user_id = ?')
      .bind(parseUserScheduleId(payload.scheduleId), parseUserScheduleId(payload.userId))
      .first<{ id: string }>();
    if (!row) throw new ScheduleAuthorityInternalError(400, 'Invalid payload.');
    return { success: true };
  }
  if (
    Object.keys(payload).every((key) => ['writer', 'operation', 'userId', 'scheduleId', 'customData', 'idempotencyKey'].includes(key)) &&
    payload.writer === 'courses_edge' &&
    payload.operation === 'update_user_schedule_custom_data' &&
    typeof payload.userId === 'string' && UUID_PATTERN.test(payload.userId) &&
    typeof payload.scheduleId === 'string' && UUID_PATTERN.test(payload.scheduleId) &&
    isRecord(payload.customData) &&
    typeof payload.idempotencyKey === 'string'
  ) {
    const owner = parseUserScheduleId(payload.userId);
    const scheduleId = parseUserScheduleId(payload.scheduleId);
    const row = await env.DB.prepare('SELECT id FROM user_schedules WHERE id = ? AND user_id = ?')
      .bind(scheduleId, owner)
      .first<{ id: string }>();
    if (!row) throw new ScheduleAuthorityInternalError(400, 'Invalid payload.');
    try {
      return await updateD1UserScheduleCustomDataFromInternal(env, {
        userId: owner,
        scheduleId,
        customData: payload.customData,
        idempotencyKey: payload.idempotencyKey,
      });
    } catch (error) {
      if (error instanceof UserScheduleError && error.status < 500) {
        throw new ScheduleAuthorityInternalError(400, 'Invalid payload.');
      }
      throw error;
    }
  }
  throw new ScheduleAuthorityInternalError(400, 'Invalid payload.');
};

export const scheduleAuthorityInternalErrorStatus = (error: unknown) =>
  error instanceof ScheduleAuthorityInternalError ? error.status : 500;
