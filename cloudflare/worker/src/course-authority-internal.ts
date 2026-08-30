import { cleanupD1CourseRequestsForAccount, readCourseWriteAuthority, rebuildD1CourseFacets, type CourseAuthorityEnv } from './course-authority.ts';
import { applyD1ScraperInstructorUpdates, diagnoseD1ScraperItemEight, diagnoseD1ScraperItemEightV2, diagnoseD1ScraperRequestMix, probeD1ScraperPrintTransport, probeD1ScraperRequestContracts, probeD1ScraperUpstream, runD1InstructorScraper, scraperDiagnosticFromError, type CourseScraperAuthorityEnv } from './course-scraper-authority.ts';

export interface CourseAuthorityInternalEnv extends CourseScraperAuthorityEnv {
  COURSE_D1_INTERNAL_ENABLED?: string;
  COURSE_D1_INTERNAL_SECRET?: string;
  SCHEDULE_D1_INTERNAL_SECRET?: string;
}

export class CourseAuthorityInternalError extends Error {
  readonly status: 400 | 401 | 404 | 405 | 413 | 503;
  constructor(status: 400 | 401 | 404 | 405 | 413 | 503, message: string) { super(message); this.status = status; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{64}$/i;
const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) => [...bytes].map((part) => part.toString(16).padStart(2, '0')).join('');
const sign = async (secret: string, value: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
};
const equal = (left: string, right: string) => {
  if (!HEX.test(left) || !HEX.test(right)) return false;
  let result = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) result |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return result === 0;
};

export const handleCourseAuthorityInternal = async (request: Request, env: CourseAuthorityInternalEnv, now = Date.now()) => {
  if (env.COURSE_D1_INTERNAL_ENABLED !== 'true') throw new CourseAuthorityInternalError(404, 'Not found.');
  if (readCourseWriteAuthority(env) !== 'd1') throw new CourseAuthorityInternalError(503, 'Course authority unavailable.');
  if (request.method !== 'POST') throw new CourseAuthorityInternalError(405, 'Method not allowed.');
  const secret = String(env.COURSE_D1_INTERNAL_SECRET || env.SCHEDULE_D1_INTERNAL_SECRET || '');
  if (secret.length < 32) throw new CourseAuthorityInternalError(503, 'Course authority unavailable.');
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > 4096) throw new CourseAuthorityInternalError(413, 'Payload too large.');
  const timestamp = String(request.headers.get('X-Hub-Course-Internal-Timestamp') || '');
  const nonce = String(request.headers.get('X-Hub-Course-Internal-Nonce') || '');
  const signature = String(request.headers.get('X-Hub-Course-Internal-Signature') || '');
  const seconds = Number(timestamp);
  if (!/^\d{10}$/.test(timestamp) || !UUID.test(nonce) || !Number.isSafeInteger(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > 300 || !equal(signature, await sign(secret, `${timestamp}.${nonce}.${raw}`))) {
    throw new CourseAuthorityInternalError(401, 'Unauthorized.');
  }
  let body: unknown;
  try { body = JSON.parse(raw) as unknown; } catch { throw new CourseAuthorityInternalError(400, 'Invalid payload.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CourseAuthorityInternalError(400, 'Invalid payload.');
  const payload = body as Record<string, unknown>;
  if (Object.keys(payload).every((key) => ['writer', 'operation', 'userId'].includes(key)) && payload.writer === 'auth_edge' && payload.operation === 'delete_user_course_requests' && typeof payload.userId === 'string' && UUID.test(payload.userId)) {
    return cleanupD1CourseRequestsForAccount(env, payload.userId.toLowerCase());
  }
  if (
    Object.keys(payload).every((key) => ['writer', 'operation', 'runId', 'updates'].includes(key)) &&
    payload.writer === 'scraper' && payload.operation === 'apply_instructor_updates' &&
    typeof payload.runId === 'string' && UUID.test(payload.runId) && Array.isArray(payload.updates)
  ) {
    return applyD1ScraperInstructorUpdates(env, payload.runId, payload.updates as Array<{ courseId: string; instructor: string }>);
  }
  if (
    Object.keys(payload).every((key) => ['writer', 'operation', 'runId'].includes(key)) &&
    payload.writer === 'scraper' && payload.operation === 'scrape_instructors' &&
    typeof payload.runId === 'string' && UUID.test(payload.runId)
  ) {
    return runD1InstructorScraper(env, payload.runId);
  }
  if (
    Object.keys(payload).every((key) => ['writer', 'operation'].includes(key)) &&
    payload.writer === 'scraper' && payload.operation === 'probe_upstream'
  ) {
    return probeD1ScraperUpstream(env);
  }
  if (
    Object.keys(payload).every((key) => ['writer', 'operation'].includes(key)) &&
    payload.writer === 'scraper' && payload.operation === 'probe_request_contracts'
  ) {
    return probeD1ScraperRequestContracts(env);
  }
  if (
    Object.keys(payload).every((key) => ['writer', 'operation'].includes(key)) &&
    payload.writer === 'scraper' && payload.operation === 'probe_print_transport'
  ) {
    return probeD1ScraperPrintTransport(env);
  }
  if (
    Object.keys(payload).every((key) => ['writer', 'operation'].includes(key)) &&
    payload.writer === 'scraper' && payload.operation === 'diagnose_item_eight'
  ) {
    return diagnoseD1ScraperItemEight(env);
  }
  if (
    Object.keys(payload).every((key) => ['writer', 'operation'].includes(key)) &&
    payload.writer === 'scraper' && payload.operation === 'diagnose_item_eight_v2'
  ) {
    return diagnoseD1ScraperItemEightV2(env);
  }
  if (
    Object.keys(payload).every((key) => ['writer', 'operation'].includes(key)) && payload.writer === 'scraper' && payload.operation === 'diagnose_request_mix'
  ) return diagnoseD1ScraperRequestMix(env);
  if (
    Object.keys(payload).every((key) => ['writer', 'operation'].includes(key)) && payload.writer === 'scraper' && payload.operation === 'diagnose_request_mix_1s'
  ) return diagnoseD1ScraperRequestMix(env, fetch, 1_000, 1, 8_000);
  if (
    Object.keys(payload).every((key) => ['writer', 'operation'].includes(key)) && payload.writer === 'scraper' && payload.operation === 'diagnose_request_mix_3s'
  ) return diagnoseD1ScraperRequestMix(env, fetch, 3_000, 1, 8_000);
  if (
    Object.keys(payload).every((key) => ['writer', 'operation'].includes(key)) &&
    payload.writer === 'system' && payload.operation === 'rebuild_course_facets'
  ) {
    return rebuildD1CourseFacets(env);
  }
  throw new CourseAuthorityInternalError(400, 'Invalid payload.');
};

export const courseAuthorityInternalErrorStatus = (error: unknown) =>
  error instanceof CourseAuthorityInternalError ? error.status :
    error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500;

export const courseAuthorityInternalScraperDiagnostic = (error: unknown) => scraperDiagnosticFromError(error);
