import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright-core';

const engine = process.env.ANNOUNCEMENTS_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const before = process.env.ANNOUNCEMENTS_BASELINE === '1';
const evidence = process.env.ANNOUNCEMENTS_EVIDENCE_DIR;
const results = [];
if (evidence) fs.mkdirSync(evidence, { recursive: true });
const server = await createServer({ configFile: false, envDir: false,
  plugins: [...(before ? [{ name: 'announcements-before', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/components/SchoolAnnouncements.jsx'))
      return execFileSync('git', ['show', 'f55e2b3553358858b32cad72a31e1b4aa7a7c0a4:components/SchoolAnnouncements.jsx'], { encoding: 'utf8' });
  } }] : []), react()], cacheDir: 'node_modules/.vite-announcements-modal',
  optimizeDeps: { entries: ['tests/school-announcements-harness.html'] },
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await (engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true }));
console.log(`ENGINE=${engine}; VERSION=${browser.version()}; REAL_DEVICE=NOT_VERIFIED`);
test.after(async () => {
  await browser.close(); await server.close();
  if (evidence) {
    const file = `${evidence}/${engine}-${before ? 'before' : 'after'}-measurements.json`;
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    const key = row => row.case || `${row.width}x${row.height}`;
    fs.writeFileSync(file, JSON.stringify([...previous.filter(row => !results.some(next => key(row) === key(next))), ...results], null, 2) + '\n');
  }
});
const catalog = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, title: `Thông báo học vụ ${i + 1} — lịch đăng ký học phần và hướng dẫn sinh viên`, date: '2026-10-20', is_new: i < 2, link: `https://phongdaotao.hub.edu.vn/thong-bao/${i + 1}` }));
async function fixture(width = 390, height = 844, internal = false, visual = false) {
  const context = await browser.newContext({ ...(width < 768 ? devices['iPhone 13'] : {}), viewport: { width, height }, serviceWorkers: 'block' });
  if (visual) await context.addInitScript(() => {
    const viewport = new EventTarget(); Object.assign(viewport, { height: innerHeight, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: viewport });
    window.setFixtureViewport = (height, offsetTop) => { Object.assign(viewport, { height, offsetTop }); viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll')); };
  });
  const calls = [], errors = [], writes = [], pending = [];
  let hold = '';
  await context.route('**/*', async route => {
    const r = route.request(), u = new URL(r.url());
    if (r.method() === 'GET' && u.origin === new URL(base).origin && (!['fetch', 'xhr'].includes(r.resourceType()) || /^\/(node_modules|@vite|@id|@fs|assets|tests)\//.test(u.pathname))) return route.continue();
    if (r.method() !== 'GET') { writes.push(r.url()); return route.fulfill({ status: 400, json: {} }); }
    if (u.pathname === '/events' && u.searchParams.get('resource') === 'announcements') {
      const query = Object.fromEntries(u.searchParams); calls.push(query);
      if (hold && query.search === hold) await new Promise(resolve => pending.push(resolve));
      if (query.search === 'error') return route.fulfill({ status: 503, json: { error: 'Fixture temporarily unavailable' } });
      const data = query.search === 'empty' ? [] : catalog;
      const offset = Number(query.offset || 0), limit = Number(query.limit);
      return route.fulfill({ json: { data: data.slice(offset, offset + limit).map(row => ({ ...row, title: `${query.search || 'initial'}: ${row.title}` })), total: data.length } }).catch(() => {});
    }
    throw Error(`Unexpected network read: ${r.url()}`);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !m.text().includes('503 (Service Unavailable)')) errors.push(m.text()); });
  await page.goto(`${base}tests/school-announcements-harness.html${internal ? '?internal=1' : ''}`, { waitUntil: 'networkidle', timeout: 120000 });
  const opener = page.getByRole('button', { name: 'Xem tất cả', exact: true });
  await opener.scrollIntoViewIfNeeded();
  return { context, page, calls, errors, writes, pending, hold: s => { hold = s; }, opener };
}
const panel = p => p.locator('[data-overlay-root] > div');
const search = p => p.getByPlaceholder('Nhập tên thông báo cần tìm...');
async function geometry(p) {
  return panel(p).evaluate(d => {
    const box = n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; };
    const [header, filters, list, footer] = [...d.children];
    const close = header.querySelector('button'), buttons = [...footer.querySelectorAll('button')];
    return { panel: box(d), header: box(header), filters: box(filters), list: box(list), footer: box(footer),
      close: box(close), pagination: buttons.map(box), cardsVisible: [...list.querySelectorAll('a')].filter(a => { const r=a.getBoundingClientRect(),v=list.getBoundingClientRect();return r.top >= v.top && r.bottom <= v.bottom; }).length,
      listScroll: [list.scrollTop, list.scrollHeight, list.clientHeight], scroll: [scrollX, scrollY],
      internalScroll: document.querySelector('main').scrollTop, overflow: d.scrollWidth > d.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      viewport: [innerWidth, innerHeight] };
  });
}
async function loaded(p) { await panel(p).locator('a').first().waitFor(); }
async function settleViewport(p) {
  await p.waitForFunction(() => {
    const r=document.querySelector('[data-overlay-root]').getBoundingClientRect();
    return Math.abs(r.height-visualViewport.height)<1 && Math.abs(r.y-visualViewport.offsetTop)<1;
  });
}
async function shot(p, suffix) { if (evidence) await p.screenshot({ path: `${evidence}/${engine}-${before ? 'before' : 'after'}-${suffix}.png`, scale: 'css' }); }
const close = p => p.getByRole('button', { name: 'Đóng tra cứu thông báo', exact: true });
const dates = p => p.getByRole('button', { name: /Bộ lọc ngày/ });
const list = p => p.getByLabel('Danh sách thông báo');
async function assertGeometry(p) {
  const g = await geometry(p);
  assert.equal(g.overflow, false, JSON.stringify(g));
  for (const b of [g.header, g.close, g.footer, ...g.pagination]) {
    assert.ok(b.y >= 0 && b.bottom <= g.viewport[1] + 1, JSON.stringify(g));
  }
  for (const b of [g.close, ...g.pagination]) assert.ok(b.width >= 44 && b.height >= 44, JSON.stringify(g));
  assert.ok(g.list.height > 0, JSON.stringify(g));
  assert.equal(await close(p).evaluate(b => { const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), true);
  return g;
}

if (before) for (const [width, height] of [[360,640],[375,667],[390,844],[430,932],[1440,900]]) test(`${engine} before ${width}: baseline geometry and requests`, async () => {
  const f = await fixture(width, height);
  try {
    await f.opener.click(); await loaded(f.page);
    const g = await geometry(f.page); results.push({ width, height, ...g }); await shot(f.page, String(width));
    assert.ok(g.close.width < 44 && g.close.height < 44, 'Reproduced undersized close');
    if (width < 640) assert.ok(g.pagination.some(b => b.height < 44), 'Reproduced undersized paging');
    await panel(f.page).locator('input[type=number]').fill('3'); await panel(f.page).locator('input[type=number]').press('Enter'); await f.page.waitForTimeout(100);
    const n = f.calls.length; await search(f.page).fill('latest'); await f.page.waitForTimeout(750);
    const keyword = f.calls.slice(n).filter(c => c.search === 'latest');
    results.at(-1).keywordRequests = keyword;
    assert.deepEqual(keyword.map(c=>c.offset), ['20','0'], 'Reproduced old offset and duplicate keyword fetch');
  } finally { await f.context.close(); }
});

if (before) test(`${engine} before: keyboard viewport clips original footer and Escape is absent`, async()=>{
  const f=await fixture(390,844,false,true),p=f.page;
  try {
    await f.opener.click();await loaded(p);
    await p.evaluate(()=>window.setFixtureViewport(240,36));await settleViewport(p);
    const measured=await geometry(p);assert.ok(measured.footer.bottom>276,JSON.stringify(measured));
    await shot(p,'visual-keyboard-dates');await p.keyboard.press('Escape');assert.equal(await panel(p).count(),1);
    results.push({case:'original-visual-viewport',...measured,escapeClosed:false});
  }finally{await f.context.close();}
});

if (!before) for (const [width,height] of [[360,640],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[667,375],[390,240]]) test(`${engine} ${width}x${height}: actual modal layout, filters, scroll and dismissal`, { timeout: 120000 }, async () => {
  const f = await fixture(width,height), p=f.page;
  try {
    assert.equal(await p.locator('[data-overlay-root]').count(),0);
    const scroll = await p.evaluate(() => ({ window: scrollY, internal: document.querySelector('main').scrollTop, anchor: document.querySelector('#anchor').getBoundingClientRect().top }));
    await f.opener.click(); await loaded(p);
    const initial=await assertGeometry(p); results.push({width,height,beforeScroll:scroll,initial});
    if([360,375,390,430,1440].includes(width)&&height>=640)await shot(p,String(width));
    assert.equal(await dates(p).getAttribute('aria-expanded'),String(width>=640));
    assert.equal(await panel(p).locator('a').first().getAttribute('href'),'https://phongdaotao.hub.edu.vn/thong-bao/1');
    assert.equal(await panel(p).locator('a').first().getAttribute('target'),'_blank');
    if(width>=640) await dates(p).click();
    const collapsed=await geometry(p); await dates(p).click();
    const expanded=await geometry(p); results.at(-1).filterHeights={collapsed:collapsed.filters.height,expanded:expanded.filters.height};
    await p.getByLabel('Từ ngày',{exact:true}).fill('2026-10-01'); await loaded(p);
    await p.getByLabel('Đến ngày',{exact:true}).fill('2026-10-31'); await loaded(p);
    assert.equal(f.calls.at(-1).startDate,'2026-10-01'); assert.equal(f.calls.at(-1).endDate,'2026-10-31');
    await dates(p).click(); assert.ok((await dates(p).innerText()).includes('2'));
    await dates(p).click(); assert.equal(await p.getByLabel('Từ ngày',{exact:true}).inputValue(),'2026-10-01');
    await dates(p).click(); await p.getByRole('button',{name:'Xóa ngày',exact:true}).click(); await loaded(p);
    const listStart=await list(p).evaluate(n=>n.scrollTop);
    await list(p).focus();
    if(engine==='chromium') {const r=await list(p).boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.wheel(0,700);}
    else await p.keyboard.press('PageDown');
    await p.waitForTimeout(100);
    const scrollable=await list(p).evaluate(n=>n.scrollHeight>n.clientHeight+1);
    if(scrollable)assert.ok(await list(p).evaluate(n=>n.scrollTop)>listStart,'User input scrolls overflowing list');
    else assert.equal(await list(p).locator('a').count(),10,'All ten cards fit without unnecessary scrolling');
    const scrolled=await assertGeometry(p); assert.equal(scrolled.header.y,initial.header.y);assert.equal(scrolled.footer.bottom,initial.footer.bottom);
    const anchor=await p.locator('#anchor').evaluate(n=>n.getBoundingClientRect().top);assert.equal(anchor,scroll.anchor);
    if(engine==='chromium') { await p.mouse.move(1,1);await p.mouse.wheel(0,500);await p.waitForTimeout(50);assert.equal(await p.locator('#anchor').evaluate(n=>n.getBoundingClientRect().top),scroll.anchor); }
    await search(p).fill('retained');await p.waitForTimeout(650);await loaded(p);
    assert.equal(await search(p).evaluate(n=>n===document.activeElement),true);
    if(width<640)assert.ok(await search(p).evaluate(n=>parseFloat(getComputedStyle(n).fontSize))>=16);
    await p.setViewportSize(height<360?{width:667,height:375}:{width:height,height:width});await settleViewport(p);await assertGeometry(p);
    await p.setViewportSize({width,height});await settleViewport(p);await assertGeometry(p);assert.equal(await search(p).inputValue(),'retained');
    await close(p).click(); await panel(p).waitFor({state:'detached'});
    assert.equal(await f.opener.evaluate(n=>n===document.activeElement),true);assert.equal(await p.evaluate(()=>scrollY),scroll.window);
    await f.opener.click();await loaded(p);await p.keyboard.press('Escape');await panel(p).waitFor({state:'detached'});
    await f.opener.click();await loaded(p);await p.mouse.click(1,1);await panel(p).waitFor({state:'detached'});
    assert.equal(await f.opener.evaluate(n=>n===document.activeElement),true); assert.equal(await p.evaluate(()=>scrollY),scroll.window);
    results.at(-1).afterScroll=await p.evaluate(()=>scrollY);results.at(-1).calls=f.calls;results.at(-1).errors=f.errors;results.at(-1).writes=f.writes;
    assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);
  } finally {f.pending.splice(0).forEach(r=>r());await f.context.close();}
});

test(`${engine} ${before?'before':'after'}: out-of-order response evidence`,{timeout:120000},async()=>{
  const f=await fixture(),p=f.page;
  try {
    await f.opener.click();await loaded(p);f.hold('slow');await search(p).fill('slow');
    await p.waitForTimeout(650);assert.equal(f.pending.length,1);
    await search(p).fill('newest');await p.waitForTimeout(650);await loaded(p);
    assert.ok((await panel(p).locator('a').first().innerText()).includes('newest:'));
    f.pending.splice(0).forEach(r=>r());await p.waitForTimeout(200);
    const final=await panel(p).locator('a').first().innerText();
    results.push({case:'out-of-order',final,calls:f.calls});
    assert.ok(final.includes(before?'slow:':'newest:'),before?'Reproduced stale response overwriting newest results':'Old response cannot replace latest results');
    if(!before)assert.deepEqual(f.errors,[]);
  }finally{f.pending.splice(0).forEach(r=>r());await f.context.close();}
});

if (!before) test(`${engine}: visual viewport offset, safe-area padding and pending loading ownership`, { timeout:120000 }, async()=>{
  const f=await fixture(390,844,false,true),p=f.page;
  try {
    await f.opener.click();await loaded(p);const widgetReads=f.calls.filter(c=>c.offset===undefined).length;
    f.hold('pending');await search(p).fill('pending');await p.waitForTimeout(650);assert.equal(f.pending.length,1);
    await list(p).getByText('Đang truy xuất dữ liệu...').waitFor();assert.equal(await list(p).locator('a').count(),0);
    await p.evaluate(()=>window.setFixtureViewport(240,36));
    await p.waitForFunction(()=>Math.abs(document.querySelector('[data-overlay-root]').getBoundingClientRect().y-36)<1);
    await assertGeometry(p);await search(p).focus();assert.equal(await search(p).inputValue(),'pending');
    const box=await search(p).boundingBox();assert.ok(box.y>=36&&box.y+box.height<=276);
    await dates(p).click();await p.getByLabel('Từ ngày',{exact:true}).fill('2026-10-01');await p.getByLabel('Từ ngày',{exact:true}).blur();assert.equal(await panel(p).count(),1);
    const constrained=await geometry(p);
    assert.ok(constrained.header.y>=36&&constrained.footer.bottom<=276&&constrained.list.height>0,JSON.stringify(constrained));
    const searchBox=await search(p).boundingBox(), dateBox=await p.getByLabel('Từ ngày',{exact:true}).boundingBox();
    assert.ok(searchBox.y>=constrained.header.bottom&&searchBox.y+searchBox.height<=constrained.filters.bottom,JSON.stringify({constrained,searchBox}));
    assert.ok(dateBox.y>=searchBox.y+searchBox.height&&dateBox.y+dateBox.height<=constrained.filters.bottom+1,JSON.stringify({constrained,searchBox,dateBox}));
    await shot(p,'visual-keyboard-dates');
    f.pending.splice(0).forEach(r=>r());f.hold('');await search(p).fill('ready');await p.waitForTimeout(650);await loaded(p);
    await p.evaluate(()=>window.setFixtureViewport(844,0));
    const padding=await p.addStyleTag({content:'.announcements-overlay { padding-top: 44px !important; padding-bottom: 34px !important; }'});
    await p.evaluate(()=>window.dispatchEvent(new Event('resize')));await assertGeometry(p);await padding.evaluate(n=>n.remove());
    await close(p).click();await f.opener.click();await loaded(p);assert.equal(f.calls.filter(c=>c.offset===undefined).length,widgetReads,'Modal lifecycle does not refetch widget cache');
    await dates(p).click();assert.equal(await p.getByLabel('Từ ngày',{exact:true}).inputValue(),'2026-10-01','Date survives close and reopen');
    await close(p).click();await p.reload({waitUntil:'networkidle'});assert.equal(f.calls.filter(c=>c.offset===undefined).length,widgetReads,'Session widget cache survives reload');
    assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);results.push({case:'visual-viewport-and-loading',input:box,constrained,calls:f.calls,widgetReads});
  }finally{f.pending.splice(0).forEach(r=>r());await f.context.close();}
});

if (!before) test(`${engine}: pagination, debounce, error/empty, focus and internal-root cleanup`, { timeout:120000 }, async()=>{
  const f=await fixture(390,844,true),p=f.page;
  try {
    const initial=await p.locator('main').evaluate(n=>n.scrollTop);assert.ok(initial>0);
    await f.opener.click();await loaded(p);const paging=p.getByRole('spinbutton',{name:'Trang thông báo'});
    for(const [input,expected] of [['3','3'],['999','5'],['0','1'],['','1']]) {
      const n=f.calls.length;await paging.fill(input);await paging.press('Enter');await loaded(p);await search(p).focus();await p.waitForTimeout(80);
      assert.equal(await paging.inputValue(),expected);assert.ok(f.calls.length-n<=1,'Enter plus blur does not duplicate fetch');
    }
    await p.getByRole('button',{name:'Trang sau',exact:true}).click();await loaded(p);assert.equal(f.calls.at(-1).offset,'10');
    await p.getByRole('button',{name:'Trang trước',exact:true}).click();await loaded(p);assert.equal(f.calls.at(-1).offset,'0');
    await paging.fill('3');await paging.press('Enter');await loaded(p);
    const n=f.calls.length;await search(p).fill('a');await search(p).fill('ab');await search(p).fill('latest');await p.waitForTimeout(650);await loaded(p);
    assert.deepEqual(f.calls.slice(n).map(q=>[q.search,q.offset]),[['latest','0']]);assert.equal(await paging.inputValue(),'1');
    await dates(p).click();await p.getByLabel('Từ ngày',{exact:true}).fill('2026-10-01');await loaded(p);assert.equal(f.calls.at(-1).search,'latest');
    await dates(p).click();await search(p).fill('empty');await p.getByText('Không tìm thấy thông báo nào phù hợp.').waitFor();
    await p.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();await loaded(p);assert.equal(f.calls.at(-1).startDate,undefined);assert.equal(f.calls.at(-1).search,undefined);
    await search(p).fill('error');await p.getByRole('alert').waitFor();assert.equal(await panel(p).locator('a').count(),0);
    await search(p).fill('recover');await p.waitForTimeout(650);await loaded(p);assert.equal(await p.getByRole('alert').count(),0);
    // Shift+Tab from the dialog wraps to its last control, Tab returns to close.
    await panel(p).focus();await p.keyboard.press('Shift+Tab');assert.equal(await p.getByRole('button',{name:'Trang sau',exact:true}).evaluate(n=>n===document.activeElement),true);
    await p.keyboard.press('Tab');assert.equal(await close(p).evaluate(n=>n===document.activeElement),true);
    f.hold('closing');await search(p).fill('closing');await p.waitForTimeout(650);
    await close(p).click();f.pending.splice(0).forEach(r=>r());await p.waitForTimeout(80);
    assert.equal(await p.locator('main').evaluate(n=>n.scrollTop),initial);assert.equal(await f.opener.evaluate(n=>n===document.activeElement),true);
    f.hold('');await f.opener.click();await loaded(p);await p.evaluate(()=>window.announcementsHarness.unmount());await panel(p).waitFor({state:'detached'});
    assert.notEqual(await p.locator('main').evaluate(n=>n.style.overflowY),'hidden');
    assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);results.push({case:'pagination-and-internal-root',calls:f.calls,errors:f.errors,initialScroll:initial,finalScroll:await p.locator('main').evaluate(n=>n.scrollTop)});
  }finally{f.pending.splice(0).forEach(r=>r());await f.context.close();}
});
