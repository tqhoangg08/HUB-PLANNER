import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import { retainPreviousFrontendAssets } from '../scripts/retain-previous-frontend-assets.mjs';

const browserSource = await build({
  entryPoints: ['utils/coursesApi.ts'], bundle: true, write: false, format: 'esm', platform: 'browser',
});
const catalogue = await import('data:text/javascript;base64,' + Buffer.from(browserSource.outputFiles[0].contents).toString('base64'));

test('catalogue canonicalizes both aliases, keeps explicit refresh and rejects foreign URLs', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push({ path, options });
    return new Response('{}');
  });
  await catalogue.fetchPublicCourses('/courses?semester=HK1&limit=10&semester=HK2', { headers: { apikey: 'fixture' } });
  await catalogue.fetchPublicCourses('/api/courses?resource=filter-options', { cache: 'reload' });
  assert.deepEqual(calls.map(call => call.path), [
    '/api/courses?semester=HK1&limit=10&semester=HK2', '/api/courses?resource=filter-options&refresh=1',
  ]);
  for (const { options } of calls) {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.get('X-Hub-Catalogue-Cache'), 'v1');
    assert.equal(options.headers.has('apikey'), false);
  }
  await assert.rejects(catalogue.fetchPublicCourses('https://other.example/courses'), /Unsupported/);
  await assert.rejects(catalogue.fetchPublicCourses('//other.example/api/courses'), /Unsupported/);
  await assert.rejects(catalogue.fetchPublicCourses('/api/courses', { method: 'POST' }), /Unsupported/);
  await assert.rejects(catalogue.fetchPublicCourses('/api/auth/get-session'), /Unsupported/);
  assert.equal(calls.length, 2);
});

async function serviceWorker(overrides = {}) {
  const listeners = new Map();
  const self = { location: { origin: 'https://local.test' }, addEventListener: (name, fn) => listeners.set(name, fn) };
  vm.runInNewContext(await readFile('public/hub-sw.js', 'utf8'), { self, URL, Headers, Request, ...overrides });
  return listeners;
}

test('service worker waits for old clients and only relays catalogue reads', async () => {
  const calls = [];
  const listeners = await serviceWorker({
    fetch: async (url, options) => { calls.push({ url, options }); return new Response('{}'); },
  });
  let stopped = false;
  listeners.get('message')({ data: { type: 'SKIP_WAITING' }, stopImmediatePropagation: () => { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(listeners.has('install'), false);
  const r = new Request('https://local.test/courses?semester=HK1', {
    credentials: 'omit', cache: 'reload', headers: { Authorization: 'fixture', apikey: 'fixture' },
  });
  let response;
  listeners.get('fetch')({ request: r, respondWith: promise => { response = promise; } });
  assert.equal((await response).status, 200);
  assert.equal(calls[0].url, 'https://local.test/api/courses?semester=HK1&refresh=1');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.headers.has('Authorization'), false);
  for (const request of [
    new Request('https://local.test/api/courses', { method: 'POST' }),
    new Request('https://local.test/api/events'), new Request('https://other.test/courses'),
    new Request('https://local.test/courses?resource=private'),
  ]) {
    listeners.get('fetch')({ request, respondWith: () => assert.fail('Unsupported request intercepted') });
  }
  assert.equal(calls.length, 1);
});

test('activation deletes only same-origin catalogue JSON entries', async () => {
  const fixtures = new Map([
    ['https://local.test/api/courses?semester=HK1', 'application/json'],
    ['https://local.test/courses?resource=filter-options', 'application/json'],
    ['https://local.test/courses', 'text/html'],
    ['https://local.test/api/private/v1/schedule', 'application/json'],
    ['https://other.test/api/courses', 'application/json'],
    ['https://local.test/assets/old-draft.js', 'text/javascript'],
  ]);
  const cache = {
    keys: async () => [...fixtures.keys()].map(url => new Request(url)),
    match: async request => new Response('', { headers: { 'Content-Type': fixtures.get(request.url) } }),
    delete: async request => fixtures.delete(request.url),
  };
  const listeners = await serviceWorker({ caches: { keys: async () => ['fixture'], has: async () => true, open: async () => cache } });
  let cleanup;
  listeners.get('activate')({ waitUntil: task => { cleanup = task; } });
  await cleanup;
  assert.deepEqual([...fixtures.keys()], [
    'https://local.test/courses', 'https://local.test/api/private/v1/schedule',
    'https://other.test/api/courses', 'https://local.test/assets/old-draft.js',
  ]);
});

test('asset retention checks exact previous bytes and never overwrites an asset or includes an old entry point', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hub-s1-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const old = join(root, 'old'), next = join(root, 'next');
  const a = 'ScheduleBoard-ABC_1234.js', b = 'styles-bcde1234.css';
  await mkdir(join(old, 'assets'), { recursive: true });
  await mkdir(join(next, 'assets'), { recursive: true });
  await writeFile(join(old, 'assets', a), 'old chunk');
  await writeFile(join(old, 'assets', b), 'old styles');
  await writeFile(join(old, 'index.html'), 'old shell');
  await writeFile(join(next, 'index.html'), 'new shell');
  await writeFile(join(next, 'assets', b), 'wrong new bytes');
  const manifest = join(root, 'manifest.json');
  const sha = value => createHash('sha256').update(value).digest('hex');
  await writeFile(manifest, JSON.stringify({ assets: { ['assets/' + a]: sha('old chunk'), ['assets/' + b]: sha('old styles') } }));
  await assert.rejects(retainPreviousFrontendAssets(old, next, manifest), /collision/);
  await assert.rejects(readFile(join(next, 'assets', a)), /ENOENT/);
  await writeFile(join(next, 'assets', b), 'old styles');
  assert.deepEqual(await retainPreviousFrontendAssets(old, next, manifest), { verified: 2, copied: 1 });
  assert.equal(await readFile(join(next, 'index.html'), 'utf8'), 'new shell');
  assert.equal(await readFile(join(next, 'assets', a), 'utf8'), 'old chunk');
  assert.deepEqual(await retainPreviousFrontendAssets(old, next, manifest), { verified: 2, copied: 0 });
  await writeFile(manifest, JSON.stringify({ assets: { '../evil.js': sha('x') } }));
  await assert.rejects(retainPreviousFrontendAssets(old, next, manifest), /exactly/);
});
