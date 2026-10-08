import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildAdminEventPayload, createEmptyAdminEventDraft, EVENT_DRAFT_STATUS, EVENT_PUBLIC_STATUS, validateAdminEventDraft } from '../utils/adminEventForm.ts';
import { AdminEventMutationError, assertAdminEventMutationAllowed, validateAdminEventMutationPayload } from '../cloudflare/worker/src/admin-event-mutations.ts';
import { EventBannerError, MAX_EVENT_BANNER_BYTES, uploadEventBanner, validateEventBannerBytes } from '../cloudflare/worker/src/event-banner.ts';
import { BetterAuthIdentityError } from '../cloudflare/worker/src/better-auth-identity.ts';

const validDraft = () => ({ ...createEmptyAdminEventDraft(), title: 'Sự kiện thử nghiệm', organizer: 'Đơn vị tổ chức', link: 'https://example.org/event' });

test('event create route is explicit before dynamic route and staff only', () => {
  const routes = readFileSync(new URL('../app/routing/ProtectedAppRoutes.tsx', import.meta.url), 'utf8');
  assert.match(routes, /path="\/events\/new" element=\{isManagementUser \? <AdminEventEditorPage \/> : <Navigate to="\/dashboard" replace \/>\}/);
  assert.ok(routes.indexOf('path="/events/new" element={isManagementUser') < routes.indexOf('path="/events/:eventId" element={<EventsBoard'));
  assert.match(routes, /path="\/events\/new" element=\{<Navigate to="\/mobile-home" replace \/>\}/);
  const board = readFileSync(new URL('../components/EventsBoard.tsx', import.meta.url), 'utf8');
  assert.match(board, /if \(isAdmin \|\| isAuditor\) \{\s*navigate\('\/events\/new'\)/);
});

test('draft validation and payload preserve create contract and close-on-full behavior', () => {
  const draft = validDraft();
  assert.ok(validateAdminEventDraft({ ...draft, title: '  ' }).title);
  assert.ok(validateAdminEventDraft({ ...draft, link: 'javascript:alert(1)' }).link);
  assert.ok(validateAdminEventDraft({ ...draft, deadline: '2026-02-30' }).deadline);
  assert.ok(validateAdminEventDraft({ ...draft, registration_start_date: '2026-10-10', deadline: '2026-10-01' }).deadline);
  assert.deepEqual(validateAdminEventDraft(draft), {});
  const payload = buildAdminEventPayload({ ...draft, close_on_full: true, deadline: '2026-10-09', deadline_time: '09:00' });
  assert.equal(payload.deadline, null);
  assert.equal(payload.deadline_time, null);
  assert.equal(payload.status, EVENT_DRAFT_STATUS);
  assert.equal(Object.hasOwn(payload, 'creator'), false);
  assert.equal(validateAdminEventMutationPayload(payload, 'create').title, draft.title);
  assert.equal(buildAdminEventPayload({ ...draft, status: EVENT_PUBLIC_STATUS }).status, EVENT_PUBLIC_STATUS);
  assert.throws(() => validateAdminEventMutationPayload({ title: draft.title, link: 'javascript:alert(1)' }, 'create'),
    (error: unknown) => error instanceof AdminEventMutationError && error.status === 400);
});

test('pending draft is not public and auditor create does not grant delete', () => {
  const source = readFileSync(new URL('../cloudflare/worker/src/admin-event-mutations.ts', import.meta.url), 'utf8');
  assert.match(source, /COALESCE\(status, ''\) <> 'pending'/);
  assert.doesNotThrow(() => assertAdminEventMutationAllowed(validateAdminEventMutationPayload(buildAdminEventPayload(validDraft()), 'create'), 'auditor'));
  assert.throws(() => assertAdminEventMutationAllowed({ is_deleted: true }, 'auditor'), (error: unknown) => error instanceof AdminEventMutationError && error.status === 403);
});

const identity = (role: 'admin' | 'auditor' | 'user') => ({
  AUTH_SERVICE: { fetch: async () => Response.json({ userId: 'c9f82e03-7b6c-46f3-9270-66c4fb167724', email: 'staff@example.org', role }) },
  SUPPORT_ATTACHMENTS_BUCKET: { put: async () => ({}) },
});
const png = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==', 'base64',
));
const request = (bytes: Uint8Array, contentType = 'image/png', withCookie = true) => new Request('https://example.org/api/admin/v1/events/banner', {
  method: 'POST', headers: { 'Content-Type': contentType, ...(withCookie ? { Cookie: 'session=test' } : {}) }, body: bytes,
});

test('banner upload requires staff auth, rejects invalid type, signature and size', async () => {
  await assert.rejects(uploadEventBanner(request(png, 'image/png', false), identity('admin') as never), (error: unknown) => error instanceof BetterAuthIdentityError && error.status === 401);
  await assert.rejects(uploadEventBanner(request(png), identity('user') as never), (error: unknown) => error instanceof BetterAuthIdentityError && error.status === 403);
  assert.throws(() => validateEventBannerBytes(png, 'image/svg+xml'), (error: unknown) => error instanceof EventBannerError && error.status === 415);
  assert.throws(() => validateEventBannerBytes(new Uint8Array([1, 2, 3]), 'image/png'), (error: unknown) => error instanceof EventBannerError && error.status === 415);
  assert.throws(() => validateEventBannerBytes(new Uint8Array(MAX_EVENT_BANNER_BYTES + 1), 'image/png'), (error: unknown) => error instanceof EventBannerError && error.status === 413);
});

test('admin and auditor banner uploads use unguessable prefixed key without user filename', async () => {
  for (const role of ['admin', 'auditor'] as const) {
    let key = '';
    const env = identity(role);
    env.SUPPORT_ATTACHMENTS_BUCKET.put = async (value: string) => { key = value; return {}; };
    const result = await uploadEventBanner(request(png), env as never);
    assert.match(key, /^event-banners\/[0-9a-f-]{36}\.png$/);
    assert.equal(result.image_url, `/api/public/v1/event-banners/${key}`);
  }
});
