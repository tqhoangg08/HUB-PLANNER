import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright-core';
const engine = process.env.SCHEDULE_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const before = process.env.LAYOUT_BEFORE === '1';
const densityBefore = process.env.DENSITY_BEFORE === '1';
const baselineRef = densityBefore ? '1a4eb2b1591f447f66ab7d61708b642c942fe586' : '77f94e24290332eddbd27246aa8b07d3d9a9defd';
const evidence = process.env.SCHEDULE_EVIDENCE_DIR;
if (evidence)
    fs.mkdirSync(evidence, { recursive: true });
const measurements = [];
const server = await createServer({ configFile: false, envDir: false, plugins: [...((before || densityBefore) ? [{ name: 'pinned-schedule-baseline', enforce: 'pre', transform(code, id) { const normalized=id.replaceAll('\\','/');const file=['components/ScheduleBoard.tsx','components/schedule-filters.css'].find(file=>normalized.endsWith('/'+file));if(file)return execFileSync('git',['show',baselineRef+':'+file],{encoding:'utf8'}); } }] : []), react()], cacheDir: (before || densityBefore) ? 'node_modules/.vite-schedule-toolbar-baseline' : 'node_modules/.vite-schedule-toolbar', optimizeDeps: { entries: ['tests/schedule-filter-collapse-harness.html'] }, server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, logLevel: 'error' });
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
const clean = f => { assert.deepEqual(f.errors, []); assert.deepEqual(f.writes, []); };

console.log(`ENGINE=${engine}; VERSION=${browser.version()}`);

test(`${engine} unified timetable layout`,{timeout:240000},async()=>{
 const rows=[];
 for(const width of process.env.LAYOUT_WIDTHS?process.env.LAYOUT_WIDTHS.split(',').map(Number):process.env.LAYOUT_BEFORE==='1'?[390,1440]:[320,360,375,390,430,667,768,1024,1440]){
 const height=process.env.LAYOUT_BEFORE==='1'?900:({320:568,360:640,375:667,390:844,430:932,667:375,768:1024,1024:768,1440:900}[width]);
 const f=await fixture({width,height,preference:'true'}),p=f.page;
 try{
 const hint=p.getByRole('button',{name:'Ẩn gợi ý AI',exact:true});if(await hint.isVisible())await hint.click();
 await p.getByRole('heading',{name:'Thời khóa biểu',exact:true}).waitFor();
 const g=await p.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};return {heading:box(document.querySelector('h1.ui-page-title')),filter:box(document.querySelector('.timetable-filter-bar')),overflow:document.documentElement.scrollWidth>innerWidth+1};});
 g.width=width;rows.push(g);if(evidence)await p.screenshot({path:`${evidence}/${engine}-${process.env.LAYOUT_BEFORE==='1'?'before':'after'}-${width}.png`,scale:'css'});
 if(process.env.LAYOUT_BEFORE==='1')continue;
 assert.equal(g.overflow,false);assert.ok(g.heading.y<g.filter.y);
 for(const target of [p.locator('button[aria-controls="timetable-filter-sidebar"]'),p.getByRole('button',{name:'Xem danh sách lớp',exact:true}),p.getByRole('button',{name:'Nhập PDF',exact:true}),p.getByRole('button',{name:'Thao tác',exact:true}),p.getByRole('button',{name:'Lịch cá nhân',exact:true}),p.getByRole('button',{name:'Kế hoạch',exact:true})]){const box=await target.boundingBox();assert.ok(box.width>=(width<1024?44:28)&&box.height>=(width<1024?44:28),JSON.stringify(box));}
 g.toolbar=await p.locator('.timetable-unified-toolbar').boundingBox();
 await p.getByRole('button',{name:'Kế hoạch',exact:true}).click();
 const plans=p.getByRole('combobox',{name:'Phương án xếp lịch',exact:true});await plans.selectOption('B');assert.equal(await plans.inputValue(),'B');assert.ok((await plans.locator('option').allTextContents()).every(s=>s.includes('môn')&&s.includes('TC')));
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 g.planPicker=await plans.boundingBox();assert.ok(g.planPicker.width>=44&&g.planPicker.height>=(width<1024?44:28),JSON.stringify(g.planPicker));g.planLabels=await plans.locator('option').allTextContents();
 if(evidence&&[390,1440].includes(width))await p.screenshot({path:evidence+'/'+engine+'-plan-'+width+'.png',scale:'css'});
 const toggle=p.locator('button[aria-controls="timetable-filter-sidebar"]');
 if(width<1024){await toggle.click();const sheet=p.getByRole('dialog',{name:'Bộ lọc lớp học phần',exact:true});await sheet.waitFor();
 g.sheet=await sheet.boundingBox();g.backdrop=await p.locator('.timetable-sheet-backdrop').boundingBox();assert.equal(g.backdrop.x,0);assert.equal(g.backdrop.width,width);assert.equal(g.sheet.width,width);g.footerDisplay=await sheet.locator('.timetable-sheet-footer').evaluate(e=>getComputedStyle(e).display);assert.equal(g.footerDisplay,'flex');g.sheetClose=await sheet.getByRole('button',{name:'Đóng bộ lọc lớp học phần',exact:true}).boundingBox();assert.ok(g.sheetClose.width>=44&&g.sheetClose.height>=44);
 await p.keyboard.press('Shift+Tab');assert.equal(await sheet.evaluate(e=>e.contains(document.activeElement)),true);await p.keyboard.press('Tab');assert.equal(await sheet.evaluate(e=>e.contains(document.activeElement)),true);
 if(evidence&&width===390)await p.screenshot({path:evidence+'/'+engine+'-sheet-390.png',scale:'css'});
 const pos=await p.evaluate(()=>({y:document.body.style.position==='fixed'?-parseFloat(document.body.style.top):scrollY,top:document.querySelector('[data-schedule-calendar]').getBoundingClientRect().y}));
 await sheet.getByRole('button',{name:/^Đợt/}).click();await sheet.getByRole('checkbox',{name:'Đợt 2',exact:true}).check();
 await sheet.getByRole('button',{name:/Áp dụng bộ lọc/}).click();await sheet.waitFor({state:'detached'});assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 const after=await p.evaluate(()=>({y:scrollY,top:document.querySelector('[data-schedule-calendar]').getBoundingClientRect().y}));assert.ok(Math.abs(after.y-pos.y)<2);assert.ok(Math.abs(after.top-pos.top)<2);g.scrollRestoration={before:pos,after};assert.equal(await toggle.evaluate(e=>e===document.activeElement),true);
 await toggle.click();await sheet.waitFor();assert.equal(await sheet.getByRole('checkbox',{name:'Đợt 2',exact:true}).isChecked(),true);await p.keyboard.press('Escape');await sheet.waitFor({state:'detached'});await toggle.click();await sheet.waitFor();await p.mouse.click(1,1);await sheet.waitFor({state:'detached'});assert.equal(await toggle.evaluate(e=>e===document.activeElement),true);
 }else{assert.equal(await p.locator('#timetable-filter-sidebar').isVisible(),true);assert.equal(await p.getByRole('button',{name:'Thu gọn bộ lọc',exact:true}).count(),0);await toggle.click();assert.equal(await p.locator('#timetable-filter-sidebar').isVisible(),false);}
 assert.equal(await p.getByRole('button',{name:'Xóa tất cả bộ lọc',exact:true}).count(),1);
 if(width===390){
 await toggle.click();const sheet=p.getByRole('dialog',{name:'Bộ lọc lớp học phần',exact:true});await sheet.waitFor();
 await sheet.getByRole('button',{name:/^Môn học/}).click();const search=sheet.getByPlaceholder('Tìm tên môn hoặc mã học phần...');await search.fill('Fixture subject');
 await p.setViewportSize({width:390,height:240});
 await p.waitForFunction(()=>[...document.querySelectorAll('.timetable-filter-sheet > header button,.timetable-sheet-footer button')].every(e=>{const r=e.getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight+1;}));const apply=sheet.getByRole('button',{name:/Áp dụng bộ lọc/});const close=sheet.getByRole('button',{name:'Đóng bộ lọc lớp học phần'});for(const b of [await apply.boundingBox(),await close.boundingBox()])assert.ok(b.y>=0&&b.y+b.height<=241);
 await sheet.locator('.timetable-sheet-scroll').evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok(await sheet.locator('.timetable-sheet-scroll').evaluate(e=>e.scrollTop)>0);assert.equal(await search.inputValue(),'Fixture subject');await apply.click();await p.setViewportSize({width,height});
 await toggle.click();await sheet.waitFor();await p.setViewportSize({width:1024,height:768});await sheet.waitFor({state:'detached'});assert.notEqual(await p.evaluate(()=>document.body.style.position),'fixed');await p.setViewportSize({width,height});
 }
 const actions=p.getByRole('button',{name:'Thao tác',exact:true});await actions.click();await p.getByRole('menu',{name:'Thao tác thời khóa biểu'}).waitFor();await p.keyboard.press('Escape');
 await p.getByRole('button',{name:'Nhập PDF',exact:true}).click();const guide=p.getByRole('heading',{name:'Hướng dẫn nhập TKB bằng PDF',exact:true});await guide.waitFor();await guide.locator('../..').getByRole('button').click();
 clean(f);
 }catch(error){console.error(JSON.stringify({width,errors:f.errors}));if(evidence)await p.screenshot({path:evidence+'/'+engine+'-failure-'+width+'.png'});throw error;}finally{await f.context.close();}
 }measurements.push(...rows);
});


test(engine+' mobile toolbar keeps filters and calendar in two rows',{timeout:150000},async()=>{
 const rows=[];
 for(const width of [320,360,375,390,430]){
 const f=await fixture({width,height:width===320?568:844,preference:'true'}),p=f.page;
 try{
 await p.getByRole('heading',{name:'Thời khóa biểu',exact:true}).waitFor();
 const measure=()=>p.evaluate(()=>{const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};const period=document.querySelector('.timetable-period-trigger');return {toolbar:box('.timetable-unified-toolbar'),actions:box('.timetable-filter-actions'),chips:box('.timetable-filter-chips'),chip:box('.timetable-semester-chip'),navigation:box('.timetable-calendar-navigation'),calendar:box('[data-schedule-calendar]'),period:box('.timetable-period-trigger'),periodWhiteSpace:getComputedStyle(period).whiteSpace,periodClipped:period.scrollHeight>period.clientHeight+1,pageOverflow:document.documentElement.scrollWidth>innerWidth+1};});
 let g=await measure();
 assert.equal(g.pageOverflow,false,JSON.stringify({width,g}));
 assert.ok(Math.abs(g.actions.y-g.chip.y)<8,JSON.stringify({width,g}));
 assert.ok(g.navigation.y>=g.actions.bottom-1&&g.navigation.bottom<=g.toolbar.bottom+1,JSON.stringify({width,g}));
 assert.ok(Math.abs(g.calendar.y-g.toolbar.bottom)<3,JSON.stringify({width,g}));
 assert.equal(g.periodWhiteSpace,'nowrap');assert.equal(g.periodClipped,false);
 assert.match(await p.getByRole('button',{name:'Lịch cá nhân',exact:true}).innerText(),width<768?/Cá nhân/:/Lịch cá nhân/);
 assert.equal(await p.getByRole('button',{name:'Xóa tất cả bộ lọc',exact:true}).isVisible(),false);
 rows.push({width,mode:'personal',...g});
 if(evidence)await p.screenshot({path:`${evidence}/${engine}-two-row-${width}.png`,scale:'css'});
 await p.getByRole('button',{name:'Kế hoạch',exact:true}).click();g=await measure();
 assert.equal(g.pageOverflow,false,JSON.stringify({width,g}));
 assert.ok(Math.abs(g.actions.y-g.chip.y)<8,JSON.stringify({width,g}));
 assert.ok(g.chip.right<=g.toolbar.right+1,JSON.stringify({width,g}));
 rows.push({width,mode:'plan',...g});
 if(evidence)await p.screenshot({path:`${evidence}/${engine}-two-row-plan-${width}.png`,scale:'css'});
 await p.getByRole('button',{name:'Bỏ lọc học kỳ',exact:true}).click();
 assert.equal(await p.locator('.timetable-semester-chip').count(),0);
 assert.equal(await p.getByRole('button',{name:'Xóa tất cả bộ lọc',exact:true}).count(),0);
 clean(f);
 }finally{await f.context.close();}
 }
 if(evidence)fs.writeFileSync(`${evidence}/${engine}-two-row-measurements.json`,JSON.stringify(rows,null,2)+'\n');
});

test(engine+' timetable control density',{timeout:180000},async()=>{
 const before=process.env.DENSITY_BEFORE==='1',rows=[];
 for(const width of process.env.DENSITY_WIDTHS?process.env.DENSITY_WIDTHS.split(',').map(Number):[360,390,1440])for(const role of process.env.DENSITY_ROLES?process.env.DENSITY_ROLES.split(','):['student','guest']){
 const f=await fixture({width,height:width===1440?900:844,role,preference:process.env.DENSITY_EXPANDED==='1'?'true':undefined}),p=f.page;
 try{
 await p.getByRole('heading',{name:'Thời khóa biểu',exact:true}).waitFor();
 const selectors=['.timetable-mode button','.timetable-header-actions > button','.timetable-header-actions .schedule-actions-trigger','.timetable-filter-actions > button','.timetable-calendar-navigation button','.timetable-view-select select','.timetable-filter-chips button','.timetable-filter-chips > span'];
 const data=await p.evaluate(selectors=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,modeBorder:getComputedStyle(document.querySelector('.timetable-mode')).borderTopWidth,toolbarHeight:document.querySelector('.timetable-unified-toolbar').getBoundingClientRect().height,controls:selectors.flatMap(selector=>[...document.querySelectorAll(selector)].filter(e=>e.getClientRects().length>0).map(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e),surface=getComputedStyle(e,'::before');return {selector,name:e.getAttribute('aria-label')||e.textContent.trim(),box:{x:b.x,y:b.y,width:b.width,height:b.height},font:parseFloat(s.fontSize),weight:s.fontWeight,opacity:s.opacity,disabled:e.disabled,surface:{height:parseFloat(surface.height),display:surface.display,border:surface.borderTopWidth,radius:surface.borderRadius},icon:e.querySelector('svg')?.getBoundingClientRect().width};}))}),selectors);
 rows.push({role,...data});
 if(evidence&&[390,1440].includes(width))await p.screenshot({path:evidence+'/'+engine+'-density-'+(before?'before':'after')+'-'+width+'-'+role+'.png',scale:'css'});
 if(evidence&&width===1440){const header=await p.locator('.timetable-page-header').boundingBox(),bar=await p.locator('.timetable-unified-toolbar').boundingBox();await p.screenshot({path:evidence+'/'+engine+'-toolbar-'+(before?'before':'after')+'-'+role+'.png',scale:'css',clip:{x:header.x,y:header.y,width:header.width,height:bar.y+bar.height-header.y+40}});}
 if(!before){
 assert.equal(data.overflow,false,JSON.stringify({width,role,data}));assert.equal(data.modeBorder,'0px');
 const unframed=await p.locator('.timetable-mode button,.timetable-date-navigation button,.timetable-view-buttons button,.timetable-filter-actions > button:nth-child(2),.timetable-filter-chips > button:not(.timetable-semester-chip),.timetable-filter-chips > span > button').evaluateAll(nodes=>nodes.map(e=>({label:e.textContent.trim(),border:getComputedStyle(e,'::before').borderTopWidth})));for(const item of unframed)assert.equal(item.border,'0px',JSON.stringify(item));
 for(const c of data.controls){if(c.selector==='.timetable-view-select select'){assert.ok(c.box.height>=44&&c.box.width>=44);assert.ok(c.font>=16);const native=p.getByRole('combobox',{name:'Chế độ xem lịch'});await native.selectOption('month');assert.equal(await p.getByRole('button',{name:'Tháng sau',exact:true}).isVisible(),true);await native.selectOption('week');continue;}if(c.selector==='.timetable-filter-chips > span'){assert.ok(c.surface.height>=24&&c.surface.height<=25,JSON.stringify(c));continue;}if(c.name==='Bỏ lọc học kỳ'){assert.ok(c.box.height>=(width<1024?44:28));assert.ok(c.surface.height>=24&&c.surface.height<=25,JSON.stringify(c));continue;}
 assert.ok(c.box.height>=(width<1024?44:c.selector.includes('header')||c.selector.includes('mode')?32:28),JSON.stringify(c));
 assert.ok(c.font>=12&&c.font<=13.1,JSON.stringify(c));assert.ok(c.surface.height>=28&&c.surface.height<=32.1,JSON.stringify(c));assert.equal(c.opacity,'1');}
 const pdf=p.getByRole('button',{name:'Nhập PDF',exact:true});assert.equal(await pdf.isDisabled(),role==='guest');assert.equal(await pdf.locator('svg').count(),role==='guest'?2:1);
 assert.equal(await p.getByRole('button',{name:'Xem danh sách lớp',exact:true}).isDisabled(),role==='guest');
 const action=p.getByRole('button',{name:'Thao tác',exact:true}),box=await action.boundingBox();if(width<1024)await p.mouse.click(box.x+box.width/2,box.y+2);else await action.click();await p.getByRole('menu',{name:'Thao tác thời khóa biểu'}).waitFor();await p.waitForFunction(()=>!!document.activeElement?.closest('[role=menu]'));assert.equal(await action.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');await p.keyboard.press('Escape');await p.getByRole('menu',{name:'Thao tác thời khóa biểu'}).waitFor({state:'detached'});assert.equal(await action.evaluate(e=>e===document.activeElement),true);
 await p.getByRole('button',{name:'Hôm nay',exact:true}).click();await p.getByRole('button',{name:'Tuần sau',exact:true}).click();await p.getByRole('button',{name:'Tuần trước',exact:true}).click();
 }
 clean(f);
 }finally{await f.context.close();}
 }
 if(evidence)fs.writeFileSync(evidence+'/'+engine+'-density-'+(before?'before':'after')+'.json',JSON.stringify(rows,null,2)+'\n');
});


test(engine+' compact controls allow enlarged text and spacing',{timeout:90000},async()=>{
 const f=await fixture({width:390,height:844}),p=f.page;
 try{
 await p.getByRole('heading',{name:'Thời khóa biểu',exact:true}).waitFor();await p.getByRole('button',{name:'Kế hoạch',exact:true}).click();await p.getByRole('combobox',{name:'Phương án xếp lịch'}).selectOption('B');
 const style=await p.addStyleTag({content:'html{font-size:28px!important}'});
 const check=async()=>{const result=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,clipped:[...document.querySelectorAll('.timetable-page-header button,.timetable-unified-toolbar button')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().width>0).filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>e.textContent.trim())}));assert.equal(result.overflow,false,JSON.stringify(result));assert.deepEqual(result.clipped,[]);};
 await frame(p);await check();assert.ok(await p.getByRole('button',{name:'Hôm nay',exact:true}).evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=25.9);
 if(evidence)await p.screenshot({path:evidence+'/'+engine+'-density-text200.png',scale:'css'});
 await style.evaluate(e=>e.textContent='html{font-size:14px!important}.timetable-page-header *,.timetable-unified-toolbar *{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}');await frame(p);await check();assert.equal(await p.getByRole('combobox',{name:'Phương án xếp lịch'}).inputValue(),'B');
 clean(f);
 }finally{await f.context.close();}
});


test(engine+' calendar navigation cluster preserves handlers',async()=>{
 const f=await fixture({width:390,height:844}),p=f.page;
 try{
 const period=p.locator('.timetable-period-trigger');await period.click();await p.getByRole('button',{name:/^Tuần 7 /}).click();assert.match(await period.innerText(),/Tuần 7/);
 await p.getByRole('button',{name:'Tuần trước',exact:true}).click();assert.match(await period.innerText(),/Tuần 6/);await p.getByRole('button',{name:'Tuần sau',exact:true}).click();assert.match(await period.innerText(),/Tuần 7/);
 await p.getByRole('button',{name:'Tháng',exact:true}).click();const month=await period.innerText();await p.getByRole('button',{name:'Tháng sau',exact:true}).click();assert.notEqual(await period.innerText(),month);await p.getByRole('button',{name:'Tháng trước',exact:true}).click();assert.equal(await period.innerText(),month);
 clean(f);
 }finally{await f.context.close();}
});
