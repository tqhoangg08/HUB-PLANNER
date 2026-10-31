import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright-core';
import worker from '../cloudflare/worker/src/index.ts';

const server=await createServer({configFile:false,envDir:false,plugins:[react()],cacheDir:'node_modules/.vite-ann-admin',server:{host:'127.0.0.1',port:0,hmr:false,watch:null},optimizeDeps:{entries:['tests/admin-announcements-harness.html']},logLevel:'error'});
await server.listen();
const base=`${server.resolvedUrls!.local[0]}tests/admin-announcements-harness.html`;
const executable=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
assert.ok(executable,'Chrome is required for announcement browser acceptance; no silent skip.');
const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
test.after(async()=>{await browser.close();await server.close();});
// Test-only cache/transport doubles. All announcement CRUD/push responses below
// come from the actual Worker and SQLite migrations, never success fixtures.
Object.assign(globalThis,{caches:{default:{match:async()=>undefined,put:async()=>undefined}}});
const fixture=async(width=1440,role='admin')=>{
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('cloudflare/migrations/0001_create_school_announcements.sql','utf8'));
  sql.exec('ALTER TABLE sync_metadata ADD COLUMN visible_row_count INTEGER; ALTER TABLE sync_metadata ADD COLUMN source_cursor TEXT;');
  for(const file of ['0023_create_event_push_deliveries.sql','0024_create_native_push_runtime.sql','0025_announcement_d1_authority.sql','0033_reduce_push_delivery_write_amplification.sql','0060_school_announcement_management.sql'])sql.exec(readFileSync(`cloudflare/migrations/${file}`,'utf8'));
  const insert=sql.prepare(`INSERT INTO school_announcements(id,title,title_search,link,date,is_new,created_at) VALUES(?,?,?,?,?,0,?)`);
  for(let id=1;id<=25;id++)insert.run(id,`Thông báo ${id} về lịch học và học phí`,`thông báo ${id} về lịch học và học phí`,`https://phongdaotao.hub.edu.vn/notice/${id}`,'2026-10-31','2026-10-31T00:00:00Z');
  const DB={prepare(query:string){let args:unknown[]=[];const stmt={bind(...values:unknown[]){args=values;return stmt;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return stmt;}};
  const signals:unknown[]=[],calls:{method:string;body:Record<string,unknown>|null;query:string}[]=[];
  const env={DB,ALLOWED_ORIGINS:'https://hotrosinhvienhub.id.vn',NOTIFICATION_JOBS_ENABLED:'true',NOTIFICATION_JOBS_MODE:'enabled',AUTH_SERVICE:{fetch:async()=>Response.json({userId:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',role})},PUSH_EVENTS_QUEUE:{send:async(message:unknown)=>{signals.push(message);}}} as never;
  const context=await browser.newContext({viewport:{width,height:900},...(width<768?{isMobile:true,hasTouch:true}:{}),serviceWorkers:'block'});
  const page=await context.newPage(), errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(20000);
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==new URL(base).origin)throw Error(`Unexpected external request: ${url.origin}`);
    if(url.pathname==='/api/admin/v1/announcements'||url.pathname==='/events'){
      const body=req.postData();calls.push({method:req.method(),body:body?JSON.parse(body):null,query:url.search});
      const response=await worker.fetch(new Request(`https://hotrosinhvienhub.id.vn${url.pathname}${url.search}`,{method:req.method(),headers:{Cookie:'fixture',...(body?{'Content-Type':'application/json'}:{})},...(body?{body}:{})}),env,{waitUntil:()=>{}} as ExecutionContext);
      return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    }
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:{data:[],total:0,candidates:[],notifications:[]}});
    return route.continue();
  });
  await page.goto(`${base}?role=${role}`,{waitUntil:'networkidle',timeout:120000});await page.getByRole('heading',{name:'Quản lý thông báo trường',exact:true}).waitFor();
  await page.locator(width<768?'.ann-mobile-rows .ann-row-title button':'.ann-table-scroll .ann-row-title button').first().waitFor();
  return {page,context,sql,signals,calls,errors,close:async()=>{await context.close();sql.close();}};
};

for(const width of [1440,390])test(`${width}: V2 content uses existing shell, real CRUD/highlight/push API and accessible detail drawer`,{timeout:120000},async()=>{
  const f=await fixture(width),p=f.page;
  try{
    assert.equal(await p.locator('.admin-shell-compact').count(),1);
    assert.equal(await p.locator('.admin-topbar').count(),1);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await p.getByRole('table',{name:'Danh sách quản lý thông báo'}).count(),width<768?0:1);
    const visibleTitles=p.locator(width<768?'.ann-mobile-rows .ann-row-title button':'.ann-table-scroll .ann-row-title button');
    await visibleTitles.first().click();
    const drawer=p.getByRole(width>=1400?'region':'dialog',{name:'Chi tiết thông báo',exact:true});await drawer.waitFor();
    assert.equal(await drawer.getByText('Tự động từ website trường',{exact:true}).count(),1);
    assert.equal(await drawer.getByRole('tab',{name:'Nội dung'}).count(),0);
    assert.equal(await drawer.getByLabel('URL nguồn',{exact:true}).getAttribute('readonly'),'');
    await drawer.getByRole('switch',{name:'Nổi bật'}).check();
    await drawer.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('.ann-admin-drawer [role="switch"]')?.getAttribute('aria-checked')==='true'||(document.querySelector('.ann-admin-drawer [role="switch"]') as HTMLInputElement)?.checked);
    await drawer.getByRole('status').filter({hasText:'Đã lưu thông báo.'}).waitFor();
    const rowId=Number(f.calls.find(call=>call.method==='PATCH')!.body!.id);
    assert.equal(f.sql.prepare('SELECT is_highlighted FROM school_announcements WHERE id=?').get(rowId)!.is_highlighted,1);
    const before=f.signals.length;p.once('dialog',dialog=>dialog.dismiss());await drawer.getByRole('button',{name:'Gửi push',exact:true}).click();assert.equal(f.signals.length,before);
    p.once('dialog',dialog=>dialog.accept());await drawer.getByRole('button',{name:'Gửi push',exact:true}).click();
    await drawer.getByText('Chờ gửi',{exact:true}).waitFor();assert.equal(f.signals.length,1);
    assert.equal(await drawer.getByRole('button',{name:'Gửi push',exact:true}).isDisabled(),true);
    f.sql.prepare("UPDATE school_announcement_push_queue SET sent_at=?,sent_count=2 WHERE announcement_id=?").run(new Date().toISOString(),rowId);
    await drawer.getByText('Đã gửi',{exact:true}).waitFor();
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM school_announcement_push_queue').get()!.n,1);
    mkdirSync('.cache/admin-announcements-qa',{recursive:true});await p.screenshot({path:`.cache/admin-announcements-qa/${width}.png`,fullPage:false});
    await drawer.getByRole('button',{name:'Đóng chi tiết'}).click();
    await p.getByRole('button',{name:'Thêm thông báo',exact:true}).click();const form=p.getByRole(width>=1400?'region':'dialog',{name:'Thêm thông báo',exact:true});
    await form.getByLabel('Tiêu đề',{exact:true}).fill('Thông báo thêm qua giao diện');await form.getByLabel('URL nguồn',{exact:true}).fill('https://hub.edu.vn/notice/manual');await form.getByLabel('Ngày đăng',{exact:true}).fill('2026-10-30');
    await form.getByRole('button',{name:'Lưu thay đổi'}).click();await p.getByRole('status').filter({hasText:'Đã lưu thông báo.'}).waitFor();
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM school_announcements WHERE source_kind=?').get('manual')!.n,1);
    await p.getByRole('button',{name:'Đóng chi tiết'}).click();
    await p.getByLabel('Tìm thông báo',{exact:true}).fill('thêm qua giao diện');await p.waitForTimeout(400);await visibleTitles.filter({hasText:'Thông báo thêm qua giao diện'}).waitFor();
    assert.equal(await visibleTitles.count(),1);
    const manualId=Number(f.sql.prepare('SELECT id FROM school_announcements WHERE source_kind=?').get('manual')!.id);
    await p.getByRole('button',{name:`Thao tác thông báo ${manualId}`,exact:true}).click();
    p.once('dialog',dialog=>dialog.accept());await p.getByRole('menuitem',{name:'Xóa thông báo',exact:true}).click();
    await p.getByRole('status').filter({hasText:'Đã xóa thông báo.'}).waitFor();assert.equal(f.sql.prepare('SELECT is_deleted FROM school_announcements WHERE id=?').get(manualId)!.is_deleted,1);
    assert.deepEqual(f.errors,[]);
  }catch(error){mkdirSync('.cache/admin-announcements-qa',{recursive:true});await p.screenshot({path:`.cache/admin-announcements-qa/${width}-failure.png`,fullPage:true});throw error;}finally{await f.close();}
});

test('filters, pagination and audit-only access do not issue mutation requests',{timeout:120000},async()=>{
  const f=await fixture(1440,'auditor'),p=f.page;
  try{
    assert.equal(await p.getByRole('button',{name:'Thêm thông báo',exact:true}).count(),0);
    await p.getByRole('button',{name:'Trang sau',exact:true}).click();await p.waitForTimeout(150);
    assert.ok(f.calls.some(call=>new URLSearchParams(call.query).get('offset')==='20'));
    await p.getByRole('button',{name:'Bộ lọc',exact:true}).click();await p.getByLabel('Từ ngày',{exact:true}).fill('2026-11-01');
    await p.getByText('Không có thông báo phù hợp.',{exact:true}).waitFor();
    await p.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();await p.locator('.ann-table-scroll .ann-row-title button').first().click();
    const detail=p.getByRole('region',{name:'Chi tiết thông báo',exact:true});await detail.waitFor();assert.equal(await detail.getByRole('button',{name:'Gửi push',exact:true}).count(),0);assert.equal(await detail.getByLabel('Tiêu đề',{exact:true}).isDisabled(),true);
    assert.equal(f.calls.some(call=>call.method!=='GET'),false);assert.deepEqual(f.errors,[]);
  }catch(error){mkdirSync('.cache/admin-announcements-qa',{recursive:true});await p.screenshot({path:'.cache/admin-announcements-qa/auditor-failure.png',fullPage:true});throw error;}finally{await f.close();}
});

test('real student API and widget/modal show saved highlights and keep source links',{timeout:120000},async()=>{
  const f=await fixture(1440),p=f.page;
  try{
    await p.evaluate(async()=>{const response=await fetch('/api/admin/v1/announcements',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:1,expectedRevision:0,is_highlighted:true})});if(!response.ok)throw Error('fixture highlight failed');});
    await p.goto(`${base}?student=1`,{waitUntil:'networkidle'});
    const link=p.locator('#root a[href="https://phongdaotao.hub.edu.vn/notice/1"]');await link.getByLabel('Thông báo nổi bật').waitFor();assert.equal(await link.getAttribute('target'),'_blank');
    await p.getByRole('button',{name:'Xem tất cả',exact:true}).click();await p.getByRole('dialog').getByLabel('Thông báo nổi bật').waitFor();
    assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});

test('legacy date stays nullable when highlighting; a stale admin form cannot overwrite cron edits',{timeout:120000},async()=>{
  const f=await fixture(1440),p=f.page;
  try{
    f.sql.prepare('UPDATE school_announcements SET date=NULL WHERE id=25').run();
    await p.getByLabel('Tìm thông báo',{exact:true}).fill('Thông báo 25');
    await p.waitForFunction(()=>document.querySelectorAll('.ann-table-scroll .ann-row-title button').length===1);
    await p.locator('.ann-table-scroll .ann-row-title button').click();
    const drawer=p.getByRole('region',{name:'Chi tiết thông báo',exact:true});
    assert.equal(await drawer.getByLabel('Ngày đăng',{exact:true}).inputValue(),'');
    await drawer.getByRole('switch',{name:'Nổi bật'}).check();await drawer.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    await drawer.getByRole('status').filter({hasText:'Đã lưu thông báo.'}).waitFor();
    assert.equal(f.sql.prepare('SELECT date FROM school_announcements WHERE id=25').get()!.date,null);
    const body=f.calls.find(call=>call.method==='PATCH')!.body!;
    assert.equal(Object.hasOwn(body,'date'),false);assert.equal(Object.hasOwn(body,'title'),false);assert.equal(Object.hasOwn(body,'link'),false);
    await drawer.getByLabel('Tiêu đề',{exact:true}).fill('Stale admin draft');
    f.sql.prepare("UPDATE school_announcements SET title='Updated by cron',title_search='updated by cron' WHERE id=25").run();
    await drawer.getByRole('button',{name:'Lưu thay đổi',exact:true}).click();
    await drawer.getByRole('alert').filter({hasText:'Thông báo vừa được sửa ở nơi khác.'}).waitFor();
    assert.equal(f.sql.prepare('SELECT title FROM school_announcements WHERE id=25').get()!.title,'Updated by cron');assert.deepEqual(f.errors,[]);
  }finally{await f.close();}
});
