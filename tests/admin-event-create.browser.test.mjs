import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = `${server.resolvedUrls.local[0]}tests/admin-event-create-harness.html`;
test.after(async () => { await browser.close(); await server.close(); });

const open = async (role, width = 1440) => {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const calls = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/get-session') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ session: { id: 'fixture-session' }, user: { id: 'fixture-user', email: 'staff@example.org' } }) });
    if (path === '/api/private/v1/me') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId: 'fixture-user', email: 'staff@example.org', role }) });
    calls.push({ path, method: route.request().method(), body: path === '/api/admin/v1/events' ? route.request().postDataJSON() : null, key: route.request().headers()['idempotency-key'] });
    if (path === '/api/admin/v1/events') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 123 }], mirrorSynced: true }) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (role === 'user') await page.getByRole('alert').waitFor();
  else await page.getByRole('heading', { name: 'Thêm sự kiện' }).waitFor();
  return { page, calls };
};

test('admin full-page form and preview are read-only', async () => {
  const { page, calls } = await open('admin');
  try {
    for (const title of ['Thông tin cơ bản', 'Thời gian & đăng ký', 'Nội dung sự kiện', 'Banner sự kiện', 'Thiết lập nhanh', 'Thông tin bài đăng', 'Lưu ý']) {
      assert.equal(await page.getByRole('heading', { name: title }).count(), 1);
    }
    await page.getByRole('button', { name: 'Tạo sự kiện' }).click();
    assert.equal(await page.getByText('Vui lòng nhập tên sự kiện.').count(), 1);
    await page.getByRole('button', { name: 'Xem trước' }).click();
    assert.equal(await page.getByRole('dialog', { name: 'Xem trước sự kiện' }).count(), 1);
    assert.equal(calls.length, 0);
    await page.getByRole('button', { name: 'Đóng' }).click();
    assert.equal(calls.length, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('auditor mobile form disables deadline on close-on-full, creates once with current API', async () => {
  const { page, calls } = await open('auditor', 390);
  try {
    assert.equal(await page.getByRole('heading', { name: 'Thêm sự kiện' }).count(), 1);
    await page.getByLabel('Tên sự kiện').fill('Sự kiện kiểm thử');
    await page.getByLabel('Đơn vị tổ chức').fill('HUB');
    await page.getByLabel('Đóng khi đủ số lượng').check();
    assert.equal(await page.getByLabel('Ngày đóng đăng ký').isDisabled(), true);
    assert.equal(await page.getByLabel('Giờ đóng đăng ký').isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole('button', { name: 'Tạo sự kiện' }).click();
    await page.waitForURL('**/events');
    const createCalls = calls.filter(call => call.path === '/api/admin/v1/events' && call.method === 'POST');
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].body.close_on_full, true);
    assert.equal(createCalls[0].body.deadline, null);
    assert.equal(createCalls[0].body.status, 'pending');
    assert.match(createCalls[0].key, /^[0-9a-f-]{36}$/);
    assert.equal(Object.hasOwn(createCalls[0].body, 'creator'), false);
  } finally { await page.close(); }
});

test('student cannot use staff event editor', async () => {
  const { page, calls } = await open('user');
  try {
    assert.equal(await page.getByRole('alert').getByText('Bạn không có quyền tạo sự kiện.').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Tạo sự kiện' }).count(), 0);
    assert.equal(calls.length, 0);
  } finally { await page.close(); }
});
