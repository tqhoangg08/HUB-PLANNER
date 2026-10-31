import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Miniflare } from 'miniflare';
import worker from '../cloudflare/worker/src/index.ts';
import { handleAdminAnnouncements, AdminAnnouncementError } from '../cloudflare/worker/src/admin-announcements.ts';
import { syncCrawledSchoolAnnouncements } from '../cloudflare/worker/src/announcement-store.ts';
import { enqueueSchoolAnnouncementPush, processNotificationOutboxItem } from '../cloudflare/worker/src/notification-cron.ts';
import { WebPushError } from '../cloudflare/worker/src/web-push.ts';
import { validateAnnouncementReleaseSchema, ANNOUNCEMENT_SCHEMA_QUERY, ANNOUNCEMENT_MIGRATION } from '../scripts/announcement-release-schema.mjs';

const origin='https://hotrosinhvienhub.id.vn';
const fixture = () => {
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('cloudflare/migrations/0001_create_school_announcements.sql','utf8'));
  sql.exec('ALTER TABLE sync_metadata ADD COLUMN visible_row_count INTEGER; ALTER TABLE sync_metadata ADD COLUMN source_cursor TEXT;');
  for(const name of ['0023_create_event_push_deliveries.sql','0024_create_native_push_runtime.sql','0025_announcement_d1_authority.sql','0033_reduce_push_delivery_write_amplification.sql'])sql.exec(readFileSync(`cloudflare/migrations/${name}`,'utf8'));
  sql.exec("INSERT INTO school_announcements(id,title,title_search,link,date,is_new,created_at,is_hidden) VALUES(1,'Thông báo cũ','thông báo cũ','https://phongdaotao.hub.edu.vn/old','2026-10-25',1,'2026-10-25T00:00:00Z',0)");
  const old=sql.prepare('SELECT * FROM school_announcements').get();
  sql.exec(readFileSync('cloudflare/migrations/0060_school_announcement_management.sql','utf8'));
  const DB={prepare(query:string){let args:unknown[]=[];const stmt={bind(...values:unknown[]){args=values;return stmt;},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};return stmt;}} as unknown as D1Database;
  let role='admin', signalFailure=false;const signals:unknown[]=[];
  const env={DB,ALLOWED_ORIGINS:origin,NOTIFICATION_JOBS_ENABLED:'true',NOTIFICATION_JOBS_MODE:'enabled',
    AUTH_SERVICE:{fetch:async()=>Response.json({userId:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',role})},
    PUSH_EVENTS_QUEUE:{send:async(message:unknown)=>{if(signalFailure)throw Error('fixture queue unavailable');signals.push(message);}},
  } as never;
  return {sql,old,env,signals,role:(value:string)=>{role=value;},failSignal:()=>{signalFailure=true;}};
};
const request=(method='GET',body?:Record<string,unknown>,query='')=>new Request(`${origin}/api/admin/v1/announcements${query}`,{method,headers:{Cookie:'fixture-session',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const call=(env:ReturnType<typeof fixture>['env'],method='GET',body?:Record<string,unknown>,query='')=>{const req=request(method,body,query);return handleAdminAnnouncements(req,new URL(req.url),env);};
const draft={title:'Học bổng học kỳ mới',link:'https://hub.edu.vn/notice/new',date:'2026-10-31',department:'Phòng Đào tạo',is_highlighted:true};

test('additive migration preserves every existing crawler column and push flag',()=>{
  const f=fixture();try{const row=f.sql.prepare('SELECT * FROM school_announcements').get()!;for(const [key,value]of Object.entries(f.old!))assert.equal(row[key],value);assert.equal(row.is_highlighted,0);assert.equal(row.source_kind,'crawler');assert.equal(row.is_deleted,0);}finally{f.sql.close();}
});
test('admin endpoint enforces Better Auth and only admin can mutate or enqueue push',async()=>{
  const f=fixture();try{
    const anonymous=await worker.fetch(new Request(`${origin}/api/admin/v1/announcements`),f.env);assert.equal(anonymous.status,401);
    f.role('user');assert.equal((await worker.fetch(request(),f.env)).status,403);
    f.role('auditor');assert.equal((await worker.fetch(request(),f.env)).status,200);
    for(const [method,body]of [['POST',draft],['PATCH',{id:1,expectedRevision:0,is_highlighted:true}],['DELETE',{id:1,expectedRevision:0}],['POST',{action:'push',id:1}]]as const)assert.equal((await worker.fetch(request(method,body),f.env)).status,403);
    assert.equal(f.signals.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM event_push_deliveries').get()!.n,0);
  }finally{f.sql.close();}
});
test('CRUD, title/URL/unit search, filters, pagination and revision conflicts use real D1 SQL',async()=>{
  const f=fixture();try{
    const added=await call(f.env,'POST',draft);const id=Number(added.data!.id);assert.equal(added.data!.source_kind,'manual');
    assert.equal((await call(f.env,'GET',undefined,'?search=đào%20tạo')).total,2);
    assert.equal((await call(f.env,'GET',undefined,'?search=HỌC%20BỔNG')).total,1);
    assert.equal((await call(f.env,'GET',undefined,'?search=notice%2Fnew')).total,1);
    assert.equal((await call(f.env,'GET',undefined,'?highlighted=true')).total,1);
    assert.equal((await call(f.env,'GET',undefined,'?startDate=2026-10-30')).total,1);
    const page=await call(f.env,'GET',undefined,'?limit=1&offset=1');assert.equal(page.data.length,1);assert.equal(page.total,2);
    await assert.rejects(call(f.env,'POST',draft),(e:unknown)=>e instanceof AdminAnnouncementError&&e.status===409);
    await call(f.env,'PATCH',{id,expectedRevision:0,is_hidden:true,is_new:1});
    assert.equal((await call(f.env,'GET',undefined,'?visibility=hidden')).total,1);
    assert.equal(f.sql.prepare('SELECT is_new FROM school_announcements WHERE id=?').get(id)!.is_new,0);
    await assert.rejects(call(f.env,'PATCH',{id,expectedRevision:0,title:'Stale edit'}),(e:unknown)=>e instanceof AdminAnnouncementError&&e.status===409);
    await call(f.env,'DELETE',{id,expectedRevision:1});
    assert.equal((await call(f.env)).total,1);assert.equal(f.sql.prepare('SELECT is_hidden FROM school_announcements WHERE id=?').get(id)!.is_hidden,1);
    assert.equal(f.sql.prepare('SELECT visible_row_count FROM sync_metadata WHERE resource=?').get('school_announcements')!.visible_row_count,1);
  }finally{f.sql.close();}
});
test('crawler retains highlights, department and tombstones without resending deleted announcements',async()=>{
  const f=fixture();try{
    await call(f.env,'PATCH',{id:1,expectedRevision:0,is_highlighted:true,department:'Đơn vị riêng'});
    const item={title:'Thông báo đã cập nhật',link:'https://phongdaotao.hub.edu.vn/old',date:new Date().toISOString().slice(0,10)};
    await syncCrawledSchoolAnnouncements(f.env,{items:[item],sources:[],complete:true});
    let row=f.sql.prepare('SELECT * FROM school_announcements WHERE id=1').get()!;assert.equal(row.is_highlighted,1);assert.equal(row.department,'Đơn vị riêng');
    await call(f.env,'DELETE',{id:1,expectedRevision:2});
    await syncCrawledSchoolAnnouncements(f.env,{items:[{...item,title:'Crawler runs again'}],sources:[],complete:true});
    row=f.sql.prepare('SELECT * FROM school_announcements WHERE id=1').get()!;assert.equal(row.is_deleted,1);assert.equal(row.is_hidden,1);assert.equal(row.is_highlighted,1);assert.equal(f.signals.length,0);
  }finally{f.sql.close();}
});
test('manual push reuses native school outbox, has one concurrent winner and reports actual progress',async()=>{
  const f=fixture();try{
    const results=await Promise.all([call(f.env,'POST',{action:'push',id:1}),call(f.env,'POST',{action:'push',id:1})]);
    assert.equal(results.filter(row=>row.inserted).length,1);assert.equal(f.signals.length,1);assert.deepEqual(f.signals[0],{v:1,type:'school',sourceId:1});
    assert.equal(results[0].data!.push_state,'queued');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM school_announcement_push_queue').get()!.n,1);
    for(const [values,expected]of [["sent_at='2026-10-31T01:00:00Z',sent_count=0",'skipped'],["sent_count=3,failed_count=1",'sent'],["sent_at=NULL,next_retry_at='2026-11-01T00:00:00Z'",'retrying'],["failed_at='2026-10-31'",'failed'],["last_error='PRE_CUTOVER_SUPPRESSED'",'suppressed']]as const){f.sql.exec(`UPDATE school_announcement_push_queue SET ${values}`);assert.equal((await call(f.env,'GET',undefined,'?id=1')).data.push_state,expected);}
    assert.equal((await call(f.env,'POST',{action:'push',id:1})).deduplicated,true);assert.equal(f.signals.length,1);
  }finally{f.sql.close();}
});
test('transport failure remains queued for recovery, hidden/deleted/disabled push cannot enqueue',async()=>{
  const f=fixture();try{
    f.failSignal();const result=await call(f.env,'POST',{action:'push',id:1});assert.equal(result.signaled,false);assert.equal(result.data!.push_state,'queued');
    await call(f.env,'PATCH',{id:1,expectedRevision:0,is_hidden:true});assert.equal(f.sql.prepare('SELECT last_error FROM school_announcement_push_queue').get()!.last_error,'ANNOUNCEMENT_HIDDEN');
    await assert.rejects(call(f.env,'POST',{action:'push',id:1}),(e:unknown)=>e instanceof AdminAnnouncementError&&e.status===409);
    await call(f.env,'DELETE',{id:1,expectedRevision:1});await assert.rejects(call(f.env,'POST',{action:'push',id:1}),(e:unknown)=>e instanceof AdminAnnouncementError&&e.status===404);
    const added=await call(f.env,'POST',draft);Object.assign(f.env,{NOTIFICATION_JOBS_ENABLED:'false'});
    await assert.rejects(call(f.env,'POST',{action:'push',id:added.data!.id}),(e:unknown)=>e instanceof AdminAnnouncementError&&e.status===503);
  }finally{f.sql.close();}
});
test('invalid URLs, dates, revisions and oversized JSON fail without writes',async()=>{
  const f=fixture();try{
    for(const patch of [{link:'javascript:alert(1)'},{link:'https://user:pass@hub.edu.vn/x'},{date:'2026-02-30'},{title:''},{is_hidden:'false'}])await assert.rejects(call(f.env,'POST',{...draft,...patch}));
    await assert.rejects(call(f.env,'PATCH',{id:1,title:'No revision'}));
    assert.equal((await worker.fetch(request('POST',{...draft,title:'x'.repeat(9000)}),f.env)).status,413);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM school_announcements').get()!.n,1);
  }finally{f.sql.close();}
});
test('student API publishes highlighted metadata but never hidden or deleted notices',async()=>{
  const f=fixture();const previous=globalThis.caches;
  Object.assign(globalThis,{caches:{default:{match:async()=>undefined,put:async()=>undefined}}});
  try{
    await call(f.env,'PATCH',{id:1,expectedRevision:0,is_highlighted:true});
    const response=await worker.fetch(new Request(`${origin}/events?resource=announcements`),f.env,{waitUntil:()=>{}} as ExecutionContext);
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.data[0].is_highlighted,true);assert.equal(result.data[0].link,'https://phongdaotao.hub.edu.vn/old');
    await call(f.env,'DELETE',{id:1,expectedRevision:1});
    const hidden=await worker.fetch(new Request(`${origin}/events?resource=announcements`),f.env,{waitUntil:()=>{}} as ExecutionContext);assert.equal((await hidden.json()).data.length,0);
  }finally{Object.assign(globalThis,{caches:previous});f.sql.close();}
});

test('manual corrections survive cron and crawler URL remains the canonical dedupe key',async()=>{
  const f=fixture();try{
    await assert.rejects(call(f.env,'PATCH',{id:1,expectedRevision:0,link:'https://hub.edu.vn/replacement'}),(e:unknown)=>e instanceof AdminAnnouncementError&&e.status===409);
    await call(f.env,'PATCH',{id:1,expectedRevision:0,title:'Tiêu đề đã đính chính',date:'2026-10-26'});
    const original={title:'Thông báo cũ',link:'https://phongdaotao.hub.edu.vn/old',date:'2026-10-25'};
    await syncCrawledSchoolAnnouncements(f.env,{items:[{...original,link:original.link+'/alias'}],sources:[],complete:true});
    const upstream={...original,title:'Tiêu đề gốc từ crawler'};
    await syncCrawledSchoolAnnouncements(f.env,{items:[upstream,{...upstream,link:original.link+'/second-alias'}],sources:[],complete:true});
    const row=f.sql.prepare('SELECT * FROM school_announcements WHERE id=1').get()!;
    assert.equal(row.title,'Tiêu đề đã đính chính');assert.equal(row.date,'2026-10-26');assert.equal(row.admin_revision,1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM school_announcements').get()!.n,1);assert.equal(f.signals.length,0);
    const added=await call(f.env,'POST',draft);
    await syncCrawledSchoolAnnouncements(f.env,{items:[{title:'Crawler copy',link:draft.link,date:'2026-10-30'}],sources:[],complete:true});
    assert.equal(f.sql.prepare('SELECT title FROM school_announcements WHERE id=?').get(Number(added.data!.id))!.title,draft.title);
  }finally{f.sql.close();}
});

test('crawler edits invalidate an open admin revision instead of allowing stale form overwrite',async()=>{
  const f=fixture();try{
    await syncCrawledSchoolAnnouncements(f.env,{items:[{title:'New upstream title',link:'https://phongdaotao.hub.edu.vn/old',date:'2026-10-26'}],sources:[],complete:true});
    await assert.rejects(call(f.env,'PATCH',{id:1,expectedRevision:0,title:'Stale form title',is_highlighted:true}),(e:unknown)=>e instanceof AdminAnnouncementError&&e.status===409);
    assert.equal(f.sql.prepare('SELECT admin_revision FROM school_announcements WHERE id=1').get()!.admin_revision,1);
  }finally{f.sql.close();}
});

const d1Fixture=async()=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("local")}}',compatibilityDate:'2026-07-29',d1Databases:['DB']});
  try{
    const DB=await mf.getD1Database('DB');
    for(const file of ['0001_create_school_announcements.sql','0023_create_event_push_deliveries.sql','0024_create_native_push_runtime.sql','0025_announcement_d1_authority.sql','0033_reduce_push_delivery_write_amplification.sql','0060_school_announcement_management.sql']){
      if(file.startsWith('0025'))await DB.exec('ALTER TABLE sync_metadata ADD COLUMN visible_row_count INTEGER; ALTER TABLE sync_metadata ADD COLUMN source_cursor TEXT;');
      if(file.startsWith('0060'))await DB.prepare("INSERT INTO school_announcements(id,title,title_search,link,date,is_new,created_at) VALUES(1,'Legacy','legacy','https://hub.edu.vn/legacy',NULL,1,NULL)").run();
      await DB.exec(readFileSync(`cloudflare/migrations/${file}`,'utf8').replace(/^\s*--.*$/gm,'').replace(/\s+/g,' '));
    }
    const signals:unknown[]=[];
    const env={DB,NOTIFICATION_JOBS_ENABLED:'true',NOTIFICATION_JOBS_MODE:'enabled',AUTH_SERVICE:{fetch:async()=>Response.json({userId:'11111111-1111-4111-8111-111111111111',email:'fixture@example.invalid',role:'admin'})},PUSH_EVENTS_QUEUE:{send:async(message:unknown)=>{signals.push(message);}}};
    return {mf,DB,signals,env};
  }catch(error){await mf.dispose();throw error;}
};

test('real D1: migration preserves legacy nullable dates; manual/automatic push share preferences, retries and dedupe',async()=>{
  const f=await d1Fixture();try{
    assert.equal(validateAnnouncementReleaseSchema((await f.DB.prepare(ANNOUNCEMENT_SCHEMA_QUERY).all()).results,[{name:ANNOUNCEMENT_MIGRATION}]),true);
    assert.deepEqual(await f.DB.prepare('SELECT date,created_at,is_new FROM school_announcements WHERE id=1').first(),{date:null,created_at:null,is_new:1});
    await f.DB.prepare("UPDATE school_announcements SET title='Upstream',title_search='upstream',date='2026-10-31' WHERE id=1").run();
    await call(f.env as never,'PATCH',{id:1,expectedRevision:1,title:'Admin correction',is_highlighted:true});
    await syncCrawledSchoolAnnouncements(f.env as never,{items:[{title:'Old crawler version',link:'https://hub.edu.vn/legacy',date:'2026-10-30'},{title:'Old crawler version',link:'https://hub.edu.vn/alias',date:'2026-10-30'}],sources:[],complete:true});
    assert.equal(await f.DB.prepare('SELECT COUNT(*) n FROM school_announcements').first('n'),1);
    assert.equal(await f.DB.prepare('SELECT title FROM school_announcements WHERE id=1').first('title'),'Admin correction');
    assert.equal(await f.DB.prepare('SELECT admin_revision FROM school_announcements WHERE id=1').first('admin_revision'),2);
    const queued=await Promise.all([call(f.env as never,'POST',{action:'push',id:1}),enqueueSchoolAnnouncementPush(f.env as never,{id:1,title:'Automatic snapshot',link:'https://hub.edu.vn/legacy'})]);
    assert.equal(queued.filter(result=>result.inserted).length,1);assert.equal(f.signals.length,1);
    for(const id of ['allowed','disabled','retry'])await f.DB.prepare('INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,binding_started_at) VALUES(?,?,?,?,?,?)').bind(id,id,`https://push.example.invalid/${id}`,'test-only','test-only','2026-01-01').run();
    await f.DB.prepare('INSERT INTO notification_preferences(user_id,school) VALUES(?,0)').bind('disabled').run();
    const sent:string[]=[];let transient=true;
    const sender=async(subscription:{id:string})=>{sent.push(subscription.id);if(subscription.id==='retry'&&transient)throw new WebPushError('local transport error',503,'transport_network');return 201;};
    const results=await Promise.all([processNotificationOutboxItem(f.env as never,'school',1,undefined,sender),processNotificationOutboxItem(f.env as never,'school',1,undefined,sender)]);
    assert.equal(results.filter(result=>result.queued===1).length,1);assert.deepEqual(sent.sort(),['allowed','retry']);
    await processNotificationOutboxItem(f.env as never,'school',1,undefined,sender);assert.equal(sent.length,2);
    transient=false;await f.DB.exec("UPDATE push_delivery_attempts SET next_retry_at='2000-01-01' WHERE state='failed'; UPDATE school_announcement_push_queue SET next_retry_at='2000-01-01';");
    await processNotificationOutboxItem(f.env as never,'school',1,undefined,sender);
    assert.deepEqual(sent,['allowed','retry','retry']);
    await processNotificationOutboxItem(f.env as never,'school',1,undefined,sender);assert.equal(sent.length,3);
    assert.equal(await f.DB.prepare("SELECT state FROM push_delivery_attempts WHERE subscription_id='disabled'").first('state'),'skipped');
    const fresh={title:'Fresh automatic source',link:'https://hub.edu.vn/fresh',date:new Date().toISOString().slice(0,10)};
    const auto=await syncCrawledSchoolAnnouncements(f.env as never,{items:[fresh,{...fresh,link:fresh.link+'/alias'}],sources:[],complete:true});
    assert.equal(auto.inserted,1);assert.equal(f.signals.length,2);
    assert.equal(await f.DB.prepare('SELECT COUNT(*) n FROM school_announcement_push_queue').first('n'),2);
  }finally{await f.mf.dispose();}
});

test('real D1: hiding atomically cancels pending push; automatic enqueue and recovery cannot send a hidden notice',async()=>{
  const f=await d1Fixture();try{
    await enqueueSchoolAnnouncementPush(f.env as never,{id:1,title:'Legacy',link:'https://hub.edu.vn/legacy'});
    // Exercise the SQL visibility write itself: cancellation cannot depend on
    // a second successful API statement after the notice is already hidden.
    await f.DB.prepare('UPDATE school_announcements SET is_hidden=1 WHERE id=1').run();
    assert.equal(await f.DB.prepare('SELECT last_error FROM school_announcement_push_queue').first('last_error'),'ANNOUNCEMENT_HIDDEN');
    await f.DB.prepare('DELETE FROM school_announcement_push_queue').run();
    const hidden=await enqueueSchoolAnnouncementPush(f.env as never,{id:1,title:'Late automatic enqueue',link:'https://hub.edu.vn/legacy'});
    assert.equal(hidden.inserted,false);assert.equal(f.signals.length,1);
    // Pre-migration hidden backlog also must not be delivered by new consumers.
    await f.DB.prepare("INSERT INTO school_announcement_push_queue(announcement_id,title,link,scheduled_at) VALUES(1,'Old queue entry','https://hub.edu.vn/legacy','2000-01-01')").run();
    await f.DB.prepare("INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,binding_started_at) VALUES('device','user','https://push.example.invalid/device','test-only','test-only','2026-01-01')").run();
    let sent=0;await processNotificationOutboxItem(f.env as never,'school',1,undefined,async()=>{sent++;return 201;});
    assert.equal(sent,0);assert.ok(await f.DB.prepare('SELECT failed_at FROM school_announcement_push_queue').first('failed_at'));
  }finally{await f.mf.dispose();}
});
