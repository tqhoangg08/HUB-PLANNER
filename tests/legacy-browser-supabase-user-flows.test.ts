import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  handleCtvRegistration,
  handleProtectedSubmission,
  UserSubmissionError,
} from '../cloudflare/worker/src/user-submissions.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const COOKIE = 'hubplanner_auth.session_token=opaque';

const env = {
  SUPABASE_URL: 'https://source.example',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
  AUTH_SERVICE: {
    fetch: async () => Response.json({
      userId: USER_ID,
      email: '030841250048@st.buh.edu.vn',
      role: 'user',
    }),
  },
} as never;

test('the four affected flows no longer acquire a browser Supabase session', () => {
  const protectedSubmit = readFileSync('utils/protectedSubmit.ts', 'utf8');
  const ctv = readFileSync('components/CTVRegistrationForm.tsx', 'utf8');
  const notifications = readFileSync('utils/moderatorNotifications.ts', 'utf8');
  const transcript = readFileSync('hooks/useTranscriptTransfer.ts', 'utf8');
  const scheduleParser = readFileSync('utils/schedulePdfImport.ts', 'utf8');
  const transcriptParser = readFileSync('utils/pdfImport.ts', 'utf8');
  const participationApi = readFileSync('utils/eventParticipationsApi.ts', 'utf8');
  const eventsDesktop = readFileSync('components/EventsBoard.tsx', 'utf8');
  const eventsMobile = readFileSync('components/MobileEvents.tsx', 'utf8');

  assert.match(protectedSubmit, /fetch\('\/api\/submissions\/v1\/protected'/);
  assert.match(protectedSubmit, /credentials: 'include'/);
  assert.doesNotMatch(protectedSubmit, /utils\/supabase|supabase\.(?:auth|from|rpc|storage)|getSession/);
  assert.match(ctv, /submitCtvRegistration\(formData\)/);
  assert.doesNotMatch(ctv, /utils\/supabase|supabase\.(?:auth|from|rpc|storage)|getSession/);
  assert.match(notifications, /\/api\/submissions\/v1\/moderator-notifications/);
  assert.doesNotMatch(notifications, /utils\/supabase|supabase\.(?:auth|from|rpc|storage)|getSession/);
  assert.match(transcript, /parseHubPdf\(file, gradeImportTurnstileToken\)/);
  assert.doesNotMatch(transcriptParser, /utils\/supabase|supabase\.(?:auth|from|rpc|storage)|getSession/);
  assert.doesNotMatch(scheduleParser, /utils\/supabase|supabase\.(?:auth|from|rpc|storage)|getSession/);
  assert.match(participationApi, /credentials: 'include'/);
  assert.doesNotMatch(participationApi, /utils\/supabase|supabase\.(?:auth|from|rpc|storage)|getSession|Authorization.*Bearer/);
  for (const eventsSource of [eventsDesktop, eventsMobile]) {
    const participationStart = eventsSource.indexOf('const loadParticipation');
    const participationEnd = eventsSource.indexOf('const toggleParticipation', participationStart);
    const participationBlock = eventsSource.slice(participationStart, participationEnd);
    assert.doesNotMatch(participationBlock, /supabase\.(?:auth|from|rpc|storage)|getSession|user_participations/);
  }
});

test('protected submission forwards only an allowlisted action and server-derived owner', async () => {
  const calls: Array<{ url: string; authorization: string; body: Record<string, unknown> }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      authorization: String(new Headers(init?.headers).get('Authorization') || ''),
      body: JSON.parse(String(init?.body || '{}')) as Record<string, unknown>,
    });
    return Response.json({ success: true, id: 7 });
  }) as typeof fetch;
  try {
    const result = await handleProtectedSubmission(new Request(
      'https://app.example/api/submissions/v1/protected',
      {
        method: 'POST',
        headers: { Cookie: COOKIE },
        body: JSON.stringify({
          action: 'lost-found',
          turnstileToken: 'turnstile-token',
          payload: {
            title: 'Ví', location: 'HUB', contact_info: '0900',
            user_id: '99999999-9999-4999-8999-999999999999',
            ownerId: '99999999-9999-4999-8999-999999999999',
          },
        }),
      },
    ), env) as { success?: boolean };
    assert.equal(result.success, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/functions\/v1\/auth\?resource=protected-submit$/);
    assert.equal(calls[0].authorization, 'Bearer anon-key');
    const payload = calls[0].body.payload as Record<string, unknown>;
    assert.equal(payload.user_id, USER_ID);
    assert.equal('ownerId' in payload, false);
    assert.doesNotMatch(JSON.stringify(calls), /server-only-key/);

    await assert.rejects(handleProtectedSubmission(new Request(
      'https://app.example/api/submissions/v1/protected',
      { method: 'POST', body: JSON.stringify({ action: 'arbitrary-proxy', turnstileToken: 'x' }) },
    ), env), (error: unknown) => error instanceof UserSubmissionError && error.status === 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unrelated browser cookies do not turn guest protected submissions into auth failures', async () => {
  let authServiceCalls = 0;
  const guestEnv = {
    ...env,
    AUTH_SERVICE: { fetch: async () => { authServiceCalls += 1; return new Response(null, { status: 401 }); } },
  } as never;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ success: true, verified: true })) as typeof fetch;
  try {
    const result = await handleProtectedSubmission(new Request(
      'https://app.example/api/submissions/v1/protected',
      {
        method: 'POST',
        headers: { Cookie: 'theme=dark; cf_clearance=opaque' },
        body: JSON.stringify({ action: 'verify-only', turnstileToken: 'token' }),
      },
    ), guestEnv) as { verified?: boolean };
    assert.equal(result.verified, true);
    assert.equal(authServiceCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CTV registration uses a server allowlist and Better Auth identity when available', async () => {
  const calls: Array<{ authorization: string; body: unknown }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      authorization: String(new Headers(init?.headers).get('Authorization') || ''),
      body: JSON.parse(String(init?.body || '[]')),
    });
    return Response.json([{ id: 42 }], { status: 201 });
  }) as typeof fetch;
  try {
    const result = await handleCtvRegistration(new Request(
      'https://app.example/api/submissions/v1/ctv-requests',
      {
        method: 'POST',
        headers: { Cookie: COOKIE },
        body: JSON.stringify({
          full_name: 'Sinh viên HUB', student_batch: 'K41', major: 'CNTT',
          contact_info: '0900', status: 'approved', extra: 'ignored',
        }),
      },
    ), env);
    assert.equal(result.id, 42);
    assert.equal(calls[0].authorization, 'Bearer server-only-key');
    const row = (calls[0].body as Array<Record<string, unknown>>)[0];
    assert.deepEqual(Object.keys(row).sort(), [
      'contact_info', 'full_name', 'major', 'status', 'student_batch', 'user_id',
    ]);
    assert.equal(row.user_id, USER_ID);
    assert.equal(row.status, 'pending');

    await assert.rejects(handleCtvRegistration(new Request(
      'https://app.example/api/submissions/v1/ctv-requests',
      {
        method: 'POST',
        body: JSON.stringify({
          full_name: 'A', student_batch: 'K41', major: 'CNTT', contact_info: '0900',
          user_id: '99999999-9999-4999-8999-999999999999',
        }),
      },
    ), env), (error: unknown) => error instanceof UserSubmissionError && error.status === 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('lost-and-found submissions and edits use Worker bridges without browser Supabase', () => {
  for (const file of ['components/LostFoundBoard.tsx', 'components/MobileLostFound.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /action: 'lost-found'/);
    assert.match(source, /updateAdminLostFound\(editingItem\.id/);
    assert.match(source, /\} else \{\s+const data = await protectedSubmit<\{ id\?: number \}>\(\{/);
    const protectedCall = source.slice(source.indexOf("action: 'lost-found'") - 100,
      source.indexOf("action: 'lost-found'") + 900);
    assert.doesNotMatch(protectedCall, /supabase\.(?:auth|from|rpc|storage)|getSession|user_id\s*:/);
    assert.doesNotMatch(source, /utils\/supabase|supabase\.(?:auth|from|rpc|storage)|isBrowserSupabaseConfigured/);
  }
});
