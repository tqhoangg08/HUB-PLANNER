import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = `${server.resolvedUrls.local[0]}tests/support-staff-role-harness.html`;
test.after(async () => { await browser.close(); await server.close(); });

const ticket = {
  id: '11111111-1111-4111-8111-111111111111', user_id: '22222222-2222-4222-8222-222222222222',
  assigned_to: '33333333-3333-4333-8333-333333333333', subject: 'Ticket fixture',
  category: 'other', priority: 'normal', status: 'pending', last_message_at: '2026-10-08T00:00:00.000Z',
  created_at: '2026-10-08T00:00:00.000Z', updated_at: '2026-10-08T00:00:00.000Z',
};

const openRole = async (role) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const actions = [];
  await page.route('**/api/private/v1/support', async (route) => {
    const action = route.request().postDataJSON().action;
    actions.push(action);
    if (action === 'get-ticket') return route.fulfill({ json: { ticket } });
    if (action === 'messages') return route.fulfill({ json: { data: [] } });
    if (action === 'staff') return route.fulfill({ json: { data: [] } });
    if (action === 'create-message') return route.fulfill({ json: { message: {
      id: '44444444-4444-4444-8444-444444444444', ticket_id: ticket.id,
      sender_id: ticket.assigned_to, sender_role: role === 'auditor' ? 'support' : 'admin', body: 'Test reply',
      is_internal_note: false, created_at: '2026-10-08T00:00:01.000Z',
    } } });
    return route.fulfill({ status: 400, json: { error: 'Unexpected test action' } });
  });
  await page.goto(`${base}?role=${role}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Ticket fixture').waitFor();
  return { page, actions };
};

test('auditor can reply and attach files but sees no management or internal-note controls', async () => {
  const { page, actions } = await openRole('auditor');
  try {
    await page.getByRole('button', { name: 'Đính kèm file' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Bật ghi chú nội bộ' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Đánh dấu đã xử lý xong' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Mở thao tác ticket' }).count(), 0);
    const composer = page.getByPlaceholder('Nhập phản hồi hoặc dán ảnh vào đây...');
    await composer.fill('Test reply');
    await page.locator('form.support-chat-input button').last().click();
    await page.getByText('Test reply').waitFor();
    assert.equal(actions.filter((action) => action === 'create-message').length, 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('auditor can preview image paste, image drop and PDF selection before sending', async () => {
  const { page } = await openRole('auditor');
  try {
    await page.getByPlaceholder('Nhập phản hồi hoặc dán ảnh vào đây...').evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'paste.png', { type: 'image/png' }));
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
    });
    await page.getByText('pasted-image-', { exact: false }).waitFor();
    await page.locator('section.support-chat').evaluate((element) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'drop.png', { type: 'image/png' }));
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
    await page.getByText('drop.png').waitFor();
    await page.locator('input[type="file"]').setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await page.getByText('proof.pdf').waitFor();
    assert.equal(await page.locator('form.support-chat-input img').count(), 2);
  } finally { await page.close(); }
});

test('admin retains reply, attachment and assigned-ticket management controls', async () => {
  const { page, actions } = await openRole('admin');
  try {
    await page.getByRole('button', { name: 'Đính kèm file' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Đánh dấu đã xử lý xong' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Bật ghi chú nội bộ' }).count(), 1);
    await page.getByPlaceholder('Nhập phản hồi hoặc dán ảnh vào đây...').fill('Test reply');
    await page.locator('form.support-chat-input button').last().click();
    await page.getByText('Test reply').waitFor();
    assert.equal(actions.filter((action) => action === 'create-message').length, 1);
  } finally { await page.close(); }
});
