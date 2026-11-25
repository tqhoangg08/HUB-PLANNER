import test from 'node:test';
import './course-facets-e.test.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { publicationFixture, githubEvidence, USER, HK1_ID } from './hk2-publication-fixture.mjs';
import { handleCourses } from '../cloudflare/worker/src/courses.ts';
import { publicCatalogueDb, rewritePublicCatalogueSql, canCacheCourseRequest } from '../cloudflare/worker/src/course-publication.ts';
import { mutateD1UserScheduleCourse, parseD1ScheduleMutationRequest } from '../cloudflare/worker/src/d1-user-schedule-mutations.ts';
import { listUserSchedules } from '../cloudflare/worker/src/user-schedules.ts';
import { retrieveAdvisorContext } from '../cloudflare/worker/src/ai-advisor.ts';
import { applyD1ScraperInstructorUpdates, probeD1ScraperUpstream, probeD1ScraperRequestContracts,
  inspectD1ScraperItemShapes, diagnoseD1ScraperItemEight, diagnoseD1ScraperItemEightV2,
  diagnoseD1ScraperRequestMix, probeD1ScraperPrintTransport } from '../cloudflare/worker/src/course-scraper-authority.ts';
import { handleCourseAuthorityInternal } from '../cloudflare/worker/src/course-authority-internal.ts';
import { verifyHk2Publication, authorizeHk2Publication, publicationApprovalText, backupRestoreAttestationText, openHk2Publication } from '../scripts/hk2-2026-2027/publication.mjs';

const HK2='HK2_2026_2027', read=(db,query='')=>handleCourses(new URL(`https://example.test/courses?${query}`),{DB:db});
const sqlRows=async(db,sql)=>(await db.prepare(sql).all()).results;
const addInput=(id,semester=HK2)=>parseD1ScheduleMutationRequest(new Request('https://example.test/api/user/v1/schedules/courses/'+id,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID(),'If-Match':'"0"'},body:JSON.stringify({semester})}),'add',id);
const probeEnv=db=>({DB:db,COURSE_WRITE_AUTHORITY:'d1',COURSE_SCRAPER_INTERNAL_ENABLED:'true',COURSE_SCRAPER_UPSTREAM_COOKIE:'ASP.NET_SessionId=local-probe-fixture'});
const diagnosticProbes=[probeD1ScraperUpstream,probeD1ScraperRequestContracts];

test('scraper diagnostics make no upstream request for CLOSED HK2 without eligible HK1; permissions and HK1 remain intact', async t=>{
  const f=await publicationFixture();t.after(()=>f.mf.dispose());const {db}=f;
  await f.migrate();await f.insertTo(1);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM course_schedules WHERE semester=? AND instructor IS NULL").bind(HK2).first()).n,25);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM course_schedules WHERE semester='HK1_2026_2027' AND (instructor IS NULL OR trim(instructor)='')").first()).n,0);
  const env=probeEnv(db),calls=[];
  const fetcher=async url=>{calls.push(String(url));return new Response('<table><tr><td>Fixture</td></tr></table>',{headers:{'Content-Type':'text/html'}});};
  const before=await sqlRows(db,'SELECT * FROM course_schedules ORDER BY id');
  const receipts=await sqlRows(db,'SELECT * FROM course_mutation_receipts ORDER BY idempotency_key');
  for(const probe of [...diagnosticProbes,diagnoseD1ScraperItemEight,diagnoseD1ScraperItemEightV2,diagnoseD1ScraperRequestMix,probeD1ScraperPrintTransport]) {
    await assert.rejects(probe(env,fetcher),e=>e.status===503&&/unavailable/.test(e.message),probe.name);
  }
  assert.deepEqual((await inspectD1ScraperItemShapes(env)).items,[null,null,null]);
  assert.deepEqual(calls,[],'No diagnostic may use hidden HK2 for an upstream target');
  assert.deepEqual(await sqlRows(db,'SELECT * FROM course_schedules ORDER BY id'),before);
  assert.deepEqual(await sqlRows(db,'SELECT * FROM course_mutation_receipts ORDER BY idempotency_key'),receipts);
  // Authority checks stay ahead of database access, including when candidates exist.
  const deniedDb={prepare(){assert.fail('Unauthorized probe reached D1');}};
  for(const probe of diagnosticProbes) for(const overrides of [
    {COURSE_SCRAPER_INTERNAL_ENABLED:'false'},{COURSE_WRITE_AUTHORITY:'supabase'},{COURSE_SCRAPER_UPSTREAM_COOKIE:''},
  ]) await assert.rejects(probe({...probeEnv(deniedDb),...overrides},fetcher),e=>e.status===503);
  for(const operation of ['probe_upstream','probe_request_contracts']) {
    await assert.rejects(handleCourseAuthorityInternal(new Request('https://example.test/internal/courses/v1/authority',{
      method:'POST',body:JSON.stringify({writer:'scraper',operation}),
    }),{...probeEnv(deniedDb),COURSE_D1_INTERNAL_ENABLED:'true',COURSE_D1_INTERNAL_SECRET:'x'.repeat(40)}),e=>e.status===401);
  }
  assert.deepEqual(calls,[]);
  // Keep hidden HK2 ahead of HK1 in source order to exercise the filtered choice.
  await db.prepare('UPDATE course_schedules SET instructor=NULL,source_position=99999 WHERE id=?').bind(HK1_ID).run();
  for(const probe of diagnosticProbes) assert.equal((await probe(env,fetcher)).success,true);
  assert.equal(calls.length,3,'One upstream probe plus two request-contract reads');
  assert.ok(calls.every(url=>new URL(url).searchParams.get('SchduleStudyUnitId')==='HK1_VISIBLE'));
});

test('SQL boundary preserves aliases, handles missing/invalid state CLOSED, and leaves HK1/user-created rows intact', async t=>{
  const f=await publicationFixture(); t.after(()=>f.mf.dispose()); const {db}=f;
  await f.insertTo(1);
  assert.equal((await read(db,`semester=${HK2}`)).payload.total,0);
  assert.equal((await read(db,'semester=HK1_2026_2027')).payload.total,1);
  assert.equal((await read(db,`resource=course-detail&id=${f.plan.rows[0].id}`)).status,404);
  await f.migrate();
  assert.equal((await read(db)).payload.total,1);
  const wrapped=await publicCatalogueDb(db);
  for(const query of ['SELECT course_schedules.id FROM course_schedules','SELECT c.id FROM course_schedules c','SELECT c.id FROM course_schedules AS c']) {
    assert.equal((await wrapped.prepare(query).all()).results.length,1);
  }
  await db.prepare("DELETE FROM hk2_catalogue_publications").run();
  assert.equal((await read(db,`semester=${HK2}`)).payload.total,0);
  await db.prepare("INSERT INTO hk2_catalogue_publications(semester) VALUES(?)").bind(HK2).run();
  await db.prepare(`INSERT INTO course_schedules(id,course_code,subject_name,semester,is_user_added,updated_at,course_code_search,subject_name_search,instructor_search,source_position)
    VALUES('private-fixture','PRIVATE','User created',?,1,'2026-01-01','private','user created','',9999)`).bind(HK2).run();
  assert.equal((await read(db,`semester=${HK2}`)).payload.total,1);
  assert.equal((await read(db,`semester=${HK2}&isUserAdded=false`)).payload.total,0);
  assert.ok(!canCacheCourseRequest(new URL(`https://x/courses?semester=${HK2}`)));
  assert.ok(!canCacheCourseRequest(new URL('https://x/courses')));
  assert.ok(!canCacheCourseRequest(new URL('https://x/courses?semester=%20')));
  assert.ok(!canCacheCourseRequest(new URL('https://x/courses?semester=%20HK2_2026_2027%20')));
  assert.ok(!canCacheCourseRequest(new URL('https://x/courses?resource=course-detail&id=x&semester=HK1_2026_2027')));
  assert.ok(canCacheCourseRequest(new URL('https://x/courses?semester=HK1_2026_2027')));
  assert.match(rewritePublicCatalogueSql('SELECT * FROM course_filter_facets',false),/HK2_2026_2027/);
});

test('95 batches stay CLOSED; verified owner-only atomic opening reveals the complete catalogue, filters, selection and Advisor', {timeout:600000}, async t=>{
  const f=await publicationFixture(); t.after(()=>f.mf.dispose()); const {db,plan,backup,release}=f;
  const hk1Before=await sqlRows(db,"SELECT * FROM course_schedules WHERE semester='HK1_2026_2027'");
  await f.migrate(); await f.insertTo(1);
  assert.equal((await mutateD1UserScheduleCourse({DB:db},USER,await addInput(HK1_ID,'HK1_2026_2027'))).changed,true);
  assert.equal((await listUserSchedules({DB:db},USER)).data.length,1);
  await assert.rejects(verifyHk2Publication(db,{plan,backup,release}),/Incomplete|provenance/);
  await assert.rejects(mutateD1UserScheduleCourse({DB:db},USER,await addInput(plan.rows[0].id)),/khả dụng/);
  for(const q of [`semester=${HK2}`,`search=${plan.rows[0].course_code}`,`semester=${HK2}&sort=name-asc&offset=1`, `semester=${HK2}&suggestions=true`]) {
    const r=await read(db,q); assert.equal(r.payload.total,0); assert.deepEqual(r.payload.data,[]);
  }
  const filters=await read(db,`resource=filter-options&semester=${HK2}`);
  for(const key of ['majorOptions','subjectNameOptions','groupNameOptions','cohortOptions','academicProgramOptions']) assert.deepEqual(filters.payload[key],[]);
  const advisor=await retrieveAdvisorContext({DB:db},USER,`Môn ${plan.rows[0].subject_name}`);
  assert.ok(!JSON.stringify(advisor).includes(plan.rows[0].subject_name));
  const scrape=await applyD1ScraperInstructorUpdates({DB:db,COURSE_WRITE_AUTHORITY:'d1',COURSE_SCRAPER_INTERNAL_ENABLED:'true'},crypto.randomUUID(),[{courseId:plan.rows[0].id,instructor:'MUST NOT WRITE'}]);
  assert.equal(scrape.updated,0);
  assert.equal((await db.prepare('SELECT instructor FROM course_schedules WHERE id=?').bind(plan.rows[0].id).first()).instructor,null);
  await f.insertTo(95);
  assert.equal((await read(db,`semester=${HK2}`)).payload.total,0,'Last import batch does not open the gate');
  await assert.rejects(verifyHk2Publication(db,{plan,backup:{...backup,protected_restored_sha256:'e'.repeat(64)},release}),/Backup/);
  const receipt=await db.prepare("SELECT * FROM course_mutation_receipts WHERE idempotency_key=?").bind(`${plan.plan_id}:apply:94`).first();
  await db.prepare('DELETE FROM course_mutation_receipts WHERE idempotency_key=?').bind(receipt.idempotency_key).run();
  await assert.rejects(verifyHk2Publication(db,{plan,backup,release}),/95 apply/);
  await db.prepare(`INSERT INTO course_mutation_receipts(${Object.keys(receipt).join(',')}) VALUES(${Object.keys(receipt).map(()=>'?').join(',')})`).bind(...Object.values(receipt)).run();
  const verification=await verifyHk2Publication(db,{plan,backup,release});
  await assert.rejects(openHk2Publication(db,verification,{owner_id:252552483,approved:true}),/Authenticated/);
  const expires_at=new Date(Date.parse(verification.checked_at)+10*60_000).toISOString();
  const approval=publicationApprovalText(verification,expires_at), attestation=backupRestoreAttestationText(verification);
  const realFetch=globalThis.fetch; t.after(()=>{globalThis.fetch=realFetch;});
  globalThis.fetch=await githubEvidence(verification,approval,attestation,{ownerId:42});
  await assert.rejects(authorizeHk2Publication(verification,{approval_comment_id:101,backup_comment_id:102,expires_at,github_read_token:'fixture-owner-read-token',cloudflare_read_token:'fixture-worker-read-token'}),/owner (?:comment|identity)/);
  globalThis.fetch=await githubEvidence(verification,approval,attestation,{deploy:false});
  await assert.rejects(authorizeHk2Publication(verification,{approval_comment_id:101,backup_comment_id:102,expires_at,github_read_token:'fixture-owner-read-token',cloudflare_read_token:'fixture-worker-read-token'}),/deployment/);
  globalThis.fetch=await githubEvidence(verification,approval,attestation);
  const compatibleFetch=globalThis.fetch;
  globalThis.fetch=async(url,init)=>String(url).endsWith('/deployments')
    ?Response.json({success:true,result:{deployments:[{versions:[{version_id:'v476',percentage:100}]}]}}):compatibleFetch(url,init);
  await assert.rejects(authorizeHk2Publication(verification,{approval_comment_id:101,backup_comment_id:102,expires_at,github_read_token:'fixture-owner-read-token',cloudflare_read_token:'fixture-worker-read-token'}),/serve all traffic/);
  globalThis.fetch=compatibleFetch;
  const capability=await authorizeHk2Publication(verification,{approval_comment_id:101,backup_comment_id:102,expires_at,github_read_token:'fixture-owner-read-token',cloudflare_read_token:'fixture-worker-read-token'});
  // Change a source field after verification: the atomic guard must abort the receipt AND OPEN.
  await db.prepare('UPDATE course_schedules SET room=? WHERE id=?').bind('RACE',plan.rows[0].id).run();
  await assert.rejects(openHk2Publication(db,verification,capability),/NOT NULL|constraint/i);
  assert.equal((await db.prepare('SELECT state FROM hk2_catalogue_publications').first()).state,'CLOSED');
  assert.equal((await sqlRows(db,'SELECT * FROM hk2_catalogue_publication_receipts')).length,0);
  await db.prepare('UPDATE course_schedules SET room=? WHERE id=?').bind(plan.rows[0].room,plan.rows[0].id).run();
  const freshCapability=await authorizeHk2Publication(verification,{approval_comment_id:101,backup_comment_id:102,expires_at,github_read_token:'fixture-owner-read-token',cloudflare_read_token:'fixture-worker-read-token'});
  await db.prepare('UPDATE course_mutation_receipts SET request_hash=? WHERE idempotency_key=?').bind('f'.repeat(64),receipt.idempotency_key).run();
  await assert.rejects(openHk2Publication(db,verification,freshCapability),/NOT NULL|constraint/i);
  assert.equal((await db.prepare('SELECT state FROM hk2_catalogue_publications').first()).state,'CLOSED');
  await db.prepare('UPDATE course_mutation_receipts SET request_hash=? WHERE idempotency_key=?').bind(receipt.request_hash,receipt.idempotency_key).run();
  const finalCapability=await authorizeHk2Publication(verification,{approval_comment_id:101,backup_comment_id:102,expires_at,github_read_token:'fixture-owner-read-token',cloudflare_read_token:'fixture-worker-read-token'});
  assert.equal((await openHk2Publication(db,verification,finalCapability)).changed,true);
  const retryCapability=await authorizeHk2Publication(verification,{approval_comment_id:101,backup_comment_id:102,expires_at,github_read_token:'fixture-owner-read-token',cloudflare_read_token:'fixture-worker-read-token'});
  assert.equal((await openHk2Publication(db,verification,retryCapability)).changed,false,'Lost response retry reconciles the same publication receipt');
  globalThis.fetch=realFetch;
  // An old OPEN receipt must never revive a rollback/reimport automatically.
  await db.prepare('INSERT INTO course_mutation_receipts VALUES(?,?,?,?,?,?,?)')
    .bind('system','hk2-bulk-v1',`${plan.plan_id}:rollback:94`,'f'.repeat(64),'hk2_bulk_rollback','{}',new Date().toISOString()).run();
  assert.equal((await read(db,`semester=${HK2}`)).payload.total,0,'Ledger change closes effective publication even at 2,357 rows');
  await db.prepare('DELETE FROM course_mutation_receipts WHERE idempotency_key=?').bind(`${plan.plan_id}:rollback:94`).run(); // fixture restores the verified state only
  const listed=await read(db,`semester=${HK2}&limit=100`); assert.equal(listed.payload.total,2357); assert.equal(listed.payload.data.length,100);
  const probeCalls=[];
  for(const probe of diagnosticProbes) assert.equal((await probe(probeEnv(db),async url=>{
    probeCalls.push(String(url));return new Response('<table><tr><td>Fixture</td></tr></table>',{headers:{'Content-Type':'text/html'}});
  })).success,true);
  assert.equal(probeCalls.length,3);
  assert.ok(probeCalls.every(url=>new URL(url).searchParams.get('SchduleStudyUnitId')==='AIN712_262_1_D01'),'Valid OPEN permits the original HK2 candidate');
  assert.ok(listed.payload.data.every(r=>r.instructor===null));
  const detail=await read(db,`resource=course-detail&id=${plan.rows[0].id}`); assert.equal(detail.status,200);
  const elite=await read(db,`semester=${HK2}&academicProgram=${encodeURIComponent('CT Elite')}`); assert.equal(elite.payload.total,29);
  assert.ok((await read(db,`resource=filter-options&semester=${HK2}`)).payload.subjectNameOptions.length>0);
  const added=await mutateD1UserScheduleCourse({DB:db},USER,await addInput(plan.rows[0].id)); assert.equal(added.changed,true);
  assert.equal((await listUserSchedules({DB:db},USER)).data.length,2);
  const visible=await retrieveAdvisorContext({DB:db},USER,`Môn ${plan.rows[0].subject_name}`);
  assert.ok(JSON.stringify(visible).includes(plan.rows[0].subject_name));
  await db.prepare("UPDATE hk2_catalogue_publications SET state='CLOSED'").run(); // local emergency-close read fixture only
  assert.equal((await read(db,`semester=${HK2}`)).payload.total,0);
  assert.equal((await listUserSchedules({DB:db},USER)).data.length,2,'Existing owner snapshots remain readable when closed');
  const personal=await retrieveAdvisorContext({DB:db},USER,'Lịch học của tôi');
  assert.ok(JSON.stringify(personal).includes(plan.rows[0].subject_name));
  assert.deepEqual(await sqlRows(db,"SELECT * FROM course_schedules WHERE semester='HK1_2026_2027'"),hk1Before);
});

test('Worker ignores a warm ungated edge cache for unscoped/HK2 reads and keeps HK1 cache eligibility', {timeout:90000}, async t=>{
  const bundle=await build({entryPoints:['cloudflare/worker/src/index.ts'],bundle:true,write:false,format:'esm',platform:'browser',external:['cloudflare:*'],logLevel:'silent'});
  const code=bundle.outputFiles[0].text, exported=code.match(/\b(\w+)\s+as\s+default\b/);
  assert.ok(exported,'Locate the actual bundled Worker entrypoint');
  const script=`let fixtureCacheReads=0;
    const caches={default:{async match(request){fixtureCacheReads++;const hk1=new URL(request.url).searchParams.get('semester')==='HK1_2026_2027';return Response.json({success:true,data:[{id:hk1?'cached-hk1':'UNPUBLISHED-CACHE-LEAK'}],total:1});},async put(){}}};
    ${code.replace(/\b\w+\s+as\s+default\s*,?/,'')}
    export default {async fetch(r,e,c){const response=await ${exported[1]}.fetch(r,e,c);const result=new Response(response.body,response);result.headers.set('X-Fixture-CacheReads',String(fixtureCacheReads));return result;}};`;
  const f=await publicationFixture({workerScript:script});t.after(()=>f.mf.dispose());await f.migrate();await f.insertTo(1);
  for(const path of ['/courses',`/courses?semester=${HK2}`,`/api/courses?semester=${HK2}`,`/courses?resource=filter-options&semester=${HK2}`,`/courses?resource=course-detail&id=${f.plan.rows[0].id}`]){
    const response=await f.mf.dispatchFetch(`https://example.test${path}`,{headers:{Accept:'application/json'}});
    assert.ok([200,404].includes(response.status),await response.clone().text());
    assert.equal(response.headers.get('X-Fixture-CacheReads'),'0');
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.ok(!(await response.text()).includes('UNPUBLISHED-CACHE-LEAK'));
  }
  const hk1=await f.mf.dispatchFetch('https://example.test/courses?semester=HK1_2026_2027',{headers:{Accept:'application/json'}});
  assert.equal(hk1.headers.get('X-Fixture-CacheReads'),'1');
  assert.equal((await hk1.json()).data[0].id,'cached-hk1');
});
