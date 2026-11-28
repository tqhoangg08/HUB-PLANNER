import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeFacebookPostUrl,
  normalizeApifyFacebookPost,
  queueFacebookEventCollection,
} from '../cloudflare/worker/src/facebook-event-collector.ts';

const now = new Date('2026-11-20T08:00:00.000Z').getTime();

test('validates Facebook post URLs and removes tracking parameters', () => {
  assert.equal(
    normalizeFacebookPostUrl('https://m.facebook.com/clb.example/posts/12345?utm_source=test&fbclid=tracking'),
    'https://www.facebook.com/clb.example/posts/12345'
  );
  assert.equal(
    normalizeFacebookPostUrl('https://www.facebook.com/story.php?story_fbid=456&id=789&fbclid=x'),
    'https://www.facebook.com/story.php?story_fbid=456&id=789'
  );
  for (const url of [
    'https://example.com/posts/1', 'http://www.facebook.com/a/posts/1',
    'https://facebook.com.evil.example/a/posts/1', 'https://www.facebook.com/clb.example',
    'https://www.facebook.com@evil.example/posts/1', 'https://www.facebook.com:444/a/posts/1',
  ]) assert.equal(normalizeFacebookPostUrl(url), null);
});

test('normalizes actor items with bounded recent content and keyword evidence', () => {
  const parsed = normalizeApifyFacebookPost({
    postUrl: 'https://www.facebook.com/clb/posts/123?fbclid=abc',
    text: 'Đăng ký tham gia hội thảo phát triển kỹ năng tại trường. Chờ cập nhật điểm rèn luyện.',
    pageName: 'CLB Kinh tế',
    timestamp: '2026-11-19T08:00:00Z',
  }, now);
  assert.ok(parsed);
  assert.equal(parsed?.source_name, 'CLB Kinh tế');
  assert.equal(parsed?.submitted_from, 'apify_facebook');
  assert.equal(parsed?.post_url, 'https://www.facebook.com/clb/posts/123');
  assert.equal(parsed?.client_created_at, '2026-11-19T08:00:00.000Z');
});

test('excludes unrelated posts, old posts, future timestamps, missing text and unsafe links', () => {
  const valid = {
    postUrl: 'https://www.facebook.com/clb/posts/123',
    text: 'Thông báo mở đăng ký cuộc thi học thuật năm 2026 dành cho sinh viên',
  };
  assert.equal(normalizeApifyFacebookPost({ ...valid, text: 'Chúc mừng sinh nhật mọi người' }, now), null);
  assert.equal(normalizeApifyFacebookPost({ ...valid, timestamp: '2026-10-10' }, now), null);
  assert.equal(normalizeApifyFacebookPost({ ...valid, timestamp: '2026-12-25' }, now), null);
  assert.equal(normalizeApifyFacebookPost({ ...valid, text: '' }, now), null);
  assert.equal(normalizeApifyFacebookPost({ ...valid, postUrl: 'https://evil.example/post' }, now), null);
});

test('collector is opt-in and does not query D1 or Apify when disabled or missing secrets', async () => {
  let called = false;
  const env = {
    FACEBOOK_EVENT_COLLECTOR_ENABLED: 'false',
    DB: { prepare() { called = true; throw new Error('Unexpected D1 use'); } },
  };
  assert.deepEqual(await queueFacebookEventCollection(env as never, () => {}), { accepted: false, reason: 'disabled' });
  assert.equal(called, false);
  assert.deepEqual(await queueFacebookEventCollection({
    ...env, FACEBOOK_EVENT_COLLECTOR_ENABLED: 'true',
  } as never, () => {}), { accepted: false, reason: 'not_configured' });
  assert.equal(called, false);
});
