import { CourseAuthorityError, readCourseWriteAuthority, type CourseAuthorityEnv } from './course-authority.ts';

export interface CourseScraperAuthorityEnv extends CourseAuthorityEnv {
  COURSE_SCRAPER_INTERNAL_ENABLED?: string;
  COURSE_SCRAPER_UPSTREAM_COOKIE?: string;
}

export interface ScraperInstructorUpdate { courseId: string; instructor: string; }
export interface ScraperRunResult {
  success: true;
  changed: boolean;
  attempted: number;
  updated: number;
  skippedAdmin: number;
  conflicts: number;
  transportRetryEvents: number;
  requestsRecoveredByRetry: number;
  requestsExhaustedRetries: number;
}

export type ScraperEndpointKind = 'LIST_STUDENTS' | 'PRINT' | 'OTHER';
export type ScraperErrorClass =
  | 'UPSTREAM_HTTP_ERROR'
  | 'UPSTREAM_REDIRECT_ERROR'
  | 'UPSTREAM_LOGIN_DETECTED'
  | 'UPSTREAM_NETWORK_ERROR'
  | 'UNEXPECTED_CONTENT_TYPE'
  | 'LIST_PAGE_PARSE_ERROR'
  | 'PRINT_PAGE_PARSE_ERROR'
  | 'COURSE_MAPPING_ERROR'
  | 'D1_CONFLICT'
  | 'OTHER';

/** Metadata safe to return from the signed internal scraper route. */
export interface ScraperDiagnostic {
  itemIndex: number;
  endpointKind: ScraperEndpointKind;
  method: 'GET';
  status: number | null;
  redirectCount: number;
  finalPath: string | null;
  contentType: string | null;
  responseBytes: number | null;
  parserStage: string;
  errorClass: ScraperErrorClass;
  retryAttempt: number;
  loginMarkerDetected: boolean;
}

export class ScraperDiagnosticError extends CourseAuthorityError {
  readonly diagnostic: ScraperDiagnostic;
  constructor(diagnostic: ScraperDiagnostic) {
    // The detailed, but sanitized, classification is exposed separately to
    // the signed internal caller.  The public HTTP status remains fail-closed.
    super(503, 'Course scraper request failed.');
    this.diagnostic = diagnostic;
  }
}

export const scraperDiagnosticFromError = (error: unknown) =>
  error instanceof ScraperDiagnosticError ? error.diagnostic : null;

/**
 * Isolated diagnostic result. This is intentionally metadata-only: it never
 * persists a receipt, course update, or outbox entry.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const hash = async (value: unknown) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
};

const parseUpdates = (updates: ScraperInstructorUpdate[]) => {
  if (!Array.isArray(updates) || updates.length > 100) throw new CourseAuthorityError(400, 'Invalid scraper input.');
  const seen = new Set<string>();
  return updates.map((item) => {
    const courseId = text(item?.courseId).toLowerCase();
    const instructor = text(item?.instructor);
    if (!UUID.test(courseId) || !instructor || instructor.length > 160 || seen.has(courseId)) {
      throw new CourseAuthorityError(400, 'Invalid scraper input.');
    }
    seen.add(courseId);
    return { courseId, instructor };
  });
};

const decodeHtml = (value: string) => value
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();

const tableRows = (html: string) => [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
  .map((row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => decodeHtml(cell[1])));

const scheduleStudyUnitUrls = (courseCode: string) => {
  const parts = courseCode.split('_').filter(Boolean);
  const encoded = encodeURIComponent(courseCode);
  if (courseCode.startsWith('GYM') && parts.length >= 3) {
    return [
      `${parts[0]}_${parts[1]}_1_${parts.at(-1)}`,
      `${parts[0]}_${parts[1]}_2_${parts.at(-1)}`,
      encoded,
    ];
  }
  if (parts.length >= 3) {
    const rest = parts.slice(2).join('_');
    return [
      `${parts[0]}_${parts[1]}_1_${rest}`,
      `${parts[0]}_${parts[1]}1_1_${rest}`,
      `${parts[0]}_${parts[1]}_2_${rest}`,
      `${parts[0]}_${parts[1]}2_2_${rest}`,
      encoded,
    ];
  }
  return [encoded];
};

const parseAcademicPeriod = (semester: string) => {
  const match = semester.match(/^HK\s*([12])\D+(20\d{2})[_-](20\d{2})$/i);
  if (!match) return null;
  return { academicYear: `${match[2]}-${match[3]}`, term: `HK0${match[1]}` };
};

const upstreamHeaders = (cookie: string): HeadersInit => ({
  Cookie: cookie,
  'User-Agent': 'Mozilla/5.0 (compatible; HUB-Planner-course-scraper/1.0)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'vi,en;q=0.8',
  Referer: 'https://online.hub.edu.vn/',
});

// Contract used by the legacy Edge/browser scraper. This exists only for the
// signed, route-less validation A/B probe; it never reaches production traffic.
const legacyUpstreamHeaders = (cookie: string): HeadersInit => ({
  Cookie: cookie,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'vi,fr-FR;q=0.9,fr;q=0.8,en-US;q=0.7,en;q=0.6',
  Referer: 'https://online.hub.edu.vn/',
  Connection: 'keep-alive',
});

type RequestContext = Pick<ScraperDiagnostic, 'itemIndex' | 'endpointKind' | 'retryAttempt'>;
export interface ScraperTransportMetrics {
  retryEvents: number;
  requestsRecoveredByRetry: number;
  requestsExhaustedRetries: number;
}
const newTransportMetrics = (): ScraperTransportMetrics => ({
  retryEvents: 0,
  requestsRecoveredByRetry: 0,
  requestsExhaustedRetries: 0,
});
const endpointPath = (url: string) => {
  try { return new URL(url).pathname; } catch { return null; }
};
const diagnostic = (context: RequestContext, fields: Partial<Omit<ScraperDiagnostic, keyof RequestContext | 'method'>>) => ({
  itemIndex: context.itemIndex,
  endpointKind: context.endpointKind,
  method: 'GET' as const,
  status: null,
  redirectCount: 0,
  finalPath: null,
  contentType: null,
  responseBytes: null,
  parserStage: 'upstream_fetch',
  errorClass: 'OTHER' as ScraperErrorClass,
  retryAttempt: context.retryAttempt,
  loginMarkerDetected: false,
  ...fields,
});

/**
 * Fetches upstream HTML while deliberately retaining only diagnostics that
 * cannot reveal the secret cookie, query-string identifiers, or page body.
 */
export const fetchScraperHtml = async (
  url: string,
  cookie: string,
  fetcher: typeof fetch,
  context: RequestContext,
  transportMetrics?: ScraperTransportMetrics,
  sleep: (milliseconds: number) => Promise<void> = wait,
) => {
  let response: Response | null = null;
  // Upstream GETs are read-only. Retries are deliberately limited to three
  // total transport attempts; redirects, HTTP responses, and parser failures
  // are evaluated only after a response arrives and never enter this loop.
  const backoffAfterFailure = [1_000, 3_000] as const;
  for (let retryAttempt = 1; retryAttempt <= 3; retryAttempt += 1) {
    // Each attempt owns its timeout and cancellation state. In particular, a
    // completed LIST request must not leave an active timer behind that can
    // interfere with the next LIST or PRINT request in the sequential run.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      response = await fetcher(url, { headers: upstreamHeaders(cookie), redirect: 'manual', signal: controller.signal });
      if (retryAttempt > 1) transportMetrics && (transportMetrics.requestsRecoveredByRetry += 1);
      break;
    } catch {
      if (retryAttempt === 3) {
        transportMetrics && (transportMetrics.requestsExhaustedRetries += 1);
        throw new ScraperDiagnosticError(diagnostic({ ...context, retryAttempt }, {
          finalPath: endpointPath(url), parserStage: 'upstream_fetch', errorClass: 'UPSTREAM_NETWORK_ERROR',
        }));
      }
      transportMetrics && (transportMetrics.retryEvents += 1);
    } finally {
      clearTimeout(timeout);
    }
    await sleep(backoffAfterFailure[retryAttempt - 1]);
  }
  if (!response) {
    throw new ScraperDiagnosticError(diagnostic(context, {
      finalPath: endpointPath(url), parserStage: 'upstream_fetch', errorClass: 'UPSTREAM_NETWORK_ERROR',
    }));
  }
  const finalPath = endpointPath(response.url || url);
  const contentType = response.headers.get('content-type');
  if (response.status >= 300 && response.status < 400) {
    const redirectLocation = response.headers.get('location');
    let redirectPath = finalPath;
    try { redirectPath = redirectLocation ? new URL(redirectLocation, url).pathname : finalPath; } catch { /* sanitized original path is retained */ }
    await response.body?.cancel().catch(() => undefined);
    throw new ScraperDiagnosticError(diagnostic(context, {
      status: response.status, finalPath: redirectPath, contentType, parserStage: 'upstream_redirect', errorClass: 'UPSTREAM_REDIRECT_ERROR',
    }));
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ScraperDiagnosticError(diagnostic(context, {
      status: response.status, finalPath, contentType, parserStage: 'upstream_status', errorClass: 'UPSTREAM_HTTP_ERROR',
    }));
  }
  if (!/^text\/html(?:;|$)/i.test(contentType || '')) {
    await response.body?.cancel().catch(() => undefined);
    throw new ScraperDiagnosticError(diagnostic(context, {
      status: response.status, finalPath, contentType, parserStage: 'content_type', errorClass: 'UNEXPECTED_CONTENT_TYPE',
    }));
  }
  const html = await response.text();
  const responseBytes = new TextEncoder().encode(html).byteLength;
  const loginMarkerDetected = /Đăng\s*nhập|Object moved/i.test(html);
  if (responseBytes > 2_000_000) {
    throw new ScraperDiagnosticError(diagnostic(context, {
      status: response.status, finalPath, contentType, responseBytes, parserStage: 'response_size', errorClass: 'OTHER', loginMarkerDetected,
    }));
  }
  if (loginMarkerDetected) {
    throw new ScraperDiagnosticError(diagnostic(context, {
      status: response.status, finalPath, contentType, responseBytes, parserStage: 'login_detection', errorClass: 'UPSTREAM_LOGIN_DETECTED', loginMarkerDetected,
    }));
  }
  return html;
};


export const findStudentId = (html: string) => {
  for (const cells of tableRows(html)) {
    const candidate = cells[1] || '';
    if (/^\d{8,15}$/.test(candidate)) return candidate;
  }
  return null;
};

export const findInstructor = (html: string, courseCode: string) => {
  const base = courseCode.split('_')[0] || courseCode;
  const suffix = courseCode.split('_').at(-1) || '';
  for (const cells of tableRows(html)) {
    const scheduleCode = cells[1] || '';
    const candidate = cells[6] || '';
    if (scheduleCode.includes(base) && scheduleCode.includes(suffix) && candidate && !/\(\)|Thứ/i.test(candidate)) return candidate;
  }
  return '';
};

type ScraperCandidate = { id: string; course_code: string; semester: string | null };
type ScraperItemShape = {
  itemIndex: number;
  endpointKind: 'LIST_STUDENTS';
  method: 'GET';
  pathname: string;
  queryParameterNames: string[];
  queryParameterCount: number;
  approximateUrlLength: number;
  requestHeaderNames: string[];
  cookieAttached: boolean;
  targetHash: string;
};

const scraperCandidates = (env: CourseScraperAuthorityEnv) => env.DB.prepare(
  `SELECT id,course_code,semester FROM course_schedules
   WHERE catalogue_visibility='published' AND (instructor IS NULL OR trim(instructor)='')
   ORDER BY source_position ASC LIMIT 10`,
).all<ScraperCandidate>();

const requireScraperProbeAuthority = (env: CourseScraperAuthorityEnv) => {
  if (env.COURSE_SCRAPER_INTERNAL_ENABLED !== 'true' || readCourseWriteAuthority(env) !== 'd1') {
    throw new CourseAuthorityError(503, 'Course scraper authority is not enabled.');
  }
  const cookie = String(env.COURSE_SCRAPER_UPSTREAM_COOKIE || '').trim();
  if (cookie.length < 16) throw new CourseAuthorityError(503, 'Course scraper credential is unavailable.');
  return cookie;
};

const listStudentsUrl = (courseCode: string) =>
  `https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${scheduleStudyUnitUrls(courseCode)[0]}`;

const itemShape = async (itemIndex: number, url: string, cookie: string): Promise<ScraperItemShape> => {
  const parsed = new URL(url);
  const headers = upstreamHeaders(cookie) as Record<string, string>;
  return {
    itemIndex,
    endpointKind: 'LIST_STUDENTS',
    method: 'GET',
    pathname: parsed.pathname,
    queryParameterNames: [...new Set([...parsed.searchParams.keys()])].sort(),
    queryParameterCount: [...parsed.searchParams.keys()].length,
    approximateUrlLength: url.length,
    requestHeaderNames: Object.keys(headers).map((name) => name.toLowerCase()).sort(),
    cookieAttached: Boolean(headers.Cookie),
    targetHash: await hash(url),
  };
};

/** Validation-only metadata for items 7/8/9; no upstream or D1 mutation. */
export const inspectD1ScraperItemShapes = async (env: CourseScraperAuthorityEnv) => {
  const cookie = requireScraperProbeAuthority(env);
  const candidates = await scraperCandidates(env);
  const results = candidates.results || [];
  return {
    success: true,
    items: await Promise.all([7, 8, 9].map(async (itemIndex) => {
      const candidate = results[itemIndex];
      return candidate ? itemShape(itemIndex, listStudentsUrl(candidate.course_code), cookie) : null;
    })),
  };
};

/** Signed validation operation: exactly one upstream read and no D1 mutation. */
export const probeD1ScraperUpstream = async (
  env: CourseScraperAuthorityEnv,
  fetcher: typeof fetch = fetch,
) => {
  if (env.COURSE_SCRAPER_INTERNAL_ENABLED !== 'true' || readCourseWriteAuthority(env) !== 'd1') {
    throw new CourseAuthorityError(503, 'Course scraper authority is not enabled.');
  }
  const cookie = String(env.COURSE_SCRAPER_UPSTREAM_COOKIE || '').trim();
  if (cookie.length < 16) throw new CourseAuthorityError(503, 'Course scraper credential is unavailable.');
  const candidate = await env.DB.prepare(
    `SELECT course_code FROM course_schedules
     WHERE catalogue_visibility='published' AND trim(course_code)<>''
       AND (instructor IS NULL OR trim(instructor)='')
     ORDER BY source_position ASC LIMIT 1`,
  ).first<{ course_code: string }>();
  if (!candidate?.course_code) throw new CourseAuthorityError(503, 'Course scraper probe source is unavailable.');
  const unitId = scheduleStudyUnitUrls(candidate.course_code)[0];
  await fetchScraperHtml(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${unitId}`, cookie, fetcher, {
    itemIndex: 0, endpointKind: 'LIST_STUDENTS', retryAttempt: 1,
  });
  return { success: true };
};

type ScraperProbeResult = {
  status: number | null;
  redirectCount: number;
  finalPath: string | null;
  contentType: string | null;
  loginMarkerDetected: boolean;
  networkException: boolean;
  networkErrorClass: string | null;
  networkErrorCode: string | null;
  networkErrorCause: string | null;
  timeoutTriggered: boolean;
  elapsedMs: number;
};

const sanitizedReadOnlyProbe = async (url: string, headers: HeadersInit, fetcher: typeof fetch): Promise<ScraperProbeResult> => {
  const startedAt = Date.now();
  const controller = new AbortController();
  let timeoutTriggered = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Error('UPSTREAM_READ_TIMEOUT');
  const pending = fetcher(url, { headers, redirect: 'manual', signal: controller.signal });
  // The losing fetch can still settle after the diagnostic response is sent.
  // Attach a catch so it cannot surface an unhandled rejection or expose a URL.
  void pending.catch(() => undefined);
  try {
    const response = await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          timeoutTriggered = true;
          controller.abort();
          reject(timeoutError);
        }, 15_000);
      }),
    ]);
    const redirect = response.headers.get('location');
    let finalPath = endpointPath(response.url || url);
    if (redirect) {
      try { finalPath = new URL(redirect, url).pathname; } catch { /* retain non-sensitive original path */ }
    }
    let loginMarkerDetected = false;
    if (response.ok && /^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) {
      const html = await response.text();
      loginMarkerDetected = /Đăng\s*nhập|Object moved/i.test(html);
    } else {
      await response.body?.cancel().catch(() => undefined);
    }
    return {
      status: response.status, redirectCount: 0, finalPath,
      contentType: response.headers.get('content-type'), loginMarkerDetected, networkException: false,
      networkErrorClass: null, networkErrorCode: null, networkErrorCause: null, timeoutTriggered, elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    // Fetch errors can include request-target text. Keep only the runtime's
    // typed class/code; neither can contain a session, query value, or HTML.
    const candidate = error as { name?: unknown; cause?: { code?: unknown; name?: unknown } };
    return {
      status: null, redirectCount: 0, finalPath: endpointPath(url), contentType: null,
      loginMarkerDetected: false, networkException: true,
      networkErrorClass: typeof candidate?.name === 'string' ? candidate.name : 'FetchError',
      networkErrorCode: typeof candidate?.cause?.code === 'string' ? candidate.cause.code : null,
      networkErrorCause: typeof candidate?.cause?.name === 'string' ? candidate.cause.name : null,
      timeoutTriggered, elapsedMs: Date.now() - startedAt,
    };
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

const durationBucket = (milliseconds: number) => milliseconds < 1_000 ? 'UNDER_1S' : milliseconds <= 5_000 ? 'ONE_TO_FIVE_SECONDS' : 'OVER_FIVE_SECONDS';
const isolatedItemProbe = async (itemIndex: number, url: string, cookie: string, fetcher: typeof fetch) => {
  const result = await sanitizedReadOnlyProbe(url, upstreamHeaders(cookie), fetcher);
  return { itemIndex, ...result, durationBucket: durationBucket(result.elapsedMs) };
};

/**
 * Signed, read-only diagnosis for a repeated list-page transport failure.
 * It deliberately bounds upstream traffic to two attempts for item 8 and one
 * control request each for items 7 and 9. No receipt, course, outbox, or facet
 * statement is executed here.
 */
export const diagnoseD1ScraperItemEight = async (
  env: CourseScraperAuthorityEnv,
  fetcher: typeof fetch = fetch,
) => {
  const cookie = requireScraperProbeAuthority(env);
  const candidates = await scraperCandidates(env);
  const results = candidates.results || [];
  const urls = new Map([7, 8, 9].map((itemIndex) => [itemIndex, results[itemIndex] ? listStudentsUrl(results[itemIndex].course_code) : null]));
  if (![7, 8, 9].every((itemIndex) => urls.get(itemIndex))) throw new CourseAuthorityError(503, 'Course scraper diagnostic source is unavailable.');
  const shapes = await Promise.all([7, 8, 9].map((itemIndex) => itemShape(itemIndex, urls.get(itemIndex)!, cookie)));
  const item8First = await isolatedItemProbe(8, urls.get(8)!, cookie, fetcher);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const item8Second = await isolatedItemProbe(8, urls.get(8)!, cookie, fetcher);
  const item7 = await isolatedItemProbe(7, urls.get(7)!, cookie, fetcher);
  const item9 = await isolatedItemProbe(9, urls.get(9)!, cookie, fetcher);
  return { success: true, shapes, probes: { item8: [item8First, item8Second], item7, item9 } };
};

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const probePassed = (probe: ScraperProbeResult) => probe.status === 200 && !probe.networkException && !probe.loginMarkerDetected;

/**
 * V2 is a metadata-only, bounded sequence diagnosis. It deliberately mirrors
 * the list-page request contract while never parsing/storing upstream data or
 * creating D1 receipts. Delays are fixed rather than adaptive.
 */
export const diagnoseD1ScraperItemEightV2 = async (
  env: CourseScraperAuthorityEnv,
  fetcher: typeof fetch = fetch,
  sleep: (milliseconds: number) => Promise<void> = wait,
) => {
  const cookie = requireScraperProbeAuthority(env);
  const candidates = await scraperCandidates(env);
  const rows = candidates.results || [];
  const urls = new Map([7, 8, 9].map((itemIndex) => [itemIndex, rows[itemIndex] ? listStudentsUrl(rows[itemIndex].course_code) : null]));
  if (![7, 8, 9].every((itemIndex) => urls.get(itemIndex))) throw new CourseAuthorityError(503, 'Course scraper diagnostic source is unavailable.');
  const shapes = [] as ScraperItemShape[];
  for (const itemIndex of [7, 8, 9]) shapes.push(await itemShape(itemIndex, urls.get(itemIndex)!, cookie));
  const probe = (itemIndex: number) => isolatedItemProbe(itemIndex, urls.get(itemIndex)!, cookie, fetcher);
  const item8 = [await probe(8)];
  await sleep(3_000); item8.push(await probe(8));
  await sleep(8_000); item8.push(await probe(8));
  const item7 = await probe(7);
  const item9 = await probe(9);
  const sequence = async (delayMs: number) => {
    const first = await probe(7);
    if (delayMs) await sleep(delayMs);
    const second = await probe(8);
    if (delayMs) await sleep(delayMs);
    const third = await probe(9);
    return [first, second, third] as const;
  };
  const noDelay = await sequence(0);
  const item8PassedInIsolation = item8.every(probePassed);
  const item8FailedInSequence = !probePassed(noDelay[1]);
  let paced2: readonly [Awaited<ReturnType<typeof probe>>, Awaited<ReturnType<typeof probe>>, Awaited<ReturnType<typeof probe>>] | null = null;
  let paced5: readonly [Awaited<ReturnType<typeof probe>>, Awaited<ReturnType<typeof probe>>, Awaited<ReturnType<typeof probe>>] | null = null;
  if (item8PassedInIsolation && item8FailedInSequence) {
    paced2 = await sequence(2_000);
    if (!probePassed(paced2[1])) paced5 = await sequence(5_000);
  }
  return {
    success: true,
    shapes,
    item8,
    item7,
    item9,
    noDelay,
    paced2,
    paced5,
    requestCountBeforeItem8: 1,
    item8PassedInIsolation,
    item8FailedInSequence,
  };
};

type PrefixFetch = ScraperProbeResult & { sequenceIndex: number; endpointKind: ScraperEndpointKind; attempt: number; targetHash: string; bodyState: 'CONSUMED' | 'NOT_CONSUMED' };
const readOnlyPrefixFetch = async (url: string, endpointKind: ScraperEndpointKind, sequenceIndex: number, cookie: string, fetcher: typeof fetch, records: PrefixFetch[], maxAttempts = 2, timeoutMs = 15_000) => {
  const targetHash = await hash(url);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetcher(url, { headers: upstreamHeaders(cookie), redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      const contentType = response.headers.get('content-type');
      const finalPath = endpointPath(response.url || url);
      if (!response.ok || !/^text\/html(?:;|$)/i.test(contentType || '')) {
        records.push({ sequenceIndex, endpointKind, attempt, targetHash, status: response.status, redirectCount: 0, finalPath, contentType, loginMarkerDetected: false, networkException: false, networkErrorClass: null, networkErrorCode: null, networkErrorCause: null, timeoutTriggered: false, elapsedMs: Date.now() - startedAt, bodyState: 'NOT_CONSUMED' });
        return null;
      }
      const html = await response.text();
      const loginMarkerDetected = /Đăng\s*nhập|Object moved/i.test(html);
      records.push({ sequenceIndex, endpointKind, attempt, targetHash, status: response.status, redirectCount: 0, finalPath, contentType, loginMarkerDetected, networkException: false, networkErrorClass: null, networkErrorCode: null, networkErrorCause: null, timeoutTriggered: false, elapsedMs: Date.now() - startedAt, bodyState: 'CONSUMED' });
      return loginMarkerDetected ? null : html;
    } catch (error) {
      const candidate = error as { name?: unknown; cause?: { code?: unknown; name?: unknown } };
      records.push({ sequenceIndex, endpointKind, attempt, targetHash, status: null, redirectCount: 0, finalPath: endpointPath(url), contentType: null, loginMarkerDetected: false, networkException: true, networkErrorClass: typeof candidate?.name === 'string' ? candidate.name : 'FetchError', networkErrorCode: typeof candidate?.cause?.code === 'string' ? candidate.cause.code : null, networkErrorCause: typeof candidate?.cause?.name === 'string' ? candidate.cause.name : null, timeoutTriggered: false, elapsedMs: Date.now() - startedAt, bodyState: 'NOT_CONSUMED' });
      if (attempt === maxAttempts) return null;
    }
  }
  return null;
};

/** Exact read-only prefix through the first LIST request for logical item 8. */
export const diagnoseD1ScraperRequestMix = async (
  env: CourseScraperAuthorityEnv,
  fetcher: typeof fetch = fetch,
  pacingMs = 0,
  maxAttempts = 2,
  timeoutMs = 15_000,
) => {
  const cookie = requireScraperProbeAuthority(env);
  const candidates = (await scraperCandidates(env)).results || [];
  if (candidates.length < 9) throw new CourseAuthorityError(503, 'Course scraper diagnostic source is unavailable.');
  const run = async (includePrint: boolean) => {
    const records: PrefixFetch[] = []; let sequenceIndex = 0; let item8Result: 'PASS' | 'FAIL' | 'NOT_REACHED' = 'NOT_REACHED';
    const read = async (url: string, endpointKind: ScraperEndpointKind) => {
      const html = await readOnlyPrefixFetch(url, endpointKind, ++sequenceIndex, cookie, fetcher, records, maxAttempts, timeoutMs);
      // Pacing is deliberately confined to this read-only diagnostic. It is
      // applied between settled logical requests, never between retry attempts.
      if (pacingMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, pacingMs));
      return html;
    };
    for (const [itemIndex, course] of candidates.slice(0, 9).entries()) {
      const period = parseAcademicPeriod(String(course.semester || ''));
      if (!period) continue;
      let studentId: string | null = null;
      for (const unitId of scheduleStudyUnitUrls(course.course_code)) {
        const html = await read(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${unitId}`, 'LIST_STUDENTS');
        if (!html) { if (itemIndex === 8) item8Result = 'FAIL'; return { records, item8Result }; }
        studentId = findStudentId(html); if (studentId) break;
      }
      if (itemIndex === 8) return { records, item8Result: 'PASS' as const };
      if (includePrint && studentId) {
        const html = await read(`https://online.hub.edu.vn/Print_.aspx?NH=${encodeURIComponent(period.academicYear)}&HK=${period.term}&StudentID=${encodeURIComponent(studentId)}`, 'PRINT');
        if (!html) return { records, item8Result };
      }
    }
    return { records, item8Result };
  };
  // Paced runs exist solely to reproduce the actual mix. The unpaced call
  // remains the only diagnostic that runs the list-only control.
  const listOnly = pacingMs === 0 ? await run(false) : null;
  const actualMix = await run(true);
  return { success: true, listOnly, actualMix };
};

/**
 * Signed, validation-only A/B request-contract diagnostic. It performs two
 * upstream reads with the same runtime cookie and no D1 mutations or receipts.
 */
export const probeD1ScraperRequestContracts = async (
  env: CourseScraperAuthorityEnv,
  fetcher: typeof fetch = fetch,
) => {
  if (env.COURSE_SCRAPER_INTERNAL_ENABLED !== 'true' || readCourseWriteAuthority(env) !== 'd1') {
    throw new CourseAuthorityError(503, 'Course scraper authority is not enabled.');
  }
  const cookie = String(env.COURSE_SCRAPER_UPSTREAM_COOKIE || '').trim();
  if (cookie.length < 16) throw new CourseAuthorityError(503, 'Course scraper credential is unavailable.');
  const candidate = await env.DB.prepare(
    `SELECT course_code FROM course_schedules
     WHERE catalogue_visibility='published' AND trim(course_code)<>''
       AND (instructor IS NULL OR trim(instructor)='')
     ORDER BY source_position ASC LIMIT 1`,
  ).first<{ course_code: string }>();
  if (!candidate?.course_code) throw new CourseAuthorityError(503, 'Course scraper probe source is unavailable.');
  const unitId = scheduleStudyUnitUrls(candidate.course_code)[0];
  const url = `https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${unitId}`;
  return {
    success: true,
    cookie: { present: true, headerAttached: true, headerNonempty: true, pairCount: cookie.split(';').filter((part) => part.trim()).length },
    current: await sanitizedReadOnlyProbe(url, upstreamHeaders(cookie), fetcher),
    legacy: await sanitizedReadOnlyProbe(url, legacyUpstreamHeaders(cookie), fetcher),
  };
};

/**
 * Signed, validation-only PRINT transport diagnosis. A PRINT target cannot be
 * obtained from D1 without retaining a sensitive upstream student identifier,
 * so it is resolved transiently from one authenticated LIST response and is
 * never returned, logged, or persisted. Every PRINT request below is read-only.
 */
export const probeD1ScraperPrintTransport = async (
  env: CourseScraperAuthorityEnv,
  fetcher: typeof fetch = fetch,
  sleep: (milliseconds: number) => Promise<void> = wait,
) => {
  const cookie = requireScraperProbeAuthority(env);
  const candidates = (await scraperCandidates(env)).results || [];
  let target: { listUrl: string; printUrl: string } | null = null;
  for (const [itemIndex, course] of candidates.entries()) {
    const period = parseAcademicPeriod(String(course.semester || ''));
    if (!period) continue;
    for (const unitId of scheduleStudyUnitUrls(course.course_code)) {
      const listUrl = `https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${unitId}`;
      const html = await fetchScraperHtml(listUrl, cookie, fetcher, { itemIndex, endpointKind: 'LIST_STUDENTS', retryAttempt: 1 });
      const studentId = findStudentId(html);
      if (!studentId) continue;
      target = {
        listUrl,
        printUrl: `https://online.hub.edu.vn/Print_.aspx?NH=${encodeURIComponent(period.academicYear)}&HK=${period.term}&StudentID=${encodeURIComponent(studentId)}`,
      };
      break;
    }
    if (target) break;
  }
  if (!target) throw new CourseAuthorityError(503, 'Course scraper PRINT probe target is unavailable.');

  const attempts: ScraperProbeResult[] = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await sanitizedReadOnlyProbe(target.printUrl, upstreamHeaders(cookie), fetcher);
    attempts.push(result);
    if (probePassed(result)) break;
    if (attempt === 1) await sleep(3_000);
    if (attempt === 2) await sleep(8_000);
  }

  const hasPassingPrint = attempts.some(probePassed);
  const listBeforePrint = hasPassingPrint ? await sanitizedReadOnlyProbe(target.listUrl, upstreamHeaders(cookie), fetcher) : null;
  const printAfterList = listBeforePrint && probePassed(listBeforePrint)
    ? await sanitizedReadOnlyProbe(target.printUrl, upstreamHeaders(cookie), fetcher)
    : null;
  const headers = upstreamHeaders(cookie) as Record<string, string>;
  const legacyHeaders = legacyUpstreamHeaders(cookie) as Record<string, string>;
  const print = new URL(target.printUrl);
  return {
    success: true,
    // No target or identifier is exposed; only non-sensitive contract shape.
    contract: {
      method: 'GET', hostname: print.hostname, pathname: print.pathname,
      queryParameterNames: [...print.searchParams.keys()].sort(), queryParameterCount: [...print.searchParams.keys()].length,
      encodedUrlLength: print.toString().length, cookieAttached: Boolean(headers.Cookie), redirectMode: 'manual',
      timeoutMs: 15_000, retryCount: 2,
      legacyDiff: {
        userAgent: headers['User-Agent'] !== legacyHeaders['User-Agent'],
        accept: headers.Accept !== legacyHeaders.Accept,
        acceptLanguage: headers['Accept-Language'] !== legacyHeaders['Accept-Language'],
        connection: !('Connection' in headers) && 'Connection' in legacyHeaders,
      },
    },
    targetResolution: { transient: true, persisted: false },
    attempts,
    listBeforePrint,
    printAfterList,
  };
};

/**
 * Manual/internal-only replacement for the legacy Supabase Edge scraper.  It
 * gets its upstream credential exclusively from a Worker secret, parses only
 * transient upstream HTML, and delegates the bounded instructor mutations to
 * the idempotent D1 primitive below.  It never deletes courses for omissions.
 */
export const runD1InstructorScraper = async (
  env: CourseScraperAuthorityEnv,
  runId: string,
  fetcher: typeof fetch = fetch,
) => {
  if (env.COURSE_SCRAPER_INTERNAL_ENABLED !== 'true' || readCourseWriteAuthority(env) !== 'd1') {
    throw new CourseAuthorityError(503, 'Course scraper authority is not enabled.');
  }
  const cookie = String(env.COURSE_SCRAPER_UPSTREAM_COOKIE || '').trim();
  if (cookie.length < 16) throw new CourseAuthorityError(503, 'Course scraper credential is unavailable.');
  const candidates = await env.DB.prepare(
    `SELECT id,course_code,semester FROM course_schedules
     WHERE catalogue_visibility='published' AND (instructor IS NULL OR trim(instructor)='')
     ORDER BY source_position ASC LIMIT 10`,
  ).all<ScraperCandidate>();
  const updates: ScraperInstructorUpdate[] = [];
  const transportMetrics = newTransportMetrics();
  for (const [itemIndex, course] of (candidates.results || []).entries()) {
    const period = parseAcademicPeriod(String(course.semester || ''));
    if (!period) continue;
    let studentId: string | null = null;
    for (const unitId of scheduleStudyUnitUrls(course.course_code)) {
      const listHtml = await fetchScraperHtml(
        `https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${unitId}`,
        cookie,
        fetcher,
        { itemIndex, endpointKind: 'LIST_STUDENTS', retryAttempt: 1 },
        transportMetrics,
      );
      if (!/<table\b/i.test(listHtml)) {
        throw new ScraperDiagnosticError(diagnostic({ itemIndex, endpointKind: 'LIST_STUDENTS', retryAttempt: 1 }, {
          status: 200, finalPath: '/Liststudentinschedulestudyunit.aspx', contentType: 'text/html',
          responseBytes: new TextEncoder().encode(listHtml).byteLength, parserStage: 'list_table', errorClass: 'LIST_PAGE_PARSE_ERROR',
        }));
      }
      studentId = findStudentId(listHtml);
      if (studentId) break;
    }
    if (!studentId) {
      updates.push({ courseId: course.id, instructor: 'Lớp Hủy/Trống' });
      continue;
    }
    const scheduleHtml = await fetchScraperHtml(
      `https://online.hub.edu.vn/Print_.aspx?NH=${encodeURIComponent(period.academicYear)}&HK=${period.term}&StudentID=${encodeURIComponent(studentId)}`,
      cookie,
      fetcher,
      { itemIndex, endpointKind: 'PRINT', retryAttempt: 1 },
      transportMetrics,
    );
    if (!/<table\b/i.test(scheduleHtml)) {
      throw new ScraperDiagnosticError(diagnostic({ itemIndex, endpointKind: 'PRINT', retryAttempt: 1 }, {
        status: 200, finalPath: '/Print_.aspx', contentType: 'text/html',
        responseBytes: new TextEncoder().encode(scheduleHtml).byteLength, parserStage: 'print_table', errorClass: 'PRINT_PAGE_PARSE_ERROR',
      }));
    }
    updates.push({ courseId: course.id, instructor: findInstructor(scheduleHtml, course.course_code) || 'Chưa xếp GV' });
  }
  return applyD1ScraperInstructorUpdates(env, runId, updates, transportMetrics);
};


/**
 * The scraper owns only instructor metadata.  Admin-reviewed instructor data
 * is immutable to this path; a missing row or CAS conflict is recorded in the
 * deterministic run receipt and never triggers a destructive delete.
 */
export const applyD1ScraperInstructorUpdates = async (
  env: CourseScraperAuthorityEnv,
  runId: string,
  rawUpdates: ScraperInstructorUpdate[],
  transportMetrics: ScraperTransportMetrics = newTransportMetrics(),
): Promise<ScraperRunResult> => {
  if (env.COURSE_SCRAPER_INTERNAL_ENABLED !== 'true' || readCourseWriteAuthority(env) !== 'd1') {
    throw new CourseAuthorityError(503, 'Course scraper authority is not enabled.');
  }
  if (!UUID.test(runId)) throw new CourseAuthorityError(400, 'Invalid scraper run.');
  const updates = parseUpdates(rawUpdates);
  const payloadHash = await hash(updates);
  const existing = await env.DB.prepare('SELECT payload_hash,status,attempted_count,updated_count,skipped_admin_count,conflict_count FROM course_scraper_runs WHERE run_id=?').bind(runId).first<Record<string, unknown>>();
  if (existing) {
    if (existing.payload_hash !== payloadHash) throw new CourseAuthorityError(409, 'Scraper run key was reused.');
    if (existing.status === 'completed') return {
      success: true, changed: Number(existing.updated_count) > 0,
      attempted: Number(existing.attempted_count), updated: Number(existing.updated_count),
      skippedAdmin: Number(existing.skipped_admin_count), conflicts: Number(existing.conflict_count),
      transportRetryEvents: 0,
      requestsRecoveredByRetry: 0,
      requestsExhaustedRetries: 0,
    };
    throw new CourseAuthorityError(409, 'Scraper run is incomplete and requires operator review.');
  }
  const at = new Date().toISOString();
  await env.DB.prepare('INSERT INTO course_scraper_runs (run_id,payload_hash,status,attempted_count,created_at) VALUES (?,?,?,?,?)').bind(runId, payloadHash, 'running', updates.length, at).run();
  let updated = 0; let skippedAdmin = 0; let conflicts = 0;
  try {
    for (const item of updates) {
      const row = await env.DB.prepare('SELECT revision,instructor_provenance FROM course_schedules WHERE id=?').bind(item.courseId).first<{ revision: number; instructor_provenance: string }>();
      if (!row) { conflicts += 1; continue; }
      if (row.instructor_provenance === 'admin') { skippedAdmin += 1; continue; }
      const result = await env.DB.prepare('UPDATE course_schedules SET instructor=?,instructor_search=?,instructor_provenance=?,writer_provenance=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND instructor_provenance IS NOT ?').bind(item.instructor, item.instructor.toLocaleLowerCase('vi-VN'), 'scraper', 'scraper', at, item.courseId, row.revision, 'admin').run();
      if (Number(result.meta.changes || 0) === 1) updated += 1; else conflicts += 1;
    }
    await env.DB.prepare('UPDATE course_scraper_runs SET status=?,updated_count=?,skipped_admin_count=?,conflict_count=?,completed_at=? WHERE run_id=?').bind('completed', updated, skippedAdmin, conflicts, new Date().toISOString(), runId).run();
  } catch (error) {
    await env.DB.prepare('UPDATE course_scraper_runs SET status=?,updated_count=?,skipped_admin_count=?,conflict_count=?,error_code=?,completed_at=? WHERE run_id=?').bind('failed', updated, skippedAdmin, conflicts, 'SCRAPER_UPDATE_FAILED', new Date().toISOString(), runId).run();
    throw error;
  }
  return {
    success: true,
    changed: updated > 0,
    attempted: updates.length,
    updated,
    skippedAdmin,
    conflicts,
    transportRetryEvents: transportMetrics.retryEvents,
    requestsRecoveredByRetry: transportMetrics.requestsRecoveredByRetry,
    requestsExhaustedRetries: transportMetrics.requestsExhaustedRetries,
  };
};
