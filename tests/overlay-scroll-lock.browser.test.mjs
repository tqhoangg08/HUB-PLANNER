import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright-core';

const server = await createServer({ configFile: false, plugins: [react()], cacheDir: 'node_modules/.vite-overlay-tests', server: { host: '127.0.0.1', port: 0 }, optimizeDeps: { entries: ['tests/overlay-scroll-lock-harness.html'] }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
test.after(async () => { await browser.close(); await server.close(); });
const base = `${server.resolvedUrls.local[0]}tests/overlay-scroll-lock-harness.html`;
const iosUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

async function fixture({ internal = false, ios = true, keyboard = false, android = false } = {}) {
  const context = await browser.newContext({ viewport: { width: ios || android ? 390 : 1280, height: 740 }, hasTouch: ios || android, isMobile: ios || android, ...(ios ? { userAgent: iosUA } : android ? { userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' } : {}) });
  if (keyboard) await context.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { height: 740, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: viewport });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  await page.goto(base + (internal ? '?internal=1' : ''), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('#open').scrollIntoViewIfNeeded();
  const before = await position(page);
  assert.ok(internal ? before.internal > 1000 : before.document > 1000);
  return { context, page, before, errors };
}
const position = page => page.evaluate(() => ({ document: scrollY, internal: document.querySelector('main').scrollTop }));

test('mobile browser layout styles preserve portal header contrast and contain absolute screen-reader table heads', async () => {
  const { context, page, before } = await fixture();
  try {
    await page.locator('#open-guide').click();
    const guide = page.getByRole('dialog');
    const root = page.locator('[data-overlay-root]');
    assert.equal(await guide.locator('header').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(0, 51, 117)');
    assert.equal(await root.evaluate(n => n.scrollHeight <= n.clientHeight + 1), true);
    await guide.locator('.overflow-y-auto').evaluate(n => { n.scrollTop = n.scrollHeight; });
    assert.equal(await root.evaluate(n => n.scrollHeight <= n.clientHeight + 1), true);
    await page.getByRole('button', { name: 'Đóng phụ lục' }).click();
    await restored(page, before);
    assert.deepEqual(await page.evaluate(async () => {
      const { attachOverlayViewport } = await import('/utils/overlayViewport.ts');
      const root = document.createElement('div'), panel = document.createElement('section');
      panel.style.setProperty('position', 'static', 'important'); root.append(panel); document.body.append(root);
      const cleanup = attachOverlayViewport(root);
      const during = getComputedStyle(panel).position;
      cleanup();
      const after = [panel.style.position, panel.style.getPropertyPriority('position')];
      root.remove(); return { during, after };
    }), { during: 'relative', after: ['static', 'important'] });
  } finally { await context.close(); }
});
const locked = page => page.evaluate(() => getComputedStyle(document.body).overflowY === 'hidden' && getComputedStyle(document.querySelector('main')).overflowY === 'hidden');
async function restored(page, before) {
  assert.equal(await page.evaluate(() => document.body.style.getPropertyValue('overflow-y')), 'auto');
  assert.equal(await page.evaluate(() => document.body.style.getPropertyPriority('overflow-y')), 'important');
  assert.equal(await page.evaluate(() => document.body.style.position), '');
  assert.equal(await page.evaluate(() => document.body.style.color), 'rgb(12, 34, 56)');
  assert.equal(await page.evaluate(() => document.documentElement.style.scrollBehavior), 'smooth');
  assert.deepEqual(await position(page), before);
}

for (const [name, settings] of [['iOS browser document path (Chromium emulation)', {}], ['iOS standalone/internal path (Chromium emulation)', { internal: true }], ['Chrome Android path (Chromium emulation)', { ios: false, android: true }], ['desktop document path', { ios: false }], ['desktop internal path', { ios: false, internal: true }]]) {
  test(`${name}: background wheel is blocked, modal scrolls, styles and deep position restore`, async () => {
    const { context, page, before, errors } = await fixture(settings);
    try {
      await page.locator('#open').click();
      assert.equal(await locked(page), true);
      assert.equal(await page.locator('#a').evaluate(node => node.parentElement === document.body), true);
      await page.mouse.move(3, 100);
      await page.mouse.wheel(0, 500);
      await page.locator('#modal-scroll').hover();
      await page.mouse.wheel(0, 300);
      await page.waitForFunction(() => document.querySelector('#modal-scroll').scrollTop > 0);
      await page.locator('#modal-scroll').evaluate(node => { node.scrollTop = node.scrollHeight; });
      await page.mouse.wheel(0, 1000);
      await page.locator('#close-a').click();
      await restored(page, before);
      const start = await position(page);
      await page.mouse.move(10, 250);
      await page.mouse.wheel(0, 200);
      await page.waitForFunction(({ internal, start }) => internal ? document.querySelector('main').scrollTop > start.internal : scrollY > start.document, { internal: !!settings.internal, start });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test('nested overlays survive out-of-order close; last owner restores the first snapshot under StrictMode', async () => {
  const { context, page, before } = await fixture();
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      await page.locator('#open').click();
      await page.locator('#open-b').click();
      await page.locator('#close-underlying').click();
      assert.equal(await locked(page), true);
      await page.locator('#close-b').click();
      await restored(page, before);
    }
  } finally { await context.close(); }
});

test('unexpected unmount and route navigation release all ownership', async () => {
  const { context, page, before } = await fixture();
  try {
    await page.locator('#open').click();
    await page.locator('#unmount').click();
    await restored(page, before);
    await page.locator('#open').click();
    await page.getByRole('link', { name: 'Next route' }).click();
    await page.locator('#next').waitFor();
    assert.equal(await page.evaluate(() => document.body.style.position), '');
    assert.equal(await page.evaluate(() => document.body.style.getPropertyValue('overflow-y')), 'auto');
    assert.equal(await page.locator('[data-overlay-root]').count(), 0);
  } finally { await context.close(); }
});

test('drawer adapter and SweetAlert dialogs share ownership with React modals', async () => {
  const { context, page, before } = await fixture();
  try {
    await page.locator('#open-drawer').click();
    assert.equal(await locked(page), true);
    await page.locator('#drawer-modal').click();
    await page.locator('#alert').click();
    await page.getByRole('dialog', { name: 'Nested alert' }).waitFor();
    await page.getByRole('button', { name: 'OK', exact: true }).click();
    await page.getByRole('dialog', { name: 'Nested alert' }).waitFor({ state: 'detached' });
    assert.equal(await locked(page), true);
    await page.locator('#close-a').click();
    assert.equal(await locked(page), true);
    await page.locator('#close-drawer').click();
    await restored(page, before);
  } finally { await context.close(); }
});

test('visual viewport resize/offset and input auto-zoom keep form and last action reachable without losing input', async () => {
  const { context, page, before } = await fixture({ keyboard: true });
  try {
    await page.locator('#open').click();
    await page.getByRole('textbox', { name: 'Notes' }).fill('Preserve draft');
    await page.evaluate(() => { Object.assign(visualViewport, { height: 360, offsetTop: 80, scale: 1.4 }); visualViewport.dispatchEvent(new Event('resize')); });
    const box = await page.locator('#a').boundingBox();
    assert.equal(box.height, 360);
    assert.equal(box.y, 80);
    await page.locator('#last').scrollIntoViewIfNeeded();
    const last = await page.locator('#last').boundingBox();
    assert.ok(last.y >= box.y && last.y + last.height <= box.y + box.height);
    assert.equal(await page.getByRole('textbox', { name: 'Notes' }).inputValue(), 'Preserve draft');
    await page.getByLabel('Date', { exact: true }).fill('2026-10-18');
    assert.equal(await locked(page), true);
    await page.locator('#close-a').click();
    await restored(page, before);
  } finally { await context.close(); }
});

test('touch guard allows modal scrolling, blocks both edges and backdrop, and preserves multi-touch', async () => {
  const { context, page } = await fixture();
  try {
    await page.locator('#open').click();
    const result = await page.evaluate(() => {
      const scroll = document.querySelector('#modal-scroll');
      function gesture(target, from, to, count = 1) {
        const touches = y => Array.from({ length: count }, (_, identifier) => new Touch({ identifier, target, clientX: 100, clientY: y }));
        target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: touches(from) }));
        return target.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: touches(to) }));
      }
      scroll.scrollTop = 100;
      const inside = gesture(scroll, 300, 200);
      scroll.scrollTop = 0;
      const top = gesture(scroll, 200, 300);
      scroll.scrollTop = scroll.scrollHeight;
      const bottom = gesture(scroll, 300, 200);
      const backdrop = gesture(document.querySelector('#a'), 300, 200);
      const pinch = gesture(scroll, 300, 200, 2);
      const range = document.querySelector('#range');
      range.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [new Touch({ identifier: 0, target: range, clientX: 100, clientY: 100 })] }));
      const slider = range.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [new Touch({ identifier: 0, target: range, clientX: 160, clientY: 100 })] }));
      return { inside, top, bottom, backdrop, pinch, slider };
    });
    assert.deepEqual(result, { inside: true, top: false, bottom: false, backdrop: false, pinch: true, slider: true });
  } finally { await context.close(); }
});

test('real event filter drawer and DRL guide share ownership and retain Escape and focus behavior', async () => {
  const { context, page, before } = await fixture();
  try {
    await page.getByRole('button', { name: /^Bộ lọc/ }).click();
    await page.getByRole('dialog', { name: 'Bộ lọc' }).waitFor();
    assert.equal(await locked(page), true);
    // Opening a second production modal is an intentional integration fixture action.
    await page.locator('#open-guide').evaluate(node => node.click());
    await page.getByRole('dialog', { name: 'Phụ lục Đánh giá Kết quả Rèn luyện' }).waitFor();
    await page.getByRole('button', { name: 'Đóng phụ lục' }).click();
    assert.equal(await locked(page), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(), 0);
    await restored(page, before);
  } finally { await context.close(); }
});
