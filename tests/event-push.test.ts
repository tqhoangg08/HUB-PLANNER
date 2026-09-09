import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  buildEventPushPayload,
  isEventPushEligible,
  runEventPush,
  type PublicEventPushCandidate,
} from '../cloudflare/worker/src/event-push.ts';

const cutoff = '2026-09-09T13:45:00.000Z';
const published = (overrides: Partial<PublicEventPushCandidate> = {}): PublicEventPushCandidate => ({
  id: 42,
  title: 'Ngày hội nghề nghiệp HUB',
  status: 'Đang mở',
  is_deleted: 0,
  created_at: '2026-09-09T13:46:00.000Z',
  ...overrides,
});

test('only newly public events after the release cutoff are eligible', () => {
  assert.equal(isEventPushEligible(published(), cutoff), true);
  for (const status of ['pending', 'draft', 'rejected', 'deleted', 'hidden']) {
    assert.equal(isEventPushEligible(published({ status }), cutoff), false, status);
  }
  assert.equal(isEventPushEligible(published({ is_deleted: 1 }), cutoff), false);
  assert.equal(isEventPushEligible(published({ created_at: '2026-09-09T13:44:59Z' }), cutoff), false);
});

test('event push payload is bounded, non-sensitive, and deep-links to a valid event route', () => {
  const payload = buildEventPushPayload(published({ title: ` Sự kiện ${'x'.repeat(300)} ` }));
  assert.equal(payload.title, 'Sự kiện mới trên HUB Planner');
  assert.equal(payload.category, 'events');
  assert.equal(payload.url, '/events/42');
  assert.equal(payload.body.length, 240);
  assert.doesNotMatch(JSON.stringify(payload), /user_id|email|student|subscription/i);
  const routes = readFileSync('components/EventsBoard.tsx', 'utf8');
  assert.match(routes, /`\/events\/\$\{encodeURIComponent\(id\)\}`/);
});

test('D1 reservation deduplicates cron runs and delivery does not depend on old event updates', async () => {
  let candidate: PublicEventPushCandidate | null = published();
  let reserved = false;
  let state = '';
  let sends = 0;
  const DB = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          return {
            async first() { return sql.includes('FROM public_events') && !reserved ? candidate : null; },
            async run() {
              if (sql.includes('INSERT OR IGNORE')) {
                if (reserved) return { meta: { changes: 0 } };
                reserved = true;
                return { meta: { changes: 1 } };
              }
              if (sql.includes('UPDATE event_push_deliveries')) state = String(_values[0]);
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  const env = {
    DB,
    SUPABASE_URL: 'https://fixture.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'x'.repeat(40),
    EVENT_PUSH_CUTOFF: cutoff,
  };
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    sends += 1;
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, {
      resource: 'send',
      title: 'Sự kiện mới trên HUB Planner',
      body: published().title,
      url: '/events/42',
      category: 'events',
    });
    return Response.json({ success: true, sent: 3 });
  };
  const first = await runEventPush(env, fetcher as typeof fetch);
  const second = await runEventPush(env, fetcher as typeof fetch);
  assert.equal(first.state, 'sent');
  assert.equal(second.state, 'idle');
  assert.equal(sends, 1);
  assert.equal(state, 'sent');
  candidate = published({ created_at: '2026-09-01T00:00:00Z' });
  assert.equal(isEventPushEligible(candidate, cutoff), false);
});

test('stale subscription cleanup remains owned by the shared sender', () => {
  const sender = readFileSync('supabase/functions/push/index.ts', 'utf8');
  const scheduled = readFileSync('cloudflare/worker/src/index.ts', 'utf8');
  assert.match(sender, /statusCode === 404 \|\| error\?\.statusCode === 410/);
  assert.match(sender, /filterSubscriptionsByPreference\(subscriptions, category/);
  assert.match(sender, /raw\.includes\('event'\).*return 'events'/);
  assert.match(scheduled, /syncPublicEvents\(env\)\.then\(async \(summary\).*runEventPush\(env\)/s);
});
