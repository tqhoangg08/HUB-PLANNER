import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright-core';

const engine = process.env.CONTRIBUTION_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const server = await createServer({ configFile: false, envDir: false, plugins: [react()],
  cacheDir: 'node_modules/.vite-contribution-mobile', optimizeDeps: { entries: ['tests/event-contribution-harness.html'] },
  server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await (engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ headless: true,
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }));
test.after(async () => { await browser.close(); await server.close(); });
await mkdir('.cache/task03', { recursive: true });

const modal = page => page.getByRole('dialog', { name: /Đóng góp Sự kiện/ });
const trigger = page => page.getByRole('button', { name: 'Gửi đóng góp', exact: true }).first();
const anchor = page => page.locator('#page-anchor').evaluate(n => n.getBoundingClientRect().top);
const times = { deadline: '2026-11-28', deadline_time: '23:45', event_date: '2026-11-20', event_time: '08:30' };
async function values(form) {
  const result = {};
  for (const key of Object.keys(times)) result[key] = await form.locator(`input[id$="-${key}"]`).inputValue();
  return result;
}
async function geometry(page) {
  const result = await modal(page).evaluate(panel => {
    const header = panel.querySelector('header'), close = header.querySelector('[aria-label="Đóng đóng góp sự kiện"]');
    const h = header.getBoundingClientRect(), c = close.getBoundingClientRect(), s = panel.querySelector('[data-contribution-scroll]');
    const style = getComputedStyle(close);
    return { headerTop: h.top, headerBottom: h.bottom, close: { width: c.width, height: c.height,
      minWidth: parseFloat(style.minWidth), minHeight: parseFloat(style.minHeight) },
      height: innerHeight, contentHeight: s.clientHeight, overflow: panel.scrollWidth > panel.clientWidth + 1 || s.scrollWidth > s.clientWidth + 1,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      hit: close.contains(document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2)) };
  });
  assert.ok(result.headerTop >= 0 && result.headerBottom <= result.height + 1, JSON.stringify(result));
  assert.ok(result.close.minWidth >= 44 && result.close.minHeight >= 44, JSON.stringify(result));
  // WebKit subtracts fractional DOMRect coordinates in float32 (44px can read
  // as 43.999992px). Keep the CSS minimum strict and allow only numeric noise.
  assert.ok(result.close.width >= 44 - 0.0001 && result.close.height >= 44 - 0.0001, JSON.stringify(result));
  assert.ok(result.contentHeight >= 40, JSON.stringify(result));
  assert.equal(result.overflow, false, JSON.stringify(result));
  assert.equal(result.documentOverflow, false, JSON.stringify(result));
  assert.equal(result.hit, true, JSON.stringify(result));
  return result;
}
async function resized(page, viewport) {
  await page.setViewportSize(viewport);
  await page.waitForFunction(() => Math.abs(document.querySelector('[data-overlay-root]').getBoundingClientRect().height - visualViewport.height) < 2);
  await geometry(page);
}

for (const [name, width, height, mobile] of [
  ['iphone-se', 375, 667, true], ['iphone-13', 390, 844, true], ['small-360', 360, 640, true],
  ['board-iphone-se', 375, 667, false], ['desktop', 1440, 900, false],
]) test(`${engine} ${name}: contribution viewport, native values, focus and draft lifecycle`, { timeout: 180_000 }, async () => {
  const touch = width < 600;
  const context = await browser.newContext({ ...(touch ? devices[name === 'small-360' ? 'Pixel 7' : 'iPhone 13'] : {}), viewport: { width, height } });
  const calls = [], errors = [], warnings = [];
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === new URL(base).origin && !['fetch', 'xhr'].includes(request.resourceType())) return route.continue();
    calls.push({ path: url.pathname, method: request.method() });
    // Typing triggers the existing read-only prediction POST. Stub it locally;
    // never call a provider or permit contribution/auth/storage writes.
    if (request.method() === 'POST' && url.pathname === '/api/private/v1/event-drl/predict') {
      return route.fulfill({ json: { success: true, prediction: null } });
    }
    if (request.method() !== 'GET') return route.abort('blockedbyclient');
    return route.fulfill({ json: url.pathname.includes('/auth/') ? null : { success: true, data: [], count: 0, total: 0,
      organizers: ['Fixture organizer'], rules: [{ rule_id: 'III_FIXTURE', section: 'III', content: 'Fixture criterion', points: 5 }] } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
  const evidence = { engine, name, width, height, view: mobile ? 'MobileEvents' : 'EventsBoard' };
  try {
    await page.goto(`${base}tests/event-contribution-harness.html?acceptance${mobile ? '&mobile' : ''}${touch ? '&touch' : ''}`, { waitUntil: 'networkidle', timeout: 120_000 });
    await trigger(page).waitFor();
    assert.equal(await page.locator('.event-contribution-form').count(), 0);
    await page.evaluate(() => window.contributionHarness.rerender());
    assert.equal(await modal(page).count(), 0);
    await trigger(page).evaluate(n => n.scrollIntoView({ block: 'center' }));
    const beforeScroll = await page.evaluate(() => scrollY), beforeAnchor = await anchor(page);
    assert.ok(beforeScroll > 500);
    const box = await trigger(page).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await modal(page).waitFor();
    await page.waitForTimeout(550); // Existing entrance animations must finish before hit testing.
    assert.equal(await modal(page).count(), 1);
    evidence.initial = await geometry(page);
    const form = modal(page).locator('form'), scroller = modal(page).locator('[data-contribution-scroll]');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden');
    assert.ok(Math.abs(await anchor(page) - beforeAnchor) <= 1, 'opening preserves background geometry');
    const title = form.getByPlaceholder(/^VD:/);
    await title.fill('Local fixture draft');
    const link = mobile ? form.locator('input[type=text]').last() : form.getByPlaceholder('https://...', { exact: true });
    await link.fill('https://example.invalid/fixture');
    for (const [key, value] of Object.entries(times)) {
      const input = form.locator(`input[id$="-${key}"]`);
      assert.equal(await input.getAttribute('type'), key.endsWith('_time') || key === 'event_time' ? 'time' : 'date');
      await input.fill(value); await input.click(); await input.press('Escape');
      assert.equal(await modal(page).count(), 1, 'Escape in a native date/time control must not close the contribution');
      assert.equal(await input.inputValue(), value);
      await title.focus(); // Explicitly leave the native control before testing modal Escape later.
    }
    await page.evaluate(() => window.contributionHarness.rerender());
    assert.deepEqual(await values(form), times);
    const category = form.locator('select').filter({ has: page.locator('option[value="Minigame"]') });
    await category.selectOption('Minigame');
    assert.equal(await form.getByLabel('Ngày bắt đầu', { exact: true }).inputValue(), times.event_date);
    assert.equal(await form.getByLabel('Giờ kết thúc', { exact: true }).inputValue(), times.deadline_time);
    const toggle = form.locator('label').filter({ has: page.locator('input[type=checkbox]') });
    await toggle.click();
    assert.equal(await form.locator('input[id$="-deadline"]').isDisabled(), true);
    assert.equal(await form.locator('input[id$="-deadline_time"]').isDisabled(), true);
    assert.equal(await form.locator('input[id$="-event_time"]').isDisabled(), false);
    await toggle.click(); await category.selectOption('Hoạt động phong trào');
    assert.deepEqual(await values(form), times);
    evidence.fonts = await form.locator('input:not([type=checkbox]):not([type=hidden]),select,textarea').evaluateAll(nodes => [...new Set(nodes.map(n => getComputedStyle(n).fontSize))]);
    assert.deepEqual(evidence.fonts, [touch ? '16px' : '13px']);
    await form.locator('input[id$="-event_time"]').focus();
    for (const viewport of [{ width, height: 240 }, { width: height, height: width }, { width, height }]) {
      await resized(page, viewport);
      await page.waitForFunction(() => {
        const input = document.activeElement;
        const r = input.getBoundingClientRect(), h = input.closest('[role=dialog]').querySelector('header').getBoundingClientRect();
        return r.top >= h.bottom - 1 && r.bottom <= visualViewport.offsetTop + visualViewport.height + 1;
      });
      assert.deepEqual(await values(form), times);
      assert.equal(await title.inputValue(), 'Local fixture draft');
      if (name === 'iphone-se' && viewport.height === 240) await page.screenshot({ path: `.cache/task03/${engine}-after-compact.png` });
    }
    if (engine === 'chromium') {
      const b = await scroller.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, 500);
    } else { await scroller.focus(); await page.keyboard.press('PageDown'); }
    await page.waitForFunction(() => document.querySelector('[data-contribution-scroll]').scrollTop > 0);
    await scroller.evaluate(n => { n.scrollTop = n.scrollHeight; });
    const submit = form.getByRole('button', { name: 'Gửi đóng góp', exact: true });
    assert.equal(await submit.evaluate(n => {
      const r = n.getBoundingClientRect(), s = n.closest('[data-contribution-scroll]').getBoundingClientRect(); return r.top >= s.top && r.bottom <= s.bottom + 1;
    }), true, 'submit reachable at end of form');
    assert.equal(await submit.isDisabled(), true, 'Turnstile gate remains active in the no-key local fixture');
    await geometry(page);
    assert.ok(Math.abs(await anchor(page) - beforeAnchor) <= 1, 'form scroll does not move background');
    if (name === 'iphone-se') await page.screenshot({ path: `.cache/task03/${engine}-after-bottom.png` });

    if (mobile) {
      await page.waitForFunction(expected => {
        const draft = JSON.parse(localStorage.getItem('event_form_draft') || 'null');
        return draft?.title === 'Local fixture draft' && Object.entries(expected).every(([key, value]) => draft[key] === value);
      }, times);
      const draft = await page.evaluate(() => localStorage.getItem('event_form_draft'));
      await modal(page).getByRole('button', { name: 'Xóa bản nháp đóng góp' }).click();
      const confirm = page.getByRole('dialog', { name: 'Xác nhận thao tác' }); await confirm.waitFor();
      await page.keyboard.press('Escape'); await confirm.waitFor({ state: 'detached' });
      await page.locator('.swal2-container').waitFor({ state: 'detached' });
      assert.equal(await modal(page).count(), 1, 'nested Escape only dismisses confirmation');
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden');
      assert.equal(await page.evaluate(() => localStorage.getItem('event_form_draft')), draft);
      assert.deepEqual(await values(form), times);
    }
    await modal(page).getByRole('button', { name: 'Đóng đóng góp sự kiện' }).click();
    await modal(page).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => scrollY), beforeScroll);
    assert.equal(await trigger(page).evaluate(n => n === document.activeElement), true);
    await trigger(page).click(); await modal(page).waitFor(); await page.waitForTimeout(550);
    if (mobile) {
      assert.deepEqual(await values(form), times); assert.equal(await title.inputValue(), 'Local fixture draft');
      assert.equal(await link.inputValue(), 'https://example.invalid/fixture');
      await modal(page).getByRole('button', { name: 'Xóa bản nháp đóng góp' }).click();
      await page.getByRole('button', { name: 'Hủy', exact: true }).click();
      await page.locator('.swal2-container').waitFor({ state: 'detached' });
      assert.deepEqual(await values(form), times);
      await modal(page).getByRole('button', { name: 'Xóa bản nháp đóng góp' }).click();
      await page.getByRole('button', { name: 'Xác nhận', exact: true }).click();
      await page.locator('.swal2-container').waitFor({ state: 'detached' });
      assert.equal(await title.inputValue(), '');
      assert.deepEqual(await values(form), { deadline: '', deadline_time: '', event_date: '', event_time: '' });
    }
    await modal(page).getByRole('button', { name: 'Đóng đóng góp sự kiện' }).focus();
    await page.keyboard.press('Escape'); await modal(page).waitFor({ state: 'detached' });
    await trigger(page).click(); await modal(page).waitFor(); await page.waitForTimeout(550);
    const root = page.locator('[data-overlay-root]').filter({ has: modal(page) });
    await root.click({ position: { x: 1, y: 1 } }); await modal(page).waitFor({ state: 'detached' });
    await trigger(page).click(); await modal(page).waitFor();
    await page.evaluate(() => window.contributionHarness.leave()); await page.locator('#away').waitFor();
    await modal(page).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflowY !== 'hidden' && document.body.style.position !== 'fixed'), true);
    assert.ok(calls.every(call => call.method === 'GET' || (call.method === 'POST' && call.path === '/api/private/v1/event-drl/predict')), JSON.stringify(calls));
    assert.deepEqual(errors, []); assert.deepEqual(warnings, []);
    evidence.dateTime = 'native type/value/focus/Escape only; platform picker UI NOT_VERIFIED';
    evidence.draft = mobile ? 'restore/cancel/clear PASS after existing 500ms autosave' : 'no draft feature';
    evidence.errors = errors; evidence.warnings = warnings; evidence.apiMethods = [...new Set(calls.map(call => call.method))];
    await writeFile(`.cache/task03/${engine}-${name}.json`, JSON.stringify(evidence, null, 2));
  } finally { await context.close(); }
});
