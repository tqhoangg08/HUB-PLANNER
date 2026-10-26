import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright-core';
const engine = process.env.FILTER_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const evidence = process.env.FILTER_EVIDENCE_DIR;
if (evidence)
    fs.mkdirSync(evidence, { recursive: true });
const measurements = [];
const server = await createServer({ configFile: false, envDir: false, plugins: [react()], cacheDir: 'node_modules/.vite-filter-stability', optimizeDeps: { entries: ['tests/event-filter-stability-harness.html'] }, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await (engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }));
test.after(async () => { await browser.close(); await server.close(); if (evidence && measurements.length)
    fs.writeFileSync(`${evidence}/${engine}-measurements.json`, JSON.stringify(measurements, null, 2) + '\n'); });
const sheet = page => page.getByRole('dialog', { name: 'Bộ lọc', exact: true });
const search = page => page.getByRole('textbox', { name: 'Tìm kiếm sự kiện', exact: true });
const filter = page => page.getByRole('button', { name: /^Bộ lọc/ });
const applied = async (page) => JSON.parse(await page.locator('#applied-filters').textContent());
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const position = page => page.evaluate(() => ({ x: document.body.style.position === 'fixed' ? -parseFloat(document.body.style.left || '0') || 0 : scrollX, y: document.body.style.position === 'fixed' ? -parseFloat(document.body.style.top || '0') || 0 : scrollY, internal: Array.from(document.querySelectorAll('[data-overlay-scroll-root]')).map(e => [e.scrollLeft, e.scrollTop]), anchor: document.querySelector('#results-anchor, #page-anchor').getBoundingClientRect().top }));
const rows = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, title: `Fixture event ${i + 1}`, criteria: ['I', 'II', 'III', 'IV', 'V'][i % 5], points: i + 1, category: i % 2 ? 'Tình nguyện' : 'Hội thảo', location_type: i % 2 ? 'Ngoài trường' : 'Trong trường', deadline: '2099-12-31', event_date: `2099-11-${String(i + 1).padStart(2, '0')}`, created_at: `2026-10-${String(i + 1).padStart(2, '0')}`, status: 'Sắp diễn ra', organizer: 'Fixture organizer' }));
async function fixture({ width = 375, height = 667, role = 'guest', controls = false, standalone = false } = {}) {
    const context = await browser.newContext({ ...width < 768 ? devices['iPhone 13'] : {}, viewport: { width, height } });
    await context.addInitScript(({ standalone }) => { if (standalone)
        Object.defineProperty(navigator, 'standalone', { value: true }); localStorage.setItem('hub_participated_events', '["1"]'); localStorage.setItem('hub_ai_third_party_consent_fixture-user', 'accepted'); }, { standalone });
    const calls = [], errors = [], writes = [];
    await context.route('**/*', async (route) => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === new URL(base).origin && !['fetch', 'xhr'].includes(request.resourceType()))
            return route.continue();
        calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: request.method() });
        if (request.method() !== 'GET') {
            writes.push({ path: url.pathname, method: request.method() });
            return route.fulfill({ status: 400, json: { error: 'Unexpected fixture write' } });
        }
        if (url.pathname === '/api/auth/get-session')
            return route.fulfill({ json: role === 'guest' ? null : { session: { id: 'fixture-session' }, user: { id: 'fixture-user', email: 'fixture@example.invalid', name: 'Fixture' } } });
        if (url.pathname === '/api/private/v1/me')
            return route.fulfill({ json: { userId: 'fixture-user', email: 'fixture@example.invalid', role: role === 'student' ? 'user' : role } });
        if (url.pathname.endsWith('/event-participations'))
            return route.fulfill({ json: { success: true, data: [1] } });
        if (url.pathname.endsWith('/events')) {
            const p = url.searchParams;
            let data = p.get('group') === 'closed' ? [] : rows.filter(r => (!p.get('search') || r.title.toLowerCase().includes(p.get('search').toLowerCase())) && (!p.get('criteria') || p.get('criteria').split(',').includes(r.criteria)) && (!p.get('eventType') || r.category === p.get('eventType')) && (!p.get('scope') || r.location_type === (p.get('scope') === 'internal' ? 'Trong trường' : 'Ngoài trường')) && (!p.get('ids') || p.get('ids').split(',').includes(String(r.id))) && (!p.get('dateFrom') || r.event_date >= p.get('dateFrom')) && (!p.get('dateTo') || r.event_date <= p.get('dateTo')) && (!p.get('registrationStatus') || p.get('registrationStatus') === 'open'));
            data.sort((a, b) => p.get('sort') === 'oldest' ? a.id - b.id : b.id - a.id);
            const offset = Number(p.get('offset') || 0), limit = Number(p.get('limit') || 100);
            return route.fulfill({ json: { success: true, data: data.slice(offset, offset + limit), total: data.length, count: data.length } });
        }
        return route.fulfill({ json: { success: true, data: [], total: 0, count: 0, candidates: [], rules: [], organizers: [], notifications: [], unread_count: 0, sessions: [] } });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (['error', 'warning'].includes(m.type()))
        errors.push(m.text()); });
    await page.goto(`${base}tests/event-filter-stability-harness.html?role=${role}${controls ? '&view=controls' : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
    return { context, page, calls, errors, writes };
}
function clean(f) { assert.deepEqual(f.errors, []); assert.deepEqual(f.writes, []); }
async function opened(page) {
    const before = await position(page);
    try { await filter(page).click(); await sheet(page).waitFor(); await frame(page); }
    catch (error) {
        console.error('Sheet open diagnostic', JSON.stringify({before,after:await position(page),button:await filter(page).boundingBox(),active:await page.evaluate(()=>document.activeElement.outerHTML.slice(0,300)),dialogs:await page.getByRole('dialog').allTextContents()}));
        if(evidence)await page.screenshot({path:`${evidence}/${engine}-open-failure.png`,scale:'css'});
        throw error;
    }
}
async function closed(page) { await sheet(page).waitFor({ state: 'detached' }); await frame(page); }
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true); }
async function sheetGeometry(page) {
    const result = await sheet(page).evaluate(d => { const h = d.querySelector('header').getBoundingClientRect(), c = d.querySelector('header button').getBoundingClientRect(), f = d.querySelector('footer').getBoundingClientRect(), s = d.querySelector('.event-filter-content'); return { header: [h.top, h.bottom], close: [c.width, c.height], footer: [f.top, f.bottom], viewport: visualViewport.height + visualViewport.offsetTop, contentHeight: s.clientHeight, overflow: d.scrollWidth > d.clientWidth + 1, hit: Array.from(d.querySelectorAll('footer button')).every(b => { const r = b.getBoundingClientRect(); return [4, r.width / 4, r.width / 2, r.width * 3 / 4, r.width - 4].every(x => [4, r.height / 2, r.height - 4].every(y => b.contains(document.elementFromPoint(r.x + x, r.y + y)))); }) }; });
    assert.ok(result.header[0] >= 0 && result.footer[1] <= result.viewport + 1, JSON.stringify(result));
    assert.ok(result.close.every(v => v >= 44 - 0.001));
    assert.ok(result.contentHeight > 30);
    assert.equal(result.overflow, false);
    assert.equal(result.hit, true);
    return result;
}
for (const [width, height] of [[360, 640], [375, 667], [390, 844], [430, 932], [768, 1024], [1440, 900]])
    test(`${engine} ${width}x${height}: stable toolbar, draft/apply/reset, focus, scrolling and debounce`, async () => {
        const f = await fixture({ width, height, controls: true }), { page } = f;
        try {
            await search(page).scrollIntoViewIfNeeded();
            await frame(page);
            const geometry = () => page.locator('.event-filter-toolbar').evaluate(toolbar => { const r = toolbar.getBoundingClientRect(); return { height: r.height, rows: [...new Set(Array.from(toolbar.children).map(e => Math.round(e.getBoundingClientRect().top)))].length, rootHeight: toolbar.parentElement.getBoundingClientRect().height, targets: Array.from(toolbar.querySelectorAll('button')).filter(b => b.getClientRects().length).map(b => { const r = b.getBoundingClientRect(); return { name: b.getAttribute('aria-label') || b.textContent, width: r.width, height: r.height }; }), font: getComputedStyle(toolbar.querySelector('input')).fontSize }; });
            const before = await geometry();
            assert.equal(before.rows, 2);
            assert.equal(before.height, 96);
            assert.ok(before.targets.every(b => b.height >= 44 && b.width >= 44));
            if (width < 768)
                assert.ok(parseFloat(before.font) >= 16);
            await search(page).fill('latest keyword');
            for (let i = 0; i < 6; i++) {
                await page.waitForTimeout(100);
                await page.evaluate(() => window.filterHarness.rerender());
            }
            assert.equal((await applied(page)).keyword, 'latest keyword');
            assert.equal(await search(page).evaluate(e => e === document.activeElement), true);
            await search(page).fill('latest keyword v2');
            await opened(page);
            assert.equal(await sheet(page).locator('#event-filter-keyword').inputValue(), 'latest keyword v2');
            await page.waitForTimeout(450);
            const original = await applied(page), locked = await position(page);
            await sheet(page).locator('#event-filter-keyword').fill('cancelled draft');
            await sheet(page).locator('#event-filter-region').selectOption('Ngoài trường');
            await page.waitForTimeout(450);
            assert.deepEqual(await applied(page), original);
            await page.keyboard.press('Escape');
            await closed(page);
            assert.deepEqual(await applied(page), original);
            assert.deepEqual(await position(page), locked);
            assert.equal(await filter(page).evaluate(e => e === document.activeElement), true);
            const anchor = await page.locator('#results-anchor').evaluate(e => e.getBoundingClientRect().top);
            await opened(page);
            await sheet(page).locator('#event-filter-region').selectOption('Trong trường');
            await sheet(page).locator('#event-filter-type').selectOption('Hội thảo');
            await sheet(page).getByLabel('Khoảng thời gian', { exact: true }).check();
            await sheet(page).getByLabel('Từ ngày', { exact: true }).fill('2099-12-31');
            await sheet(page).getByLabel('Đến ngày', { exact: true }).fill('2099-01-01');
            await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
            await sheet(page).getByRole('alert').waitFor();
            assert.deepEqual(await applied(page), original);
            await sheet(page).getByLabel('Từ ngày', { exact: true }).fill('2099-01-01');
            await sheet(page).getByLabel('Đến ngày', { exact: true }).fill('2099-12-31');
            await sheet(page).getByLabel('Mục II', { exact: true }).check();
            await sheet(page).getByLabel('Mục IV', { exact: true }).check();
            await sheet(page).locator('#event-filter-status').selectOption('closed');
            await sheet(page).locator('#event-filter-sort').selectOption('highestScore');
            await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
            await closed(page);
            const active = await applied(page);
            assert.deepEqual(active, { keyword: 'latest keyword v2', region: 'Trong trường', eventType: 'Hội thảo', datePreset: 'custom', dateFrom: '2099-01-01', dateTo: '2099-12-31', trainingCategories: ['II', 'IV'], registrationStatus: 'closed', sortBy: 'highestScore' });
            assert.equal(await page.getByLabel('Bộ lọc đang áp dụng').getByRole('button', { name: /^Xóa / }).count(), 7);
            const after = await geometry();
            assert.equal(after.height, before.height);
            assert.equal(after.rootHeight, before.rootHeight);
            assert.ok(Math.abs(await page.locator('#results-anchor').evaluate(e => e.getBoundingClientRect().top) - anchor) < 1);
            if (evidence && width === 375)
                await page.screenshot({ path: `${evidence}/${engine}-after-toolbar.png`, scale: 'css' });
            await page.getByRole('button', { name: 'Xóa Khu vực: Trong trường', exact: true }).click();
            assert.equal((await applied(page)).region, 'all');
            await opened(page);
            const preReset = await applied(page);
            await sheet(page).getByRole('button', { name: 'Đặt lại', exact: true }).click();
            await page.keyboard.press('Escape');
            await closed(page);
            assert.deepEqual(await applied(page), preReset);
            await opened(page);
            await sheet(page).getByRole('button', { name: 'Đặt lại', exact: true }).click();
            await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
            await closed(page);
            assert.equal((await applied(page)).keyword, '');
            assert.deepEqual((await applied(page)).trainingCategories, []);
            await opened(page);
            await sheet(page).getByLabel('Tháng này', { exact: true }).check();
            await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
            await closed(page);
            assert.equal((await applied(page)).datePreset, 'thisMonth');
            await page.getByRole('button', { name: 'Xóa tất cả', exact: true }).click();
            assert.equal((await applied(page)).datePreset, 'all');
            await opened(page);
            await sheet(page).getByLabel('Tháng tới', { exact: true }).check();
            await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
            await closed(page);
            assert.equal((await applied(page)).datePreset, 'nextMonth');
            await page.getByRole('button', { name: 'Xóa tất cả', exact: true }).click();
            if (width < 1024) {
                await page.getByRole('button', { name: 'Sắp xếp', exact: true }).click();
                await sheet(page).waitFor();
                assert.equal(await sheet(page).locator('#event-filter-sort').evaluate(e => e.closest('label') === document.activeElement), true);
                await page.keyboard.press('Escape');
                await closed(page);
                assert.equal(await page.getByRole('button', { name: 'Sắp xếp', exact: true }).evaluate(e => e === document.activeElement), true);
            }
            else {
                const date = page.getByRole('button', { name: 'Chọn thời gian', exact: true });
                await date.click();
                await sheet(page).waitFor();
                await page.keyboard.press('Escape');
                await closed(page);
                assert.equal(await date.evaluate(e => e === document.activeElement), true);
            }
            await opened(page);
            const portrait = await sheetGeometry(page), beforeScroll = await position(page);
            const close = sheet(page).getByRole('button', { name: 'Đóng bộ lọc', exact: true });
            await close.focus();
            await page.keyboard.press('Shift+Tab');
            assert.equal(await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).evaluate(e => e === document.activeElement), true);
            await page.keyboard.press('Tab');
            assert.equal(await close.evaluate(e => e === document.activeElement), true);
            if (engine === 'chromium') {
                await page.mouse.move(1, 1);
                await page.mouse.wheel(0, 500);
            }
            else
                assert.equal(await page.locator('[data-overlay-root]').evaluate(e => !e.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 500 }))), true);
            assert.deepEqual(await position(page), beforeScroll);
            if (width === 375) {
                await page.evaluate(() => window.filterHarness.guide());
                const guide = page.getByRole('dialog', { name: 'Phụ lục Đánh giá Kết quả Rèn luyện' });
                await guide.waitFor();
                await page.waitForFunction(() => Array.from(document.querySelectorAll('[role=dialog]')).some(d => d.textContent.includes('Phụ lục Đánh giá Kết quả Rèn luyện') && d.contains(document.activeElement)));
                await page.keyboard.press('Escape');
                await guide.waitFor({ state: 'detached' });
                assert.equal(await sheet(page).count(), 1);
                assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
                await page.setViewportSize({ width, height: 240 });
                await frame(page);
                await page.waitForFunction(() => Math.abs(document.querySelector('[data-overlay-root]').getBoundingClientRect().height - visualViewport.height) < 2);
                const keyboard = await sheetGeometry(page);
                const input = sheet(page).locator('#event-filter-keyword');
                await input.fill('keyboard draft');
                await input.focus();
                await frame(page);
                assert.equal(await input.inputValue(), 'keyboard draft');
                const visibleInput = await input.evaluate(e => { const r = e.getBoundingClientRect(), s = e.closest('.event-filter-content').getBoundingClientRect(); return r.top >= s.top - 1 && r.bottom <= s.bottom + 1; });
                assert.equal(visibleInput, true, 'focused input fully fits between header and footer');
                assert.equal(await page.locator('.mobile-ai-button').isVisible(), false);
                if (evidence)
                    await page.screenshot({ path: `${evidence}/${engine}-after-keyboard.png`, scale: 'css' });
                await page.setViewportSize({ width: 667, height: 375 });
                await frame(page);
                await sheetGeometry(page);
                assert.equal(await input.inputValue(), 'keyboard draft');
                await page.setViewportSize({ width, height });
                await frame(page);
                measurements.push({ engine, width, height, before, after, portrait, keyboard, original, active, scroll: beforeScroll });
            }
            else
                measurements.push({ engine, width, height, before, after, portrait, original, active, scroll: beforeScroll });
            const scroller = sheet(page).locator('.event-filter-content');
            await close.focus();
            await page.keyboard.press('Tab');
            await page.keyboard.press('PageDown');
            await page.waitForTimeout(250);
            assert.ok(await scroller.evaluate(e => e.scrollHeight <= e.clientHeight || e.scrollTop > 0));
            assert.deepEqual(await position(page), beforeScroll);
            await close.click();
            await closed(page);
            await opened(page);
            await page.locator('[data-overlay-root] > button').click({ position: { x: 1, y: 1 } });
            await closed(page);
            assert.deepEqual(await position(page), beforeScroll);
            await noOverflow(page);
            clean(f);
        }
        finally {
            await f.context.close();
        }
    });
for (const [role, standalone, width, height] of [['guest', false, 375, 667], ['student', false, 1440, 900], ['student', true, 390, 844]])
    test(`${engine}: real ${standalone ? 'MobileEvents' : 'EventsBoard'} ${role}, tabs, actions and pagination`, async () => {
        const f = await fixture({ role, standalone, width, height }), { page } = f;
        try {
            await search(page).waitFor();
            await page.getByText('Fixture event 25', { exact: true }).first().waitFor();
            if (standalone) {
                const pager = page.locator('input[type=number]');
                await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
                await page.waitForFunction(() => document.querySelector('input[type=number]').value === '2');
            }
            await page.getByRole('button', { name: 'Mục I', exact: true }).click();
            await opened(page);
            await sheet(page).getByLabel('Mục I', { exact: true }).uncheck();
            await sheet(page).getByLabel('Mục II', { exact: true }).check();
            await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
            await closed(page);
            assert.ok((await page.getByRole('button', { name: 'Mục II', exact: true }).getAttribute('class')).includes(standalone ? 'bg-[#1A56FF]' : 'text-[#003375]'));
            await page.getByText('Fixture event 2', { exact: true }).first().waitFor();
            await page.getByRole('button', { name: 'Xóa Mục: Mục II', exact: true }).click();
            await page.getByText(standalone ? 'Fixture event 25' : 'Fixture event 1', { exact: true }).first().waitFor();
            assert.ok((await page.getByRole('button', { name: 'Tất cả', exact: true }).getAttribute('class')).includes(standalone ? 'bg-[#1A56FF]' : 'text-[#003375]'));
            if (standalone) {
                assert.equal(await page.locator('input[type=number]').inputValue(), '1');
                assert.ok(f.calls.some(c => c.query.criteria === 'II'));
            }
            await page.getByRole('button', { name: /^Đã tham gia/ }).click();
            await search(page).fill('Fixture');
            await page.waitForTimeout(450);
            assert.ok((await page.getByRole('button', { name: /^Đã tham gia/ }).getAttribute('class')).includes(standalone ? 'bg-[#1A56FF]' : 'text-[#003375]'));
            if (width < 768) {
                await page.locator('.mobile-ai-button').click();
                await page.locator('.mobile-ai-backdrop').click({ position: { x: 5, y: 5 } });
            }
            else {
                await page.locator('button.fixed.bottom-6.right-6').click();
                const ai = page.locator('div.fixed.inset-0').filter({ has: page.getByRole('heading', { name: 'Trợ lý Học tập HUB', exact: true }) });
                await ai.locator('button').filter({ has: page.locator('svg.lucide-x') }).click();
            }
            await frame(page);
            if (width < 1024)
                await page.getByRole('button', { name: 'Thao tác sự kiện', exact: true }).click();
            const requestCount = f.calls.length;
            await page.getByRole('button', { name: 'Làm mới dữ liệu', exact: true }).click();
            await page.waitForFunction(() => !document.querySelector('svg.animate-spin'));
            assert.ok(f.calls.slice(requestCount).some(c => c.path.endsWith('/events') && c.query.refresh === '1'));
            if (width < 1024)
                await page.getByRole('button', { name: 'Thao tác sự kiện', exact: true }).click();
            await page.getByRole('button', { name: 'Xem hướng dẫn điểm rèn luyện', exact: true }).click();
            const guide = page.getByRole('dialog', { name: 'Phụ lục Đánh giá Kết quả Rèn luyện' });
            await guide.waitFor();
            await page.keyboard.press('Escape');
            await guide.waitFor({ state: 'detached' });
            if (width < 1024)
                assert.equal(await page.getByRole('button', { name: 'Thao tác sự kiện', exact: true }).evaluate(e => e === document.activeElement), true);
            await noOverflow(page);
            clean(f);
        }
        finally {
            await f.context.close();
        }
    });
for (const role of ['admin', 'auditor'])
    test(`${engine}: ${role} management and shared student preview remain available`, async () => {
        const f = await fixture({ role }), { page } = f;
        try {
            await page.getByRole('heading', { name: 'Quản lý sự kiện', exact: true }).waitFor();
            await page.getByRole('button', { name: 'Xem giao diện sinh viên', exact: true }).click();
            await search(page).waitFor();
            await page.getByRole('button', { name: 'Thao tác sự kiện', exact: true }).click();
            const actions = page.getByRole('dialog', { name: 'Thao tác sự kiện', exact: true });
            assert.equal(await actions.getByRole('button', { name: 'Quay lại quản lý', exact: true }).count(), 1);
            await actions.getByRole('button', { name: 'Quay lại quản lý', exact: true }).click();
            await page.getByRole('heading', { name: 'Quản lý sự kiện', exact: true }).waitFor();
            await noOverflow(page);
            clean(f);
        }
        finally {
            await f.context.close();
        }
    });
test(`${engine}: all category, status, sorting and alternate-date options remain available`, async () => {
    const f = await fixture({ controls: true }), { page } = f;
    try {
        for (const category of ['I', 'II', 'III', 'IV', 'V']) {
            await opened(page);
            await sheet(page).getByRole('button', { name: 'Đặt lại', exact: true }).click();
            await sheet(page).getByLabel(`Mục ${category}`, { exact: true }).check();
            await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
            await closed(page);
            assert.deepEqual((await applied(page)).trainingCategories, [category]);
        }
        for (const status of ['all', 'open', 'upcoming', 'closed', 'ongoing', 'ended']) {
            await opened(page);
            await sheet(page).locator('#event-filter-status').selectOption(status);
            await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
            await closed(page);
            assert.equal((await applied(page)).registrationStatus, status);
        }
        for (const sort of ['newest', 'oldest', 'upcoming', 'highestScore', 'registrationDeadline']) {
            await opened(page);
            await sheet(page).locator('#event-filter-sort').selectOption(sort);
            await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
            await closed(page);
            assert.equal((await applied(page)).sortBy, sort);
        }
        await opened(page);
        await sheet(page).getByLabel('Tùy chọn khác', { exact: true }).check();
        await sheet(page).getByLabel('Từ ngày', { exact: true }).fill('2099-01-01');
        await sheet(page).getByLabel('Đến ngày', { exact: true }).fill('2099-12-31');
        await sheet(page).getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
        await closed(page);
        assert.equal((await applied(page)).datePreset, 'other');
        assert.equal((await applied(page)).dateTo, '2099-12-31');
        clean(f);
    }
    finally {
        await f.context.close();
    }
});


test(`${engine}: intermediate desktop breakpoints keep every toolbar control reachable`, async () => {
 for (const width of [1024,1280]) {
  const f=await fixture({width,height:900,controls:true});
  try {
   const bounds=await f.page.locator('.event-filter-toolbar').evaluate(t=>{const r=t.getBoundingClientRect();return Array.from(t.querySelectorAll('button,input,select')).filter(e => e.getClientRects().length).map(e=>{const b=e.getBoundingClientRect();return {name:e.getAttribute('aria-label')||e.textContent,inside:b.left>=r.left-1&&b.right<=r.right+1};});});
   assert.ok(bounds.every(b=>b.inside),JSON.stringify({width,bounds}));await noOverflow(f.page);
   await search(f.page).fill('latest across sort');
   await f.page.getByRole('combobox',{name:'Sắp xếp sự kiện',exact:true}).selectOption('oldest');
   await f.page.waitForTimeout(450);
   assert.equal((await applied(f.page)).keyword,'latest across sort');assert.equal((await applied(f.page)).sortBy,'oldest');
   clean(f);
  }finally{await f.context.close();}
 }
});

test(`${engine}: EventsBoard places page actions above one compact desktop filter row`, async () => {
 const results=[];
 for(const width of [390,1024,1440]){
  const f=await fixture({width,height:900,role:'guest'}),{page}=f;
  try{
   const heading=page.locator('.events-board-heading-row'),toolbar=page.locator('.event-filter-toolbar');
   await heading.scrollIntoViewIfNeeded();
   const geometry=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};const h=document.querySelector('.events-board-heading-row'),t=document.querySelector('.event-filter-toolbar'),s=t.querySelector('input'),a=document.querySelector('.events-board-page-actions'),b=document.querySelector('.events-board-ctv-banner');return {heading:rect(h),toolbar:rect(t),search:rect(s),actions:rect(a),banner:rect(b),overflow:document.documentElement.scrollWidth>innerWidth+1};});
   assert.equal(geometry.overflow,false,JSON.stringify({width,geometry}));
   assert.ok(geometry.banner.y-geometry.toolbar.bottom<50,JSON.stringify({width,geometry}));
   if(width>=1024){
    assert.ok(geometry.search.width<=321&&geometry.search.width>=220,JSON.stringify({width,geometry}));
    assert.ok(geometry.toolbar.height<=40,JSON.stringify({width,geometry}));
    assert.ok(geometry.actions.bottom<=geometry.toolbar.y,JSON.stringify({width,geometry}));
    assert.equal(await heading.getByRole('button',{name:'Xem hướng dẫn điểm rèn luyện'}).isVisible(),true);
    assert.equal(await heading.getByRole('button',{name:'Gửi đóng góp'}).isVisible(),true);
    assert.equal(await toolbar.getByRole('button',{name:'Gửi đóng góp'}).count(),0);
    assert.equal(await toolbar.getByRole('button',{name:'Làm mới dữ liệu'}).isVisible(),true);
    assert.equal((await page.locator('.events-board-note').textContent()).trim().startsWith('ⓘ Lưu ý:'),true);
    if(width===1440){
     assert.ok((await page.locator('.events-board-note').boundingBox()).height<25);
     await heading.getByRole('button',{name:'Xem hướng dẫn điểm rèn luyện'}).click();
     await page.getByRole('dialog',{name:'Phụ lục Đánh giá Kết quả Rèn luyện'}).waitFor();
     await page.getByRole('button',{name:'Đóng phụ lục'}).click();
     await heading.getByRole('button',{name:'Gửi đóng góp'}).click();
     await page.getByRole('dialog',{name:'Đóng góp Sự kiện mới'}).waitFor();
     await page.getByRole('button',{name:'Đóng đóng góp sự kiện'}).click();
    }
   }else{
    assert.equal(await heading.getByRole('button',{name:'Gửi đóng góp'}).isVisible(),false);
    assert.ok(geometry.search.width>220);
    await page.getByRole('button',{name:'Thao tác sự kiện'}).click();
    assert.equal(await page.getByRole('dialog',{name:'Thao tác sự kiện'}).getByRole('button',{name:'Gửi đóng góp'}).isVisible(),true);
    await page.getByRole('dialog',{name:'Thao tác sự kiện'}).getByRole('button',{name:'Đóng bộ lọc'}).click();
   }
   if(evidence){const top=Math.max(0,geometry.heading.y-12);await page.screenshot({path:`${evidence}/${engine}-events-layout-${width}.png`,scale:'css',clip:{x:0,y:top,width,height:Math.min(500,900-top)}});}
   results.push({width,...geometry});clean(f);
  }finally{await f.context.close();}
 }
 if(evidence)fs.writeFileSync(`${evidence}/${engine}-events-layout.json`,JSON.stringify(results,null,2)+'\n');
});


test(`${engine}: record scroll lifecycle measurements across target viewports`, async () => {
    const snapshots = [];
    for (const [width,height] of [[360,640],[375,667],[390,844],[430,932],[768,1024],[1440,900]]) {
        const f = await fixture({width,height,controls:true}), {page} = f;
        const snapshot = async () => ({...await position(page), rawScroll:await page.evaluate(()=>[scrollX,scrollY]), bodyPosition:await page.evaluate(()=>document.body.style.position)});
        try {
            await search(page).scrollIntoViewIfNeeded();await frame(page);
            const before = await snapshot();
            await opened(page);const during = await snapshot();
            assert.deepEqual(await position(page),{x:before.x,y:before.y,internal:before.internal,anchor:before.anchor});
            const appliedBefore = await applied(page);
            await sheet(page).locator('#event-filter-region').selectOption('Ngoài trường');
            await sheet(page).getByRole('button',{name:'Đóng bộ lọc',exact:true}).click();await closed(page);
            const after = await snapshot(), afterCancel = await applied(page);
            assert.deepEqual(after,before);assert.deepEqual(afterCancel,appliedBefore);
            let afterApply,afterReset;
            if(width===375){
                await opened(page);await sheet(page).locator('#event-filter-region').selectOption('Trong trường');
                await sheet(page).getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click();await closed(page);afterApply=await applied(page);
                await page.getByRole('button',{name:'Xóa tất cả',exact:true}).click();afterReset=await applied(page);
                assert.equal(afterApply.region,'Trong trường');assert.deepEqual(afterReset,appliedBefore);
            }
            snapshots.push({width,height,before,during,after,appliedBefore,afterCancel,afterApply,afterReset});clean(f);
        } finally {await f.context.close();}
    }
    if(evidence)fs.writeFileSync(`${evidence}/${engine}-scroll-lifecycle.json`,JSON.stringify(snapshots,null,2)+'\n');
});
