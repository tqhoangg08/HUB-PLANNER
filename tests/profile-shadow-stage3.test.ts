import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { BetterAuthIdentityError } from '../cloudflare/worker/src/better-auth-identity.ts';
import { handlePrivateProfile } from '../cloudflare/worker/src/private-profile.ts';
import { handleProfileShadowInternalMirror } from '../cloudflare/worker/src/profile-shadow-internal.ts';
import {
  ProfileShadowError,
  canonicalizePrivateProfileSemesters,
  compareProfileShadowRead,
  getProfileShadowCohortBucket,
  isProfileD1ShadowWriteEligible,
  mirrorAuthoritativeProfileToD1,
  projectSourcePrivateProfile,
  projectSourcePublicProfile,
  writeProfileD1Authority,
} from '../cloudflare/worker/src/profile-shadow.ts';
import {
  projectPrivateProfileRow,
  projectProfileRow,
} from '../scripts/profile-shadow-reconciliation.mjs';
import { mirrorProfileShadowAfterSourceWrite } from '../supabase/functions/_shared/profile-shadow-mirror.ts';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const signMirrorBody = async (secret: string, timestamp: string, nonce: string, body: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${nonce}.${body}`),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const PUBLIC_SOURCE = {
  id: USER_A,
  student_code: '030800000001',
  full_name: 'Student A',
  avatar_url: null,
  bio: 'Bio',
  class_name: 'K01',
  class_name_overridden: false,
  profile_tags: [{ z: 1, a: 2 }],
  public_profile_enabled: true,
  show_profile_stats: false,
  public_gpa: 3.5,
  public_completed_semesters: 4,
  public_credits: 80,
  created_at: '2026-01-01 00:00:00+00',
  updated_at: '2026-01-02 00:00:00+00',
};

const PRIVATE_SOURCE = {
  user_id: USER_A,
  data: { studentName: 'Student A', semesters: [{ name: 'HK1' }] },
  student_name: 'Student A',
  cohort: '2026',
  major_name: 'Major',
  specialization_name: null,
  program_name: 'Program',
  semesters: [{ name: 'HK1' }],
  target_gpa: 3.8,
  total_credits_required: 120,
  has_onboarded: true,
  lookback_seen: { dashboard: true },
  updated_at: '2026-01-02 00:00:00+00',
};

type FakeD1Options = {
  publicRow?: Record<string, unknown> | null;
  privateRow?: Record<string, unknown> | null;
  existingPrivateData?: string | null;
  failBatch?: boolean;
  failRead?: boolean;
};

const fakeD1 = (options: FakeD1Options = {}) => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const batches: Array<Array<{ sql: string; values: unknown[] }>> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const statement = {
            sql,
            values,
            async first() {
              calls.push({ sql, values });
              if (options.failRead) throw new Error('simulated D1 read failure');
              if (sql.includes('SELECT data_json FROM user_profile_private')) {
                return options.existingPrivateData === undefined
                  ? null
                  : { data_json: options.existingPrivateData };
              }
              if (sql.includes('FROM user_profile_private')) return options.privateRow ?? null;
              if (sql.includes('FROM user_profiles')) return options.publicRow ?? null;
              return null;
            },
          };
          return statement;
        },
      };
    },
    async batch(statements: Array<{ sql: string; values: unknown[] }>) {
      if (options.failBatch) throw new Error('simulated D1 failure');
      batches.push(statements);
      return [];
    },
  };
  return { db: db as never, calls, batches };
};

const d1Rows = async () => {
  const publicProjection = await projectSourcePublicProfile(PUBLIC_SOURCE);
  const privateProjection = await projectSourcePrivateProfile(PRIVATE_SOURCE);
  return {
    publicRow: {
      user_id: USER_A,
      canonical_hash: publicProjection?.canonical_hash,
      row_version: 1,
    },
    privateRow: {
      user_id: USER_A,
      data_json: privateProjection?.data_json,
      canonical_hash: privateProjection?.canonical_hash,
      row_version: 1,
    },
  };
};

const d1AuthorityRows = () => ({
  publicRow: {
    user_id: USER_A,
    student_code: PUBLIC_SOURCE.student_code,
    full_name: PUBLIC_SOURCE.full_name,
    avatar_url: PUBLIC_SOURCE.avatar_url,
    bio: PUBLIC_SOURCE.bio,
    class_name: PUBLIC_SOURCE.class_name,
    class_name_overridden: 0,
    profile_tags_json: JSON.stringify([{ a: 2, z: 1 }]),
    public_profile_enabled: 1,
    show_profile_stats: 0,
    public_gpa: PUBLIC_SOURCE.public_gpa,
    public_completed_semesters: PUBLIC_SOURCE.public_completed_semesters,
    public_credits: PUBLIC_SOURCE.public_credits,
    created_at: PUBLIC_SOURCE.created_at,
    updated_at: PUBLIC_SOURCE.updated_at,
  },
  privateRow: {
    user_id: USER_A,
    data_json: JSON.stringify(PRIVATE_SOURCE.data),
    student_name: PRIVATE_SOURCE.student_name,
    cohort: PRIVATE_SOURCE.cohort,
    major_name: PRIVATE_SOURCE.major_name,
    specialization_name: PRIVATE_SOURCE.specialization_name,
    program_name: PRIVATE_SOURCE.program_name,
    semesters_json: JSON.stringify(PRIVATE_SOURCE.semesters),
    target_gpa: PRIVATE_SOURCE.target_gpa,
    total_credits_required: PRIVATE_SOURCE.total_credits_required,
    has_onboarded: 1,
    lookback_seen_json: JSON.stringify(PRIVATE_SOURCE.lookback_seen),
    updated_at: PRIVATE_SOURCE.updated_at,
  },
});

const authService = (userId = USER_A) => ({
  fetch: async () => Response.json({
    userId,
    email: 'student@st.buh.edu.vn',
    role: 'user',
  }),
});

const fileText = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('shared Stage 2 and Worker canonical projections produce identical hashes', async () => {
  assert.deepEqual(await projectSourcePublicProfile(PUBLIC_SOURCE), projectProfileRow(PUBLIC_SOURCE));
  assert.deepEqual(await projectSourcePrivateProfile(PRIVATE_SOURCE), projectPrivateProfileRow(PRIVATE_SOURCE));
});

test('semesters canonicalization defines populated, empty, null, and multi-semester semantics', () => {
  const populated = canonicalizePrivateProfileSemesters({}, {
    semesters: [{ name: 'Term A', subjects: [{ credits: 3, code: 'X' }] }],
  });
  assert.deepEqual(populated.semesters, [
    { name: 'Term A', subjects: [{ code: 'X', credits: 3 }] },
  ]);

  const empty = canonicalizePrivateProfileSemesters({}, { semesters: [] });
  assert.deepEqual(empty.semesters, []);
  assert.equal(JSON.stringify(empty.semesters), '[]');

  assert.equal(canonicalizePrivateProfileSemesters({}, {}).semesters, null);
  assert.equal(canonicalizePrivateProfileSemesters({}, { semesters: null }).semesters, null);

  const multiple = canonicalizePrivateProfileSemesters({}, {
    semesters: [
      { name: 'Term B', optional: null },
      { subjects: [], name: 'Term A' },
    ],
  });
  assert.deepEqual(multiple.semesters, [
    { name: 'Term B', optional: null },
    { name: 'Term A', subjects: [] },
  ]);
});

test('semesters canonicalization preserves an existing transcript against sparse overwrite', () => {
  const existing = {
    semesters: [{ name: 'Term A', subjects: [{ code: 'X' }] }],
  };
  const result = canonicalizePrivateProfileSemesters(existing, { semesters: [] });
  assert.deepEqual(result.semesters, existing.semesters);
  assert.deepEqual(result.data.semesters, existing.semesters);
});

test('semesters canonical hash is stable across JSON object key order', async () => {
  const first = await projectSourcePrivateProfile({
    ...PRIVATE_SOURCE,
    data: { semesters: [{ name: 'Term A', subjects: [{ code: 'X', credits: 3 }] }] },
    semesters: [{ name: 'Term A', subjects: [{ code: 'X', credits: 3 }] }],
  });
  const second = await projectSourcePrivateProfile({
    ...PRIVATE_SOURCE,
    data: { semesters: [{ subjects: [{ credits: 3, code: 'X' }], name: 'Term A' }] },
    semesters: [{ subjects: [{ credits: 3, code: 'X' }], name: 'Term A' }],
  });
  assert.equal(first?.semesters_json, second?.semesters_json);
  assert.equal(first?.canonical_hash, second?.canonical_hash);
});

test('D1 authority derives semesters_json from canonical data and repeated writes are idempotent', async () => {
  const staleRows = d1AuthorityRows();
  staleRows.privateRow.semesters_json = JSON.stringify([{ name: 'Stale' }]);
  const { db, batches } = fakeD1(staleRows);
  const data = {
    studentName: PRIVATE_SOURCE.student_name,
    cohort: PRIVATE_SOURCE.cohort,
    majorName: PRIVATE_SOURCE.major_name,
    specializationName: 'Specialization',
    programName: PRIVATE_SOURCE.program_name,
    targetGPA: PRIVATE_SOURCE.target_gpa,
    totalCreditsRequired: PRIVATE_SOURCE.total_credits_required,
    hasOnboarded: true,
    lookbackSeen: PRIVATE_SOURCE.lookback_seen,
    semesters: [
      { subjects: [{ credits: 3, code: 'X' }], name: 'Term A' },
      { name: 'Term B', subjects: [] },
    ],
  };
  const input = {
    userId: USER_A,
    email: 'student@st.buh.edu.vn',
    publicProfile: {},
    privateProfile: { data },
    now: '2026-01-03T00:00:00.000Z',
  };
  const first = await writeProfileD1Authority({ DB: db }, input);
  const second = await writeProfileD1Authority({ DB: db }, input);
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[0][1].values, batches[1][1].values);
  assert.equal(
    batches[0][1].values[7],
    JSON.stringify([
      { name: 'Term A', subjects: [{ code: 'X', credits: 3 }] },
      { name: 'Term B', subjects: [] },
    ]),
  );
  assert.deepEqual(first.compatibilityPrivateProfile, second.compatibilityPrivateProfile);
  assert.deepEqual(first.compatibilityPrivateProfile.data, JSON.parse(String(batches[0][1].values[1])));
});

test('D1 authority repairs derived profile columns and ignores stale hasOnboarded', async () => {
  const rows = d1AuthorityRows();
  rows.privateRow.student_name = null;
  rows.privateRow.cohort = null;
  rows.privateRow.program_name = null;
  rows.privateRow.major_name = null;
  rows.privateRow.specialization_name = null;
  rows.privateRow.has_onboarded = 0;
  const { db, batches } = fakeD1(rows);
  await writeProfileD1Authority({ DB: db }, {
    userId: USER_A,
    email: 'student@st.buh.edu.vn',
    publicProfile: {},
    privateProfile: { data: {
      studentName: 'Student A', cohort: '2026', programName: 'Program', majorName: 'Major',
      specializationName: 'Specialization', targetGPA: 3.2, totalCreditsRequired: 125,
      hasOnboarded: false, semesters: [],
    } },
  });
  const values = batches[0][1].values;
  assert.equal(values[2], 'Student A');
  assert.equal(values[3], '2026');
  assert.equal(values[4], 'Major');
  assert.equal(values[5], 'Specialization');
  assert.equal(values[6], 'Program');
  assert.equal(values[10], 1);

  const incomplete = d1AuthorityRows();
  const { db: incompleteDb, batches: incompleteBatches } = fakeD1(incomplete);
  await writeProfileD1Authority({ DB: incompleteDb }, {
    userId: USER_A,
    email: 'student@st.buh.edu.vn',
    publicProfile: {},
    privateProfile: { data: {
      studentName: 'Student A', cohort: '2026', programName: 'Program', majorName: '',
      specializationName: 'Specialization', hasOnboarded: true, semesters: [],
    } },
  });
  assert.equal(incompleteBatches[0][1].values[10], 0);
});

test('shadow compare exact match', async () => {
  const rows = await d1Rows();
  const { db } = fakeD1(rows);
  const result = await compareProfileShadowRead({ DB: db }, USER_A, PUBLIC_SOURCE, PRIVATE_SOURCE);
  assert.equal(result.status, 'match');
  assert.equal(result.metrics.PROFILE_SHADOW_MATCH, 1);
});

test('shadow compare profile with no private row', async () => {
  const projected = await projectSourcePublicProfile(PUBLIC_SOURCE);
  const { db } = fakeD1({
    publicRow: { user_id: USER_A, canonical_hash: projected?.canonical_hash, row_version: 1 },
    privateRow: null,
  });
  const result = await compareProfileShadowRead({ DB: db }, USER_A, PUBLIC_SOURCE, null);
  assert.equal(result.status, 'match');
});

test('shadow compare Better Auth-only user does not synthesize a row', async () => {
  const { db, batches } = fakeD1({ publicRow: null, privateRow: null });
  const result = await compareProfileShadowRead({ DB: db }, USER_A, null, null);
  assert.equal(result.status, 'match');
  assert.equal(batches.length, 0);
});

test('shadow compare detects canonical hash mismatch', async () => {
  const rows = await d1Rows();
  const { db } = fakeD1({
    ...rows,
    privateRow: { ...rows.privateRow, canonical_hash: '0'.repeat(64) },
  });
  const result = await compareProfileShadowRead({ DB: db }, USER_A, PUBLIC_SOURCE, PRIVATE_SOURCE);
  assert.equal(result.status, 'mismatch');
  assert.equal(result.metrics.PROFILE_SHADOW_MISMATCH, 1);
});

test('shadow compare detects a missing D1 row', async () => {
  const rows = await d1Rows();
  const { db } = fakeD1({ publicRow: rows.publicRow, privateRow: null });
  const result = await compareProfileShadowRead({ DB: db }, USER_A, PUBLIC_SOURCE, PRIVATE_SOURCE);
  assert.equal(result.status, 'mismatch');
  assert.equal(result.metrics.PROFILE_SHADOW_MISSING_D1, 1);
});

test('authenticated GET keeps the Supabase response contract and scopes both reads to Better Auth owner', async () => {
  const rows = await d1Rows();
  const { db, calls } = fakeD1(rows);
  const sourceUrls: string[] = [];
  const scheduled: Promise<unknown>[] = [];
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  console.log = () => undefined;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    sourceUrls.push(url);
    return Response.json(url.includes('profile_private_data') ? [PRIVATE_SOURCE] : [PUBLIC_SOURCE]);
  }) as typeof fetch;
  try {
    const result = await handlePrivateProfile(new Request(
      `https://app.example/api/user/v1/profile?userId=${USER_B}`,
      { headers: { Cookie: 'better-auth.session_token=opaque' } },
    ), {
      AUTH_SERVICE: authService(),
      SUPABASE_URL: 'https://source.example',
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
      DB: db,
      PROFILE_D1_SHADOW_READ_ENABLED: 'true',
    }, { waitUntil: (promise) => scheduled.push(promise) });
    await Promise.all(scheduled);
    assert.deepEqual(result, {
      success: true,
      publicProfile: {
        full_name: 'Student A', avatar_url: null, bio: 'Bio', class_name: 'K01',
        class_name_overridden: false, profile_tags: [{ z: 1, a: 2 }],
        public_profile_enabled: true, show_profile_stats: false, public_gpa: 3.5,
        public_completed_semesters: 4, public_credits: 80,
      },
      privateProfile: {
        data: PRIVATE_SOURCE.data,
        updated_at: PRIVATE_SOURCE.updated_at,
      },
    });
    assert.ok(sourceUrls.every((url) => url.includes(`eq.${USER_A}`)));
    assert.ok(sourceUrls.every((url) => !url.includes(USER_B)));
    assert.ok(calls.every((call) => call.values[0] === USER_A));
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

test('D1-authoritative GET preserves the response contract without any Supabase read', async () => {
  const { db, calls } = fakeD1(d1AuthorityRows());
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const diagnostics: string[] = [];
  let outboundCalls = 0;
  globalThis.fetch = (async () => {
    outboundCalls += 1;
    throw new Error('D1 authority must not call Supabase');
  }) as typeof fetch;
  console.log = (...values: unknown[]) => diagnostics.push(values.map(String).join(' '));
  try {
    const result = await handlePrivateProfile(new Request(
      `https://app.example/api/user/v1/profile?userId=${USER_B}`,
      { headers: { Cookie: 'better-auth.session_token=opaque' } },
    ), {
      AUTH_SERVICE: authService(),
      SUPABASE_URL: 'https://source.example',
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
      DB: db,
      PROFILE_READ_AUTHORITY: 'd1',
      PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
      PROFILE_D1_SHADOW_WRITE_PERCENT: '100',
    });
    assert.deepEqual(result, {
      success: true,
      publicProfile: {
        full_name: 'Student A', avatar_url: null, bio: 'Bio', class_name: 'K01',
        class_name_overridden: false, profile_tags: [{ a: 2, z: 1 }],
        public_profile_enabled: true, show_profile_stats: false, public_gpa: 3.5,
        public_completed_semesters: 4, public_credits: 80,
      },
      privateProfile: {
        data: PRIVATE_SOURCE.data,
        updated_at: PRIVATE_SOURCE.updated_at,
      },
    });
    assert.equal(outboundCalls, 0);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.values[0] === USER_A));
    assert.ok(diagnostics.some((entry) => entry.includes('profile_authoritative_read')));
    assert.ok(diagnostics.every((entry) => !entry.includes(USER_A)));
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

test('D1-authoritative GET preserves Better Auth-only empty profile behavior', async () => {
  const { db, batches } = fakeD1({ publicRow: null, privateRow: null });
  const originalLog = console.log;
  console.log = () => undefined;
  try {
    const result = await handlePrivateProfile(new Request('https://app.example/api/user/v1/profile', {
      headers: { Cookie: 'better-auth.session_token=opaque' },
    }), {
      AUTH_SERVICE: authService(),
      DB: db,
      PROFILE_READ_AUTHORITY: 'd1',
    });
    assert.deepEqual(result, { success: true, publicProfile: null, privateProfile: null });
    assert.equal(batches.length, 0);
  } finally {
    console.log = originalLog;
  }
});

test('D1-authoritative GET fails closed and never falls back to Supabase', async () => {
  const { db } = fakeD1({ failRead: true });
  const originalFetch = globalThis.fetch;
  let sourceCalls = 0;
  globalThis.fetch = (async () => {
    sourceCalls += 1;
    return Response.json([PUBLIC_SOURCE]);
  }) as typeof fetch;
  try {
    await assert.rejects(
      handlePrivateProfile(new Request('https://app.example/api/user/v1/profile', {
        headers: { Cookie: 'better-auth.session_token=opaque' },
      }), {
        AUTH_SERVICE: authService(),
        SUPABASE_URL: 'https://source.example',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
        DB: db,
        PROFILE_READ_AUTHORITY: 'd1',
      }),
      (error: unknown) => (error as { status?: number }).status === 503,
    );
    assert.equal(sourceCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('D1-authoritative PATCH writes only D1 and makes no Supabase compatibility call', async () => {
  const { db, batches } = fakeD1(d1AuthorityRows());
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let sourceCalls = 0;
  const diagnostics: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).startsWith('https://source.example')) sourceCalls += 1;
    throw new Error('Supabase compatibility must be disabled');
  }) as typeof fetch;
  console.log = (...values: unknown[]) => diagnostics.push(values.map(String).join(' '));
  try {
    const result = await handlePrivateProfile(new Request('https://app.example/api/user/v1/profile', {
      method: 'PATCH',
      headers: { Cookie: 'better-auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicProfile: { bio: 'D1 authority' } }),
    }), {
      AUTH_SERVICE: authService(), DB: db,
      PROFILE_READ_AUTHORITY: 'd1',
      PROFILE_WRITE_AUTHORITY: 'd1',
    });
    assert.deepEqual(result, { success: true });
    assert.equal(sourceCalls, 0);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].length, 1);
    assert.equal(batches[0][0].values[0], USER_A);
    assert.equal(batches[0][0].values[4], 'D1 authority');
    assert.ok(diagnostics.some((entry) => entry.includes('profile_authoritative_write')));
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});

test('unauthenticated profile GET is rejected before source or D1 access', async () => {
  const { db, calls } = fakeD1();
  const originalFetch = globalThis.fetch;
  let sourceCalls = 0;
  globalThis.fetch = (async () => {
    sourceCalls += 1;
    return Response.json([]);
  }) as typeof fetch;
  try {
    await assert.rejects(
      handlePrivateProfile(new Request('https://app.example/api/user/v1/profile'), {
        AUTH_SERVICE: { fetch: async () => Response.json({}, { status: 401 }) },
        SUPABASE_URL: 'https://source.example',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
        DB: db,
      }),
      (error: unknown) => error instanceof BetterAuthIdentityError && error.status === 401,
    );
    assert.equal(sourceCalls, 0);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mirror plumbing uses canonical owner projections and is disabled by default', async () => {
  const disabled = fakeD1();
  assert.deepEqual(
    await mirrorAuthoritativeProfileToD1(
      { DB: disabled.db }, USER_A, PUBLIC_SOURCE, PRIVATE_SOURCE,
    ),
    { status: 'disabled' },
  );
  assert.equal(disabled.batches.length, 0);

  const enabled = fakeD1({ existingPrivateData: '{}' });
  const result = await mirrorAuthoritativeProfileToD1(
    { DB: enabled.db, PROFILE_D1_SHADOW_WRITE_ENABLED: 'true' },
    USER_A,
    PUBLIC_SOURCE,
    PRIVATE_SOURCE,
  );
  assert.equal(result.status, 'mirrored');
  assert.equal(enabled.batches.length, 1);
  assert.equal(enabled.batches[0].length, 2);
  assert.equal(enabled.batches[0][0].values[0], USER_A);
  assert.equal(enabled.batches[0][1].values[0], USER_A);
});

test('private mirror blocks an empty overwrite of existing meaningful data', async () => {
  const { db, batches } = fakeD1({ existingPrivateData: '{"semesters":[{"name":"HK1"}]}' });
  await assert.rejects(
    mirrorAuthoritativeProfileToD1(
      { DB: db, PROFILE_D1_SHADOW_WRITE_ENABLED: 'true' },
      USER_A,
      PUBLIC_SOURCE,
      { ...PRIVATE_SOURCE, data: {} },
    ),
    (error: unknown) => error instanceof ProfileShadowError &&
      error.code === 'PROFILE_SHADOW_EMPTY_PRIVATE_OVERWRITE_REJECTED',
  );
  assert.equal(batches.length, 0);
});

test('simulated D1 mirror failure does not change authoritative Supabase PATCH success', async () => {
  const rows = await d1Rows();
  const { db } = fakeD1({ ...rows, existingPrivateData: '{}', failBatch: true });
  const scheduled: Promise<unknown>[] = [];
  const sourceMethods: string[] = [];
  const diagnostics: string[] = [];
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sourceMethods.push(String(init?.method || 'GET'));
    if (init?.method === 'PATCH' || init?.method === 'POST') return new Response(null, { status: 204 });
    return Response.json(String(input).includes('profile_private_data') ? [PRIVATE_SOURCE] : [PUBLIC_SOURCE]);
  }) as typeof fetch;
  console.error = (...values: unknown[]) => diagnostics.push(values.map(String).join(' '));
  try {
    const result = await handlePrivateProfile(new Request('https://app.example/api/user/v1/profile', {
      method: 'PATCH',
      headers: {
        Cookie: 'better-auth.session_token=opaque',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ privateProfile: { data: PRIVATE_SOURCE.data } }),
    }), {
      AUTH_SERVICE: authService(),
      SUPABASE_URL: 'https://source.example',
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
      DB: db,
      PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
      PROFILE_D1_SHADOW_CANARY_USER_ID: USER_A,
    }, { waitUntil: (promise) => scheduled.push(promise) });
    await Promise.all(scheduled);
    assert.deepEqual(result, { success: true });
    assert.ok(sourceMethods.includes('POST'));
    assert.ok(diagnostics.some((entry) => entry.includes('profile_shadow_mirror_failed')));
    assert.ok(diagnostics.every((entry) => !entry.includes('Student A')));
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

test('browser profile writers route through the Better Auth Worker and contain no direct Supabase write', () => {
  const utility = fileText('../utils/profilePrivate.ts');
  const studyData = fileText('../hooks/useStudyData.ts');
  const accountDraft = fileText('../hooks/useAccountProfileDraft.ts');
  assert.match(utility, /updateOwnPrivateProfile\(\{ privateProfile:/);
  assert.doesNotMatch(utility, /\.from\(PROFILE_PRIVATE_TABLE\)\s*\.(?:insert|update|upsert|delete)/s);
  assert.doesNotMatch(studyData, /\.from\(STUDENT_PROFILE_TABLE\)\s*\.update/s);
  assert.doesNotMatch(
    accountDraft,
    /profileUpdatePayload\s*=\s*\{[\s\S]{0,2_000}?updated_at\s*:/,
    'browser profile updates must not send the server-managed updated_at field',
  );
});

test('profile PATCH rejects caller-controlled owner and forbidden fields before source mutation', async () => {
  const { db, batches } = fakeD1();
  const originalFetch = globalThis.fetch;
  let sourceCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).startsWith('https://source.example')) sourceCalls += 1;
    return Response.json([]);
  }) as typeof fetch;
  try {
    await assert.rejects(
      handlePrivateProfile(new Request('https://app.example/api/user/v1/profile', {
        method: 'PATCH',
        headers: { Cookie: 'better-auth.session_token=opaque', 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_B, publicProfile: { full_name: 'Other' } }),
      }), {
        AUTH_SERVICE: authService(), SUPABASE_URL: 'https://source.example',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-key', DB: db,
      }),
      (error: unknown) => (error as { status?: number }).status === 400,
    );
    await assert.rejects(
      handlePrivateProfile(new Request('https://app.example/api/user/v1/profile', {
        method: 'PATCH',
        headers: { Cookie: 'better-auth.session_token=opaque', 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicProfile: { role: 'admin' } }),
      }), {
        AUTH_SERVICE: authService(), SUPABASE_URL: 'https://source.example',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-key', DB: db,
      }),
      (error: unknown) => (error as { status?: number }).status === 400,
    );
    assert.equal(sourceCalls, 0);
    assert.equal(batches.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('source failure prevents any D1 mirror mutation', async () => {
  const { db, batches } = fakeD1({ existingPrivateData: '{}' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH' || init?.method === 'POST') {
      return Response.json({ error: 'source failure' }, { status: 500 });
    }
    return Response.json(String(input).includes('profile_private_data') ? [PRIVATE_SOURCE] : [PUBLIC_SOURCE]);
  }) as typeof fetch;
  try {
    await assert.rejects(
      handlePrivateProfile(new Request('https://app.example/api/user/v1/profile', {
        method: 'PATCH',
        headers: { Cookie: 'better-auth.session_token=opaque', 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicProfile: { bio: 'updated' } }),
      }), {
        AUTH_SERVICE: authService(), SUPABASE_URL: 'https://source.example',
        SUPABASE_SERVICE_ROLE_KEY: 'server-only-key', DB: db,
        PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
        PROFILE_D1_SHADOW_CANARY_USER_ID: USER_A,
      }),
      (error: unknown) => (error as { status?: number }).status === 502,
    );
    assert.equal(batches.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('legitimate first profile write creates authoritative source rows before shadow mirror', async () => {
  const { db, batches } = fakeD1({ existingPrivateData: null });
  const sourceMutations: Array<{ path: string; body: Record<string, unknown> }> = [];
  let created = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === 'POST') {
      sourceMutations.push({ path, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      if (path.includes('/profiles?')) created = true;
      return new Response(null, { status: 204 });
    }
    if (!created) return Response.json([]);
    return Response.json(path.includes('profile_private_data') ? [PRIVATE_SOURCE] : [PUBLIC_SOURCE]);
  }) as typeof fetch;
  try {
    const result = await handlePrivateProfile(new Request('https://app.example/api/user/v1/profile', {
      method: 'PATCH',
      headers: { Cookie: 'better-auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicProfile: { full_name: 'Student A' },
        privateProfile: { data: PRIVATE_SOURCE.data },
      }),
    }), {
      AUTH_SERVICE: authService(), SUPABASE_URL: 'https://source.example',
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key', DB: db,
      PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
      PROFILE_D1_SHADOW_CANARY_USER_ID: USER_A,
    });
    assert.deepEqual(result, { success: true });
    assert.equal(sourceMutations.length, 2);
    assert.ok(sourceMutations.every(({ body }) => !('role' in body)));
    assert.equal(sourceMutations[0].body.id, USER_A);
    assert.equal(sourceMutations[1].body.user_id, USER_A);
    assert.equal(batches.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('direct Worker profile writes mirror only the configured canary owner', async () => {
  const { db, batches } = fakeD1({ existingPrivateData: '{}' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH' || init?.method === 'POST') return new Response(null, { status: 204 });
    return Response.json(String(input).includes('profile_private_data') ? [PRIVATE_SOURCE] : [PUBLIC_SOURCE]);
  }) as typeof fetch;
  try {
    const result = await handlePrivateProfile(new Request('https://app.example/api/user/v1/profile', {
      method: 'PATCH',
      headers: { Cookie: 'better-auth.session_token=opaque', 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicProfile: { bio: 'source-only non-canary update' } }),
    }), {
      AUTH_SERVICE: authService(), SUPABASE_URL: 'https://source.example',
      SUPABASE_SERVICE_ROLE_KEY: 'server-only-key', DB: db,
      PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
      PROFILE_D1_SHADOW_CANARY_USER_ID: USER_B,
    });
    assert.deepEqual(result, { success: true });
    assert.equal(batches.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('D1 mirror retries are idempotent and reject stale canonical overwrites', async () => {
  const { db, batches } = fakeD1({ existingPrivateData: '{}' });
  const env = { DB: db, PROFILE_D1_SHADOW_WRITE_ENABLED: 'true' };
  await mirrorAuthoritativeProfileToD1(env, USER_A, PUBLIC_SOURCE, PRIVATE_SOURCE);
  await mirrorAuthoritativeProfileToD1(env, USER_A, PUBLIC_SOURCE, PRIVATE_SOURCE);
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[0][0].values, batches[1][0].values);
  assert.match(batches[0][0].sql, /updated_at <= excluded\.updated_at/i);
  assert.match(batches[0][1].sql, /updated_at <= excluded\.updated_at/i);
});

test('signed Edge mirror client reaches the internal Worker endpoint without profile payload', async () => {
  const secret = 'stage4a-test-secret-that-is-long-enough-0001';
  const now = 1_785_000_000_000;
  const { db, batches } = fakeD1({ existingPrivateData: '{}' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    Response.json(String(input).includes('profile_private_data') ? [PRIVATE_SOURCE] : [PUBLIC_SOURCE])) as typeof fetch;
  try {
    const result = await mirrorProfileShadowAfterSourceWrite(USER_A, 'auth_edge', {
      enabled: true,
      url: 'https://app.example/internal/profile-shadow/v1/mirror',
      secret,
      canaryUserId: USER_A,
      now,
      nonce: USER_B,
      fetcher: async (input, init) => {
        const request = new Request(input, init);
        const response = await handleProfileShadowInternalMirror(request, {
          AUTH_SERVICE: authService(), SUPABASE_URL: 'https://source.example',
          SUPABASE_SERVICE_ROLE_KEY: 'server-only-key', DB: db,
          PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
          PROFILE_D1_SHADOW_INTERNAL_ENABLED: 'true',
          PROFILE_D1_SHADOW_MIRROR_SECRET: secret,
          PROFILE_D1_SHADOW_CANARY_USER_ID: USER_A,
        }, now);
        return Response.json(response);
      },
    });
    assert.deepEqual(result, { status: 'mirrored' });
    assert.equal(batches.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Edge mirror failure preserves source-side semantics and logs no private payload', async () => {
  const diagnostics: string[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => diagnostics.push(values.map(String).join(' '));
  try {
    const result = await mirrorProfileShadowAfterSourceWrite(USER_A, 'auth_edge', {
      enabled: true,
      url: 'https://app.example/internal/profile-shadow/v1/mirror',
      secret: 'stage4a-test-secret-that-is-long-enough-0001',
      canaryUserId: USER_A,
      fetcher: async () => Response.json({ error: 'unavailable' }, { status: 503 }),
    });
    assert.deepEqual(result, { status: 'failed' });
    assert.ok(diagnostics.some((entry) => entry.includes('profile_shadow_mirror_client_failed')));
    assert.ok(diagnostics.every((entry) => !entry.includes('Student A')));
  } finally {
    console.error = originalError;
  }
});

test('Edge producer allowlist prevents non-canary mirror requests', async () => {
  let fetchCalls = 0;
  const result = await mirrorProfileShadowAfterSourceWrite(USER_B, 'auth_edge', {
    enabled: true,
    url: 'https://app.example/internal/profile-shadow/v1/mirror',
    secret: 'stage4b-test-secret-that-is-long-enough-0002',
    canaryUserId: USER_A,
    fetcher: async () => {
      fetchCalls += 1;
      return Response.json({ success: true });
    },
  });
  assert.deepEqual(result, { status: 'disabled' });
  assert.equal(fetchCalls, 0);
});

test('internal mirror rejects missing authentication and non-canary owners before any D1 write', async () => {
  const secret = 'stage4b-test-secret-that-is-long-enough-0002';
  const now = 1_785_000_000_000;
  const { db, batches } = fakeD1({ existingPrivateData: '{}' });
  const env = {
    AUTH_SERVICE: authService(), SUPABASE_URL: 'https://source.example',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-key', DB: db,
    PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
    PROFILE_D1_SHADOW_INTERNAL_ENABLED: 'true',
    PROFILE_D1_SHADOW_MIRROR_SECRET: secret,
    PROFILE_D1_SHADOW_CANARY_USER_ID: USER_A,
  };
  await assert.rejects(
    handleProfileShadowInternalMirror(new Request(
      'https://app.example/internal/profile-shadow/v1/mirror',
      { method: 'POST', body: JSON.stringify({ userId: USER_A }) },
    ), env, now),
    (error: unknown) => (error as { status?: number }).status === 401,
  );

  const result = await mirrorProfileShadowAfterSourceWrite(USER_B, 'auth_edge', {
    enabled: true,
    url: 'https://app.example/internal/profile-shadow/v1/mirror',
    secret,
    canaryUserId: USER_B,
    now,
    nonce: USER_A,
    fetcher: async (input, init) => {
      try {
        await handleProfileShadowInternalMirror(new Request(input, init), env, now);
        return Response.json({ success: true });
      } catch (error) {
        return Response.json({ error: 'forbidden' }, { status: (error as { status?: number }).status || 500 });
      }
    },
  });
  assert.deepEqual(result, { status: 'failed' });
  assert.equal(batches.length, 0);
});

test('internal mirror rejects invalid signatures and signed malformed payloads without D1 writes', async () => {
  const secret = 'stage4b-test-secret-that-is-long-enough-0002';
  const now = 1_785_000_000_000;
  const timestamp = String(Math.floor(now / 1_000));
  const nonce = USER_B;
  const { db, batches } = fakeD1({ existingPrivateData: '{}' });
  const env = {
    AUTH_SERVICE: authService(), SUPABASE_URL: 'https://source.example',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-key', DB: db,
    PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
    PROFILE_D1_SHADOW_INTERNAL_ENABLED: 'true',
    PROFILE_D1_SHADOW_MIRROR_SECRET: secret,
    PROFILE_D1_SHADOW_CANARY_USER_ID: USER_A,
  };

  await assert.rejects(
    handleProfileShadowInternalMirror(new Request(
      'https://app.example/internal/profile-shadow/v1/mirror',
      {
        method: 'POST',
        headers: {
          'X-Hub-Profile-Mirror-Timestamp': timestamp,
          'X-Hub-Profile-Mirror-Nonce': nonce,
          'X-Hub-Profile-Mirror-Signature': '0'.repeat(64),
        },
        body: JSON.stringify({ userId: USER_A }),
      },
    ), env, now),
    (error: unknown) => (error as { status?: number }).status === 401,
  );

  const malformedBody = JSON.stringify({ userId: USER_A, role: 'admin' });
  const validSignature = await signMirrorBody(secret, timestamp, nonce, malformedBody);
  await assert.rejects(
    handleProfileShadowInternalMirror(new Request(
      'https://app.example/internal/profile-shadow/v1/mirror',
      {
        method: 'POST',
        headers: {
          'X-Hub-Profile-Mirror-Timestamp': timestamp,
          'X-Hub-Profile-Mirror-Nonce': nonce,
          'X-Hub-Profile-Mirror-Signature': validSignature,
        },
        body: malformedBody,
      },
    ), env, now),
    (error: unknown) => (error as { status?: number }).status === 400,
  );
  assert.equal(batches.length, 0);
});

test('Auth and Courses Edge Profile dependencies route through operation-scoped D1 authority', () => {
  const authEdge = fileText('../supabase/functions/auth/index.ts');
  const coursesEdge = fileText('../supabase/functions/courses/index.ts');
  assert.match(authEdge, /operation: 'ensure_student_profile'/);
  assert.match(authEdge, /operation: 'delete_profile'/);
  assert.match(coursesEdge, /operation: 'read_profile_map'/);
  assert.doesNotMatch(authEdge, /mirrorProfileShadowAfterSourceWrite/);
  assert.doesNotMatch(coursesEdge, /mirrorProfileShadowAfterSourceWrite|ensureNotificationReceiverProfile/);
});

test('Stage 4C cohorting is deterministic, server-controlled, and supports only approved levels', () => {
  const bucket = getProfileShadowCohortBucket(USER_A);
  assert.equal(getProfileShadowCohortBucket(USER_A), bucket);
  assert.equal(isProfileD1ShadowWriteEligible({
    PROFILE_D1_SHADOW_WRITE_ENABLED: 'false',
    PROFILE_D1_SHADOW_WRITE_PERCENT: '100',
  }, USER_A), false);
  assert.equal(isProfileD1ShadowWriteEligible({
    PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
    PROFILE_D1_SHADOW_WRITE_PERCENT: '0',
  }, USER_A), false);
  assert.equal(isProfileD1ShadowWriteEligible({
    PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
    PROFILE_D1_SHADOW_WRITE_PERCENT: '100',
  }, USER_A), true);
  assert.equal(isProfileD1ShadowWriteEligible({
    PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
    PROFILE_D1_SHADOW_WRITE_PERCENT: '25',
  }, USER_A), bucket < 25);
  assert.equal(isProfileD1ShadowWriteEligible({
    PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
    PROFILE_D1_SHADOW_WRITE_PERCENT: '17',
  }, USER_A), false);
  assert.equal(isProfileD1ShadowWriteEligible({
    PROFILE_D1_SHADOW_WRITE_ENABLED: 'true',
    PROFILE_D1_SHADOW_WRITE_PERCENT: '1',
    PROFILE_D1_SHADOW_CANARY_USER_ID: USER_A,
  }, USER_A), true);
});
