import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnoseD1ScraperItemEightV2, fetchScraperHtml, probeD1ScraperPrintTransport, runD1InstructorScraper, ScraperDiagnosticError, type ScraperTransportMetrics } from '../cloudflare/worker/src/course-scraper-authority.ts';

const secret = 'ASP.NET_SessionId=secret-cookie-value; PortalAuth=another-secret';
const context = { itemIndex: 7, endpointKind: 'LIST_STUDENTS' as const, retryAttempt: 1 };
const url = 'https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=student-123456789';
const transport = (): ScraperTransportMetrics => ({ retryEvents: 0, requestsRecoveredByRetry: 0, requestsExhaustedRetries: 0 });

const expectDiagnostic = async (fetcher: typeof fetch, errorClass: string, parserStage: string) => {
  await assert.rejects(
    () => fetchScraperHtml(url, secret, fetcher, context),
    (error: unknown) => {
      assert.ok(error instanceof ScraperDiagnosticError);
      assert.equal(error.diagnostic.errorClass, errorClass);
      assert.equal(error.diagnostic.parserStage, parserStage);
      const serialized = JSON.stringify(error.diagnostic);
      assert.doesNotMatch(serialized, /secret-cookie-value|another-secret|123456789/);
      return true;
    },
  );
};

test('scraper upstream diagnostics retain HTTP authorization failures without secrets', async () => {
  await expectDiagnostic(async () => new Response('', { status: 403, headers: { 'content-type': 'text/html' } }), 'UPSTREAM_HTTP_ERROR', 'upstream_status');
});

test('non-success upstream response bodies are cancelled before a typed diagnostic is returned', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('denied')); },
    cancel() { cancelled = true; },
  });
  await expectDiagnostic(
    async () => new Response(body, { status: 403, headers: { 'content-type': 'text/html' } }),
    'UPSTREAM_HTTP_ERROR',
    'upstream_status',
  );
  assert.equal(cancelled, true);
});

test('scraper diagnostics distinguish login HTML, malformed HTML, content type, and network errors', async () => {
  await expectDiagnostic(async () => new Response('<html>Đăng nhập</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }), 'UPSTREAM_LOGIN_DETECTED', 'login_detection');
  await expectDiagnostic(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }), 'UNEXPECTED_CONTENT_TYPE', 'content_type');
  await expectDiagnostic(async () => { throw new TypeError('network unavailable'); }, 'UPSTREAM_NETWORK_ERROR', 'upstream_fetch');
});

test('redirect diagnostics retain only a sanitized destination path', async () => {
  await assert.rejects(
    () => fetchScraperHtml(url, secret, async () => new Response('', { status: 302, headers: { location: '/Login.aspx?student=123456789', 'content-type': 'text/html' } }), context),
    (error: unknown) => {
      assert.ok(error instanceof ScraperDiagnosticError);
      assert.equal(error.diagnostic.errorClass, 'UPSTREAM_REDIRECT_ERROR');
      assert.equal(error.diagnostic.finalPath, '/Login.aspx');
      assert.doesNotMatch(JSON.stringify(error.diagnostic), /123456789/);
      return true;
    },
  );
});

test('a 200 list page without the expected table retains the list parser stage', async () => {
  let fetchAttempts = 0;
  const db = {
    prepare: () => ({
      all: async () => ({ results: [{ id: '11111111-1111-4111-8111-111111111111', course_code: 'ABC_01_1', semester: 'HK1 2025-2026' }] }),
    }),
  };
  await assert.rejects(
    () => runD1InstructorScraper({ DB: db, COURSE_WRITE_AUTHORITY: 'd1', COURSE_SCRAPER_INTERNAL_ENABLED: 'true', COURSE_SCRAPER_UPSTREAM_COOKIE: secret } as never, '22222222-2222-4222-8222-222222222222', async () => {
      fetchAttempts += 1;
      return new Response('<html>valid but changed markup</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }),
    (error: unknown) => {
      assert.ok(error instanceof ScraperDiagnosticError);
      assert.equal(error.diagnostic.errorClass, 'LIST_PAGE_PARSE_ERROR');
      assert.equal(error.diagnostic.parserStage, 'list_table');
      assert.doesNotMatch(JSON.stringify(error.diagnostic), /secret-cookie-value|123456789/);
      return true;
    },
  );
  assert.equal(fetchAttempts, 1);
});

test('successful scraper requests retain no diagnostic payload and preserve request contract', async () => {
  let request: RequestInit | undefined;
  const html = await fetchScraperHtml(url, secret, async (_url, init) => {
    request = init;
    return new Response('<table><tr><td>ok</td></tr></table>', { status: 200, headers: { 'content-type': 'text/html' } });
  }, context);
  assert.match(html, /table/);
  assert.equal(request?.redirect, 'manual');
  assert.equal((request?.headers as HeadersInit as Record<string, string>).Cookie, secret);
});

test('a transient upstream network error is retried with fresh request state and bounded backoff', async () => {
  let attempts = 0;
  const signals: AbortSignal[] = [];
  const delays: number[] = [];
  const metrics = transport();
  const html = await fetchScraperHtml(url, secret, async (_url, init) => {
    attempts += 1;
    signals.push(init?.signal as AbortSignal);
    if (attempts === 1) throw new TypeError('temporary network reset');
    return new Response('<table><tr><td>ok</td></tr></table>', { status: 200, headers: { 'content-type': 'text/html' } });
  }, context, metrics, async (milliseconds) => { delays.push(milliseconds); });
  assert.match(html, /table/);
  assert.equal(attempts, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.equal(signals[1]?.aborted, false);
  assert.deepEqual(delays, [1_000]);
  assert.deepEqual(metrics, { retryEvents: 1, requestsRecoveredByRetry: 1, requestsExhaustedRetries: 0 });
});

test('a third transport attempt can recover, while exhaustion fails the logical request without skipping it', async () => {
  let attempts = 0;
  const recovered = transport();
  await fetchScraperHtml(url, secret, async () => {
    attempts += 1;
    if (attempts < 3) throw new TypeError('transient transport failure');
    return new Response('<table><tr><td>ok</td></tr></table>', { status: 200, headers: { 'content-type': 'text/html' } });
  }, context, recovered, async () => {});
  assert.equal(attempts, 3);
  assert.deepEqual(recovered, { retryEvents: 2, requestsRecoveredByRetry: 1, requestsExhaustedRetries: 0 });

  const exhausted = transport();
  let exhaustedAttempts = 0;
  await assert.rejects(
    () => fetchScraperHtml(url, secret, async () => { exhaustedAttempts += 1; throw new TypeError('still offline'); }, context, exhausted, async () => {}),
    (error: unknown) => error instanceof ScraperDiagnosticError && error.diagnostic.retryAttempt === 3,
  );
  assert.equal(exhaustedAttempts, 3);
  assert.deepEqual(exhausted, { retryEvents: 2, requestsRecoveredByRetry: 0, requestsExhaustedRetries: 1 });
});

test('redirect and parser failures do not enter the transport retry loop', async () => {
  let redirectAttempts = 0;
  await assert.rejects(
    () => fetchScraperHtml(url, secret, async () => {
      redirectAttempts += 1;
      return new Response('', { status: 302, headers: { location: '/Default.aspx', 'content-type': 'text/html' } });
    }, context, transport(), async () => { throw new Error('retry must not occur'); }),
    (error: unknown) => error instanceof ScraperDiagnosticError && error.diagnostic.errorClass === 'UPSTREAM_REDIRECT_ERROR',
  );
  assert.equal(redirectAttempts, 1);
});

test('each transport attempt clears its timeout after a settled response', async () => {
  const nativeSetTimeout = globalThis.setTimeout;
  const nativeClearTimeout = globalThis.clearTimeout;
  let cleared = 0;
  globalThis.setTimeout = ((handler: TimerHandler, _milliseconds?: number, ...args: unknown[]) => nativeSetTimeout(handler, 60_000, ...args)) as typeof setTimeout;
  globalThis.clearTimeout = ((id?: number | NodeJS.Timeout) => {
    cleared += 1;
    return nativeClearTimeout(id);
  }) as typeof clearTimeout;
  try {
    await fetchScraperHtml(url, secret, async () => new Response('<table><tr><td>ok</td></tr></table>', { status: 200, headers: { 'content-type': 'text/html' } }), context);
    assert.equal(cleared, 1);
  } finally {
    globalThis.setTimeout = nativeSetTimeout;
    globalThis.clearTimeout = nativeClearTimeout;
  }
});

test('item-eight V2 diagnosis is read-only, sequential, and redacts target values', async () => {
  const courses = Array.from({ length: 10 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, course_code: `ABC_${index}_1`, semester: 'HK1 2025-2026' }));
  let prepares = 0;
  const env = {
    DB: { prepare: () => ({ all: async () => { prepares += 1; return { results: courses }; } }) },
    COURSE_WRITE_AUTHORITY: 'd1', COURSE_SCRAPER_INTERNAL_ENABLED: 'true', COURSE_SCRAPER_UPSTREAM_COOKIE: secret,
  };
  const result = await diagnoseD1ScraperItemEightV2(
    env as never,
    async () => new Response('<table><tr><td>ok</td></tr></table>', { status: 200, headers: { 'content-type': 'text/html' } }),
    async () => {},
  );
  assert.equal(prepares, 1);
  assert.equal(result.item8.length, 3);
  assert.equal(result.noDelay[1].status, 200);
  assert.equal(result.paced2, null);
  assert.doesNotMatch(JSON.stringify(result), /secret-cookie-value|ABC_8_1/);
});

test('PRINT transport probe keeps target data transient, bounds retries, and settles LIST before PRINT', async () => {
  let calls = 0;
  const db = { prepare: () => ({ all: async () => ({ results: [{ id: '11111111-1111-4111-8111-111111111111', course_code: 'ABC_01_SAMPLE', semester: 'HK1 2025-2026' }] }) }) };
  const result = await probeD1ScraperPrintTransport(
    { DB: db, COURSE_WRITE_AUTHORITY: 'd1', COURSE_SCRAPER_INTERNAL_ENABLED: 'true', COURSE_SCRAPER_UPSTREAM_COOKIE: secret } as never,
    async (input) => {
      calls += 1;
      const url = String(input);
      if (url.includes('Liststudent')) return new Response('<table><tr><td>x</td><td>12345678</td></tr></table>', { status: 200, headers: { 'content-type': 'text/html' } });
      if (calls === 2) throw new Error('network');
      return new Response('<table><tr><td>ok</td></tr></table>', { status: 200, headers: { 'content-type': 'text/html' } });
    },
    async () => {},
  );
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].networkException, true);
  assert.equal(result.attempts[1].status, 200);
  assert.equal(result.listBeforePrint?.status, 200);
  assert.equal(result.printAfterList?.status, 200);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /12345678|secret-cookie-value|another-secret/);
});
