import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fetchPublicWorker } from '../utils/publicWorkerApi.ts';
import {
  handleWebErrorTelemetry,
  resetWebErrorTelemetryRateLimitForTest,
} from '../cloudflare/worker/src/web-error-telemetry.ts';

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const telemetryRequest = (
  id: string,
  overrides: Record<string, unknown> = {},
  ip = '198.51.100.44'
) => new Request('https://app.example/api/public/v1/telemetry/web-errors', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'CF-Connecting-IP': ip,
  },
  body: JSON.stringify({
    id,
    level: 'error',
    source: 'frontend',
    action: 'batch1_test',
    page_path: '/dashboard?token=ignored',
    error: { name: 'Error', message: 'safe failure', code: 'E_TEST' },
    metadata: { surface: 'public-read', stage: 'batch1' },
    ...overrides,
  }),
});

test('Batch 1 public consumers use same-origin Worker paths without a Supabase fallback', () => {
  const sourceFiles = [
    'utils/coursesApi.ts',
    'utils/lostFoundApi.ts',
    'utils/announcementsApi.ts',
    'utils/benchmarkRankingsApi.ts',
    'hooks/useForecastRank.ts',
    'utils/logWebError.ts',
  ];
  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /supabase\.(?:auth|from|rpc|storage)|getSession\(|apiUrl\(|\/functions\/v1\/|\/rest\/v1\/|\/storage\/v1\/|supabase\.co/);
  }

  const eventSource = readFileSync('utils/eventsApi.ts', 'utf8');
  const publicReader = eventSource.slice(eventSource.indexOf('export const fetchPublicEvents'));
  assert.match(publicReader, /fetchPublicWorker\(path, init\)/);
  assert.doesNotMatch(publicReader, /supabase|apiUrl|fallback/i);

  const workerSource = readFileSync('cloudflare/worker/src/index.ts', 'utf8');
  assert.match(workerSource, /\/api\/public\/v1\/telemetry\/web-errors/);
});

test('same-origin public Worker requests omit credentials and caller auth headers', async () => {
  const originalFetch = globalThis.fetch;
  let requestPath = '';
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestPath = String(input);
    requestInit = init;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  try {
    await fetchPublicWorker('/events?limit=10', {
      headers: { Authorization: 'Bearer should-not-leave-browser', apikey: 'ignored' },
      credentials: 'include',
    });
    assert.equal(requestPath, '/events?limit=10');
    assert.equal(requestInit?.credentials, 'omit');
    assert.equal(new Headers(requestInit?.headers).get('Authorization'), null);
    assert.equal(new Headers(requestInit?.headers).get('apikey'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('web error telemetry accepts only a bounded, sanitised anonymous envelope', async () => {
  resetWebErrorTelemetryRateLimitForTest();
  const originalWarn = console.warn;
  const observed: string[] = [];
  console.warn = (...args: unknown[]) => observed.push(args.map(String).join(' '));
  try {
    const accepted = await handleWebErrorTelemetry(telemetryRequest(uuid('1'), {
      error: { name: 'Error', message: 'Bearer private-token-must-not-log', code: 'E_TEST' },
    }));
    assert.equal(accepted.status, 202);
    assert.match(observed.join('\n'), /\[redacted\]/);
    assert.doesNotMatch(observed.join('\n'), /private-token-must-not-log/);

    const rejectedExtraField = await handleWebErrorTelemetry(telemetryRequest(uuid('2'), {
      cookie: 'must-not-be-accepted',
    }, '198.51.100.45'));
    assert.equal(rejectedExtraField.status, 400);

    const oversized = await handleWebErrorTelemetry(new Request(
      'https://app.example/api/public/v1/telemetry/web-errors',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.46' },
        body: JSON.stringify({ padding: 'x'.repeat(9 * 1024) }),
      }
    ));
    assert.equal(oversized.status, 413);
  } finally {
    console.warn = originalWarn;
  }
});

test('web error telemetry has a per-IP request limit and rejects unsupported methods', async () => {
  resetWebErrorTelemetryRateLimitForTest();
  const ip = '198.51.100.47';
  for (let index = 1; index <= 12; index += 1) {
    const result = await handleWebErrorTelemetry(telemetryRequest(uuid(String(index + 100)), {}, ip));
    assert.equal(result.status, 202);
  }
  const limited = await handleWebErrorTelemetry(telemetryRequest(uuid('113'), {}, ip));
  assert.equal(limited.status, 429);
  const unsupported = await handleWebErrorTelemetry(new Request(
    'https://app.example/api/public/v1/telemetry/web-errors'
  ));
  assert.equal(unsupported.status, 405);
});
