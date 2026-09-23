import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = `${server.resolvedUrls.local[0]}tests/admin-event-management-harness.html`;
test.after(async () => { await browser.close(); await server.close(); });

test('admin and auditor get management layout, accessible actions and role-safe delete', async () => {
  for (const role of ['admin', 'auditor']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    try {
      await page.goto(`${base}?role=${role}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.getByRole('heading', { name: 'Quản lý sự kiện' }).waitFor();
      assert.equal(await page.getByRole('table').count(), 1);
      assert.equal(await page.getByRole('columnheader', { name: 'Thao tác' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Thêm sự kiện' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Sửa sự kiện #15', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Tạm đóng đăng ký sự kiện #15', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Ẩn/Xóa sự kiện #15', exact: true }).count(), role === 'admin' ? 1 : 0);
      assert.equal(await page.getByRole('region', { name: 'Bộ lọc sự kiện' }).count(), 1);
    } finally { await page.close(); }
  }
});

test('tabs, search and pagination reset after filter changes', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('heading', { name: 'Quản lý sự kiện' }).waitFor();
    await page.getByRole('button', { name: 'Trang 2' }).click();
    assert.equal(await page.getByRole('button', { name: 'Trang 2' }).getAttribute('aria-current'), 'page');
    await page.getByPlaceholder('Tên sự kiện, BTC, loại hình...').fill('Sự kiện 1');
    assert.equal(await page.getByRole('button', { name: 'Trang 1' }).getAttribute('aria-current'), 'page');
    assert.match(await page.getByRole('region', { name: 'Danh sách sự kiện' }).innerText(), /Hiển thị 1–7 của 7 sự kiện/);
    await page.getByRole('button', { name: 'Đã đóng', exact: true }).click();
    assert.equal(await page.getByText('Không có sự kiện phù hợp.').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Đã đóng', exact: true }).getAttribute('aria-current'), 'page');
  } finally { await page.close(); }
});

test('loading and empty states remain clear on a narrow viewport', async () => {
  for (const suffix of ['?count=0', '?loading=1', '?error=1']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    try {
      await page.goto(`${base}${suffix}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.getByRole('heading', { name: 'Quản lý sự kiện' }).waitFor();
      assert.equal(await page.getByRole('region', { name: 'Danh sách sự kiện' }).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } finally { await page.close(); }
  }
});
