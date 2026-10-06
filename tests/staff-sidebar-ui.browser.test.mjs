import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = `${server.resolvedUrls.local[0]}tests/staff-sidebar-harness.html`;
test.after(async () => { await browser.close(); await server.close(); });

const open = async (role, width) => {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/v1/reports') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 2 }) });
    if (url.pathname === '/api/admin/v1/event-candidates') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{}] }) });
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  });
  await page.goto(`${base}?role=${role}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('.admin-sidebar-nav').waitFor();
  return page;
};

test('auditor desktop navigation has its own ordered groups, badges and no admin-only groups', async () => {
  const page = await open('auditor', 1440);
  try {
    const nav = page.locator('.admin-sidebar-nav');
    assert.deepEqual(await nav.locator('section > button').allTextContents(), ['HỌC TẬP', 'NỘI DUNG & SỰ KIỆN', 'KIỂM DUYỆT', 'HỖ TRỢ']);
    for (const label of ['Tổng quan', 'Thời khóa biểu', 'Sự kiện ĐRL', 'Duyệt sự kiện', 'Thông báo trường', 'Đồ thất lạc', 'Báo cáo & vi phạm', 'Ticket hỗ trợ']) assert.equal(await nav.locator(`a[aria-label="${label}"]`).count(), 1);
    for (const label of ['QUẢN LÝ', 'Sinh viên', 'DỮ LIỆU', 'HỆ THỐNG']) assert.equal(await nav.getByText(label, { exact: true }).count(), 0);
    await nav.locator('[aria-label="1 sự kiện chờ duyệt"]').waitFor({ state: 'attached' });
    await nav.locator('[aria-label="12 báo cáo chờ xử lý"]').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Thu gọn thanh điều hướng' }).click();
    assert.equal(await page.locator('.admin-sidebar').getAttribute('data-collapsed'), 'true');
    assert.equal(await nav.locator('a[aria-label="Duyệt sự kiện"]').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('auditor mobile drawer keeps the same IA without overflow', async () => {
  const page = await open('auditor', 390);
  try {
    await page.getByRole('button', { name: /Mở menu|Menu/ }).first().click();
    const nav = page.locator('.admin-sidebar-nav');
    assert.deepEqual(await nav.locator('section > button').allTextContents(), ['HỌC TẬP', 'NỘI DUNG & SỰ KIỆN', 'KIỂM DUYỆT', 'HỖ TRỢ']);
    assert.equal(await nav.getByText('QUẢN LÝ', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('admin desktop navigation retains its original groups', async () => {
  const page = await open('admin', 1440);
  try {
    const nav = page.locator('.admin-sidebar-nav');
    assert.deepEqual(await nav.locator('section > button').allTextContents(), ['QUẢN LÝ', 'NỘI DUNG & SỰ KIỆN', 'VẬN HÀNH', 'DỮ LIỆU', 'HỆ THỐNG']);
    for (const label of ['Sinh viên', 'Thời khóa biểu', 'Trung tâm dữ liệu', 'Tri thức AI', 'Tài khoản nội bộ', 'Nhật ký hoạt động']) assert.equal(await nav.locator(`a[aria-label="${label}"]`).count(), 1);
  } finally { await page.close(); }
});
