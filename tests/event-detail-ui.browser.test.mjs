import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = `${server.resolvedUrls.local[0]}tests/event-detail-harness.html`;
test.after(async () => { await browser.close(); await server.close(); });

test('student detail uses the shared layout without administration actions', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Ngày hội học thuật HUB', level: 1 }).waitFor();
    assert.equal(await page.getByRole('navigation', { name: 'Đường dẫn sự kiện' }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Xem sự kiện', exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Giới thiệu sự kiện' }).count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Thông tin dẫn nguồn' }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: 'Tham gia sự kiện' }).count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Lưu ý cho sinh viên' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Chỉnh sửa sự kiện' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Quay lại danh sách sự kiện' }).count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Tham gia ngay' }).count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Nguồn sự kiện' }).count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Nguồn sự kiện' }).getAttribute('href'), 'https://example.org/event/378');
    assert.equal((await page.locator('main').innerText()).includes('https://example.org/event/378'), false);
    assert.equal(await page.getByRole('button', { name: 'Sao chép liên kết sự kiện' }).count(), 1);
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal(await page.locator('[class*="shadow-"]').count(), 0);
    const heroGrid = page.getByTestId('event-hero-grid');
    const hero = page.locator('section[aria-label="Thông tin chính của sự kiện"]');
    assert.equal(await heroGrid.locator(':scope > div').count(), 2);
    assert.equal(await hero.getByText('Liên kết gốc').count(), 0);
    assert.equal(await hero.getByRole('link').count(), 0);
    assert.equal(await page.getByTestId('event-student-actions').count(), 0);
    const topBar = page.locator('article > header');
    const actionCard = page.locator('section[aria-labelledby="event-actions-title"]');
    assert.equal(await topBar.getByRole('button', { name: 'Quay lại danh sách sự kiện' }).count(), 1);
    assert.equal(await topBar.getByRole('button', { name: 'Sao chép liên kết sự kiện' }).count(), 1);
    assert.equal(await topBar.getByRole('button', { name: 'Lưu sự kiện' }).count(), 0);
    assert.equal(await topBar.getByRole('button', { name: 'Báo lỗi' }).count(), 0);
    assert.equal(await topBar.getByRole('link', { name: 'Tham gia ngay' }).count(), 0);
    assert.equal(await actionCard.getByRole('link', { name: 'Tham gia ngay' }).count(), 1);
    assert.equal(await actionCard.getByRole('button', { name: 'Lưu sự kiện' }).count(), 1);
    assert.equal(await actionCard.getByRole('button', { name: 'Báo lỗi' }).count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Tham gia ngay' }).getAttribute('href'), 'https://example.org/event/378');
    await page.getByRole('button', { name: 'Lưu sự kiện' }).click();
    assert.equal(await page.getByRole('status', { name: 'Thao tác thử nghiệm' }).innerText(), 'save');
    await page.getByRole('button', { name: 'Báo lỗi' }).click();
    assert.equal(await page.getByRole('status', { name: 'Thao tác thử nghiệm' }).innerText(), 'report');
    await page.getByRole('button', { name: 'Sao chép liên kết sự kiện' }).click();
    assert.equal(await page.getByRole('status', { name: 'Thao tác thử nghiệm' }).innerText(), 'copy');
  } finally { await page.close(); }
});

test('desktop route mounts detail inline rather than through a modal portal', () => {
  const desktop = readFileSync('components/EventsBoard.tsx', 'utf8');
  const mobile = readFileSync('components/MobileEvents.tsx', 'utf8');
  assert.doesNotMatch(desktop, /EventDetailModal/);
  assert.equal(desktop.includes('eventId && routeEvent ? <div className="w-full min-w-0 bg-white"'), true);
  assert.equal(mobile.includes('eventId && routeEvent ? <div className="min-h-[100dvh] w-full bg-white '), true);
  assert.equal(desktop.includes("if (eventId) params.set('ids', eventId)"), true);
  assert.equal(mobile.includes("if (eventId) params.set('ids', eventId)"), true);
  assert.equal(desktop.includes('bypassCache: !eventId && !showManagementView'), true);
  assert.equal(mobile.includes('bypassCache: !eventId && !(isManagementView && canManage)'), true);
});

test('admin and auditor preview show only existing edit permission', async () => {
  for (const role of ['admin', 'auditor']) {
    const page = await browser.newPage();
    try {
      await page.goto(`${base}?role=${role}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Ngày hội học thuật HUB', level: 1 }).waitFor();
      assert.equal(await page.getByRole('navigation', { name: 'Đường dẫn sự kiện' }).count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Xem trước sự kiện', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Chỉnh sửa sự kiện' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Sao chép liên kết sự kiện' }).count(), 1);
      assert.equal(await page.getByRole('button', { name: /Xóa sự kiện/ }).count(), 0);
      assert.equal(await page.getByRole('link', { name: 'Tham gia ngay' }).count(), 0);
      assert.equal(await page.getByRole('link', { name: 'Xem link gốc' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Lưu sự kiện' }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Báo lỗi' }).count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Tham gia sự kiện' }).count(), 0);
      assert.equal(await page.getByRole('heading', { name: 'Thông tin dẫn nguồn' }).count(), 0);
      assert.equal(await page.getByTestId('event-student-actions').count(), 0);
    } finally { await page.close(); }
  }
});

test('metadata and missing-image/source fallback remain readable on mobile', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Ngày hội học thuật HUB', level: 1 }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Tham gia ngay' }).count(), 1);
    const introBox = await page.locator('section[aria-labelledby="event-intro-title"]').boundingBox();
    const actionsBox = await page.locator('section[aria-labelledby="event-actions-title"]').boundingBox();
    assert.ok(introBox && actionsBox && actionsBox.y >= introBox.y + introBox.height - 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.goto(`${base}?missing=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Ngày hội học thuật HUB', level: 1 }).waitFor();
    assert.equal(await page.getByText('Chưa có ảnh sự kiện').count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Thông tin dẫn nguồn' }).count(), 0);
    assert.equal(await page.getByRole('link', { name: 'Nguồn sự kiện' }).count(), 0);
    assert.match(await page.locator('main').innerText(), /#378|Hội trường A|Mục I/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('opening detail records one authoritative view; rerender does not, reopening and reload do', async () => {
  const page = await browser.newPage();
  let requests = 0;
  try {
    await page.route('**/api/events/378/view', async (route) => {
      assert.equal(route.request().method(), 'POST');
      requests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, views: requests }) });
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByRole('status', { name: 'Lượt xem thử nghiệm' }).getByText('1').waitFor();
    await page.getByRole('button', { name: 'Lưu sự kiện' }).click();
    assert.equal(requests, 1);
    await page.getByRole('button', { name: 'Đổi trạng thái detail' }).click();
    await page.getByRole('heading', { name: 'Ngày hội học thuật HUB' }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Đổi trạng thái detail' }).click();
    await page.getByRole('status', { name: 'Lượt xem thử nghiệm' }).getByText('2').waitFor();
    assert.equal(requests, 2);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('status', { name: 'Lượt xem thử nghiệm' }).getByText('3').waitFor();
    assert.equal(requests, 3);
  } finally { await page.close(); }
});

test('admin and auditor previews count published event views without extra list requests', async () => {
  for (const role of ['admin', 'auditor']) {
    const page = await browser.newPage();
    let requests = 0;
    try {
      await page.route('**/api/events/378/view', async (route) => {
        requests += 1;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, views: requests }) });
      });
      await page.goto(`${base}?role=${role}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('status', { name: 'Lượt xem thử nghiệm' }).getByText('1').waitFor();
      assert.equal(requests, 1);
    } finally { await page.close(); }
  }
});

test('student card image overlays retain a light gradient and use D1 view count in both layouts', () => {
  for (const path of ['components/EventsBoard.tsx', 'components/MobileEvents.tsx']) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /bg-gradient-to-t from-slate-950\/75 via-slate-950\/25 to-transparent/);
    assert.match(source, /line-clamp-2[^\n]*text-white/);
    assert.match(source, /formatEventViewCount\(evt\.view_count \?\? 0\)/);
    assert.match(source, /view_count: Number\(row\.view_count\) \|\| 0/);
  }
});

test('student list cards expose only one arrow detail action on desktop and mobile', () => {
  const desktop = readFileSync('components/EventsBoard.tsx', 'utf8');
  const mobile = readFileSync('components/MobileEvents.tsx', 'utf8');
  const desktopCard = desktop.split('const renderEventCard = (evt: HubEvent) => {')[1].split('// ✨ NGĂN CHẶN RENDER')[0];
  const mobileCard = mobile.split('const renderNativeEventCard = (evt: HubEvent) => {')[1].split('\nreturn (')[0];

  for (const card of [desktopCard, mobileCard]) {
    assert.equal((card.match(/<button\b/g) ?? []).length, 1);
    assert.doesNotMatch(card, /<a\b|Xem chi tiết\s*<|Đăng ký ngay|Tham gia ngay|Bookmark|AlertTriangle|MoreHorizontal|LinkIcon/);
    assert.match(card, /formatEventViewCount\(evt\.view_count \?\? 0\)/);
    assert.match(card, /rounded-full border border-blue-200 bg-white/);
    assert.match(card, /aria-label=\{`Xem chi tiết sự kiện: \$\{evt\.name\}`\}/);
  }
  assert.match(desktopCard, /onClick=\{\(\) => handleOpenEventDetail\(evt\)\}/);
  assert.match(desktop, /if \(eventId !== evt\.id\) navigate\(getEventPath\(evt\.id\)\)/);
  assert.match(mobileCard, /navigate\(getEventPath\(evt\.id\)\)/);
  assert.match(desktop, /const getEventPath = \(id: string\) => `\/events\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(mobile, /const getEventPath = \(id: string\) => `\/events\/\$\{encodeURIComponent\(id\)\}`/);
});
