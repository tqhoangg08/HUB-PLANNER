import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import test from 'node:test';
import {Miniflare} from 'miniflare';
import {syncCrawledSchoolAnnouncements} from '../cloudflare/worker/src/announcement-store.ts';
import {runNotificationQueueControl} from '../cloudflare/worker/src/notification-cron.ts';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('cloudflare/migrations/0001_create_school_announcements.sql','utf8'));
  sql.exec('ALTER TABLE sync_metadata ADD COLUMN visible_row_count INTEGER; ALTER TABLE sync_metadata ADD COLUMN source_cursor TEXT;');
  sql.exec(`CREATE TABLE school_announcement_push_queue (id INTEGER PRIMARY KEY, announcement_id INTEGER UNIQUE, title TEXT, link TEXT, scheduled_at TEXT, sent_at TEXT, failed_at TEXT, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, last_error TEXT);
    CREATE TABLE lost_found_push_queue (id INTEGER PRIMARY KEY, lost_found_item_id INTEGER UNIQUE, title TEXT, body TEXT, url TEXT, scheduled_at TEXT, sent_at TEXT, failed_at TEXT, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, failed_count INTEGER DEFAULT 0, skipped_count INTEGER DEFAULT 0, last_error TEXT);`);
  sql.exec("INSERT INTO school_announcements VALUES(900,'Hidden original','hidden original','https://example.invalid/hidden','2026-08-01',0,'2026-08-01T00:00:00Z',1)");
  sql.exec(readFileSync('cloudflare/migrations/0025_announcement_d1_authority.sql','utf8'));
  const DB = {prepare(query: string) {
    let args: any[]=[];
    const statement = {
      bind(...values: any[]) {args=values; return statement;},
      async run() {const result=sql.prepare(query).run(...args); return {meta:{changes:Number(result.changes)}};},
      async first() {return sql.prepare(query).get(...args) || null;},
      async all() {return {results:sql.prepare(query).all(...args)};},
    }; return statement;
  }} as unknown as D1Database;
  return {sql,DB};
}
const crawl=(items: Array<{title:string;link:string;date:string}>)=>({items,sources:[],complete:true});
const item={title:'New announcement',link:'https://example.invalid/new',date:new Date().toISOString().slice(0,10)};

// Exercise the actual D1 binding: node:sqlite's run().changes omits trigger
// writes, so the lightweight fixture above cannot reproduce D1 metadata.
async function d1Fixture() {
  const mf = new Miniflare({modules:true, script:'export default {fetch(){return new Response("ok")}}',
    compatibilityDate:'2026-07-29', d1Databases:['DB']});
  try {
    const DB = await mf.getD1Database('DB');
    for (const path of [
      '0001_create_school_announcements.sql',
      '0023_create_event_push_deliveries.sql',
      '0024_create_native_push_runtime.sql',
      '0025_announcement_d1_authority.sql',
      '0033_reduce_push_delivery_write_amplification.sql',
    ]) {
      if (path.startsWith('0025')) {
        await DB.exec('ALTER TABLE sync_metadata ADD COLUMN visible_row_count INTEGER; ALTER TABLE sync_metadata ADD COLUMN source_cursor TEXT;');
      }
      await DB.exec(readFileSync(`cloudflare/migrations/${path}`,'utf8').replace(/^\s*--.*$/gm,'').replace(/\s+/g,' '));
    }
    return {mf, DB};
  } catch (error) { await mf.dispose(); throw error; }
}

test('D1 changes includes both migration 0025 insert triggers, unlike SQLite changes()',async()=>{
  const {mf,DB}=await d1Fixture(); try {
    const result=await DB.prepare(`INSERT INTO school_announcements
      (id,title,title_search,link,date,is_new,created_at,is_hidden)
      VALUES (1,'Probe','probe','https://example.invalid/probe',?,1,?,0)`)
      .bind(item.date,new Date().toISOString()).run();
    assert.equal(result.meta.changes,3); // content + ID high watermark + paging metadata
    assert.equal(await DB.prepare('SELECT changes() AS n').first('n'),1);
    assert.equal(await DB.prepare('SELECT last_id FROM announcement_id_sequence').first('last_id'),1);
    assert.equal(await DB.prepare("SELECT source_row_count FROM sync_metadata WHERE resource='school_announcements'").first('source_row_count'),1);
    // A previously committed is_new row without an outbox is historical
    // backlog: subsequent crawls must not silently replay it.
    let signals=0;
    const env={DB,PUSH_EVENTS_QUEUE:{send:async()=>{signals++;}} as Queue};
    await syncCrawledSchoolAnnouncements(env,crawl([{title:'Probe',link:'https://example.invalid/probe',date:item.date}]));
    assert.equal(await DB.prepare('SELECT COUNT(*) n FROM school_announcement_push_queue').first('n'),0);
    assert.equal(signals,0);
  }finally{await mf.dispose();}
});

test('real D1 crawl enqueues and signals once; retries, aliases, edits and old rows never resend',async()=>{
  const {mf,DB}=await d1Fixture(); try {
    const signals: unknown[]=[];
    const env={DB,PUSH_EVENTS_QUEUE:{send:async(message:unknown)=>{signals.push(message);}} as Queue};
    const first=await syncCrawledSchoolAnnouncements(env,crawl([item]));
    assert.equal(await DB.prepare('SELECT COUNT(*) n FROM school_announcement_push_queue').first('n'),1);
    assert.equal(first.inserted,1);
    assert.deepEqual(signals,[{v:1,type:'school',sourceId:1}]);
    await DB.prepare("UPDATE school_announcement_push_queue SET sent_at=? WHERE announcement_id=1").bind(new Date().toISOString()).run();
    assert.equal((await syncCrawledSchoolAnnouncements(env,crawl([item,item,{...item,link:item.link+'/alias'}]))).inserted,0);
    await syncCrawledSchoolAnnouncements(env,crawl([{...item,title:'Edited announcement'}]));
    await syncCrawledSchoolAnnouncements(env,crawl([{...item,title:'Old announcement',link:item.link+'/old',date:'2020-01-01'}]));
    assert.equal(signals.length,1);
    assert.equal(await DB.prepare('SELECT COUNT(*) n FROM school_announcement_push_queue').first('n'),1);
  }finally{await mf.dispose();}
});

test('concurrent D1 crawls of the same new item create only one outbox record and signal',async()=>{
  const {mf,DB}=await d1Fixture(); try {
    const signals: unknown[]=[];
    const env={DB,PUSH_EVENTS_QUEUE:{send:async(message:unknown)=>{signals.push(message);}} as Queue};
    const results=await Promise.all([syncCrawledSchoolAnnouncements(env,crawl([item])),syncCrawledSchoolAnnouncements(env,crawl([item]))]);
    assert.equal(results.reduce((n,result)=>n+result.inserted,0),1);
    assert.equal(await DB.prepare('SELECT COUNT(*) n FROM school_announcement_push_queue').first('n'),1);
    assert.equal(signals.length,1);
  }finally{await mf.dispose();}
});

test('Queue signal failure keeps the D1 school outbox pending without duplicate enqueue on retry',async()=>{
  const {mf,DB}=await d1Fixture(); try {
    let attempts=0;
    const env={DB,PUSH_EVENTS_QUEUE:{send:async()=>{attempts++; throw new Error('synthetic queue failure');}} as Queue};
    await syncCrawledSchoolAnnouncements(env,crawl([item]));
    await syncCrawledSchoolAnnouncements(env,crawl([item]));
    assert.equal(attempts,1);
    assert.equal(await DB.prepare('SELECT COUNT(*) n FROM school_announcement_push_queue WHERE sent_at IS NULL AND failed_at IS NULL').first('n'),1);
  }finally{await mf.dispose();}
});

test('direct D1 crawl inserts once and newest date matches upstream',async()=>{
  const {sql,DB}=fixture(); try {
    assert.equal((await syncCrawledSchoolAnnouncements({DB},crawl([item]))).inserted,1);
    const repeated = await syncCrawledSchoolAnnouncements({DB},crawl([item,item]));
    assert.equal(repeated.inserted,0);
    assert.equal(repeated.metadataWritten,0);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM school_announcements').get()?.n,2);
    assert.equal(sql.prepare('SELECT MAX(date) AS date FROM school_announcements').get()?.date,item.date);
    assert.equal(sql.prepare("SELECT visible_row_count AS n FROM sync_metadata WHERE resource='school_announcements'").get()?.n,1);
  }finally{sql.close();}
});
test('repeat crawl and queue processing do not enqueue a second push',async()=>{
  const {sql,DB}=fixture(); try {
    sql.exec(readFileSync('cloudflare/migrations/0023_create_event_push_deliveries.sql','utf8'));
    sql.exec(readFileSync('cloudflare/migrations/0024_create_native_push_runtime.sql','utf8'));
    sql.exec(readFileSync('cloudflare/migrations/0033_reduce_push_delivery_write_amplification.sql','utf8'));
    sql.exec('CREATE TABLE public_lost_found_items(id TEXT,title TEXT,type TEXT,user_name TEXT,location TEXT,status TEXT,is_deleted INTEGER,created_at TEXT);');
    await syncCrawledSchoolAnnouncements({DB},crawl([item]));
    const env={DB,NOTIFICATION_REENABLE_CUTOFF:'2026-01-01T00:00:00Z'};
    await runNotificationQueueControl(env,'process');
    await syncCrawledSchoolAnnouncements({DB},crawl([item]));
    await runNotificationQueueControl(env,'process');
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM school_announcement_push_queue').get()?.n,1);
  }finally{sql.close();}
});
test('updates preserve canonical identity, creation, hidden and push state',async()=>{
  const {sql,DB}=fixture(); try {
    const result=await syncCrawledSchoolAnnouncements({DB},crawl([{...item,link:'https://example.invalid/hidden',title:'Updated title'}]));
    assert.equal(result.updated,1);
    const row=sql.prepare('SELECT * FROM school_announcements WHERE id=900').get();
    assert.equal(row?.created_at,'2026-08-01T00:00:00Z');
    assert.equal(row?.is_hidden,1); assert.equal(row?.is_new,0);
    assert.equal(row?.title,'Updated title'); assert.ok(row?.updated_at);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM school_announcements WHERE is_hidden=0').get()?.n,0);
  }finally{sql.close();}
});
test('historical imports are not push eligible and deleted IDs are never reused',async()=>{
  const {sql,DB}=fixture(); try {
    await syncCrawledSchoolAnnouncements({DB},crawl([{...item,date:'2026-08-01'}]));
    assert.equal(sql.prepare('SELECT is_new FROM school_announcements WHERE id=901').get()?.is_new,0);
    sql.exec('DELETE FROM school_announcements WHERE id=901');
    await syncCrawledSchoolAnnouncements({DB},crawl([{...item,link:item.link+'/second'}]));
    assert.equal(sql.prepare('SELECT MAX(id) AS id FROM school_announcements').get()?.id,902);
  }finally{sql.close();}
});
test('same title aliases dedupe and paging/search stay visible-only',async()=>{
  const {sql,DB}=fixture(); try {
    await syncCrawledSchoolAnnouncements({DB},crawl([item,{...item,link:item.link+'/alias'}]));
    const rows=sql.prepare("SELECT id FROM school_announcements WHERE is_hidden=0 AND title_search LIKE ? ORDER BY date DESC,created_at DESC LIMIT ? OFFSET ?").all('%announcement%',10,0);
    assert.equal(rows.length,1);
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM school_announcements').get()?.n,2);
  }finally{sql.close();}
});
