import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { jsPDF } from 'jspdf';
import { chromium, webkit, devices } from 'playwright-core';
const engine = process.env.ACTIONS_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const before = process.env.ACTIONS_BASELINE === '1';
const evidence = process.env.ACTIONS_EVIDENCE_DIR;
if (evidence)
    fs.mkdirSync(evidence, { recursive: true });
const measurements = [];
const server = await createServer({ configFile: false, envDir: false, plugins: [{name:'isolated-turnstile-fixture',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/components/TurnstileBox.tsx'))return `import {useEffect} from 'react'; export const hasTurnstileSiteKey=true; export function TurnstileBox({onTokenChange}){useEffect(()=>onTokenChange('fixture-only-turnstile-token'),[onTokenChange]);return null;}`;}}, ...(before ? [{ name: 'task08-baseline', enforce: 'pre', transform(code, id) { const file=id.replaceAll('\\','/').split('/').at(-1); if (['ScheduleBoard.tsx','MobileSchedule.tsx'].includes(file)) return execFileSync('git',['show',`69672040488df01e8eada26a5e9ec628b51458c3:components/${file}`],{encoding:'utf8'}); } }] : []), react()], cacheDir: 'node_modules/.vite-schedule-actions', optimizeDeps: { entries: ['tests/schedule-filter-collapse-harness.html'] }, server: { host:'127.0.0.1',port:0,hmr:false,watch:null }, logLevel:'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await (engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' }));
console.log(`AUTOMATED_ENGINE=${engine}; VERSION=${browser.version()}; REAL_DEVICE=NOT_VERIFIED`);
test.after(async () => {
    await browser.close(); await server.close();
    if (!evidence || !measurements.length) return;
    fs.writeFileSync(`${evidence}/${engine}-${before ? 'before' : 'after'}-measurements.json`, JSON.stringify(measurements,null,2)+'\n');
});
const pref = 'hub_timetable_filter_sidebar_expanded_v1';
const catalog = Array.from({ length: 65 }, (_, i) => ({ id: `fixture-${i}`, course_code: `FIX${i}`, subject_name: `Fixture subject ${i}`, credits: 3, shift: 'S', day_of_week: '2', weeks: '1-15', room: 'Fixture room', campus: 'Fixture campus', semester: 'HK1_2026_2027', phase: i % 2 ? '2' : '1', academic_program: 'Chính quy chuẩn', major: 'Fixture major', cohort: 'K52', group_name: 'Fixture group', instructor: 'Fixture instructor', scheduleSessions: [] }));
async function fixture({ width = 375, height = 667, role = 'student', standalone = false, preference, blocked = false, empty = false } = {}) {
    const context = await browser.newContext({ ...width < 768 ? devices['iPhone 13'] : {}, viewport: { width, height } });
    await context.addInitScript(({ standalone, preference, blocked, pref }) => {
        const arrayBuffer=File.prototype.arrayBuffer;
        File.prototype.arrayBuffer=async function(){if(this.name==='task08-fixture.pdf')await new Promise(resolve=>{window.__releaseTask08Pdf=resolve;});return arrayBuffer.call(this);};
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
        if (request.method()==='GET' && url.origin === new URL(base).origin && (!['fetch', 'xhr'].includes(request.resourceType()) || /^\/(node_modules|@vite|@id|@fs|assets|tests)\//.test(url.pathname)))
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
        if (url.pathname === '/api/user/v1/schedules') return route.fulfill({json:{success:true,data:role==='guest'||empty?[]:[{...catalog[0],user_schedule_id:'fixture-row',labels:[],scheduleSessions:[{id:'fixture-session',dayOfWeek:'2',shift:'S',startTime:'07:00',endTime:'11:05',weeks:Array.from({length:26},(_,i)=>i+1),room:'Fixture room',campus:'TD',instructor:'Fixture instructor'}]}],revisions:{HK1_2026_2027:1}}});
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
    page.on('pageerror', e => errors.push(e.stack || e.message));
    page.on('console', m => { if (['error', 'warning'].includes(m.type()))
        errors.push(m.text()); });
    await page.goto(`${base}tests/schedule-filter-collapse-harness.html?role=${role}`, { waitUntil: 'networkidle', timeout: 120000 });
    return { context, page, calls, errors, writes };
}
const frame = page => page.evaluate(() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const clean = f => {assert.deepEqual(f.errors,[]);assert.deepEqual(f.writes,[]);};
async function geometry(page) {
 return page.evaluate(() => {
  const trigger=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Thao tác');
  const report=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Báo lỗi') && b.getClientRects().length);
  const bar=trigger?.parentElement.parentElement || (report?.parentElement.classList.contains('grid-cols-4') ? report?.parentElement : report?.parentElement?.parentElement);
  const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  return {bar:box(bar),trigger:box(trigger),legacyReport:box(report),menu:box(document.querySelector('[role=menu][aria-label="Thao tác thời khóa biểu"]')),renderedActionButtons:[...bar?.querySelectorAll('button')||[]].filter(b=>b.getClientRects().length).length,visibleActionButtons:[...bar?.querySelectorAll('button')||[]].filter(b=>{const r=b.getBoundingClientRect(),clip=bar.getBoundingClientRect();return b.getClientRects().length&&r.x>=Math.max(0,clip.x)&&r.right<=Math.min(innerWidth,clip.right)&&r.y>=Math.max(0,clip.y)&&r.bottom<=Math.min(innerHeight,clip.bottom);}).length,scroll:[scrollX,scrollY],internal:[...document.querySelectorAll('.mobile-main,[data-overlay-scroll-root],main')].filter(e=>e.scrollHeight>e.clientHeight).map(e=>[e.scrollLeft,e.scrollTop]),overflow:document.documentElement.scrollWidth>innerWidth+1,viewport:[innerWidth,innerHeight]};
 });
}
async function capture(page,name){if(evidence)await page.screenshot({path:`${evidence}/${engine}-${name}.png`,scale:'css'});}
if(before) for(const [width,height,standalone] of [[375,667,false],[390,844,false],[1440,900,false],[375,667,true]]) test(`${engine} before ${width} ${standalone?'PWA':'browser'}`,async()=>{
 const f=await fixture({width,height,standalone});try{await f.page.getByRole('button',{name:standalone?'Báo lỗi':'Báo lỗi môn',exact:true}).filter({visible:true}).waitFor();
 const g=await geometry(f.page);await capture(f.page,`before-${width}${standalone?'-pwa':''}`);if(standalone){await f.page.getByRole('button',{name:'Tổng quát',exact:true}).click();await frame(f.page);const rows=f.page.getByText(/^Tuần 1\s*\(/);g.existingWeekSelector={renderedRows:await rows.count(),visibleRows:await rows.filter({visible:true}).count()};assert.ok(g.existingWeekSelector.renderedRows>0);assert.equal(g.existingWeekSelector.visibleRows,0);}measurements.push({width,height,standalone,...g});clean(f);
 }finally{await f.context.close();}
});


const trigger = p => p.getByRole('button',{name:'Thao tác',exact:true});
const menu = p => p.getByRole('menu',{name:'Thao tác thời khóa biểu'});
const item = (p,name) => menu(p).getByRole('menuitem',{name,exact:true});
const labels=['Thêm vào lịch','Báo lỗi môn','Yêu cầu thêm môn','Nhập PDF'];
const menuPositions=new WeakMap();
async function show(p){await trigger(p).scrollIntoViewIfNeeded();const before=await geometry(p);menuPositions.set(p,before);await trigger(p).click();await menu(p).waitFor();await frame(p);const after=await geometry(p);assert.deepEqual(after.scroll,before.scroll,'opening menu preserves document scroll');assert.deepEqual(after.internal,before.internal,'opening menu preserves internal scroll');assert.equal(after.trigger.y,before.trigger.y,'opening menu preserves trigger anchor');}
async function restored(p){await frame(p);const before=menuPositions.get(p),after=await geometry(p);assert.deepEqual(after.scroll,before.scroll,'closing the action dialog restores its own opening document position');assert.deepEqual(after.internal,before.internal,'closing the action dialog restores internal scrollers');}
async function closeModal(p,heading,fromMenu=true){const h=p.getByRole('heading',{name:heading,exact:true});await h.waitFor();await h.locator('xpath=ancestor::div[./button][1]').getByRole('button').first().click();await h.waitFor({state:'hidden'});if(fromMenu)await restored(p);}
function bounds(box,width,height){assert.ok(box && box.x>=11 && box.y>=11 && box.x+box.width<=width-11 && box.y+box.height<=height-11,JSON.stringify({box,width,height}));}
if(!before) for(const [width,height] of [[360,640],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1440,900]]) test(`${engine} ${width}: actual schedule actions, geometry, forms, scroll and keyboard`,async()=>{
 const f=await fixture({width,height}),p=f.page;
 try {
  await trigger(p).waitFor();assert.equal(await trigger(p).count(),1);assert.equal(await menu(p).count(),0);
  assert.equal(await p.getByText('Mới: Gắn nhãn, tùy chỉnh lịch học cá nhân!',{exact:true}).count(),0);
  await trigger(p).scrollIntoViewIfNeeded();const initial=await geometry(p);
  assert.ok(initial.trigger.width>=44&&initial.trigger.height>=44);assert.equal(initial.visibleActionButtons,1);assert.equal(initial.overflow,false);
  for(const name of ['Báo lỗi môn','Yêu cầu thêm','Nhập PDF'])assert.equal(await p.getByRole('button',{name,exact:true}).count(),0);
  await show(p);assert.equal(await trigger(p).getAttribute('aria-expanded'),'true');assert.equal(await trigger(p).getAttribute('aria-controls'),await menu(p).getAttribute('id'));
  assert.deepEqual(await menu(p).getByRole('menuitem').allTextContents(),labels);assert.equal(await menu(p).getByText(/Gắn nhãn/).count(),0);
  const targets={};for(const name of labels){const b=await item(p,name).boundingBox();targets[name]=b;assert.ok(b.width>=44&&b.height>=44,JSON.stringify(b));assert.equal(await item(p,name).isDisabled(),false);}
  const opened=await geometry(p);bounds(opened.menu,width,height);assert.deepEqual(opened.scroll,initial.scroll);assert.equal(opened.overflow,false);
  if([375,390,1440].includes(width)){await capture(p,`after-${width}`);}
  await p.keyboard.press('End');assert.equal(await item(p,'Nhập PDF').evaluate(e=>document.activeElement===e),true);
  await p.keyboard.press('ArrowDown');assert.equal(await item(p,'Thêm vào lịch').evaluate(e=>document.activeElement===e),true);
  await p.keyboard.press('ArrowUp');assert.equal(await item(p,'Nhập PDF').evaluate(e=>document.activeElement===e),true);
  await p.keyboard.press('Home');await p.keyboard.press('Escape');assert.equal(await menu(p).count(),0);assert.equal(await trigger(p).evaluate(e=>document.activeElement===e),true);
  await p.keyboard.press('ArrowDown');await menu(p).waitFor();await p.keyboard.press('Tab');assert.equal(await menu(p).count(),0);assert.equal(await p.evaluate(()=>!!document.activeElement.closest('.schedule-actions-menu')),false);
  await trigger(p).focus();await p.keyboard.press('ArrowUp');await menu(p).waitFor();await p.keyboard.press('Shift+Tab');assert.equal(await menu(p).count(),0);
  await show(p);if(width<768)await p.getByRole('heading',{name:'Thời khóa biểu',exact:true}).tap();else await p.getByRole('heading',{name:'Thời khóa biểu',exact:true}).click();assert.equal(await menu(p).count(),0);
  await show(p);await item(p,'Thêm vào lịch').click();const dialog=p.getByRole('dialog',{name:'Thêm vào lịch thiết bị'});await dialog.waitFor();assert.equal(await menu(p).count(),0);assert.ok(await dialog.getByText(/1 môn/).count()>0);await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
  assert.equal(await trigger(p).evaluate(e=>document.activeElement===e),true);await restored(p);
  await show(p);await item(p,'Báo lỗi môn').click();await p.getByPlaceholder('Mã học phần (VD: ACC718_2521_L04)').fill('LOCAL-DRAFT');await closeModal(p,'Báo lỗi môn học');
  await show(p);await item(p,'Báo lỗi môn').click();assert.equal(await p.getByPlaceholder('Mã học phần (VD: ACC718_2521_L04)').inputValue(),'');await closeModal(p,'Báo lỗi môn học');
  await show(p);await item(p,'Yêu cầu thêm môn').click();await p.getByRole('heading',{name:'Yêu cầu thêm môn',exact:true}).waitFor();await closeModal(p,'Yêu cầu thêm môn');
  await show(p);await item(p,'Nhập PDF').click();await p.getByRole('heading',{name:'Hướng dẫn nhập TKB bằng PDF'}).waitFor();await closeModal(p,'Hướng dẫn nhập TKB bằng PDF');
  const final=await geometry(p);assert.equal(final.overflow,false); // Tab may intentionally scroll to the next focusable control; each menu/dialog cycle is checked independently.
  measurements.push({width,height,initial,opened,final,targets,keyboard:'PASS',actions:labels.map(label=>({label,enabled:true,opensExistingModal:true}))});clean(f);
 } catch(e){await capture(p,`failure-${width}`);console.error(JSON.stringify({width,errors:f.errors,geometry:await geometry(p)}));throw e;} finally{await f.context.close();}
});
if(!before) for(const options of [{role:'guest'},{empty:true},{role:'guest',standalone:true},{empty:true,standalone:true}]) test(`${engine} disabled ${JSON.stringify(options)}`,async()=>{
 const f=await fixture(options),p=f.page;try{await show(p);const state={};for(const label of labels){const disabled=options.role==='guest'||label==='Thêm vào lịch';state[label]=disabled;assert.equal(await item(p,label).isDisabled(),disabled);if(disabled){await item(p,label).dispatchEvent('click');assert.equal(await menu(p).isVisible(),true);}}
 if(options.role==='guest'){const before=await geometry(p);await p.keyboard.press('Home');await p.keyboard.press('End');assert.deepEqual((await geometry(p)).scroll,before.scroll);assert.equal(await menu(p).isVisible(),true);}await p.keyboard.press('Escape');assert.equal(await menu(p).count(),0);assert.equal(await trigger(p).evaluate(e=>document.activeElement===e),true);measurements.push({case:'disabled',...options,state});clean(f);
 }finally{await f.context.close();}
});
if(!before) test(`${engine} positioning tracks scroll, orientation and short visual viewport`,async()=>{
 const f=await fixture(),p=f.page;try{
 await show(p);await p.evaluate(()=>scrollBy(0,80));await frame(p);let g=await geometry(p);bounds(g.menu,375,667);assert.ok(Math.abs(g.menu.y-(g.trigger.y+g.trigger.height+6))<2 || Math.abs(g.menu.y+g.menu.height+6-g.trigger.y)<2);
 await p.setViewportSize({width:667,height:375});await frame(p);if(!await menu(p).count())await show(p);g=await geometry(p);bounds(g.menu,667,375);
 await p.keyboard.press('Escape');await p.setViewportSize({width:390,height:240});await trigger(p).scrollIntoViewIfNeeded();await show(p);g=await geometry(p);bounds(g.menu,390,240);await menu(p).evaluate(e=>e.scrollBy(0,44));await frame(p);assert.equal(await menu(p).isVisible(),true,'internal menu scroll does not dismiss');
 await item(p,'Nhập PDF').scrollIntoViewIfNeeded();await item(p,'Nhập PDF').click();await p.getByRole('heading',{name:'Hướng dẫn nhập TKB bằng PDF'}).waitFor();await closeModal(p,'Hướng dẫn nhập TKB bằng PDF');
 await p.setViewportSize({width:375,height:667});await show(p);await p.getByRole('button',{name:'Fixture route away'}).click();assert.equal(await menu(p).count(),0);assert.equal(await p.evaluate(()=>document.body.style.position),'');
 measurements.push({case:'orientation-short-viewport',geometry:g});clean(f);
 }finally{await f.context.close();}
});
if(!before) for(const role of ['admin','auditor']) test(`${engine} ${role} management unchanged and student actions gated`,async()=>{
 const f=await fixture({role}),p=f.page;try{await p.getByRole('tablist',{name:'Danh mục quản lý thời khóa biểu'}).waitFor();assert.equal(await trigger(p).count(),0);assert.equal(await p.getByRole('tab').count(),5);assert.equal(await p.getByRole('button',{name:'Thêm môn',exact:true}).filter({visible:true}).count(),1,'existing management UI is unchanged; authorization covered by authority regressions');clean(f);}finally{await f.context.close();}
});
if(!before) test(`${engine} actual MobileSchedule PWA: actions, scroll, labels, disabled and cleanup`,async()=>{
 const f=await fixture({standalone:true}),p=f.page;try{await p.locator('.mobile-schedule-page').waitFor();await show(p);assert.equal(await p.locator('#mode').textContent(),'standalone');assert.equal(await trigger(p).count(),1);assert.deepEqual(await menu(p).getByRole('menuitem').allTextContents(),labels);
 for(const label of labels){assert.equal(await item(p,label).isDisabled(),false);const b=await item(p,label).boundingBox();assert.ok(b.height>=44);}
 const g=await geometry(p);bounds(g.menu,375,667);await capture(p,'after-375-pwa');await p.keyboard.press('Escape');
 await show(p);await item(p,'Thêm vào lịch').click();await p.getByRole('dialog',{name:'Thêm vào lịch thiết bị'}).getByRole('button',{name:'Đóng',exact:true}).click();
 await show(p);await item(p,'Báo lỗi môn').click();await closeModal(p,'Báo lỗi môn học');await show(p);await item(p,'Yêu cầu thêm môn').click();await closeModal(p,'Yêu cầu thêm môn');await show(p);await item(p,'Nhập PDF').click();await closeModal(p,'Hướng dẫn nhập TKB bằng PDF');
 assert.equal(await p.getByText('Ca học tiếp theo',{exact:true}).count(),1);await p.getByRole('heading',{name:'Lịch cá nhân',exact:true}).locator('../..').locator(':scope > div').nth(1).getByRole('button').last().click();await p.getByRole('button',{name:/^T2 /}).click();await p.getByText('Fixture subject 0',{exact:true}).filter({visible:true}).last().click();await p.getByRole('button',{name:'Gắn nhãn',exact:true}).filter({visible:true}).click();await p.getByRole('heading',{name:'Gắn nhãn nhanh'}).waitFor();await closeModal(p,'Gắn nhãn nhanh',false);measurements.push({case:'PWA',...g});clean(f);
 }finally{await f.context.close();}
});

function fixturePdf(){
 const pages=JSON.parse(fs.readFileSync('tests/fixtures/hub-schedule-11.layout.json','utf8'));
 const font=['C:/Windows/Fonts/arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(p=>fs.existsSync(p));assert.ok(font,'Unicode font is required to synthesize the anonymized PDF fixture');
 const pdf=new jsPDF({unit:'pt',format:[pages[0].width,pages[0].height]});
 pdf.addFileToVFS('Fixture.ttf',fs.readFileSync(font).toString('base64'));pdf.addFont('Fixture.ttf','Fixture','normal');pdf.setFont('Fixture');
 pages.forEach((page,index)=>{if(index)pdf.addPage([page.width,page.height]);for(const item of page.items){pdf.setFontSize(item.height);pdf.text(item.text,item.x,page.height-item.y,{horizontalScale:item.width/pdf.getTextWidth(item.text)});}});
 return Buffer.from(pdf.output('arraybuffer'));
}
if(!before) for(const standalone of [false,true]) test(`${engine} PDF guide to real PDF parser and preview, processing disabled ${standalone?'PWA':'browser'}`,async()=>{
 const f=await fixture({standalone}),p=f.page;try{
 await show(p);await item(p,'Nhập PDF').click();await p.getByRole('heading',{name:'Hướng dẫn nhập TKB bằng PDF'}).waitFor();
 // Only the local Vite fixture replaces Turnstile's external UI; application
 // guards and handlers are unchanged. Exercise the real guide -> input ref.
 const chooser=p.waitForEvent('filechooser');await p.getByRole('button',{name:'Chọn file PDF',exact:true}).click();
 await (await chooser).setFiles({name:'task08-fixture.pdf',mimeType:'application/pdf',buffer:fixturePdf()});
 await show(p);assert.equal(await item(p,'Nhập PDF').isDisabled(),true);await item(p,'Nhập PDF').dispatchEvent('click');assert.equal(await p.getByRole('heading',{name:'Hướng dẫn nhập TKB bằng PDF'}).count(),0);await p.evaluate(()=>window.__releaseTask08Pdf());
 await p.getByRole('heading',{name:'Xem trước thời khóa biểu'}).waitFor({timeout:45000});await menu(p).waitFor({state:'hidden'});assert.equal(await p.getByRole('group').filter({has:p.locator('input')}).count()>0,true);
 const debug=await p.evaluate(()=>JSON.parse(localStorage.getItem('hub_last_schedule_import_debug')));assert.equal(debug.stage,'hub-layout-parsed');assert.equal(debug.courseCount,11);
 assert.equal(await p.getByRole('group').count(),11);await p.getByRole('button',{name:'Đóng',exact:true}).click();assert.equal(await trigger(p).evaluate(e=>document.activeElement===e),true);
 await show(p);assert.equal(await item(p,'Nhập PDF').isDisabled(),false);await p.keyboard.press('Escape');measurements.push({case:'PDF',standalone,parser:debug.stage,courses:debug.courseCount,busyDisabled:true,fileChooser:true});clean(f);
 }catch(e){console.error(JSON.stringify({case:'PDF',standalone,errors:f.errors,stubbedAssets:f.calls.filter(c=>c.path.startsWith('/node_modules')||c.path.includes('worker')),debug:await p.evaluate(()=>localStorage.getItem('hub_last_schedule_import_debug')),body:(await p.locator('body').innerText()).slice(-1600)}));throw e;}finally{await f.context.close();}
});
if(!before) test(`${engine} week/month dropdown ownership, plans and contextual labels remain reachable`,async()=>{
 const f=await fixture({width:390,height:844}),p=f.page;try{
 await trigger(p).waitFor();await p.getByRole('button',{name:'Tổng quát',exact:true}).click();await p.getByRole('button',{name:'Hiển thị Tổng quát',exact:true}).waitFor();
 await show(p);assert.equal(await p.getByRole('button',{name:'Hiển thị Tổng quát',exact:true}).count(),0);
 await p.getByRole('button',{name:'Tháng',exact:true}).click();assert.equal(await menu(p).count(),0);
 await p.getByRole('button',{name:'Tuần',exact:true}).click();await p.getByRole('button',{name:'Tổng quát',exact:true}).click();await p.getByRole('button',{name:/^Tuần 7 /}).click();
 const tag=p.getByRole('button',{name:/^Gắn nhãn( cho ngày này)?$/}).filter({visible:true}).first();await tag.click();await p.getByRole('heading',{name:'Gắn nhãn nhanh'}).waitFor();await closeModal(p,'Gắn nhãn nhanh',false);
 await p.getByRole('button',{name:'Kế hoạch',exact:true}).click();for(const key of ['A','B','C']){await p.getByRole('button',{name:`KH ${key}`,exact:true}).click();await show(p);await p.keyboard.press('Escape');assert.ok((await p.getByRole('button',{name:`KH ${key}`,exact:true}).getAttribute('class')).includes('bg-white'));}
 await p.getByRole('button',{name:'Lịch cá nhân',exact:true}).click();await show(p);assert.equal(await item(p,'Thêm vào lịch').isDisabled(),false);await p.keyboard.press('Escape');measurements.push({case:'week-month-plans-labels',result:'PASS'});clean(f);
 }finally{await f.context.close();}
});
