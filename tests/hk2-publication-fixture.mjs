import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { createHash } from 'node:crypto';
import { loadBulkPackage, captureSnapshot, createBulkPlan, PAYLOAD_SHA256 } from '../scripts/hk2-2026-2027/bulk-import.mjs';
import { sha256 } from '../scripts/hk2-2026-2027/catalogue.mjs';

export const USER = '11111111-1111-4111-8111-111111111111';
export const HK1_ID = '22222222-2222-4222-8222-222222222222';
export const RELEASE_SHA = 'a'.repeat(40);
export async function publicationFixture({ workerScript, databaseId = 'local' } = {}) {
  const mf = new Miniflare({ modules: true, script: workerScript || 'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  const db = await mf.getD1Database('DB');
  const baseline = JSON.parse(await readFile('docs/hk2-d1-import/production-readonly.json','utf8'));
  for (const type of ['table','index','trigger']) for (const row of baseline.response.result[0].results.filter(r => r.type === type)) await db.prepare(row.sql).run();
  for (const name of ['0014_add_user_schedule_write_safety.sql','0015_add_user_schedule_transaction_assertions.sql','0017_create_user_schedule_course_snapshots.sql']) {
    const sql = (await readFile(`cloudflare/migrations/${name}`,'utf8')).replace(/--[^\n]*/g,'').replace(/ALTER TABLE user_schedules ADD COLUMN updated_at TEXT;/,'');
    for (const statement of sql.split(';').map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  await db.prepare("CREATE TABLE sync_metadata(resource TEXT PRIMARY KEY,synced_at TEXT)").run();
  await db.prepare("INSERT INTO sync_metadata VALUES('user_schedules','2026-11-20')").run();
  await db.prepare("CREATE TABLE course_scraper_runs(run_id TEXT PRIMARY KEY,payload_hash TEXT,status TEXT,attempted_count INTEGER,updated_count INTEGER DEFAULT 0,skipped_admin_count INTEGER DEFAULT 0,conflict_count INTEGER DEFAULT 0,error_code TEXT,created_at TEXT,completed_at TEXT)").run();
  await db.prepare(`INSERT INTO course_schedules(id,course_code,subject_name,semester,instructor,is_user_added,updated_at,course_code_search,subject_name_search,instructor_search,source_position)
    VALUES(?,'HK1_VISIBLE','HK1 unchanged','HK1_2026_2027','Existing lecturer',0,'2026-01-01','hk1_visible','hk1 unchanged','existing lecturer',1)`).bind(HK1_ID).run();
  const primary = { prepare: sql => db.prepare(sql), batch: async statements => (await db.batch(statements)).map(r => ({ ...r, meta: { ...r.meta, served_by_primary: true } })) };
  const pkg = await loadBulkPackage(), plan = await createBulkPlan(pkg, await captureSnapshot(databaseId === 'local' ? db : primary, databaseId));
  const backup = { database_id: 'local', export_sha256: 'b'.repeat(64), export_reference: 'fixture-only-backup.sql', export_bytes: 100,
    protected_source_sha256: 'c'.repeat(64), protected_restored_sha256: 'c'.repeat(64), restore_environment: 'isolated', production_restored: false,
    exported_at: new Date(Date.parse(plan.snapshot.checked_at)-60_000).toISOString(), restore_verified_at: new Date(Date.parse(plan.snapshot.checked_at)-30_000).toISOString() };
  const release = { sha: RELEASE_SHA, run_id: 12345, worker_version: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', asset_manifest_sha256: 'd'.repeat(64) };
  let inserted = 0, previous = null;
  const insertTo = async batches => {
    while (inserted < batches) {
      const i=inserted, records=plan.rows.slice(i*25,(i+1)*25);
      const body={version:2,plan_id:plan.plan_id,action:'apply',batch_index:i,payload_sha256:PAYLOAD_SHA256,snapshot_sha256:plan.snapshot_sha256,
        batch_sha256:sha256(JSON.stringify(records)),ids:records.map(r=>r.id),semester:'HK2_2026_2027',sequence:i,previous_receipt_hash:previous};
      const hash=sha256(JSON.stringify(body));
      const statements=records.map(row=>db.prepare(`INSERT INTO course_schedules(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)));
      statements.push(db.prepare('INSERT INTO course_mutation_receipts VALUES(?,?,?,?,?,?,?)').bind('system','hk2-bulk-v1',`${plan.plan_id}:apply:${i}`,hash,'hk2_bulk_apply',JSON.stringify(body),new Date().toISOString()));
      await db.batch(statements); previous=hash; inserted++;
    }
  };
  const migrate = async () => {
    const sql=(await readFile('cloudflare/migrations/0062_hk2_catalogue_publication.sql','utf8')).replace(/--[^\n]*/g,'');
    for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
  };
  return {mf,db,pkg,plan,backup,release,insertTo,migrate};
}

/** Mock only the external authenticated provider boundary, never owner/capability checks. */
export async function githubEvidence(verification, approvalText, backupText, { ownerId=252552483, deploy=true }={}) {
  const bytes=Buffer.from((await readFile('cloudflare/worker/src/course-publication.ts','utf8')).replace(/\r\n/g,'\n'));
  const blob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const time=new Date().toISOString(), owner={id:ownerId,type:'User'};
  const comment=(id,body)=>({id,user:owner,issue_url:'https://api.github.com/repos/tqhoangg08/HUB-PLANNER/issues/161',body,created_at:time,updated_at:time});
  return async (url,init) => {
    if(String(url).startsWith('https://api.cloudflare.com/client/v4/accounts/6cd8bac6009a55f96bdf9df7c2057548/workers/scripts/hub-planner-public-dev-api/') && init.method==='GET') return Response.json({success:true,result:String(url).endsWith('/deployments')?{deployments:[{versions:[{version_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',percentage:100}]}]}:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',metadata:{created_on:time}}});
    if(!(String(url)==='https://api.github.com/user' || String(url).startsWith('https://api.github.com/repos/tqhoangg08/HUB-PLANNER')) || init.method!=='GET') throw new Error('External boundary mismatch');
    const path=new URL(url).pathname, base='/repos/tqhoangg08/HUB-PLANNER';
    const data=path==='/user' ? owner : path===base ? {id:1126820605,full_name:'tqhoangg08/HUB-PLANNER',owner:{id:252552483,type:'User'}}
      : path.endsWith('/branches/main') ? {name:'main',commit:{sha:RELEASE_SHA}}
      : path.endsWith('/comments/101') ? comment(101,approvalText)
      : path.endsWith('/comments/102') ? comment(102,backupText)
      : path.endsWith('/jobs') ? {total_count:1,jobs:[{name:'release-public',started_at:time,completed_at:time,conclusion:deploy?'success':'skipped',steps:[{name:'Verify solo owner approval, live protections and exact-SHA CI',conclusion:'success'},{name:'Deploy Public Worker and frontend assets',conclusion:deploy?'success':'skipped'}]}]}
      : path.includes('/actions/runs/') ? {id:12345,repository:{id:1126820605},head_sha:RELEASE_SHA,head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/deploy-cloudflare-production.yml',actor:owner,triggering_actor:owner,run_attempt:1,status:'completed',conclusion:'success'}
      : path.includes('/contents/') ? {type:'file',sha:blob} : null;
    if(!data)throw new Error(`Unexpected provider read ${path}`);
    return Response.json(data);
  };
}
