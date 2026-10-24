import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright-core';

const evidence = process.env.SIDEBAR_EVIDENCE_DIR;
if (evidence) fs.mkdirSync(evidence, { recursive: true });
const measurements = [];
const server = await createServer({ configFile: false, envDir: false, plugins: [react()], cacheDir: 'node_modules/.vite-sidebar-mobile', optimizeDeps: { entries: ['tests/mobile-sidebar-harness.html'] }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browsers = {
  chromium: await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }),
  webkit: await webkit.launch({ headless: true }),
};
test.after(async () => {
  await Promise.all(Object.values(browsers).map(browser => browser.close()));
  await server.close();
  if (evidence) fs.writeFileSync(`${evidence}/measurements.json`, JSON.stringify(measurements, null, 2) + '\n');
});
async function fixture(engine, role, width = 375, height = 667, standalone = false) {
  const context = await browsers[engine].newContext({ ...devices['iPhone 13'], viewport: { width, height }, ...(width >= 768 ? { isMobile: false, hasTouch: false } : {}) });
  await context.addInitScript(({ standalone }) => {
    localStorage.setItem('hub_ai_third_party_consent_fixture-user', 'accepted');
    if (standalone) Object.defineProperty(navigator, 'standalone', { value: true });
  }, { standalone });
  const requests = [], errors = [];
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === new URL(base).origin && !['fetch', 'xhr'].includes(request.resourceType())) return route.continue();
    requests.push({ method: request.method(), path: url.pathname });
    return route.fulfill({ json: url.pathname.includes('/auth/') ? null : { success: true, data: [], total: 0, count: 0, candidates: [], notifications: [], unread_count: 0, sessions: [] } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) errors.push(message.text()); });
  await page.goto(`${base}tests/mobile-sidebar-harness.html?role=${role}`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.locator('#mode').waitFor({ state: 'attached' });
  return { context, page, errors, requests };
}
const positions = page => page.evaluate(() => {
  const main = document.querySelector('.admin-content-scroll');
  const anchor = document.querySelector('#page-anchor').getBoundingClientRect();
  // The existing iOS lock fixes body at negative saved offsets. Compare logical
  // position while locked, plus the actual background anchor, and raw offsets after release.
  const fixed = document.body.style.position === 'fixed';
  return { x: fixed ? -parseFloat(document.body.style.left || '0') || 0 : scrollX, y: fixed ? -parseFloat(document.body.style.top || '0') || 0 : scrollY, internalX: main?.scrollLeft || 0, internalY: main?.scrollTop || 0, anchorX: anchor.x, anchorY: anchor.y };
});
const opener = page => page.getByRole('button', { name: 'Mở menu', exact: true });
const dialog = page => page.getByRole('dialog', { name: 'Menu điều hướng', exact: true });
const scroller = page => page.locator('.mobile-sidebar-layer .staff-sidebar-content, .mobile-sidebar-layer > .mobile-menu-panel > .mobile-menu-scroll');
async function resize(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(width => innerWidth === width, width);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function open(page) {
  await opener(page).click();
  await dialog(page).waitFor();
  await page.waitForTimeout(350);
  assert.equal(await dialog(page).count(), 1);
  assert.equal(await opener(page).getAttribute('aria-expanded'), 'true');
  assert.equal(await dialog(page).getAttribute('id'), await opener(page).getAttribute('aria-controls'));
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-sidebar-close')), true);
}
async function closed(page, before) {
  await dialog(page).waitFor({ state: 'detached' });
  // Let WebKit present the released fixed-body frame before the next pointer action.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await opener(page).getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#root').evaluate(element => element.inert), false);
  assert.equal(await opener(page).evaluate(element => element === document.activeElement), true);
  assert.deepEqual(await positions(page), before);
}
async function visibleHeader(page) {
  const geometry = await dialog(page).evaluate(panel => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
    const close = panel.querySelector('[data-sidebar-close]'), header = panel.querySelector('[data-sidebar-header]');
    const r = close.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { panel: rect(panel), header: rect(header), close: rect(close), closeClickable: close.contains(hit), viewport: { width: innerWidth, height: visualViewport.height, top: visualViewport.offsetTop }, horizontal: document.documentElement.scrollWidth > innerWidth || panel.scrollWidth > panel.clientWidth + 1 };
  });
  assert.ok(geometry.close.width >= 44 - 0.001 && geometry.close.height >= 44 - 0.001, JSON.stringify(geometry));
  assert.ok(geometry.header.y >= geometry.viewport.top - 1 && geometry.header.bottom <= geometry.viewport.top + geometry.viewport.height + 1, JSON.stringify(geometry));
  assert.equal(geometry.closeClickable, true);
  assert.equal(geometry.horizontal, false);
  return geometry;
}

for (const engine of Object.keys(browsers)) {
  for (const [role, width, height] of [['student', 375, 667], ['student', 390, 844], ['student', 430, 932], ['student', 360, 640], ['guest', 375, 667], ['admin', 375, 667], ['auditor', 390, 844]]) {
    test(`${engine} browser ${role} ${width}x${height}: drawer, isolation, scroll, focus, route and resize`, async () => {
      const { context, page, errors, requests } = await fixture(engine, role, width, height);
      const staff = role === 'admin' || role === 'auditor';
      try {
        assert.equal(await page.locator('#mode').textContent(), 'browser');
        assert.equal(await dialog(page).count(), 0);
        assert.equal(await opener(page).getAttribute('aria-expanded'), 'false');
        await page.locator('#background-draft').fill('Edited background draft');
        await page.evaluate(() => { scrollTo(0, 0); const main = document.querySelector('.admin-content-scroll'); if (main) main.scrollTop = 900; else scrollTo(0, 900); });
        const before = await positions(page);
        if (evidence && width === 375 && ['student', 'admin'].includes(role)) await page.screenshot({ path: `${evidence}/${engine}-${role}-page.png` });
        await open(page);
        assert.deepEqual(await positions(page), before);
        const firstHeader = await visibleHeader(page);
        const navFonts = await dialog(page).locator('a').evaluateAll(elements => elements.filter(e=>e.getClientRects().length).map(e=>({name:e.getAttribute('aria-label')||e.textContent.trim(),font:parseFloat(getComputedStyle(e).fontSize)})));
        assert.ok(navFonts.every(e=>e.font>=13.99),JSON.stringify(navFonts));
        assert.equal(await page.locator('#root').evaluate(element => element.inert), true);
        const layer = page.locator('.mobile-sidebar-layer');
        assert.equal(await layer.evaluate(element => { const r = element.getBoundingClientRect(); return Math.abs(r.height - visualViewport.height) < 1 && Math.abs(r.y - visualViewport.offsetTop) < 1; }), true);
        const aiHit = await page.locator('.mobile-ai-button').evaluate(element => { const r = element.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.mobile-ai-advisor') != null; });
        assert.equal(aiHit, false);
        // Physical wheel plus touchmove edge dispatch exercise the existing shared guards.
        await page.mouse.move(width - 5, height / 2);
        if (engine === 'chromium') await page.mouse.wheel(0, 550);
        else assert.equal(await layer.evaluate(element => !element.querySelector('.mobile-sidebar-backdrop').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 550 }))), true);
        assert.equal(await layer.evaluate(element => {
          const target = element.querySelector('.mobile-sidebar-backdrop');
          const point = y => ({ identifier: 1, clientX: innerWidth - 5, clientY: y });
          const send = (type, y) => { const event = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'touches', { value: [point(y)] }); target.dispatchEvent(event); return event.defaultPrevented; };
          send('touchstart', 450); return send('touchmove', 150);
        }), true);
        assert.deepEqual(await positions(page), before);
        await page.locator('#background-action').evaluate(element => element.focus());
        assert.equal(await dialog(page).evaluate(element => element.contains(document.activeElement)), true);
        await page.locator('[data-sidebar-close]').focus();
        await page.keyboard.press('Shift+Tab');
        assert.equal(await dialog(page).evaluate(element => element.contains(document.activeElement)), true);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('[data-sidebar-close]').evaluate(element => element === document.activeElement), true);
        const ends = await dialog(page).evaluate(element => {
          const controls = Array.from(element.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')).filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && !control.closest('[inert]') && control.getClientRects().length);
          controls[0].setAttribute('data-tab-first', ''); controls.at(-1).setAttribute('data-tab-last', ''); return controls.length;
        });
        assert.ok(ends > 2);
        await page.locator('[data-tab-first]').focus(); await page.keyboard.press('Shift+Tab');
        assert.equal(await page.locator('[data-tab-last]').evaluate(element => element === document.activeElement), true);
        await page.keyboard.press('Tab');
        assert.equal(await page.locator('[data-tab-first]').evaluate(element => element === document.activeElement), true);
        if (staff) {
          const groups = dialog(page).locator('.admin-sidebar-nav section > button');
          for (const group of await groups.all()) if (await group.getAttribute('aria-expanded') === 'false') await group.click();
        } else {
          const handbook = dialog(page).getByRole('button', { name: 'Cẩm nang', exact: true });
          await handbook.click(); assert.equal(await handbook.getAttribute('aria-expanded'), 'true');
        }
        await page.waitForTimeout(350); // Wait for the handbook's height transition.
        // Native Chromium touch scrolling, followed by native keyboard input in both engines.
        await scroller(page).evaluate(element => { element.tabIndex = 0; element.scrollTop = 0; element.focus(); });
        if (engine === 'chromium' && await scroller(page).evaluate(element => element.scrollHeight > element.clientHeight)) {
          const session = await context.newCDPSession(page), box = await scroller(page).boundingBox();
          const x = box.x + box.width / 2, start = box.y + box.height - 30, distance = Math.min(300, box.height - 60);
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
          for (let step = 1; step <= 5; step++) { await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: start - distance * step / 5 }] }); await page.waitForTimeout(40); }
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForTimeout(150);
          assert.ok(await scroller(page).evaluate(element => element.scrollTop > 0), 'Native touch must scroll the menu');
          await session.detach();
        }
        await page.keyboard.press('PageDown'); await page.waitForTimeout(150);
        await page.keyboard.press('End');
        await page.waitForTimeout(300);
        const scroll = await scroller(page).evaluate(element => ({ top: element.scrollTop, end: element.scrollHeight - element.clientHeight }));
        assert.ok(scroll.top >= scroll.end - 2, JSON.stringify(scroll));
        if (!staff) assert.ok(scroll.end > 0, 'Long student menu must scroll');
        const last = staff ? dialog(page).getByRole('button', { name: 'Đăng xuất', exact: true }) : dialog(page).getByRole('link', { name: 'Chính sách bảo mật', exact: true });
        assert.equal(await last.evaluate(element => { const r = element.getBoundingClientRect(); return r.y >= 0 && r.bottom <= visualViewport.height + 1; }), true);
        const endHeader = await visibleHeader(page);
        assert.equal(endHeader.header.y, firstHeader.header.y);
        assert.deepEqual(await positions(page), before);
        if (evidence && width === 375 && ['student', 'admin'].includes(role)) await page.screenshot({ path: `${evidence}/${engine}-${role}-drawer.png` });
        measurements.push({ engine, role, width, height, ...endHeader, menuScroll: scroll, background: before });
        await page.keyboard.press('Escape'); await closed(page, before);
        await open(page); await page.locator('.mobile-sidebar-backdrop').click({ position: { x: width - 3, y: 120 } }); await closed(page, before);
        await open(page); await page.locator('[data-sidebar-close]').click(); await closed(page, before);
        await open(page);
        await resize(page, width, 240); await page.waitForTimeout(100); await visibleHeader(page);
        await scroller(page).evaluate(element => { element.tabIndex = 0; element.focus(); });
        await page.keyboard.press('End'); await page.waitForTimeout(200); await visibleHeader(page);
        assert.equal(await last.evaluate(element => { const r = element.getBoundingClientRect(); return r.y >= 0 && r.bottom <= visualViewport.height + 1; }), true);
        await resize(page, 667, 375);
        if (!staff) await dialog(page).waitFor({ state: 'detached' });
        else { await visibleHeader(page); await page.keyboard.press('Escape'); }
        await resize(page, width, height);
        await open(page);
        const route = dialog(page).getByRole('link', { name: 'Tổng quan', exact: true });
        await route.click(); await dialog(page).waitFor({ state: 'detached' });
        assert.equal(new URL(page.url()).pathname, '/dashboard');
        // The link handler closes immediately; React Router commits its transition later.
        // Wait for the actual page render before exercising the next deliberate opening.
        await page.locator('#page-anchor').filter({ hasText: '/dashboard' }).waitFor();
        assert.equal(await page.locator('#background-draft').inputValue(), 'Edited background draft');
        await open(page);
        await page.evaluate(() => window.sidebarHarness.navigate('/events'));
        await dialog(page).waitFor({ state: 'detached' });
        assert.equal(await page.locator('#root').evaluate(element => element.inert), false);
        await page.locator('#page-anchor').filter({ hasText: '/events' }).waitFor();
        await open(page); await resize(page, 1440, 900);
        await dialog(page).waitFor({ state: 'detached' });
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
        assert.equal(await page.locator('#root').evaluate(element => element.inert), false);
        assert.deepEqual(errors, []);
        assert.equal(requests.some(request => request.method !== 'GET'), false, JSON.stringify(requests));
      } finally { await context.close(); }
    });
  }
  test(`${engine}: higher overlay ownership, existing AI draft and viewport geometry`, async () => {
    const { context, page, errors } = await fixture(engine, 'student');
    try {
      await page.locator('.mobile-ai-button').click();
      const input = page.locator('.mobile-ai-overlay textarea');
      await input.fill('Unsaved chat draft');
      // Explicit fixture concurrency: AI's backdrop normally prevents opening a lower menu by pointer.
      await opener(page).evaluate(element => element.click());
      await dialog(page).waitFor();
      assert.equal(await input.inputValue(), 'Unsaved chat draft');
      assert.equal(await page.locator('.mobile-ai-overlay').evaluate(element => element.inert), true);
      await page.evaluate(() => window.sidebarHarness.nested());
      await page.getByRole('button', { name: 'Close nested' }).waitFor();
      await page.waitForFunction(() => document.activeElement?.textContent === 'Close nested');
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: 'Nested fixture' }).waitFor({ state: 'detached' });
      assert.equal(await dialog(page).count(), 1);
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      await page.evaluate(() => window.sidebarHarness.nested());
      await page.getByRole('button', { name: 'Close nested' }).waitFor();
      await page.evaluate(() => window.sidebarHarness.navigate('/schedule'));
      await dialog(page).waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      await page.getByRole('button', { name: 'Close nested' }).click();
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await input.inputValue(), 'Unsaved chat draft');
      assert.equal(await page.locator('.mobile-ai-overlay').evaluate(element => element.inert), false);
      // VisualViewport offsets and safe-area-sized insets are simulated, not physical Safari chrome.
      await opener(page).evaluate(element => element.click());
      await dialog(page).waitFor();
      await page.evaluate(() => {
        const viewport = new EventTarget(); Object.assign(viewport, { height: 280, offsetTop: 36, scale: 1 });
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
      });
      // Reopen to attach to the simulated viewport event target.
      await page.keyboard.press('Escape'); await opener(page).evaluate(element => element.click());
      await dialog(page).waitFor();
      await page.locator('.mobile-sidebar-layer').evaluate(element => { element.style.paddingTop = '44px'; element.style.paddingBottom = '34px'; window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(350); await visibleHeader(page);
      assert.equal(await page.locator('.mobile-sidebar-layer').evaluate(element => element.getBoundingClientRect().y), 36);
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  test(`${engine}: SweetAlert confirmation takes focus and Escape before the drawer`, async () => {
    const { context, page, errors } = await fixture(engine, 'student');
    try {
      const before = await positions(page);
      await open(page);
      await page.evaluate(() => window.sidebarHarness.alert());
      const alert = page.locator('.swal2-container');
      await alert.waitFor();
      await page.waitForFunction(() => document.querySelector('.swal2-container')?.contains(document.activeElement));
      assert.equal(await alert.evaluate(element => element.inert), false);
      await page.keyboard.press('Escape');
      await alert.waitFor({ state: 'detached' });
      assert.equal(await dialog(page).count(), 1);
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      await page.evaluate(() => window.sidebarHarness.alert());
      await alert.waitFor();
      await page.evaluate(() => window.sidebarHarness.navigate('/events'));
      await dialog(page).waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      await page.getByRole('button', { name: 'Cancel fixture', exact: true }).click();
      await alert.waitFor({ state: 'detached' });
      // The shared SweetAlert adapter releases its owner in asynchronous didDestroy,
      // after DOM removal. A remaining owner must still fail this bounded wait.
      await page.waitForFunction(() => document.body.style.overflow === '', null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await page.locator('#root').evaluate(element => element.inert), false);
      assert.deepEqual(await positions(page), before);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  test(`${engine}: desktop and installed mode retain their layout`, async () => {
    const desktop = await fixture(engine, 'admin', 1440, 900);
    try {
      assert.equal(await desktop.page.locator('.admin-sidebar').count(), 1);
      assert.equal(await desktop.page.locator('.admin-sidebar').getAttribute('role'), null);
      const sidebar = desktop.page.locator('.admin-sidebar');
      assert.ok((await sidebar.boundingBox()).width > 200);
      await desktop.page.getByRole('button', { name: 'Thu gọn thanh điều hướng' }).click();
      await desktop.page.waitForTimeout(300);
      assert.ok((await sidebar.boundingBox()).width <= 61);
      assert.deepEqual(desktop.errors, []);
    } finally { await desktop.context.close(); }
    const standalone = await fixture(engine, 'student', 390, 844, true);
    try {
      assert.equal(await standalone.page.locator('#mode').textContent(), 'standalone');
      assert.equal(await standalone.page.locator('.mobile-sidebar-layer').count(), 0);
      assert.equal(await standalone.page.evaluate(() => document.body.style.overflow), '');
      assert.deepEqual(standalone.errors, []);
    } finally { await standalone.context.close(); }
  });
}
