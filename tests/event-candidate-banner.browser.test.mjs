import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = `${server.resolvedUrls.local[0]}tests/event-candidate-banner-harness.html?id=222`;
test.after(async () => { await browser.close(); await server.close(); });

test('candidate banner reaches approval draft and staff can choose an R2 replacement or clear it', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  try {
    await page.route('**/api/public/v1/event-banners/**', (route) => route.fulfill({
      status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==', 'base64'),
    }));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    const banner = page.getByAltText('Xem trước banner sự kiện');
    await banner.waitFor();
    assert.equal(await page.getByText('Đã lưu ảnh vào R2').count(), 1);
    assert.match(await banner.getAttribute('src'), /^\/api\/public\/v1\/event-banners\//);
    assert.equal(await page.getByLabel('Chọn banner sự kiện').count(), 1);
    await page.getByLabel('Chọn banner sự kiện').setInputFiles({
      name: 'banner.png', mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==', 'base64'),
    });
    await page.waitForFunction(() => document.querySelector('img[alt="Xem trước banner sự kiện"]')?.getAttribute('src')?.startsWith('blob:'));
    await page.getByRole('button', { name: 'Bỏ ảnh' }).click();
    assert.equal(await page.getByText('Chưa có ảnh hợp lệ').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('unavailable candidate banner shows a safe placeholder instead of a broken image', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.route('**/api/public/v1/event-banners/**', (route) => route.fulfill({ status: 403, body: '' }));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.getByText('Chưa có ảnh hợp lệ').waitFor();
    assert.equal(await page.getByLabel('Chọn banner sự kiện').count(), 1);
  } finally { await page.close(); }
});
