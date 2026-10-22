import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { build } from 'esbuild';

test('actual import preview at 1280, 1024, 768 and 390px: official lock, independent edits, visible confirm and exact persistence', { timeout: 120000 }, async () => {
  const executablePath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find(existsSync);
  assert.ok(executablePath, 'Chrome is required for browser acceptance');
  // The fixture serves built styles below; esbuild only needs the JavaScript bundle.
  const bundled = await build({ loader: { '.css': 'empty' }, entryPoints: ['tests/browser/schedule-import-entry.tsx'], bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic' });
  const cssFiles = readdirSync('dist/assets').filter(name => name.endsWith('.css'));
  assert.ok(cssFiles.some(name => name.startsWith('index-')), 'Run npm run build before browser acceptance');
  const css = cssFiles.map(name => readFileSync(`dist/assets/${name}`, 'utf8')).join('\n');
  const catalog = JSON.parse(readFileSync('tests/fixtures/hub-schedule-catalog.json', 'utf8'));
  const server = createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundled.outputFiles[0].text); }
    else if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="vi"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ executablePath, headless: true });
  mkdirSync('.cache/schedule-browser', { recursive: true });
  try {
    for (const width of [1280, 1024, 768, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      const errors: string[] = [], writes: any[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/courses?**', route => route.fulfill({ json: { data: catalog, total: catalog.length, hasMore: false } }));
      await page.route('**/api/user/v1/schedules', route => route.fulfill({ json: { success: true, data: [], revisions: { HK1_2026_2027: 3 } } }));
      await page.route('**/api/user/v1/schedules/replace', route => {
        assert.equal(route.request().method(), 'PUT');
        assert.equal(route.request().headers()['if-match'], '"3"');
        writes.push(route.request().postDataJSON());
        return route.fulfill({ json: { success: true, changed: true, revision: 4, count: 11 } });
      });
      await page.goto(`http://127.0.0.1:${port}/`);
      const confirm = page.getByRole('button', { name: 'Xác nhận nhập', exact: true });
      await confirm.waitFor({ timeout: 15000 }).catch(async error => {
        await page.screenshot({ path: `.cache/schedule-browser/import-failure-${width}.png` });
        throw new Error(`Import fixture failed to render: ${JSON.stringify(errors)}`, { cause: error });
      });
      assert.equal(await confirm.isDisabled(), true, 'PDF has two genuinely missing instructors');
      const official = page.getByRole('group', { name: 'Học phần LAW349_2611_1_D01', exact: true });
      assert.equal(await official.getByText('Dữ liệu hệ thống', { exact: true }).count(), 1);
      assert.equal(await official.locator('input,select').count(), 0);
      const discrete = page.getByRole('group', { name: 'Học phần AMA308_261_1_D01', exact: true });
      assert.equal(await discrete.getByLabel('Ca học buổi 1', { exact: true }).filter({ visible: true }).inputValue(), 'C');
      assert.equal(await discrete.getByLabel('Giờ bắt đầu buổi 1', { exact: true }).filter({ visible: true }).inputValue(), '13:00');
      assert.equal(await discrete.getByRole('alert').count(), 0, 'same-week Monday/Wednesday is valid');
      await discrete.getByLabel('Phòng học buổi 1', { exact: true }).filter({ visible: true }).fill('A399');
      const programming = page.getByRole('group', { name: 'Học phần ITE713_LT_261_1_D01', exact: true });
      assert.equal(await programming.getByLabel('Phòng học buổi 1', { exact: true }).filter({ visible: true }).inputValue(), 'B1.301');
      await page.getByLabel('Giảng viên GYM301_2611_1_D07', { exact: true }).fill('Giảng viên GDTC kiểm thử');
      await page.getByLabel('Giảng viên ENP706_261_1_D05', { exact: true }).fill('Giảng viên Anh kiểm thử');
      assert.equal(await confirm.isEnabled(), true);
      assert.equal(writes.length, 0, 'reading and editing preview must not persist');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[role="group"]')].every(el => el.scrollWidth <= el.clientWidth + 1)), true, 'course rows must not overflow');
      const box = await confirm.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width && box.y + box.height <= 900);
      await discrete.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.cache/schedule-browser/preview-${width}.png` });
      await confirm.click();
      await page.getByRole('status').filter({ hasText: 'Đã lưu 11 môn' }).waitFor({ state: 'attached' });
      assert.equal(writes.length, 1);
      assert.deepEqual(writes[0].rows[3], { systemCourseId: catalog[0].id });
      assert.equal(writes[0].rows[0].course.scheduleSessions[0].room, 'A399');
      assert.equal(writes[0].rows[1].course.scheduleSessions[0].room, 'B1.301');
      assert.equal(writes[0].rows[0].course.scheduleSessions.length, 6);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
