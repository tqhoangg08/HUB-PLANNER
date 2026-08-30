import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  handlePdfAi,
  PdfAiError,
  resetPdfAiRateLimitForTest,
} from '../cloudflare/worker/src/pdf-ai.ts';

const environment = {
  TURNSTILE_SECRET_KEY: 'test-turnstile-secret',
  GROQ_API_KEY: 'test-groq-secret',
  PDF_AI_EXPECTED_HOSTNAME: 'hotrosinhvienhub.id.vn',
};

const requestFor = (body: Record<string, unknown>) => new Request(
  'https://hotrosinhvienhub.id.vn/api/public/v1/pdf-ai',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '198.51.100.90',
      Cookie: 'must-not-be-used',
    },
    body: JSON.stringify(body),
  },
);

test('PDF imports use a same-origin Worker route with no Supabase Edge fallback', () => {
  for (const file of ['utils/pdfImport.ts', 'utils/schedulePdfImport.ts']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /requestPdfAi/);
    assert.doesNotMatch(source, /apiUrl\(|apiHeaders\(|\/chat|\/functions\/v1\/|supabase\.co/);
  }
  const client = readFileSync('utils/pdfAiApi.ts', 'utf8');
  assert.match(client, /['"]\/api\/public\/v1\/pdf-ai['"]/);
  assert.match(client, /credentials:\s*'omit'/);
  assert.doesNotMatch(client, /supabase\.(?:auth|from|rpc|storage)|apiUrl\(|apiHeaders\(|\/functions\/v1\/|supabase\.co/i);
  const worker = readFileSync('cloudflare/worker/src/index.ts', 'utf8');
  assert.match(worker, /requestUrl\.pathname === '\/api\/public\/v1\/pdf-ai'/);

  const gradeFlow = readFileSync('hooks/useTranscriptTransfer.ts', 'utf8');
  assert.match(gradeFlow, /parseHubPdf\(file, gradeImportTurnstileToken\)/);
  assert.doesNotMatch(gradeFlow, /verifyTurnstileOnly/);
  for (const file of ['components/ScheduleBoard.tsx', 'components/MobileSchedule.tsx']) {
    const source = readFileSync(file, 'utf8');
    const start = source.indexOf('const handlePdfUpload');
    const end = source.indexOf('const handleConfirmScheduleImport', start);
    const pdfFlow = source.slice(start, end);
    assert.match(pdfFlow, /parseSchedulePdf\(file, scheduleImportTurnstileToken\)/);
    assert.doesNotMatch(pdfFlow, /verifyTurnstileOnly|apiUrl\(|apiHeaders\(|supabase\.|\/functions\/v1\/|supabase\.co/);
  }
});

test('PDF AI verifies a Turnstile token once then calls Groq without cookies or browser identity', async () => {
  resetPdfAiRateLimitForTest();
  const originalFetch = globalThis.fetch;
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, init });
    if (url.includes('/turnstile/v0/siteverify')) {
      return new Response(JSON.stringify({ success: true, hostname: 'hotrosinhvienhub.id.vn' }), { status: 200 });
    }
    if (url.includes('api.groq.com')) {
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"courses":[]}' }, finish_reason: 'stop' }],
      }), { status: 200 });
    }
    throw new Error('unexpected outbound endpoint');
  }) as typeof fetch;

  try {
    const result = await handlePdfAi(requestFor({
      message: 'sanitised extracted PDF text',
      turnstileToken: 'single-use-token',
    }), environment);
    assert.deepEqual(result, { reply: '{"courses":[]}' });
    assert.equal(seen.filter((entry) => entry.url.includes('/turnstile/v0/siteverify')).length, 1);
    assert.equal(seen.filter((entry) => entry.url.includes('api.groq.com')).length, 1);
    const providerHeaders = new Headers(seen.find((entry) => entry.url.includes('api.groq.com'))?.init?.headers);
    assert.equal(providerHeaders.get('Cookie'), null);
    assert.equal(providerHeaders.get('Authorization'), 'Bearer test-groq-secret');
    assert.doesNotMatch(String(seen.find((entry) => entry.url.includes('api.groq.com'))?.init?.body), /single-use-token/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PDF AI chooses from all five non-empty Groq slots and retries with a bounded random failover policy', async () => {
  resetPdfAiRateLimitForTest();
  const originalFetch = globalThis.fetch;
  const originalRandom = Math.random;
  const selectedSlots: string[] = [];
  const randomValues = [0, 0.21, 0.41, 0.61, 0.81, 0, 0.21, 0.41];
  Math.random = () => randomValues.shift() ?? 0;
  const fiveKeyEnvironment = {
    ...environment,
    GROQ_API_KEY: 'slot-1',
    GROQ_API_KEY_2: 'slot-2',
    GROQ_API_KEY_3: 'slot-3',
    GROQ_API_KEY_4: 'slot-4',
    GROQ_API_KEY_5: 'slot-5',
  };
  let providerAttempt = 0;
  let forceSuccess = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/turnstile/v0/siteverify')) {
      return new Response(JSON.stringify({ success: true, hostname: 'hotrosinhvienhub.id.vn' }), { status: 200 });
    }
    providerAttempt += 1;
    selectedSlots.push(String(new Headers(init?.headers).get('Authorization')));
    if (!forceSuccess && providerAttempt <= 2) {
      return new Response(JSON.stringify({ error: { message: 'provider detail must not escape' } }), { status: 500 });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await handlePdfAi(requestFor({ message: 'text', turnstileToken: 'valid-token' }), fiveKeyEnvironment);
    assert.deepEqual(result, { reply: '{"ok":true}' });
    assert.equal(providerAttempt, 3);
    assert.deepEqual(selectedSlots, ['Bearer slot-1', 'Bearer slot-2', 'Bearer slot-3']);

    selectedSlots.length = 0;
    providerAttempt = 0;
    forceSuccess = true;
    for (let index = 0; index < 5; index += 1) {
      await handlePdfAi(requestFor({ message: 'text', turnstileToken: `valid-token-${index}` }), fiveKeyEnvironment);
    }
    assert.deepEqual(selectedSlots, ['Bearer slot-4', 'Bearer slot-5', 'Bearer slot-1', 'Bearer slot-2', 'Bearer slot-3']);
  } finally {
    globalThis.fetch = originalFetch;
    Math.random = originalRandom;
  }
});

test('invalid Turnstile blocks PDF AI before any provider call and maps to a safe 403', async () => {
  resetPdfAiRateLimitForTest();
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('api.groq.com')) providerCalls += 1;
    return new Response(JSON.stringify({ success: false, hostname: 'hotrosinhvienhub.id.vn' }), { status: 200 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => handlePdfAi(requestFor({ message: 'text', turnstileToken: 'expired-token' }), environment),
      (error: unknown) => error instanceof PdfAiError && error.status === 403 &&
        error.message === 'Xác minh bảo mật không thành công. Vui lòng thử lại.',
    );
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('missing Public Worker secrets fail closed before PDF data reaches either external service', async () => {
  resetPdfAiRateLimitForTest();
  const originalFetch = globalThis.fetch;
  let outboundCalls = 0;
  globalThis.fetch = (async () => {
    outboundCalls += 1;
    throw new Error('must not be called');
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => handlePdfAi(requestFor({ message: 'text', turnstileToken: 'valid-token' }), {}),
      (error: unknown) => error instanceof PdfAiError && error.status === 503,
    );
    assert.equal(outboundCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider failures do not leak provider details and malformed requests cannot submit a user id', async () => {
  resetPdfAiRateLimitForTest();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('/turnstile/v0/siteverify')) {
      return new Response(JSON.stringify({ success: true, hostname: 'hotrosinhvienhub.id.vn' }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: 'sensitive provider trace' } }), { status: 500 });
  }) as typeof fetch;
  try {
    await assert.rejects(
      () => handlePdfAi(requestFor({ message: 'text', turnstileToken: 'valid-token' }), environment),
      (error: unknown) => error instanceof PdfAiError && error.status === 502 &&
        !error.message.includes('sensitive provider trace'),
    );
    await assert.rejects(
      () => handlePdfAi(requestFor({
        message: 'text', turnstileToken: 'valid-token', userId: 'caller-controlled',
      }), environment),
      (error: unknown) => error instanceof PdfAiError && error.status === 400,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
