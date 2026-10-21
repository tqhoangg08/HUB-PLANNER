import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright-core';

const evidence = process.env.TICKET_EVIDENCE_DIR;
if (evidence) fs.mkdirSync(evidence, { recursive: true });
const measurements = [];
const uploads = new Map();
// Measure actual bytes at a loopback-only sink. WebKit does not expose the
// Blob's request body through Playwright request.postDataBuffer().
function receiveUpload(request, response, next) {
  if (!request.url.startsWith('/__ticket-fixture-upload')) return next();
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    const key = new URL(request.url, 'http://fixture.invalid').searchParams.get('fixture');
    uploads.set(key, { method: request.method, contentType: request.headers['content-type'], body: Buffer.concat(chunks) });
    response.statusCode = 204; response.end();
  });
}
const server = await createServer({ configFile: false, envDir: false, plugins: [react(), {
  name: 'isolated-ticket-upload', configureServer(vite) { vite.middlewares.use(receiveUpload); },
}], cacheDir: 'node_modules/.vite-ticket-navigation', optimizeDeps: { entries: ['tests/ticket-navigation-harness.html'] }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browsers = {
  chromium: await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined) }),
  webkit: await webkit.launch({ headless: true }),
};
test.after(async () => {
  await Promise.all(Object.values(browsers).map(browser => browser.close()));
  await server.close();
  if (evidence) fs.writeFileSync(`${evidence}/measurements.json`, JSON.stringify(measurements, null, 2) + '\n');
});
const ticketId = '11111111-1111-4111-8111-111111111111';
const opener = page => page.getByRole('button', { name: 'Mở menu', exact: true });
const drawer = page => page.getByRole('dialog', { name: 'Menu điều hướng', exact: true });
const entry = page => drawer(page).getByRole('link', { name: 'Yêu cầu hỗ trợ', exact: true });
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const position = page => page.evaluate(() => ({ x: document.body.style.position === 'fixed' ? -parseFloat(document.body.style.left || '0') || 0 : scrollX, y: document.body.style.position === 'fixed' ? -parseFloat(document.body.style.top || '0') || 0 : scrollY }));
async function open(page) { await opener(page).click(); await drawer(page).waitFor(); await page.waitForTimeout(350); }
async function assertNoOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
async function fixture(engine, { width = 375, height = 667, role = 'student', path = '/dashboard', standalone = false } = {}) {
  const context = await browsers[engine].newContext({ ...devices['iPhone 13'], viewport: { width, height }, ...(width >= 768 ? { isMobile: false, hasTouch: false } : {}) });
  await context.addInitScript(({ role, path, standalone }) => {
    history.replaceState(null, '', `${path}?role=${role}`);
    localStorage.setItem('hub_ai_third_party_consent_fixture-user', 'accepted');
    if (standalone) Object.defineProperty(navigator, 'standalone', { value: true });
  }, { role, path, standalone });
  const actions = [], unexpected = [], errors = [], expectedAuthErrors = [];
  const uploadKey = crypto.randomUUID();
  const ticket = { id: ticketId, user_id: 'fixture-user', assigned_to: null, subject: 'Fixture ticket', category: 'other', priority: 'normal', status: 'open', created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z' };
  const messages = [];
  const attachment = { id: 'fixture-attachment', ticket_id: ticketId, file_name: 'proof.pdf', mime_type: 'application/pdf', size_bytes: 8, status: 'uploaded', storage_provider: 'cloudflare_r2' };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === new URL(base).origin && !['fetch', 'xhr'].includes(request.resourceType())) return route.continue();
    // All fetch/XHR and external resources are intercepted; nothing reaches production.
    if (url.pathname === '/__ticket-fixture-upload') {
      actions.push({ action: 'fixture-upload', method: request.method() });
      return route.continue();
    }
    if (url.pathname === '/api/private/v1/support') {
      const payload = request.postDataJSON(); actions.push(payload);
      if (role === 'guest') return route.fulfill({ status: 401, json: { error: 'Unauthenticated fixture' } });
      switch (payload.action) {
        case 'list': return route.fulfill({ json: { data: [ticket], total: 1 } });
        case 'get-ticket': return route.fulfill({ json: { ticket } });
        case 'messages': return route.fulfill({ json: { data: [...messages].reverse() } });
        case 'staff': return route.fulfill({ json: { data: [] } });
        case 'create-ticket': Object.assign(ticket, { subject: payload.subject, category: payload.category, priority: payload.priority }); return route.fulfill({ json: ticket });
        case 'create-message': {
          const message = { id: `message-${messages.length}`, ticket_id: ticketId, sender_id: 'fixture-user', sender_role: 'user', body: payload.body, is_internal_note: payload.is_internal_note, created_at: '2026-10-21T00:00:01Z' };
          messages.push(message); return route.fulfill({ json: { message } });
        }
        case 'attachment:create-upload-url': return route.fulfill({ json: { upload_url: `${base}__ticket-fixture-upload?fixture=${uploadKey}`, file_key: 'fixture-key' } });
        case 'attachment:complete-upload': return route.fulfill({ json: { attachment } });
        case 'attachment:link-message-attachments': return route.fulfill({ json: { attachments: [attachment] } });
        default: unexpected.push(payload); return route.fulfill({ status: 400, json: { error: 'Unexpected fixture action' } });
      }
    }
    if (!['GET', 'HEAD'].includes(request.method())) unexpected.push({ method: request.method(), path: url.pathname });
    return route.fulfill({ json: url.pathname.includes('/auth/') ? null : { success: true, data: [], total: 0, count: 0, candidates: [], notifications: [], unread_count: 0, sessions: [] } });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (!['warning', 'error'].includes(message.type())) return;
    // Expected HTTP 401 diagnostics are evidence of the Guest denial, not runtime failures.
    if (role === 'guest' && /Failed to load resource:.*401/.test(message.text())) expectedAuthErrors.push(message.text());
    else errors.push(message.text());
  });
  await page.goto(`${base}tests/ticket-navigation-harness.html`, { waitUntil: 'networkidle', timeout: 120_000 });
  await page.locator('#mode').waitFor({ state: 'attached' });
  return { context, page, actions, errors, unexpected, expectedAuthErrors, uploadKey };
}
function clean(f) { assert.deepEqual(f.errors, []); assert.deepEqual(f.unexpected, []); }
for (const engine of Object.keys(browsers)) {
  for (const [width, height] of [[375, 667], [390, 844], [430, 932], [360, 640]]) {
    test(`${engine}: ${width}x${height} single top-level Ticket entry, navigation, scroll/focus and AI`, async () => {
      const f = await fixture(engine, { width, height }), { page } = f;
      try {
        assert.equal(await page.getByRole('button', { name: 'Mở hỗ trợ', exact: true }).count(), 0);
        assert.equal(await drawer(page).count(), 0);
        await page.locator('.mobile-ai-button').click();
        const chat = page.getByPlaceholder('Hỏi AI tại đây...'); await chat.fill('Keep AI conversation draft');
        await page.locator('.mobile-ai-backdrop').click({ position: { x: 5, y: 5 } }); await settle(page);
        await page.evaluate(() => scrollTo(0, 700)); const before = await position(page);
        await open(page);
        assert.equal(await drawer(page).locator('a[href="/support"]').count(), 1);
        assert.equal(await entry(page).evaluate(element => !element.closest('[inert], [aria-hidden="true"]')), true);
        assert.equal(await entry(page).locator('svg.lucide-ticket').count(), 1);
        assert.equal(await drawer(page).getByRole('button', { name: 'Cẩm nang', exact: true }).getAttribute('aria-expanded'), 'false');
        await entry(page).scrollIntoViewIfNeeded();
        const target = await entry(page).boundingBox(); assert.ok(target.height >= 44 && target.width >= 44, JSON.stringify(target));
        assert.equal(await entry(page).evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true);
        if (engine === 'chromium') { await page.mouse.move(width - 2, height / 2); await page.mouse.wheel(0, 500); }
        else assert.equal(await page.locator('.mobile-sidebar-backdrop').evaluate(e => !e.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 500 }))), true);
        assert.deepEqual(await position(page), before);
        await assertNoOverflow(page);
        if (evidence && width === 375) await page.screenshot({ path: `${evidence}/${engine}-after-sidebar.png`, scale: 'css' });
        await page.keyboard.press('Escape'); await drawer(page).waitFor({ state: 'detached' }); await settle(page);
        assert.deepEqual(await position(page), before);
        assert.equal(await opener(page).evaluate(e => e === document.activeElement), true);
        await page.locator('.mobile-ai-button').click(); assert.equal(await chat.inputValue(), 'Keep AI conversation draft');
        await page.locator('.mobile-ai-backdrop').click({ position: { x: 5, y: 5 } }); await settle(page);
        await open(page); await entry(page).click(); await drawer(page).waitFor({ state: 'detached' });
        await page.getByRole('heading', { name: 'Ticket của tôi', exact: true }).waitFor();
        assert.equal(new URL(page.url()).pathname, '/support');
        await page.getByRole('link', { name: /Fixture ticket/ }).waitFor();
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
        await open(page); assert.equal(await entry(page).getAttribute('aria-current'), 'page');
        await page.keyboard.press('Escape'); await settle(page);
        if (evidence && width === 375) await page.screenshot({ path: `${evidence}/${engine}-after-list.png`, scale: 'css' });
        await page.getByRole('link', { name: 'Tạo ticket mới', exact: true }).click();
        await page.getByRole('heading', { name: 'Tạo yêu cầu hỗ trợ', exact: true }).waitFor();
        assert.equal(new URL(page.url()).pathname, '/support/new');
        await open(page); assert.equal(await entry(page).getAttribute('aria-current'), 'page');
        await page.keyboard.press('Escape'); await settle(page);
        await assertNoOverflow(page); clean(f);
        assert.equal(f.actions.some(a => ['create-ticket', 'create-message', 'fixture-upload'].includes(a.action)), false);
        measurements.push({ engine, width, height, target, navigation: '/support -> /support/new', scrollRestored: before, errors: f.errors });
      } finally { await f.context.close(); }
    });
  }
  test(`${engine}: real create/detail/reply/attachment contracts and deep link`, async () => {
    const f = await fixture(engine, { path: '/support/new' }), { page } = f;
    try {
      await page.getByLabel('Tiêu đề', { exact: true }).fill('  Navigation contract fixture  ');
      await page.getByRole('combobox', { name: /^Loại vấn đề/ }).selectOption('events');
      await page.getByRole('combobox', { name: /^Mức ưu tiên/ }).selectOption('high');
      await page.getByLabel('Mô tả vấn đề', { exact: true }).fill('Fixture creation only');
      await page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
      await page.getByText('Navigation contract fixture', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, `/support/${ticketId}`);
      assert.deepEqual(f.actions.find(a => a.action === 'create-ticket'), { action: 'create-ticket', subject: 'Navigation contract fixture', category: 'events', priority: 'high', message: 'Fixture creation only' });
      const reply = page.getByPlaceholder('Nhập phản hồi hoặc dán ảnh vào đây...');
      await reply.fill('Fixture reply with attachment');
      await page.locator('input[type="file"]').setInputFiles({ name: 'proof.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
      await page.getByText('proof.pdf', { exact: true }).waitFor();
      await page.locator('form.support-chat-input button').last().click();
      await page.locator('section.support-chat p').filter({ hasText: /^Fixture reply with attachment$/ }).waitFor();
      assert.equal(await reply.inputValue(), '');
      assert.deepEqual(f.actions.find(a => a.action === 'create-message'), { action: 'create-message', ticket_id: ticketId, body: 'Fixture reply with attachment', is_internal_note: false, allow_empty_body: true, metadata: {} });
      assert.deepEqual(f.actions.filter(a => a.action.startsWith('attachment:') || a.action === 'fixture-upload').map(a => a.action), ['attachment:create-upload-url', 'fixture-upload', 'attachment:complete-upload', 'attachment:link-message-attachments']);
      assert.deepEqual(f.actions.find(a => a.action === 'fixture-upload'), { action: 'fixture-upload', method: 'PUT' });
      const received = uploads.get(f.uploadKey);
      assert.equal(received.method, 'PUT');
      assert.equal(received.contentType, 'application/pdf');
      assert.equal(received.body.length, 8);
      assert.deepEqual(received.body, Buffer.from('%PDF-1.4'));
      assert.deepEqual(f.actions.find(a => a.action === 'attachment:link-message-attachments'), { action: 'attachment:link-message-attachments', ticket_id: ticketId, message_id: 'message-0', attachment_ids: ['fixture-attachment'] });
      await assertNoOverflow(page); clean(f);
    } finally { await f.context.close(); }
    const deep = await fixture(engine, { path: `/support/${ticketId}` });
    try {
      await deep.page.getByText('Fixture ticket', { exact: true }).waitFor();
      await open(deep.page); assert.equal(await entry(deep.page).getAttribute('aria-current'), 'page');
      await deep.page.keyboard.press('Escape'); clean(deep);
    } finally { await deep.context.close(); }
  });
  test(`${engine}: Guest receives login guidance; fixture rejects unauthorized creation`, async () => {
    const f = await fixture(engine, { role: 'guest' }), { page } = f;
    try {
      assert.equal(await page.getByRole('button', { name: 'Mở hỗ trợ', exact: true }).count(), 0);
      await open(page); await entry(page).click();
      await page.getByText('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', { exact: true }).waitFor();
      await page.getByRole('link', { name: 'Tạo ticket mới', exact: true }).click();
      await page.getByLabel('Tiêu đề', { exact: true }).fill('Unauthorized fixture');
      await page.getByLabel('Mô tả vấn đề', { exact: true }).fill('Must be rejected');
      await page.getByRole('button', { name: 'Gửi yêu cầu', exact: true }).click();
      await page.getByText('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', { exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/support/new');
      assert.equal(f.actions.filter(a => a.action === 'create-ticket').length, 1); clean(f);
    } finally { await f.context.close(); }
  });
  for (const role of ['admin', 'auditor']) test(`${engine}: ${role} preserves /admin/support navigation`, async () => {
    const f = await fixture(engine, { role }), { page } = f;
    try {
      await open(page);
      const groups = drawer(page).locator('.admin-sidebar-nav section > button');
      for (const group of await groups.all()) if (await group.getAttribute('aria-expanded') === 'false') await group.click();
      const link = drawer(page).getByRole('link', { name: 'Ticket hỗ trợ', exact: true });
      assert.equal(await link.getAttribute('href'), '/admin/support'); await link.click();
      await drawer(page).waitFor({ state: 'detached' });
      await page.getByRole('heading', { name: 'Hỗ trợ Sinh viên', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/admin/support');
      await page.getByRole('link', { name: /Fixture ticket/ }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Mở hỗ trợ', exact: true }).count(), 0);
      clean(f);
    } finally { await f.context.close(); }
  });
  test(`${engine}: desktop retains navigation; PWA retains its real floating Ticket UI`, async () => {
    const desktop = await fixture(engine, { width: 1440, height: 900 });
    try {
      const { page } = desktop;
      assert.equal(await page.getByRole('button', { name: 'Mở hỗ trợ', exact: true }).count(), 0);
      await page.getByRole('button', { name: /Cẩm nang/ }).hover();
      await page.getByRole('link', { name: 'Hỗ trợ', exact: true }).click();
      await page.getByRole('heading', { name: 'Ticket của tôi', exact: true }).waitFor();
      await assertNoOverflow(page); clean(desktop);
    } finally { await desktop.context.close(); }
    const pwa = await fixture(engine, { standalone: true, width: 390, height: 844 });
    try {
      const { page } = pwa;
      assert.equal(await page.locator('#mode').textContent(), 'standalone');
      assert.equal(await page.locator('.mobile-bottom-nav').count(), 1);
      await page.getByRole('button', { name: 'Mở hỗ trợ', exact: true }).click();
      await page.getByText('Fixture ticket', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Mở rộng hỗ trợ', exact: true }).click();
      await page.getByRole('heading', { name: 'Ticket của tôi', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/support');
      assert.equal(await page.evaluate(() => document.body.style.overflow), ''); clean(pwa);
    } finally { await pwa.context.close(); }
  });
}
