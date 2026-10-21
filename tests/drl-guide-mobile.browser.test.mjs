import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright-core';

// Real EventsBoard/MobileEvents handlers and default state, anonymous API data.
// No production requests, auth bypass, component transforms or auto-open hooks.
const engine = process.env.DRL_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const server = await createServer({ configFile: false, envDir: false, plugins: [react()],
  cacheDir: 'node_modules/.vite-drl-mobile', optimizeDeps: { entries: ['tests/drl-guide-mobile-harness.html'] },
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await (engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true }));
test.after(async () => { await browser.close(); await server.close(); });
await mkdir('.cache/drl-task02', { recursive: true });

const title = 'Phụ lục Đánh giá Kết quả Rèn luyện';
const guide = page => page.getByRole('dialog', { name: title });
const guideAction = page => page.getByRole('button', { name: 'Xem hướng dẫn điểm rèn luyện' });
const trigger = page => page.viewportSize().width < 1024 ? page.getByRole('button', { name: 'Thao tác sự kiện', exact: true }) : guideAction(page);
async function chooseGuide(page) { if (page.viewportSize().width < 1024) await guideAction(page).click(); }
const anchorTop = page => page.locator('#page-anchor').evaluate(n => n.getBoundingClientRect().top);
const settleViewport = page => page.waitForFunction(() => Math.abs(
  document.querySelector('[data-overlay-root]').getBoundingClientRect().height - visualViewport.height) < 2);
async function visibleControls(page) {
  const geometry = await guide(page).evaluate(d => {
    const h = d.querySelector('header').getBoundingClientRect(), b = d.querySelector('button').getBoundingClientRect();
    const s = d.querySelector('.overflow-y-auto');
    return { headerTop: h.top, headerBottom: h.bottom, closeTop: b.top, closeBottom: b.bottom,
      closeWidth: b.width, closeHeight: b.height, viewport: innerHeight,
      bodyHeight: s.clientHeight, overflow: s.scrollWidth > s.clientWidth + 1 || d.scrollWidth > d.clientWidth + 1,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.ok(geometry.headerTop >= 0 && geometry.headerBottom <= geometry.viewport, JSON.stringify(geometry));
  assert.ok(geometry.closeTop >= 0 && geometry.closeBottom <= geometry.viewport, JSON.stringify(geometry));
  assert.ok(geometry.closeWidth >= 44 && geometry.closeHeight >= 44, JSON.stringify(geometry));
  assert.ok(geometry.bodyHeight > 40, JSON.stringify(geometry));
  assert.equal(geometry.overflow, false, JSON.stringify(geometry));
  assert.equal(geometry.documentOverflow, false, JSON.stringify(geometry));
  // A visible rectangle alone does not prove that another layer cannot cover it.
  assert.equal(await guide(page).getByRole('button', { name: 'Đóng phụ lục' }).evaluate(b => {
    const r = b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  }), true);
  return geometry;
}

for (const [name, width, height, desktop] of [
  ['iphone-se', 375, 667, false], ['iphone-13', 390, 844, false],
  ['small-360', 360, 640, false], ['desktop', 1440, 900, true],
]) test(`${engine} ${name}: real event page, appendix, focus, viewport and scroll lifecycle`, { timeout: 180_000 }, async () => {
  const context = await browser.newContext({ ...(desktop ? {} : devices[name === 'small-360' ? 'Pixel 7' : 'iPhone 13']), viewport: { width, height } });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === new URL(base).origin && !['fetch', 'xhr'].includes(request.resourceType())) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(
      url.pathname.includes('/auth/') ? null : { success: true, data: [], total: 0, count: 0,
        rules: [], organizers: [], event_types: [], regions: [] }) });
  });
  const page = await context.newPage(), errors = [], warnings = [], evidence = { engine, name, width, height };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
  try {
    await page.goto(`${base}tests/drl-guide-mobile-harness.html${desktop ? '?view=desktop' : ''}`, { waitUntil: 'networkidle', timeout: 120_000 });
    await trigger(page).waitFor();
    assert.equal(await guide(page).count(), 0, 'closed on initial mount');
    await page.getByRole('textbox', { name: 'Tìm kiếm sự kiện', exact: true }).fill('fixture');
    if (page.viewportSize().width >= 1024) await page.getByRole('combobox', { name: 'Sắp xếp sự kiện', exact: true }).selectOption({ index: 1 });
    else { await page.getByRole('button', { name: 'Sắp xếp', exact: true }).click(); await page.locator('#event-filter-sort').selectOption({ index: 1 }); await page.getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click(); }
    await page.waitForTimeout(400); // Allow the real keyword debounce to rerender its parent.
    await page.evaluate(() => window.drlHarness.rerender());
    assert.equal(await guide(page).count(), 0, 'filters and parent rerender cannot open appendix');
    await page.getByRole('button', { name: /^Bộ lọc/ }).click();
    await page.getByRole('dialog', { name: 'Bộ lọc', exact: true }).waitFor();
    assert.equal(await guide(page).count(), 0, 'opening filter drawer cannot open appendix');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.evaluate(() => window.drlHarness.leave());
    await page.locator('#away').waitFor();
    await page.evaluate(() => window.drlHarness.return());
    await trigger(page).waitFor();
    assert.equal(await guide(page).count(), 0, 'closed after route remount');

    await trigger(page).evaluate(n => n.scrollIntoView({ block: 'center' }));
    await trigger(page).focus();
    const beforeScroll = await page.evaluate(() => scrollY), beforeAnchor = await anchorTop(page);
    assert.ok(beforeScroll > 500, `fixture opens guide from a deeply scrolled page: ${JSON.stringify({ beforeScroll, beforeAnchor, trigger: await trigger(page).boundingBox() })}`);
    const beforeStyles = await page.evaluate(() => [document.body.getAttribute('style'), document.documentElement.getAttribute('style')]);
    // Locator.click may scroll an already-visible sticky desktop header again.
    // Click its current hit-tested coordinates, as a user does, after snapshotting.
    const triggerBox = await trigger(page).boundingBox();
    await page.mouse.click(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
    await chooseGuide(page);
    await guide(page).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1, 'one user action opens one dialog');
    await settleViewport(page);
    evidence.portrait = await visibleControls(page);
    assert.equal(await guide(page).getByRole('heading', { level: 3 }).count(), 5);
    assert.equal(await guide(page).locator('tbody tr').count(), 64);
    // Captured from unchanged main on both engines before this fix; includes all
    // rows, headings, notes and special cases, even collapsed details content.
    const content = await guide(page).locator('h3,tbody tr,caption,p,summary,strong').allTextContents();
    evidence.contentHash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    assert.equal(evidence.contentHash, '094c51d315b7f44787e91bdb34fbe84870821eed75389664610c8c05e3b7df50');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden');
    assert.ok(Math.abs(await anchorTop(page) - beforeAnchor) <= 1, `no background jump on open: ${JSON.stringify({ beforeAnchor, afterAnchor: await anchorTop(page), scroll: await page.evaluate(() => scrollY) })}`);

    const body = guide(page).locator('.overflow-y-auto');
    if (engine === 'chromium') {
      const box = await body.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 400);
    } else {
      // WebKit mobile does not support Playwright's wheel input.
      await body.focus(); await page.keyboard.press('PageDown');
    }
    await page.waitForFunction(() => document.querySelector('[role="dialog"] .overflow-y-auto').scrollTop > 0);
    assert.ok(Math.abs(await anchorTop(page) - beforeAnchor) <= 1, 'only modal content scrolls');
    await guide(page).locator('summary').focus();
    await body.evaluate(n => { n.scrollTop = n.scrollHeight; });
    const contentScroll = await body.evaluate(n => n.scrollTop);
    await page.evaluate(() => window.drlHarness.rerender());
    await page.waitForTimeout(100);
    assert.equal(await guide(page).locator('summary').evaluate(n => document.activeElement === n), true, 'parent rerender must preserve focused content');
    assert.equal(await body.evaluate(n => n.scrollTop), contentScroll);
    await guide(page).locator('summary').click();
    await body.evaluate(n => { n.scrollTop = n.scrollHeight; });
    assert.equal(await guide(page).locator('details').evaluate(n => n.open), true);
    assert.equal(await guide(page).locator('details p').last().evaluate(n => {
      const r = n.getBoundingClientRect(), s = n.closest('.overflow-y-auto').getBoundingClientRect();
      return r.top >= s.top && r.bottom <= s.bottom + 1;
    }), true, 'last special case remains readable');
    await visibleControls(page);
    await page.keyboard.press('Tab');
    assert.equal(await guide(page).getByRole('button', { name: 'Đóng phụ lục' }).evaluate(n => n === document.activeElement), true, 'Tab wraps to close');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await guide(page).locator('summary').evaluate(n => n === document.activeElement), true, 'Shift+Tab stays in modal');

    if (name === 'iphone-se') await page.screenshot({ path: `.cache/drl-task02/${engine}-after-portrait.png` });
    // Toolbar/keyboard-height and orientation approximations, not a real keyboard.
    for (const viewport of [{ width, height: 240 }, { width: height, height: width }, { width: 412, height: 740 }, { width, height }]) {
      await page.setViewportSize(viewport); await settleViewport(page); await visibleControls(page);
      if (name === 'iphone-se' && viewport.height === 240) await page.screenshot({ path: `.cache/drl-task02/${engine}-after-compact.png` });
    }
    // Simulate notch padding locally; actual safe-area hardware is not emulated.
    const insets = await page.addStyleTag({ content: '.overlay-root { padding-top: 44px !important; padding-bottom: 34px !important; }' });
    await page.setViewportSize({ width, height: height - 1 }); await settleViewport(page);
    evidence.insets = await visibleControls(page);
    await insets.evaluate(n => n.remove());
    await page.setViewportSize({ width, height }); await settleViewport(page);
    await page.mouse.click(1, 1); // Real backdrop dismissal, outside panel and safe-area padding.
    await guide(page).waitFor({ state: 'detached' });
    assert.equal(await trigger(page).evaluate(n => n === document.activeElement), true, `focus after backdrop: ${await page.evaluate(() => document.activeElement.outerHTML.slice(0, 250))}`);
    assert.equal(await page.evaluate(() => scrollY), beforeScroll);
    assert.deepEqual(await page.evaluate(() => [document.body.getAttribute('style'), document.documentElement.getAttribute('style')]), beforeStyles);

    for (const dismissal of ['button', 'escape', 'route']) {
      await trigger(page).click(); await chooseGuide(page); await guide(page).waitFor();
      if (engine === 'chromium') {
        await page.mouse.move(1, 1); await page.mouse.wheel(0, 500); await page.waitForTimeout(100);
      } else {
        await page.keyboard.press('PageDown'); await page.waitForTimeout(100);
      }
      assert.ok(Math.abs(await anchorTop(page) - beforeAnchor) <= 1, 'backdrop input cannot scroll background');
      if (dismissal === 'button') await guide(page).getByRole('button', { name: 'Đóng phụ lục' }).click();
      else if (dismissal === 'escape') await page.keyboard.press('Escape');
      else await page.evaluate(() => window.drlHarness.leave());
      await guide(page).waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY !== 'hidden' && document.body.style.position !== 'fixed'), true, 'cleanup releases shared lock');
      if (dismissal !== 'route') {
        assert.equal(await page.evaluate(() => scrollY), beforeScroll);
        assert.equal(await trigger(page).evaluate(n => n === document.activeElement), true);
      }
    }
    await page.evaluate(() => window.drlHarness.return()); await trigger(page).waitFor();
    assert.equal(await guide(page).count(), 0);
    assert.deepEqual(errors, [], 'no runtime or console errors');
    assert.deepEqual(warnings, [], 'no React/console warnings');
    evidence.errors = errors; evidence.warnings = warnings;
    await writeFile(`.cache/drl-task02/${engine}-${name}.json`, JSON.stringify(evidence, null, 2));
  } finally { await context.close(); }
});
