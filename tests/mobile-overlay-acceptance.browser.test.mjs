import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright-core';
import { acceptancePlugin } from './mobile-overlay-acceptance-plugin.mjs';
import { scenes, student, course } from './mobile-overlay-scenes.mjs';

const output = path.resolve(process.env.ACCEPTANCE_OUTPUT || '.cache/mobile-overlay-acceptance');
const engine = process.env.ACCEPTANCE_ENGINE === 'webkit' ? 'WebKit' : 'Chromium';
await fs.mkdir(output, { recursive: true });
console.log('Starting isolated Vite acceptance server');
const server = await createServer({ configFile: false, envDir: false, plugins: [acceptancePlugin(), react()], cacheDir: 'node_modules/.vite-mobile-acceptance', server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, optimizeDeps: { entries: ['tests/mobile-overlay-acceptance.html', ...new Set(scenes.map(s => s.file))] }, logLevel: 'error' });
await server.listen();
console.log('Warming Vite fixture and production stylesheet');
await server.environments.client.warmupRequest('/tests/mobile-overlay-acceptance.tsx');
await server.environments.client.warmupRequest('/index.css');
await Promise.all([...new Set(scenes.map(s => s.file))].map(file => server.environments.client.warmupRequest(`/${file}`)));
await server.waitForRequestsIdle();
console.log(`Vite ready; launching ${engine}`);
const origin = server.resolvedUrls.local[0];
const browser = await (engine === 'WebKit' ? webkit.launch({ headless: true }) : chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true }));
const results = [];
let evidenceWrite = Promise.resolve();
function saveResults() {
  const body = JSON.stringify({ engine: `${engine} emulation`, realDeviceAcceptance: 'NOT VERIFIED', results }, null, 2);
  evidenceWrite = evidenceWrite.then(() => fs.writeFile(path.join(output, 'results.json'), body));
  return evidenceWrite;
}
test.after(async () => {
  await saveResults();
  await browser.close(); await server.close();
});
const matrix = [
  ['iphone13', devices['iPhone 13'], 390, 844], ['iphoneSE', devices['iPhone SE'], 375, 667],
  ['pixel7', devices['Pixel 7'], 412, 915], ['android360', devices['Pixel 7'], 360, 640],
];
const position = page => page.evaluate(() => ({ x: scrollX, y: scrollY, internal: document.querySelector('.mobile-main')?.scrollTop || 0 }));
function apiFixture(url) {
  if (url.includes('/api/auth/get-session')) return { session: { id: 'fixture-session', userId: 'fixture-user', expiresAt: '2099-01-01T00:00:00Z' }, user: { id: 'fixture-user', email: student.email, name: student.full_name, emailVerified: true } };
  if (url.includes('/api/private/v1/me')) return { userId: 'fixture-user', email: student.email, role: 'admin' };
  if (url.includes('/api/staff/v1/profiles')) return { data: [], total: 0 };
  if (url.includes('announcements')) return { data: Array.from({ length: 10 }, (_, i) => ({ id: i, title: `Thông báo kiểm thử ${i} — nội dung dài cho sinh viên`, link: '/fixture-news', date: '2026-10-18', created_at: '2026-10-18T08:00:00Z' })), total: 30, count: 30 };
  if (url.includes('drl') || url.includes('catalog')) return { data: [], rules: [], organizers: [], event_types: [], regions: [] };
  if (url.includes('course') || url.includes('schedule')) return { success: true, data: [], revisions: {}, courses: [], total: 0, has_more: false, summaries: [], semesters: [], facets: {} };
  if (url.includes('profile') && !url.includes('profiles?')) return { data: { ...student, ...student.data }, profile: student };
  return { success: true, data: [], total: 0, count: 0, has_more: false, next_cursor: null, candidates: [], participations: [], events: [], notifications: [], unread_count: 0, cohorts: [], majors: [], filters: {} };
}
describe('isolated mobile overlay acceptance', { concurrency: engine === 'WebKit' ? 1 : 2 }, () => {
for (const [device, descriptor, width, height] of matrix.filter(([name]) => (engine !== 'WebKit' || name.startsWith('iphone')) && (!process.env.ACCEPTANCE_DEVICE || name === process.env.ACCEPTANCE_DEVICE))) {
  const shards = engine === 'WebKit' ? 4 : 1;
  for (let shard = 0; shard < shards; shard++) test(`${device} ${width}px: production overlays ${shard + 1}/${shards}`, { timeout: 1800_000 }, async () => {
    const failures = [];
    // Windows WebKit's native host accumulates resources across closed contexts.
    // Bound each process lifetime; do not retry or discard a failed scene.
    const sceneBrowser = engine === 'WebKit' ? await webkit.launch({ headless: true }) : browser;
    try {
    for (const scene of scenes.filter((s, index) => index % shards === shard && (!process.env.ACCEPTANCE_SCENE || new RegExp(process.env.ACCEPTANCE_SCENE).test(s.key)))) {
      const context = await sceneBrowser.newContext({ ...descriptor, viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      await context.addInitScript(() => localStorage.setItem('push_prompt_dismissed:fixture-user', 'true'));
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      const runtime = [], consoleProblems = [], knownWarnings = [], requests = [], failedRequests = [];
      page.on('requestfailed', request => failedRequests.push({ url: request.url(), reason: request.failure()?.errorText }));
      page.on('pageerror', e => runtime.push(e.message));
      page.on('console', e => {
        if (!['error', 'warning'].includes(e.type())) return;
        // Recharts emits this existing measurement warning on first ResizeObserver
        // delivery/hidden charts. Retain it in evidence; it is not a React warning.
        if (e.type() === 'warning' && /^The width\(-1\) and height\(-1\) of chart/.test(e.text())) knownWarnings.push(e.text());
        else consoleProblems.push(e.text());
      });
      await context.route(url => url.origin + '/' !== origin || /^(\/api\/|\/events$|\/courses$)/.test(url.pathname), async route => {
        const request = route.request(), url = request.url();
        if (url.startsWith(origin) && !new URL(url).pathname.startsWith('/api/') && !['fetch', 'xhr'].includes(request.resourceType())) return route.continue();
        requests.push({ url, method: request.method(), external: !url.startsWith(origin) });
        if (url.startsWith(origin)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiFixture(url)) });
        // No external request reaches the network, including images and captcha.
        return route.fulfill({ status: 200, contentType: request.resourceType() === 'image' ? 'image/svg+xml' : 'application/json', body: request.resourceType() === 'image' ? '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>' : '{}' });
      });
      const prefix = `${device}/${scene.key}`;
      await fs.mkdir(path.join(output, device), { recursive: true });
      const record = { device, width, scene: scene.key, group: scene.group, source: `${scene.file}:${scene.id}`, opening: scene.fixtureOpen ? 'test-only state control; real component' : 'fixture launcher; real component', screenshots: ['before','during','after'].map(s => `${prefix}-${s}.png`), status: 'FAIL' };
      record.gesture = engine === 'WebKit' ? 'native keyboard PageDown; mobile WebKit wheel unavailable in Playwright' : 'native mouse wheel; additional CDP touch matrix';
      try {
        await page.goto(`${origin}tests/mobile-overlay-acceptance.html?scene=${scene.key}`, { waitUntil: 'networkidle', timeout: 120_000 });
        // Network idle may precede React's concurrent commit, especially in WebKit.
        await page.locator('#fixture-open').waitFor({ state: 'visible' });
        if (scene.fixtureOpen) {
          await page.evaluate(key => window.acceptance.mount(key), scene.key);
          await page.waitForFunction(key => window.acceptance?.ready === key, scene.key, { timeout: 120_000 });
          await page.waitForTimeout(650);
        }
        await page.locator('#fixture-open').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${prefix}-before.png`) });
        const before = await position(page);
        assert.ok(before.y > 1000 || before.internal > 1000, 'background begins deeply scrolled');
        await page.locator('#fixture-open').click();
        await page.waitForFunction(key => window.acceptance?.ready === key, scene.key, { timeout: 120_000 });
        if (Object.keys(scene.state).length) {
          await page.evaluate(({ file, values }) => window.acceptanceState(file, values), { file: scene.file, values: scene.state });
        }
        const overlay = page.locator(`[data-acceptance-overlay="${scene.file}:${scene.id}"]`);
        await overlay.waitFor({ state: 'visible' });
        if (scene.short === 'FloatingSupportTab') {
          await overlay.getByRole('button', { name: 'Tạo yêu cầu hỗ trợ', exact: true }).click();
          await overlay.getByPlaceholder('Tóm tắt vấn đề').fill('Nghiệm thu scroll lock');
          await overlay.getByPlaceholder('Mô tả vấn đề bạn đang gặp').fill('Dữ liệu giả cô lập, không gửi production.');
          record.journey = 'list → create ticket; existing controls, title + message entered';
        }
        await page.waitForTimeout(350);
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden', 'document locked');
        const start = await overlay.evaluate(root => {
          const all = [root, ...root.querySelectorAll('*')];
          const scrollers = all.filter(n => /auto|scroll/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight + 2 && n.clientHeight > 30);
          scrollers.forEach((n, i) => n.dataset.acceptanceScroller = String(i));
          return scrollers.map(n => ({ height: n.clientHeight, content: n.scrollHeight }));
        });
        record.scrollers = start;
        const backgroundGesture = async () => {
          if (engine === 'WebKit') { await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()); await page.keyboard.press('PageDown'); }
          else { await page.mouse.move(1, 30); await page.mouse.wheel(0, 500); }
        };
        await backgroundGesture();
        await page.waitForTimeout(100);
        // iOS body fixing represents the original scroll using a negative top.
        const lockedBefore = await position(page);
        await backgroundGesture(); await page.waitForTimeout(100);
        assert.deepEqual(await position(page), lockedBefore, 'background wheel cannot scroll');
        if (start.length) {
          const scroll = overlay.locator('[data-acceptance-scroller]').first();
          await scroll.hover();
          if (engine === 'WebKit') { await scroll.evaluate(n => { n.tabIndex = 0; n.focus({ preventScroll: true }); }); await page.keyboard.press('PageDown'); }
          else await page.mouse.wheel(0, 250);
          await page.waitForFunction(() => [...document.querySelectorAll('[data-acceptance-scroller]')].some(n => n.scrollTop > 0));
          await scroll.evaluate(n => { n.scrollTop = n.scrollHeight; });
          if (engine === 'WebKit') await page.keyboard.press('PageDown');
          else await page.mouse.wheel(0, 800);
          await page.waitForTimeout(100);
          assert.deepEqual(await position(page), lockedBefore, 'bottom edge does not chain');
          await page.waitForTimeout(250);
          await overlay.evaluate(root => [root, ...root.querySelectorAll('[data-acceptance-scroller]')].forEach(n => n.scrollTop = 0));
        }
        let close = overlay.locator('button').filter({ has: page.locator('svg.lucide-x') }).first();
        if (!await close.count()) close = overlay.getByRole('button', { name: /^Đóng/ }).first();
        if (await close.count()) {
          await close.scrollIntoViewIfNeeded();
          await close.click({ trial: true });
        }
        await page.screenshot({ path: path.join(output, `${prefix}-during.png`) });
        const geometry = await overlay.evaluate(root => {
          const r = root.getBoundingClientRect(); const p = root.firstElementChild?.getBoundingClientRect();
          return { root: { x: r.x, y: r.y, width: r.width, height: r.height }, panel: p && { x: p.x, y: p.y, width: p.width, height: p.height }, overflow: document.documentElement.scrollWidth - innerWidth };
        });
        record.geometry = geometry;
        assert.ok(geometry.overflow <= 2, `horizontal document overflow: ${geometry.overflow}px`);
        assert.ok(await overlay.evaluate(root => root.scrollHeight <= root.clientHeight + 2), 'panel descendants cannot create phantom backdrop scrolling');
        const input = overlay.locator('textarea:not([readonly]):visible,input:not([readonly]):not([disabled]):not([type]):visible,input[type="text"]:not([readonly]):not([disabled]):visible,input[type="password"]:not([readonly]):not([disabled]):visible,input[type="email"]:not([readonly]):not([disabled]):visible').first();
        if (await input.count() && await input.isVisible()) {
          const value = (await input.getAttribute('type')) === 'email' ? 'fixture@example.invalid' : '123456';
          await input.fill(value); await input.press('End');
          await page.setViewportSize({ width: height, height: width });
          await page.waitForTimeout(100);
          assert.equal(await input.inputValue(), value, 'form value survives orientation');
          await page.screenshot({ path: path.join(output, `${prefix}-landscape.png`) });
          await page.setViewportSize({ width, height: Math.max(320, height - 300) });
          record.compactPanel = await overlay.evaluate(root => [...root.children].filter(n => n.tagName !== 'BUTTON').map(n => ({ style: n.getAttribute('style'), rect: n.getBoundingClientRect().toJSON(), maxHeight: getComputedStyle(n).maxHeight, minHeight: getComputedStyle(n).minHeight })));
          await input.scrollIntoViewIfNeeded(); await input.click({ trial: true });
          assert.equal(await input.inputValue(), value, 'form value survives reduced viewport');
          await page.screenshot({ path: path.join(output, `${prefix}-compact.png`) });
          record.input = 'typed; rotation + reduced viewport preserve value';
          if (await close.count()) await close.click({ trial: true });
          const compactAction = overlay.getByRole('button', { name: /^(Lưu|Xác nhận|Gửi|Tạo|Áp dụng|Hoàn tất|Tiếp tục)/ }).first();
          if (await compactAction.count() && await compactAction.isVisible() && await compactAction.isEnabled()) await compactAction.click({ trial: true });
          record.compactControlsReachable = true;
        }
        for (const type of ['date','time']) {
          const field = overlay.locator(`input[type="${type}"]:not([disabled]):not([readonly]):visible`).first();
          if (await field.count()) {
            await field.fill(type === 'date' ? '2026-11-20' : '09:30');
            assert.equal(await field.inputValue(), type === 'date' ? '2026-11-20' : '09:30');
            record[type] = 'browser input fill verified; OS picker not tested';
          }
        }
        await page.setViewportSize({ width, height }); await page.waitForTimeout(100);
        const primary = overlay.getByRole('button', { name: /^(Lưu|Xác nhận|Gửi|Tạo|Áp dụng|Hoàn tất|Tiếp tục)/ });
        record.primaryActions = [];
        for (const action of await primary.all()) if (await action.isVisible()) {
          const label = await action.innerText();
          if (await action.isEnabled()) { await action.click({ trial: true }); record.primaryActions.push({ label, reachable: true }); }
          else record.primaryActions.push({ label, disabledByForm: true });
        }
        if (scene.mandatory) { await page.evaluate(() => window.acceptance.unmount()); record.closing = 'mandatory overlay: owner unmount'; }
        else if (await close.count()) { await close.click(); record.closing = 'existing close button'; }
        else {
          const named = overlay.getByRole('button', { name: /^(Đóng|Hủy|Huỷ|Ở lại sửa|Hủy bỏ|Đã hiểu|Tôi đã hiểu|Để sau)/i }).first();
          assert.ok(await named.count(), 'existing dismissal control found');
          await named.click(); record.closing = 'existing dismissal control';
        }
        await overlay.waitFor({ state: 'detached' });
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => document.body.style.getPropertyValue('overflow-y')), 'auto');
        assert.equal(await page.evaluate(() => document.body.style.getPropertyPriority('overflow-y')), 'important');
        assert.equal(await page.evaluate(() => document.body.style.position), '');
        assert.deepEqual(await position(page), before, 'deep scroll position restored');
        await page.screenshot({ path: path.join(output, `${prefix}-after.png`) });
        assert.deepEqual(runtime, [], 'runtime errors');
        assert.deepEqual(consoleProblems, [], 'console errors / React warnings');
        assert.deepEqual(failedRequests, [], 'network requests complete in isolated fixture');
        record.status = 'PASS';
      } catch (error) {
        record.error = error.message;
        record.failureGeometry = await page.evaluate(() => {
          const rect = node => node?.getBoundingClientRect().toJSON();
          const input = document.activeElement;
          return { inner: [innerWidth, innerHeight], viewport: window.visualViewport && { height: visualViewport.height, offsetTop: visualViewport.offsetTop, scale: visualViewport.scale }, input: rect(input), overlays: [...document.querySelectorAll('[data-overlay-root]')].map(root => ({ root: rect(root), panel: rect(root.lastElementChild), style: root.getAttribute('style'), panelStyle: root.lastElementChild?.getAttribute('style'), maxHeight: root.lastElementChild && getComputedStyle(root.lastElementChild).maxHeight, minHeight: root.lastElementChild && getComputedStyle(root.lastElementChild).minHeight })) };
        }).catch(() => null);
        await page.screenshot({ path: path.join(output, `${prefix}-failure.png`) }).catch(() => {});
        failures.push(`${scene.key}: ${error.message}`);
      } finally {
        record.runtime = runtime; record.consoleProblems = consoleProblems; record.knownWarnings = knownWarnings; record.requests = requests; record.failedRequests = failedRequests;
        results.push(record);
        console.log(`${device} ${scene.key}: ${record.status}${record.error ? ` ${record.error.split('\n')[0]}` : ''}`);
        await saveResults();
        await context.close();
      }
    }
    assert.deepEqual(failures, []);
    } finally { if (sceneBrowser !== browser) await sceneBrowser.close(); }
  });
}
});

if (!process.env.ACCEPTANCE_SCENE) for (const [device, descriptor, width, height] of matrix.filter(([name]) => (engine !== 'WebKit' || name.startsWith('iphone')) && (!process.env.ACCEPTANCE_DEVICE || name === process.env.ACCEPTANCE_DEVICE))) {
  test(`${device}: ${engine === 'WebKit' ? 'keyboard' : 'touch'}, nested owners, route cleanup, PWA internal scroll`, async () => {
    for (const internal of [false, true]) {
      const context = await browser.newContext({ ...descriptor, viewport: { width, height }, serviceWorkers: 'block' });
      if (device.startsWith('iphone')) await context.addInitScript(() => { window.GestureEvent = function GestureEvent() {}; });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(`${origin}tests/overlay-scroll-lock-harness.html${internal ? '?internal=1' : ''}`, { waitUntil: 'networkidle', timeout: 120_000 });
        await page.locator('#open').scrollIntoViewIfNeeded();
        const before = await position(page);
        await page.locator('#open').click();
        const cdp = engine === 'Chromium' ? await context.newCDPSession(page) : null;
        const touch = async (x, from, to) => {
          if (!cdp) {
            // Mobile WebKit has no Playwright wheel/CDP swipe API. Use native
            // keyboard scrolling in that engine and retain CDP touch in Chromium.
            await page.evaluate(({ x, y }) => {
              const target = document.elementFromPoint(x, y)?.closest('#modal-scroll');
              if (target instanceof HTMLElement) { target.tabIndex = 0; target.focus({ preventScroll: true }); }
              else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            }, { x, y: from });
            await page.keyboard.press('PageDown'); await page.waitForTimeout(200); return;
          }
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
          for (let y = from; y > to; y -= 20) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForTimeout(200);
        };
        const locked = await position(page);
        await touch(2, height - 50, 80);
        assert.deepEqual(await position(page), locked, 'background gesture blocked');
        const scroll = page.locator('#modal-scroll');
        const rect = await scroll.boundingBox();
        await touch(width / 2, Math.min(rect.y + rect.height - 20, height - 50), Math.max(rect.y + 20, 100));
        assert.ok(await scroll.evaluate(n => n.scrollTop) > 0, 'gesture scrolls modal');
        await scroll.evaluate(n => n.scrollTop = n.scrollHeight);
        await touch(width / 2, height - 80, height / 2);
        assert.deepEqual(await position(page), locked, 'edge cannot chain');
        await page.locator('#open-b').click();
        await page.locator('#close-underlying').click();
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden');
        await page.locator('#close-b').click();
        assert.deepEqual(await position(page), before);
        for (let cycle = 0; cycle < 2; cycle++) {
          await page.locator('#open').click(); await page.locator('#unmount').click();
          assert.deepEqual(await position(page), before);
        }
        await page.locator('#open-drawer').click(); await page.locator('#drawer-modal').click();
        const bodyTop = await page.evaluate(() => document.body.style.top);
        const bodyPosition = () => page.evaluate(() => ({ x: document.body.getBoundingClientRect().left, y: document.body.getBoundingClientRect().top }));
        const frozenBody = await bodyPosition();
        await page.locator('#alert').click();
        assert.deepEqual(await bodyPosition(), frozenBody, 'Safari alert preserves background geometry');
        // An internal-only lock deliberately owns no body.top. SweetAlert may
        // temporarily set 0px there; only document locking owns a frozen offset.
        if (!internal) assert.equal(await page.evaluate(() => document.body.style.top), bodyTop, 'Safari alert preserves frozen background');
        await page.getByRole('button', { name: 'OK', exact: true }).click();
        await page.locator('.swal2-container').waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden');
        assert.equal(await page.evaluate(() => document.body.style.top), bodyTop, 'remaining owner retains body offset after alert');
        assert.deepEqual(await bodyPosition(), frozenBody, 'remaining owner retains background geometry');
        await page.locator('#close-a').click(); await page.locator('#close-drawer').click();
        await page.waitForFunction(() => document.body.style.getPropertyValue('overflow-y') === 'auto');
        assert.deepEqual(await position(page), before);
        await page.locator('#open').click(); await page.getByRole('link', { name: 'Next route' }).click();
        await page.locator('#next').waitFor();
        assert.equal(await page.evaluate(() => document.body.style.position), '');
        assert.equal(await page.evaluate(() => document.body.style.getPropertyValue('overflow-y')), 'auto');
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  });
  for (const layout of ['staff', 'student', 'scholarship']) test(`${device}: real ${layout} drawer + real modal ownership`, async () => {
    const context = await browser.newContext({ ...descriptor, viewport: { width, height }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route(url => url.origin + '/' !== origin || /^(\/api\/|\/events$|\/courses$)/.test(url.pathname), route => {
      const request = route.request(), url = request.url();
      if (url.startsWith(origin) && !url.includes('/api/') && !['fetch','xhr'].includes(request.resourceType())) return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(apiFixture(url)) });
    });
    try {
      await page.goto(`${origin}tests/mobile-overlay-acceptance.html?layout=${layout}`, { waitUntil: 'networkidle', timeout: 120_000 });
      if (layout === 'student') await page.locator('button').filter({ has: page.locator('svg.lucide-menu') }).first().click();
      else await page.getByRole('button', { name: /Mở menu|Menu/ }).first().click();
      const close = layout === 'student' ? page.locator('.mobile-menu-panel button').filter({ has: page.locator('svg.lucide-x') }).first() : page.getByRole('button', { name: /^Đóng menu/ }).first();
      await close.waitFor({ state: 'visible' });
      await close.click({ trial: true });
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden');
      await page.screenshot({ path: path.join(output, `${device}/drawer-${layout}-during.png`) });
      await page.evaluate(() => window.acceptance.mount('UserGuideModal-1'));
      const modal = page.locator('[data-acceptance-overlay="components/UserGuideModal.tsx:1"]');
      await modal.waitFor();
      // Simulate lower owner's close while its physical control is intentionally occluded.
      await close.evaluate(button => button.click());
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden');
      await page.evaluate(() => window.acceptance.unmount());
      await modal.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.body.style.getPropertyValue('overflow-y')), 'auto');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
