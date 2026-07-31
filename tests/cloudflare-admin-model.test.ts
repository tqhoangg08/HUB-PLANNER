import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifySyncFreshness,
  normalizeCloudflareHealthPayload,
} from '../utils/cloudflareAdminApi.ts';

test('normalizes Cloudflare health resources and numeric counts', () => {
  const snapshot = normalizeCloudflareHealthPayload({
    ok: true,
    resources: {
      events: {
        resource: 'events',
        source_row_count: '27',
        visible_row_count: 25,
        source_max_created_at: null,
        synced_at: '2026-07-31T02:00:00.000Z',
      },
    },
  });

  assert.deepEqual(snapshot.resources.events, {
    resource: 'events',
    source_row_count: 27,
    visible_row_count: 25,
    source_max_created_at: null,
    synced_at: '2026-07-31T02:00:00.000Z',
  });
});

test('rejects malformed Cloudflare health payloads', () => {
  assert.throws(
    () => normalizeCloudflareHealthPayload({ ok: false, resources: {} }),
    /không hợp lệ/
  );
});

test('classifies fresh, stale and missing sync timestamps', () => {
  const now = Date.parse('2026-07-31T03:00:00.000Z');
  assert.equal(
    classifySyncFreshness('2026-07-31T02:50:00.000Z', 20, now),
    'healthy'
  );
  assert.equal(
    classifySyncFreshness('2026-07-31T02:30:00.000Z', 20, now),
    'stale'
  );
  assert.equal(classifySyncFreshness(null, 20, now), 'missing');
});

