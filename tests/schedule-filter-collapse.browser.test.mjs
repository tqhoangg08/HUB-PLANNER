import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright-core';
const engine = process.env.SCHEDULE_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const before = process.env.SCHEDULE_BASELINE === '1';
const evidence = process.env.SCHEDULE_EVIDENCE_DIR;
if (evidence)
    fs.mkdirSync(evidence, { recursive: true });
const measurements = [];
const server = await createServer({ configFile: false, envDir: false, plugins: [...(before ? [{ name: 'pinned-schedule-baseline', enforce: 'pre', transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/components/ScheduleBoard.tsx'))
                    return execFileSync('git', ['show', 'e4740ecada34ad4569104ca4133b01fe586e38b4:components/ScheduleBoard.tsx'], { encoding: 'utf8' }); } }] : []), react()], cacheDir: before ? 'node_modules/.vite-schedule-collapse-baseline' : 'node_modules/.vite-schedule-collapse', optimizeDeps: { entries: ['tests/schedule-filter-collapse-harness.html'] }, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await (engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }));
test.after(async () => {
    await browser.close(); await server.close();
    if (!evidence || !measurements.length) return;
    const path = `${evidence}/${engine}-${before ? 'before' : 'after'}-measurements.json`;
    const previous = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : [];
    const merged = new Map([...previous, ...measurements].map(row => [row.width, row]));
    fs.writeFileSync(path, JSON.stringify([...merged.values()].sort((a,b)=>a.width-b.width), null, 2) + '\n');
});
const pref = 'hub_timetable_filter_sidebar_expanded_v1';
const catalog = Array.from({ length: 65 }, (_, i) => ({ id: `fixture-${i}`, course_code: `FIX${i}`, subject_name: `Fixture subject ${i}`, credits: 3, shift: 'S', day_of_week: '2', weeks: '1-15', room: 'Fixture room', campus: 'Fixture campus', semester: 'HK1_2026_2027', phase: i % 2 ? '2' : '1', academic_program: 'Chính quy chuẩn', major: 'Fixture major', cohort: 'K52', group_name: 'Fixture group', instructor: 'Fixture instructor', scheduleSessions: [] }));
async function fixture({ width = 375, height = 667, role = 'student', standalone = false, preference, blocked = false } = {}) {
    const context = await browser.newContext({ ...width < 768 ? devices['iPhone 13'] : {}, viewport: { width, height } });
    await context.addInitScript(({ standalone, preference, blocked, pref }) => {
        if (standalone)
            Object.defineProperty(navigator, 'standalone', { value: true });
        localStorage.setItem('hub_schedule_board_update_notice_hidden_v1', 'true');
        localStorage.setItem('hub_ai_third_party_consent_fixture-user', 'accepted');
        if (preference !== undefined && !sessionStorage.getItem('preference-seeded')) {
            localStorage.setItem(pref, preference);
            sessionStorage.setItem('preference-seeded', 'true');
        }
        if (blocked) {
            const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
            Storage.prototype.getItem = function (k) { if (k === pref)
                throw new DOMException('blocked', 'SecurityError'); return get.call(this, k); };
            Storage.prototype.setItem = function (k, v) { if (k === pref)
                throw new DOMException('blocked', 'SecurityError'); return set.call(this, k, v); };
        }
    }, { standalone, preference, blocked, pref });
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
        if (url.pathname.endsWith('/courses')) {
            const p = url.searchParams;
            if (p.get('resource') === 'filter-options')
                return route.fulfill({ json: { subjectNameOptions: catalog.map(c => c.subject_name), majorOptions: ['Fixture major'], cohortOptions: ['K52'], groupNameOptions: ['Fixture group'], academicProgramOptions: ['Chính quy chuẩn'] } });
            if (p.get('resource') === 'course-detail')
                return route.fulfill({ json: { data: catalog.find(c => c.id === p.get('id')) } });
            const data = catalog.filter(c => (!p.get('search') || `${c.subject_name} ${c.course_code}`.toLowerCase().includes(p.get('search').toLowerCase())) && (!p.get('phase') || p.get('phase').split(',').includes(c.phase)) && (!p.get('subjectName') || p.get('subjectName') === c.subject_name));
            const offset = Number(p.get('offset') || 0), limit = Number(p.get('limit') || 100);
            return route.fulfill({ json: { success: true, data: data.slice(offset, offset + limit), total: data.length, hasMore: offset + limit < data.length } });
        }
        return route.fulfill({ json: { success: true, data: [], total: 0, count: 0, revisions: { HK1_2026_2027: 1 }, candidates: [], rules: [], organizers: [], notifications: [], unread_count: 0, sessions: [] } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (['error', 'warning'].includes(m.type()))
        errors.push(m.text()); });
    await page.goto(`${base}tests/schedule-filter-collapse-harness.html?role=${role}${standalone ? '&appPreview=1' : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForFunction(expected => document.querySelector('#mode')?.textContent === expected, standalone ? 'standalone' : width < 768 ? 'browser' : 'desktop');
    return { context, page, calls, errors, writes };
}
const frame = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const geometry = page => page.evaluate(() => {
    const heading = [...document.querySelectorAll('h2')].find(e => e.textContent.trim() === 'Bộ lọc');
    const sidebar = heading?.parentElement.parentElement;
    const toolbar = document.querySelector('.schedule-toolbar');
    const calendar = toolbar?.parentElement;
    const rect = e => e && e.getClientRects().length ? { x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height } : null;
    return { sidebar: rect(sidebar), calendar: rect(calendar), scroll: [scrollX, scrollY], overflow: document.documentElement.scrollWidth > innerWidth + 1, viewport: [innerWidth, innerHeight] };
});
const clean = f => { assert.deepEqual(f.errors, []); assert.deepEqual(f.writes, []); };
if (before)
    for (const [width, height] of [[375, 667], [1440, 900]])
        test(`${engine} baseline ${width}`, async () => {
            const f = await fixture({ width, height }), { page } = f;
            try {
                await page.getByRole('heading', { name: 'Bộ lọc', exact: true }).waitFor();
                const expanded = await geometry(page);
                if (evidence)
                    await page.screenshot({ path: `${evidence}/${engine}-before-${width}.png`, scale: 'css' });
                await page.getByRole('button', { name: 'Thu gọn', exact: true }).click();
                await frame(page);
                const collapsed = await geometry(page);
                assert.ok(collapsed.sidebar, 'old collapse leaves the card mounted and visible');
                const apply = page.getByRole('button', { name: /Áp dụng bộ lọc/ });
                await apply.click();
                await page.getByRole('dialog', { name: 'Kết quả lớp học phù hợp' }).waitFor();
                measurements.push({ width, expanded, collapsed, applyOpensResults: true });
                await page.keyboard.press('Escape');
                measurements[measurements.length - 1].escapeLeavesOldResultsOpen = await page.getByRole('dialog', { name: 'Kết quả lớp học phù hợp' }).isVisible();
                clean(f);
            }
            catch (error) {
                console.error('Schedule viewport failure', JSON.stringify({width, geometry:await geometry(page),calls:f.calls.slice(-5),errors:f.errors}));
                await capture(page,`failure-${width}`); throw error;
            }
            finally {
                await f.context.close();
            }
        });
const toggle = page => page.locator('button[aria-controls="timetable-filter-sidebar"]');
const sidebar = page => page.locator('#timetable-filter-sidebar');
const results = page => page.getByRole('dialog', { name: 'Kết quả lớp học phù hợp' });
const advanced = page => page.getByRole('dialog', { name: 'Bộ lọc nâng cao', exact: true });
const count = page => toggle(page).locator('span[aria-label]').getAttribute('aria-label');
const position = page => page.evaluate(() => ({ document: [scrollX, document.body.style.position === 'fixed' ? -parseFloat(document.body.style.top || '0') : scrollY], internal: [...document.querySelectorAll('.mobile-main,main')].filter(e => e.scrollHeight > e.clientHeight).map(e => ({ x: e.scrollLeft, y: e.scrollTop })), anchor: document.querySelector('.timetable-filter-bar')?.getBoundingClientRect().top }));
async function collapsed(page) { await frame(page); assert.equal(await sidebar(page).isVisible(), false); assert.equal(await toggle(page).getAttribute('aria-expanded'), 'false'); }
async function open(page) { await toggle(page).click(); await frame(page); assert.equal(await sidebar(page).isVisible(), true); }
async function capture(page, name) { if (evidence)
    await page.screenshot({ path: `${evidence}/${engine}-${name}.png`, scale: 'css' }); }
if (!before)
    for (const [width, height] of [[360, 640], [375, 667], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900]])
        test(`${engine} ${width}x${height}: full collapse, direct filters, results, pagination, focus and persistence`, async () => {
            const f = await fixture({ width, height }), { page } = f;
            try {
                await toggle(page).waitFor();
                await collapsed(page);
                assert.match(await count(page), /^1 /);
                assert.equal(await page.getByRole('button', { name: /Áp dụng bộ lọc/ }).count(), 0);
                const initial = await geometry(page), scrollBefore = await position(page);
                await open(page);
                const expanded = await geometry(page);
                if (width >= 1024)
                    assert.ok(initial.calendar.width - expanded.calendar.width >= 329, JSON.stringify({ initial, expanded }));
                else
                    assert.ok(expanded.calendar.y - initial.calendar.y >= 520);
                const target = await toggle(page).boundingBox();
                assert.ok(target.height >= 44 && target.width >= 44);
                await sidebar(page).getByRole('button', { name: /^Môn học/ }).click();
                const search = sidebar(page).getByPlaceholder('Tìm tên môn hoặc mã học phần...');
                await search.fill('Fixture subject');
                await page.waitForFunction(() => document.activeElement?.getAttribute('placeholder') === 'Tìm tên môn hoặc mã học phần...');
                await page.waitForTimeout(550);
                assert.ok(f.calls.some(c => c.query.search === 'Fixture subject' && c.query.limit === '30'));
                assert.equal(await results(page).count(), 0, 'typing applies data without opening a result modal');
                assert.match(await count(page), /^2 /);
                await toggle(page).click();
                await collapsed(page);
                assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')), 'timetable-filter-sidebar');
                const compact = await geometry(page);
                assert.equal(compact.overflow, false);
                await open(page);
                assert.equal(await search.inputValue(), 'Fixture subject');
                assert.equal(await search.isVisible(), true, 'expanded accordion survives full collapse');
                await toggle(page).click();
                await collapsed(page);
                await page.getByRole('button', { name: 'Xem danh sách lớp', exact: true }).scrollIntoViewIfNeeded();
                const scroll = await position(page);
                await page.getByRole('button', { name: 'Xem danh sách lớp', exact: true }).click();
                await results(page).waitFor();
                await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Kết quả lớp học phù hợp');
                const locked = await position(page);
                const scroller = results(page).locator('.overflow-y-auto');
                if (engine === 'webkit' && width < 768) {
                    // Playwright mobile WebKit has no mouse.wheel/swipe API.
                    // Check the real lock's touch boundary handler, then measure
                    // independent native container scrolling explicitly via scrollBy.
                    const canceled = await results(page).evaluate(dialog => {
                        const root = dialog.closest('.overlay-root');
                        const touch = (name, y) => {
                            // WebKit exposes Touch/TouchEvent but disallows their constructors.
                            const event = new Event(name, { bubbles: true, cancelable: true });
                            Object.defineProperty(event, 'touches', { value: [{ identifier: 0, target: root, clientX: 1, clientY: y }] });
                            return event;
                        };
                        root.dispatchEvent(touch('touchstart', 100));
                        const canceled = !root.dispatchEvent(touch('touchmove', 20));
                        root.dispatchEvent(new Event('touchend', { bubbles: true }));
                        return canceled;
                    });
                    assert.equal(canceled, true, 'touch on the non-scrollable overlay boundary is canceled');
                    await page.keyboard.press('PageDown'); await frame(page);
                    assert.deepEqual(await position(page), locked, 'keyboard cannot scroll the background');
                    await scroller.evaluate(element => element.scrollBy(0, 500));
                } else {
                    await page.mouse.move(2, 2); await page.mouse.wheel(0, 500); await frame(page);
                    assert.deepEqual(await position(page), locked, 'wheel outside scrollable results cannot move the background');
                    await scroller.hover(); await page.mouse.wheel(0, 500);
                }
                await page.waitForFunction(() => document.querySelector('[aria-label="Kết quả lớp học phù hợp"] .overflow-y-auto')?.scrollTop > 0);
                assert.deepEqual(await position(page), locked, 'results scroll independently');
                const nextPage = page.waitForResponse(r => new URL(r.url()).searchParams.get('offset') === '30');
                await results(page).getByRole('button', { name: 'Trang sau', exact: true }).click();
                await nextPage;
                await results(page).getByText('Trang 2/3', { exact: false }).waitFor();
                assert.ok(f.calls.some(c => c.query.offset === '30' && c.query.search === 'Fixture subject'));
                await page.keyboard.press('Shift+Tab');
                assert.equal(await results(page).evaluate(d => d.contains(document.activeElement)), true);
                await page.keyboard.press('Tab');
                await page.keyboard.press('Escape');
                await results(page).waitFor({ state: 'detached' });
                await frame(page);
                assert.deepEqual(await position(page), scroll, 'result overlay restores both document and internal roots');
                assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Xem danh sách lớp');
                await page.getByRole('button', { name: 'Bỏ lọc từ khóa', exact: true }).click();
                assert.match(await count(page), /^1 /);
                await page.getByRole('button', { name: 'Bộ lọc nâng cao', exact: true }).click();
                await advanced(page).waitFor();
                assert.equal(await page.getByRole('button', { name: 'Xem kết quả', exact: true }).count(), 1);
                await advanced(page).getByRole('button', { name: 'Đóng bộ lọc', exact: true }).click();
                await advanced(page).waitFor({ state: 'detached' });
                // Filter chip removes exactly the same field; reset then reaches zero.
                await page.getByRole('button', { name: 'Bỏ lọc học kỳ', exact: true }).click();
                assert.match(await count(page), /^0 /);
                await open(page);
                await sidebar(page).getByRole('checkbox').first().check();
                await page.getByRole('button', { name: 'Xóa tất cả bộ lọc', exact: true }).click();
                assert.match(await count(page), /^0 /);
                await toggle(page).click();
                await collapsed(page);
                await page.reload({ waitUntil: 'networkidle' });
                await collapsed(page);
                await open(page);
                await page.reload({ waitUntil: 'networkidle' });
                assert.equal(await toggle(page).getAttribute('aria-expanded'), 'true');
                await page.getByRole('button', { name: 'Fixture route away' }).click();
                await page.getByRole('button', { name: 'Quay lại lịch' }).click();
                await sidebar(page).waitFor();
                assert.equal(await toggle(page).getAttribute('aria-expanded'), 'true');
                // Move only the viewport; the preference/entrypoint stays reachable across orientation.
                await page.setViewportSize({ width: height, height: width });
                await frame(page);
                assert.equal(await toggle(page).getAttribute('aria-expanded'), 'true');
                await page.setViewportSize({ width, height });
                await frame(page);
                await toggle(page).click();
                await collapsed(page);
                await toggle(page).scrollIntoViewIfNeeded();
                const after = await geometry(page);
                assert.equal(after.overflow, false);
                if ((engine === 'chromium' && [375, 1440].includes(width)) || (engine === 'webkit' && width === 375)) {
                    await capture(page, `collapsed-${width}`);
                    await open(page);
                    await toggle(page).scrollIntoViewIfNeeded();
                    await capture(page, `expanded-${width}`);
                    await toggle(page).click();
                }
                measurements.push({ width, height, initial, expanded, collapsed: compact, after, target, scrollBefore, scrollAfter: await position(page), scrollInput: engine === 'webkit' && width < 768 ? 'synthetic touch boundary + keyboard + explicit scrollBy (no native swipe API)' : 'mouse wheel', filterRequests: f.calls.filter(c => c.path.endsWith('/courses')), count: await count(page), persisted: await page.evaluate(k => localStorage.getItem(k), pref) });
                clean(f);
            }
            finally {
                await f.context.close();
            }
        });
if (!before)
    for (const preference of ['corrupted', 'null', 'false', 'true'])
        test(`${engine}: preference ${preference}`, async () => {
            const f = await fixture({ preference });
            try {
                await toggle(f.page).waitFor();
                assert.equal(await toggle(f.page).getAttribute('aria-expanded'), String(preference === 'true'));
                await toggle(f.page).click();
                assert.equal(await f.page.evaluate(k => localStorage.getItem(k), pref), String(preference !== 'true'));
                clean(f);
            }
            finally {
                await f.context.close();
            }
        });
if (!before)
    test(`${engine}: denied preference storage does not block filtering`, async () => {
        const f = await fixture({ blocked: true });
        try {
            await collapsed(f.page);
            await open(f.page);
            await toggle(f.page).click();
            await collapsed(f.page);
            clean(f);
        }
        finally {
            await f.context.close();
        }
    });
if (!before)
    for (const role of ['guest', 'admin', 'auditor'])
        test(`${engine}: ${role} authorization and navigation retained`, async () => {
            const f = await fixture({ role });
            try {
                if (role === 'guest') {
                    await toggle(f.page).waitFor();
                    assert.equal(await f.page.getByRole('button', { name: 'Xem danh sách lớp', exact: true }).isDisabled(), true);
                    await open(f.page);
                    await sidebar(f.page).getByRole('button', { name: /^Môn học/ }).click();
                    assert.equal(await sidebar(f.page).getByPlaceholder('Tìm tên môn hoặc mã học phần...').isDisabled(), true);
                }
                else {
                    await f.page.getByRole('tab', { name: /Môn hệ thống/ }).waitFor();
                    assert.equal(await toggle(f.page).count(), 0);
                    assert.equal(await f.page.getByRole('tab').count(), 5);
                }
                clean(f);
            }
            finally {
                await f.context.close();
            }
        });
if (!before)
    test(`${engine}: plan A/B, week/month, result selection and PWA remain available`, async () => {
        const f = await fixture();
        try {
            const p = f.page;
            await p.getByRole('button', { name: 'Kế hoạch', exact: true }).click();
            await p.getByRole('button', { name: 'KH B', exact: true }).click();
            await p.getByRole('button', { name: 'Tháng', exact: true }).click();
            await open(p);
            await toggle(p).click();
            assert.ok((await p.getByRole('button', { name: 'KH B', exact: true }).getAttribute('class')).includes('bg-white'));
            await p.getByRole('button', { name: 'Xem danh sách lớp', exact: true }).click();
            await results(p).waitFor();
            await results(p).getByRole('button', { name: 'Thêm vào lịch', exact: true }).first().click();
            await results(p).getByRole('button', { name: 'Đã lưu', exact: true }).first().waitFor();
            await results(p).getByRole('button', { name: 'Đóng kết quả' }).click();
            assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('hub_schedule_plans_v1:fixture-user')).B.length), 1);
            await p.getByRole('button', { name: 'Xem danh sách lớp', exact: true }).click();
            await results(p).getByRole('button').filter({ has: p.getByRole('heading', { name: 'Fixture subject 1', exact: true }) }).click();
            assert.equal(await results(p).count(), 0);
            assert.ok(await p.getByText('Fixture subject 1', { exact: true }).count() > 0);
            clean(f);
        }
        finally {
            await f.context.close();
        }
        const pwa = await fixture({ standalone: true });
        try {
            assert.equal(await pwa.page.locator('#mode').textContent(), 'standalone');
            await pwa.page.locator('.mobile-schedule-page').waitFor();
            assert.equal(await toggle(pwa.page).count(), 0);
            assert.ok(await pwa.page.getByText('Ca học tiếp theo', { exact: true }).count() > 0);
            clean(pwa);
        }
        finally {
            await pwa.context.close();
        }
    });
if (!before)
    test(`${engine}: all sidebar fields, advanced input, chip removals and PDF entry survive collapse`, async () => {
        const f = await fixture({ width: 1440, height: 900 }), { page } = f;
        try {
            await toggle(page).waitFor();
            await open(page);
            await sidebar(page).getByRole('button', { name: /^Môn học/ }).click();
            await sidebar(page).getByRole('combobox').selectOption({ label: 'Fixture subject 2' });
            for (const [section, value] of [['Chương trình', 'Chính quy chuẩn'], ['Đợt', 'Đợt 1'], ['Chuyên ngành', 'Fixture major'], ['Khóa', 'K52'], ['Nhóm', 'Fixture group']]) {
                await sidebar(page).getByRole('button', { name: new RegExp(`^${section}`) }).click();
                await sidebar(page).getByRole('checkbox', { name: value, exact: true }).check();
            }
            assert.match(await count(page), /^7 /);
            await page.waitForTimeout(600);
            const request = f.calls.filter(c => c.path.endsWith('/courses') && c.query.groupName).at(-1);
            assert.equal(request.query.subjectName, 'Fixture subject 2');
            assert.equal(request.query.phase, '1');
            assert.equal(request.query.academicProgram, 'Chính quy chuẩn');
            assert.equal(request.query.major, 'Fixture major');
            assert.equal(request.query.cohort, 'K52');
            assert.equal(request.query.groupName, 'Fixture group');
            await sidebar(page).getByRole('button', { name: 'Thu gọn bộ lọc', exact: true }).click();
            await collapsed(page);
            await open(page);
            assert.equal(await sidebar(page).getByRole('checkbox', { name: 'Fixture group', exact: true }).isChecked(), true);
            await toggle(page).click();
            await page.getByRole('button', { name: 'Bộ lọc nâng cao', exact: true }).click();
            await advanced(page).waitFor();
            await advanced(page).getByLabel('Giảng viên', { exact: true }).fill('Fixture instructor');
            await page.waitForTimeout(550);
            assert.ok(f.calls.some(c => c.query.instructor === 'Fixture instructor'));
            await advanced(page).getByRole('button', { name: 'Đóng bộ lọc', exact: true }).click();
            assert.match(await count(page), /^8 /);
            for (const label of ['Bỏ lọc khóa', 'Bỏ lọc nhóm', 'Bỏ lọc instructor'])
                await page.getByRole('button', { name: label, exact: true }).click();
            assert.match(await count(page), /^5 /);
            await page.getByRole('button', { name: 'Xóa tất cả bộ lọc', exact: true }).click();
            assert.match(await count(page), /^0 /);
            assert.equal(await page.locator('#timetable-filter-sidebar input[type=file]').count(), 1, 'PDF input stays mounted inside hidden card');
            await page.getByRole('button', { name: 'Thao tác', exact: true }).click();
            await page.getByRole('menuitem', { name: 'Nhập PDF', exact: true }).click();
            await page.getByText('Laptop / PC', { exact: true }).waitFor();
            assert.equal(await sidebar(page).isVisible(), false);
            clean(f);
        }
        finally {
            await f.context.close();
        }
    });
