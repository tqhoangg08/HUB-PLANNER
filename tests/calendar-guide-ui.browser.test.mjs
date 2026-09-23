import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const baseUrl = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: chromePath, headless: true });

test.after(async () => {
  await browser.close();
  await server.close();
});

const openHarness = async ({ userAgent, width = 390, share = 'unsupported' } = {}) => {
  const context = await browser.newContext({ viewport: { width, height: 740 }, userAgent });
  await context.addInitScript((shareMode) => {
    window.__downloadCount = 0;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { window.__downloadCount += 1; return; }
      return originalClick.call(this);
    };
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => shareMode !== 'unsupported' });
    Object.defineProperty(navigator, 'share', { configurable: true, value: shareMode === 'unsupported' ? undefined : async () => {
      if (shareMode === 'cancel') throw { name: 'AbortError' };
    } });
  }, share);
  const page = await context.newPage();
  await page.goto(`${baseUrl}tests/calendar-guide-harness.html`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  return { context, page };
};

const assertDownloadGuide = async (settings, expectedTitle) => {
  const { context, page } = await openHarness(settings);
  try {
    await page.getByRole('button', { name: 'Thêm toàn bộ vào lịch' }).click();
    const guide = page.getByRole('dialog', { name: 'Hoàn tất thêm lịch' });
    await guide.waitFor();
    assert.match(await guide.innerText(), expectedTitle);
    assert.equal(await page.evaluate(() => window.__downloadCount), 1);
    assert.equal(await guide.evaluate(node => node.parentElement?.parentElement === document.body), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await page.locator('[aria-labelledby="calendar-export-title"]').count(), 0);
    await page.getByRole('button', { name: 'Unmount export' }).click();
    assert.equal(await guide.isVisible(), true);
    await page.reload();
    await guide.waitFor();
    assert.equal(await page.evaluate(() => window.__downloadCount), 0);
    await page.keyboard.press('Escape');
    assert.equal(await guide.count(), 0);
  } finally { await context.close(); }
};

test('iOS mobile download renders body-portal guide before export unmount and survives reload', async () => {
  await assertDownloadGuide({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' }, /iPhone\/iPad/);
});

test('Android mobile download renders guide and no horizontal overflow', async () => {
  await assertDownloadGuide({ userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' }, /Android/);
});

test('Windows desktop download still renders guide exactly once', async () => {
  await assertDownloadGuide({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36', width: 1280 }, /máy tính/);
});

test('successful share and cancelled share neither download nor show the guide', async () => {
  for (const share of ['success', 'cancel']) {
    const { context, page } = await openHarness({ share });
    try {
      await page.getByRole('button', { name: 'Thêm toàn bộ vào lịch' }).click();
      assert.equal(await page.evaluate(() => window.__downloadCount), 0);
      assert.equal(await page.getByRole('dialog', { name: 'Hoàn tất thêm lịch' }).count(), 0);
      assert.equal(await page.getByRole('alert').count(), 0);
    } finally { await context.close(); }
  }
});
