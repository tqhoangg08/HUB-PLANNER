import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import worker from '../cloudflare/worker/src/index.ts';
import { readCourseWriteAuthority } from '../cloudflare/worker/src/course-authority.ts';

const ORIGIN = 'https://hotrosinhvienhub.id.vn';

test('course authority stays explicitly Supabase-authoritative until the later cutover', () => {
  assert.equal(readCourseWriteAuthority({}), 'supabase');
  assert.equal(readCourseWriteAuthority({ COURSE_WRITE_AUTHORITY: 'supabase' }), 'supabase');
  assert.equal(readCourseWriteAuthority({ COURSE_WRITE_AUTHORITY: 'd1' }), 'd1');
  assert.equal(readCourseWriteAuthority({ COURSE_WRITE_AUTHORITY: 'client-d1' }), 'supabase');
});

test('prepared course mutation routes fail closed before auth or D1 while source authority remains Supabase', async () => {
  let authCalls = 0;
  let d1Calls = 0;
  const response = await worker.fetch(new Request(`${ORIGIN}/api/private/v1/courses`, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }), {
    ALLOWED_ORIGINS: ORIGIN,
    COURSE_WRITE_AUTHORITY: 'supabase',
    AUTH_SERVICE: { fetch: async () => { authCalls += 1; throw new Error('unexpected'); } },
    DB: { prepare: () => { d1Calls += 1; throw new Error('unexpected'); } },
  } as never, {} as never);
  assert.equal(response.status, 503);
  assert.equal(authCalls, 0);
  assert.equal(d1Calls, 0);
});

test('course authority migration is additive and isolates retired rows from the public catalogue', () => {
  const sql = readFileSync('cloudflare/migrations/0018_add_course_authority_foundation.sql', 'utf8');
  assert.match(sql, /ADD COLUMN catalogue_visibility/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS user_course_requests/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS course_mutation_receipts/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS course_mutation_outbox/i);
  assert.match(sql, /course_filter_facets_after_visibility_update/i);
  assert.doesNotMatch(sql, /\bDROP\b/i);

  const courses = readFileSync('cloudflare/worker/src/courses.ts', 'utf8');
  assert.match(courses, /catalogue_visibility = 'published'/);
  assert.match(courses, /WHERE id = \? AND catalogue_visibility = 'published'/);
});

test('course authority uses Better Auth staff roles and never the legacy Supabase role helper', () => {
  const source = readFileSync('cloudflare/worker/src/course-authority.ts', 'utf8');
  assert.match(source, /requireBetterAuthStaff/);
  assert.match(source, /requireBetterAuthSession/);
  assert.doesNotMatch(source, /user_roles|SUPABASE_SERVICE_ROLE_KEY|\.from\(/);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /If-Match/);
  assert.match(source, /identity\.role !== 'admin'/);
  assert.match(source, /course_mutation_outbox/);
});

test('Cloudflare scraper is internal-only, server-secret-backed, and cannot overwrite admin-reviewed fields', () => {
  const scraper = readFileSync('cloudflare/worker/src/course-scraper-authority.ts', 'utf8');
  const internal = readFileSync('cloudflare/worker/src/course-authority-internal.ts', 'utf8');
  const migration = readFileSync('cloudflare/migrations/0019_add_course_scraper_run_receipts.sql', 'utf8');
  assert.match(scraper, /COURSE_SCRAPER_UPSTREAM_COOKIE/);
  assert.match(scraper, /runD1InstructorScraper/);
  assert.match(scraper, /instructor_provenance IS NOT \?/);
  assert.match(scraper, /catalogue_visibility='published'/);
  assert.doesNotMatch(scraper, /\bsupabase\s*\.|MY_SECRET_SCRAPER_KEY|request\.json\(\).*cookie/i);
  assert.match(internal, /scrape_instructors/);
  assert.match(internal, /probe_upstream/);
  assert.match(internal, /probe_request_contracts/);
  assert.match(scraper, /Course scraper probe source is unavailable/);
  assert.match(internal, /apply_instructor_updates/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS course_scraper_runs/i);
  assert.doesNotMatch(migration, /\bDROP\b/i);
});

test('account deletion switches only user course-request cleanup to the signed D1 path in D1 lifecycle mode', () => {
  const auth = readFileSync('supabase/functions/auth/index.ts', 'utf8');
  const client = readFileSync('supabase/functions/_shared/course-authority-client.ts', 'utf8');
  assert.match(auth, /isCourseD1LifecycleEnabled/);
  assert.match(auth, /delete_user_course_requests/);
  assert.match(auth, /courseD1Lifecycle \? \[\] : \['user_course_requests'\]/);
  assert.match(client, /COURSE_D1_INTERNAL_SECRET/);
  assert.match(client, /X-Hub-Course-Internal-Signature/);
});

test('Stage 2C reconciliation is explicitly read-only and ignores D1-only authority metadata', () => {
  const source = readFileSync('scripts/reconcile-production-course-authority.mjs', 'utf8');
  assert.match(source, /BEGIN READ ONLY/);
  assert.match(source, /convert_to\(row_to_json\(r\)::text, 'UTF8'\)/);
  assert.match(source, /Buffer\.from\(line, 'hex'\)\.toString\('utf8'\)/);
  assert.match(source, /catalogue_visibility='published'/);
  assert.match(source, /--semester/);
  assert.match(source, /PUBLIC_ACTIVE_VISIBILITY_MISMATCH/);
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\s+(?:INTO|FROM|TABLE)/i);
});
