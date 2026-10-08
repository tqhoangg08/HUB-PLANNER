import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const popupUrl = pathToFileURL(resolve('extension/hub-planner-event-collector/popup.html')).href;
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL9WQAAAABJRU5ErkJggg==', 'base64',
);
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true,
});
test.after(async () => browser.close());

const openPopup = async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 820 } });
  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        sync: { get: async () => ({}), set: async () => {}, remove: async () => {} },
        local: { get: async () => ({}), set: async () => {} },
      },
      tabs: { query: async () => [{ url: 'https://www.facebook.com/example' }] },
    };
  });
  await page.goto(popupUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#apiUrl')?.value ===
    'https://hotrosinhvienhub.id.vn/api/event-candidates');
  return page;
};

test('extension popup keeps consent unchecked and previews an authorized local image at 390px', async () => {
  const page = await openPopup(390);
  try {
    assert.equal(await page.locator('#imageConsent').isChecked(), false);
    assert.equal(await page.locator('#apiUrl').getAttribute('readonly'), '');
    await page.locator('#imageFile').setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: image });
    await page.locator('#imagePreview').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#imagePreview').getAttribute('alt'), 'Xem trước ảnh sự kiện');
    assert.equal(await page.locator('#imageConsent').isChecked(), false);
    await page.locator('#imageConsent').check();
    await page.locator('#imageRightsBasis').selectOption('permission');
    assert.equal(await page.locator('#imageConsent').isChecked(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('invalid local image never receives a misleading preview or stored-state message', async () => {
  const page = await openPopup(410);
  try {
    await page.locator('#imageFile').setInputFiles({ name: 'not-image.txt', mimeType: 'text/plain',
      buffer: Buffer.from('not an image') });
    await page.getByText('Chỉ nhận ảnh JPG, PNG hoặc WEBP hợp lệ.').waitFor();
    assert.equal(await page.locator('#imagePreview').isVisible(), false);
    assert.equal(await page.getByText('Đã lưu ảnh vào HUB Planner.').count(), 0);
  } finally { await page.close(); }
});
