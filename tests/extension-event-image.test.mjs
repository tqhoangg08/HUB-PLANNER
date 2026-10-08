import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync('extension/hub-planner-event-collector/popup.js', 'utf8');
const manifest = JSON.parse(readFileSync('extension/hub-planner-event-collector/manifest.json', 'utf8'));
const IMAGE = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==', 'base64',
));

const popup = (fetcher) => {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      id, value: '', checked: false, disabled: false, hidden: true, files: [], textContent: '', className: '',
      addEventListener() {}, removeAttribute() {},
    });
    return nodes.get(id);
  };
  const localValues = {};
  const syncValues = {};
  const chrome = {
    storage: {
      local: { async get() { return localValues; }, async set(values) { Object.assign(localValues, values); } },
      sync: {
        async get() { return syncValues; },
        async set(values) { Object.assign(syncValues, values); },
        async remove(keys) { for (const key of keys) delete syncValues[key]; },
      },
    },
    tabs: { async query() { return [{ url: 'https://www.facebook.com/example' }]; } },
  };
  const context = { document: { getElementById: node, addEventListener() {} }, chrome, fetch: fetcher,
    URL, Blob, Uint8Array, TextDecoder, setTimeout, console };
  runInNewContext(source, context);
  node('sourceName').value = 'Fixture source';
  node('postUrl').value = 'https://www.facebook.com/example';
  node('rawContent').value = 'Fixture event';
  node('apiToken').value = 'fixture-secret';
  return { context, node, localValues, syncValues };
};

test('extension manifest requests only production API and image CDN host permissions', () => {
  assert.deepEqual(manifest.host_permissions,
    ['https://hotrosinhvienhub.id.vn/*', 'https://*.fbcdn.net/*']);
  assert.equal(JSON.stringify(manifest).includes('<all_urls>'), false);
  assert.equal(JSON.stringify(manifest).includes('background'), false);
});

test('image storage consent is opt-in and candidate still submits without image rights', async () => {
  const calls = [];
  const view = popup(async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ success: true, created: true, candidate: { id: 7 } }, { status: 201 });
  });
  view.node('imageUrl').value = 'https://scontent.xx.fbcdn.net/post.png';
  assert.equal(view.node('imageConsent').checked, false);
  await view.context.sendCandidate();
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.image_rights_confirmed, false);
  assert.equal(body.image_url, null);
  assert.match(view.node('status').textContent, /Đã gửi sự kiện để duyệt/);
  assert.match(view.node('imageUploadStatus').textContent, /chưa được lưu/i);
});

test('popup reports R2 success only after secret-scoped storage status confirms it', async () => {
  const calls = [];
  const view = popup(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/image-status')) return Response.json({ success: true,
      image_ingest_status: 'stored', image_stored: true });
    return Response.json({ success: true, created: true, candidate: { id: 8, image_ingest_status: 'pending' } },
      { status: 201 });
  });
  view.node('imageUrl').value = 'https://scontent.xx.fbcdn.net/post.png';
  view.node('imageConsent').checked = true;
  view.node('imageRightsBasis').value = 'permission';
  await view.context.sendCandidate();
  assert.equal(calls.length, 2);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.image_rights_confirmed, true);
  assert.equal(body.image_rights_basis, 'permission');
  assert.equal(calls[1].init.credentials, 'omit');
  assert.equal(view.node('imageUploadStatus').textContent, 'Đã lưu ảnh vào HUB Planner.');
});

test('browser binary fallback sends bounded authenticated bytes and waits for R2 confirmation', async () => {
  const calls = [];
  const view = popup(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/image-status')) return Response.json({ success: true,
      image_ingest_status: 'failed', image_stored: false });
    if (String(url).endsWith('/image')) return Response.json({ success: true,
      candidate: { image_ingest_status: 'stored',
        image_url: '/api/public/v1/event-banners/event-banners/00000000-0000-4000-8000-000000000001.png' } });
    if (String(url).includes('fbcdn.net')) return new Response(IMAGE,
      { headers: { 'Content-Type': 'image/png' } });
    return Response.json({ success: true, created: true, candidate: { id: 9, image_ingest_status: 'pending' } },
      { status: 201 });
  });
  view.node('imageUrl').value = 'https://scontent.xx.fbcdn.net/post.png';
  view.node('imageConsent').checked = true;
  view.node('imageRightsBasis').value = 'owned';
  await view.context.sendCandidate();
  const upload = calls.find(({ url }) => url.endsWith('/image'));
  assert.ok(upload);
  assert.equal(upload.init.method, 'POST');
  assert.equal(upload.init.credentials, 'omit');
  assert.equal(upload.init.headers['Content-Type'], 'image/png');
  assert.equal(upload.init.headers['X-Image-Rights-Basis'], 'owned');
  assert.deepEqual(Buffer.from(upload.init.body), Buffer.from(IMAGE));
  const imageFetch = calls.find(({ url }) => url.includes('fbcdn.net'));
  assert.equal(imageFetch.init.credentials, 'omit');
  assert.equal(imageFetch.init.redirect, 'manual');
  assert.equal(view.node('imageUploadStatus').textContent, 'Đã lưu ảnh vào HUB Planner.');
});

test('candidate stays submitted when image fetch fails; duplicate stored candidate avoids binary upload', async () => {
  const failed = popup(async (url) => {
    if (String(url).endsWith('/image-status')) return Response.json({ success: true,
      image_ingest_status: 'failed', image_stored: false });
    if (String(url).includes('fbcdn.net')) return new Response(null, { status: 403 });
    return Response.json({ success: true, created: true, candidate: { id: 10 } }, { status: 201 });
  });
  failed.node('imageUrl').value = 'https://scontent.xx.fbcdn.net/post.png';
  failed.node('imageConsent').checked = true;
  failed.node('imageRightsBasis').value = 'permission';
  await failed.context.sendCandidate();
  assert.match(failed.node('status').textContent, /Đã gửi sự kiện/);
  assert.match(failed.node('imageUploadStatus').textContent, /ảnh chưa lưu được/i);

  const calls = [];
  const duplicate = popup(async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/image-status')) return Response.json({ success: true,
      image_ingest_status: 'stored', image_stored: true });
    return Response.json({ success: true, duplicate: true, created: false, candidate: { id: 11 } });
  });
  duplicate.node('imageUrl').value = 'https://scontent.xx.fbcdn.net/post.png';
  duplicate.node('imageConsent').checked = true;
  duplicate.node('imageRightsBasis').value = 'licensed';
  await duplicate.context.sendCandidate();
  assert.match(duplicate.node('status').textContent, /đã được gửi trước đó/);
  assert.equal(calls.filter(({ url }) => url.endsWith('/image')).length, 0);
});

test('invalid rights basis, untrusted URL, wrong signature and oversize images are rejected', async () => {
  const view = popup(async () => new Response(null, { status: 403 }));
  view.node('imageConsent').checked = true;
  view.node('imageUrl').value = 'https://scontent.xx.fbcdn.net/post.png';
  assert.throws(() => view.context.buildPayload(), /cơ sở quyền/i);
  assert.equal(view.context.allowedPublicImageUrl('https://127.0.0.1/internal.png'), null);
  assert.equal(view.context.allowedPublicImageUrl('https://scontent.xx.fbcdn.net.evil.test/post.png'), null);
  await assert.rejects(view.context.readLocalImage({ size: IMAGE.length, type: 'image/jpeg',
    async arrayBuffer() { return IMAGE.buffer; } }), /JPG, PNG hoặc WEBP/);
  await assert.rejects(view.context.readLocalImage({ size: 2 * 1024 * 1024 + 1, type: 'image/png',
    async arrayBuffer() { throw new Error('must not read'); } }), /2 MB/);
});
