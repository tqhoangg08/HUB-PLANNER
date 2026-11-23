import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {fork,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {PublicationNativeLease} from '../scripts/hk2-2026-2027/publication-native-lease.mjs';
import {PublicationSessionState,inspectSession,releaseOwnedOperatorLock} from '../scripts/hk2-2026-2027/publication-session-state.mjs';
import {publishProductionCatalogue} from '../scripts/hk2-2026-2027/publication-transport.mjs';
const worker=new URL('./fixtures/hk2-native-child.mjs',import.meta.url);
const expiry=()=>new Date(Date.now()+60000).toISOString();
const folder=async()=>{await mkdir('.cache/hk2-session-tests',{recursive:true});return mkdtemp('.cache/hk2-session-tests/run-');};
const close=async lease=>{try{await lease.close();}catch{}};
const scopedEnv=(t,key,value)=>{const old=process.env[key];if(value===undefined)delete process.env[key];else process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});};
const pair=(db,id='one',receiptId='ok',note='LỚP ẢO\nSân bóng đá')=>[
  db.prepare('INSERT INTO hk2_catalogue_publication_receipts(id,note) VALUES(?,?)').bind(id,note),
  db.prepare("UPDATE hk2_catalogue_publications SET state='OPEN',revision=1,receipt_id=? WHERE semester='HK2_2026_2027'").bind(receiptId),
];

test('native IPC handles publication-sized UTF-8 parameters/results without truncation or newline changes',async t=>{
  scopedEnv(t,'HK2_NATIVE_TEST_STATE',await folder());scopedEnv(t,'HK2_NATIVE_TEST_FAULT',undefined);
  const lease=new PublicationNativeLease({publication:true,worker,expiresAt:expiry()});t.after(()=>close(lease));await lease.health();
  const value='LỚP ẢO\n'.repeat(160000);assert.ok(Buffer.byteLength(value)>1750000&&Buffer.byteLength(value)<1900000);
  await lease.db.batch(pair(lease.db,'large','ok',value));
  const actual=await lease.db.prepare('SELECT note FROM hk2_catalogue_publication_receipts').first('note');
  const hash=v=>createHash('sha256').update(v).digest('hex');assert.equal(hash(actual),hash(value));
});

test('native IPC preserves NULL/newlines, atomic rollback and cannot write outside the publication pair',async t=>{
  const state=await folder();scopedEnv(t,'HK2_NATIVE_TEST_STATE',state);scopedEnv(t,'HK2_NATIVE_TEST_FAULT',undefined);
  const lease=new PublicationNativeLease({publication:true,worker,expiresAt:expiry()});t.after(()=>close(lease));await lease.health();
  await assert.rejects(publishProductionCatalogue(lease.db,{}, {approved:true}),/Fresh in-process/);
  await assert.rejects(lease.db.batch(pair(lease.db,'failed','reject')),/constraint|CHECK/i);
  await close(lease);
  const reader=new PublicationNativeLease({worker});t.after(()=>close(reader));
  assert.equal((await reader.db.prepare('SELECT COUNT(*) AS n FROM hk2_catalogue_publication_receipts').first()).n,0);
  assert.equal((await reader.db.prepare('SELECT state FROM hk2_catalogue_publications').first()).state,'CLOSED');
  assert.equal((await reader.db.prepare('SELECT note FROM user_schedules').first()).note,'personal unchanged');
  assert.equal((await reader.db.prepare('SELECT semester FROM course_schedules').first()).semester,'HK1_2026_2027');
  await assert.rejects(reader.db.batch(pair(reader.db)),/SCOPE/);await reader.close();
  const outside=new PublicationNativeLease({publication:true,worker,expiresAt:expiry()});t.after(()=>close(outside));await outside.health();
  await assert.rejects(outside.db.batch([outside.db.prepare("UPDATE user_schedules SET note='forbidden'")]),/SCOPE/);await close(outside);
  const valid=new PublicationNativeLease({publication:true,worker,expiresAt:expiry()});t.after(()=>close(valid));await valid.health();
  await valid.db.batch(pair(valid.db));
  assert.equal((await valid.db.prepare('SELECT note FROM hk2_catalogue_publication_receipts').first()).note,'LỚP ẢO\nSân bóng đá');
  assert.equal(await valid.db.prepare('SELECT NULL AS empty').first('empty'),null);
  await assert.rejects(valid.db.batch(pair(valid.db,'two')),/SCOPE/);
});

test('operator cancellation before the native write blocks OPEN and never sends a batch',async t=>{
  scopedEnv(t,'HK2_NATIVE_TEST_STATE',await folder());scopedEnv(t,'HK2_NATIVE_TEST_FAULT',undefined);
  const controller=new AbortController(),lease=new PublicationNativeLease({publication:true,worker,signal:controller.signal,expiresAt:expiry()});t.after(()=>close(lease));
  await lease.health();controller.abort(Error('owner cancelled'));
  await assert.rejects(lease.db.batch(pair(lease.db)),/cancelled/);assert.equal(lease.mutationAttempted,false);
  await lease.close();const reader=new PublicationNativeLease({worker});t.after(()=>close(reader));
  assert.equal((await reader.db.prepare('SELECT state FROM hk2_catalogue_publications').first()).state,'CLOSED');
});

test('SDK process exit/timeout reject requests, never restart or auto-publish, and leave parent alive',async t=>{
  for(const fault of ['exit','hang'])await t.test(fault,async tt=>{
    scopedEnv(tt,'HK2_NATIVE_TEST_STATE',await folder());scopedEnv(tt,'HK2_NATIVE_TEST_FAULT',fault);
    const lease=new PublicationNativeLease({worker,requestMs:fault==='hang'?1000:10000});tt.after(()=>close(lease));
    await assert.rejects(lease.health(),fault==='hang'?/TIMEOUT/:/CHILD_EXIT/);
    const pid=lease.pid;await assert.rejects(lease.health());assert.equal(lease.pid,pid,'Failed lease never restarts itself');assert.equal(lease.mutationAttempted,false);
  });
});

test('a committed batch with lost ACK is not retried; fresh READ-ONLY reconciliation sees receipt and OPEN',async t=>{
  const state=await folder();scopedEnv(t,'HK2_NATIVE_TEST_STATE',state);scopedEnv(t,'HK2_NATIVE_TEST_FAULT','lost-ack');
  const lease=new PublicationNativeLease({publication:true,worker,expiresAt:expiry()});t.after(()=>close(lease));await lease.health();
  await assert.rejects(lease.db.batch(pair(lease.db)),/CHILD_EXIT/);await close(lease);
  delete process.env.HK2_NATIVE_TEST_FAULT;
  const reader=new PublicationNativeLease({worker});t.after(()=>close(reader));
  assert.equal((await reader.db.prepare('SELECT COUNT(*) AS n FROM hk2_catalogue_publication_receipts').first()).n,1);
  assert.equal((await reader.db.prepare('SELECT state FROM hk2_catalogue_publications').first()).state,'OPEN');
  assert.equal((await reader.db.prepare('SELECT note FROM user_schedules').first()).note,'personal unchanged');
  assert.equal((await reader.db.prepare('SELECT COUNT(*) AS n FROM course_schedules').first()).n,1);
  await assert.rejects(lease.db.batch(pair(lease.db)),/CLOSED|CHILD_EXIT/);
});

test('approval status rejects expired/stale/PID-reused sessions; no SDK remains during owner wait',async t=>{
  const out=await folder(),state=new PublicationSessionState(out);await state.start();t.after(()=>state.finish('TEST_COMPLETE'));
  await state.update('AWAITING_OWNER',{native_active:false,expires_at:new Date(Date.now()+60000).toISOString()});
  assert.equal((await inspectSession(out)).approval_valid,true);
  assert.equal((await inspectSession(out,{probe:()=> 'another-process'})).approval_valid,false);
  assert.equal((await inspectSession(out,{now:Date.now()+20000})).approval_valid,false);
  await state.update('AWAITING_OWNER',{native_active:true});assert.equal((await inspectSession(out)).approval_valid,false);
  await state.update('AWAITING_OWNER',{native_active:false,expires_at:new Date(Date.now()-1000).toISOString()});assert.equal((await inspectSession(out)).approval_valid,false);
  assert.equal((await inspectSession(await folder())).approval_valid,false);
});

test('expiry at the final native send blocks writes even after a successful health probe',async t=>{
  scopedEnv(t,'HK2_NATIVE_TEST_STATE',await folder());scopedEnv(t,'HK2_NATIVE_TEST_FAULT',undefined);
  const lease=new PublicationNativeLease({publication:true,worker,expiresAt:expiry()});t.after(()=>close(lease));await lease.health();
  lease.options.expiresAt=new Date(Date.now()-1).toISOString();
  await assert.rejects(lease.db.batch(pair(lease.db)),/APPROVAL_EXPIRED/);assert.equal(lease.mutationAttempted,false);
  assert.equal((await lease.db.prepare('SELECT state FROM hk2_catalogue_publications').first()).state,'CLOSED');
});

test('torn heartbeat never falls back to an old live record; another operator lock is never removed',async()=>{
  const out=await folder(),file=out+'/session-state.jsonl';
  await writeFile(file,JSON.stringify({stage:'AWAITING_OWNER',pid:process.pid})+'\n{"stage":');
  assert.equal((await inspectSession(out)).approval_valid,false);
  const lock=out+'/resume-operator.lock';await writeFile(lock,JSON.stringify({pid:process.pid,nonce:'other'}));
  assert.equal(await releaseOwnedOperatorLock(lock,process.pid,'mine'),false);
  assert.equal(JSON.parse(await readFile(lock)).nonce,'other');
  assert.equal(await releaseOwnedOperatorLock(lock,process.pid,'other'),true);
});

test('forced exits leave abnormal-stop evidence; SIGKILL is detected without deleting the operator lock',async t=>{
  for(const forced of [false,true])await t.test(forced?'process.exit':'SIGKILL',async()=>{
    const out=await folder(),lock=out+'/resume-operator.lock';await writeFile(lock,'preserved');
    const child=fork(new URL('./fixtures/hk2-session-process.mjs',import.meta.url),[out],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
    await once(child,'message');const exited=once(child,'exit');if(forced)child.send({exit:true});else child.kill('SIGKILL');await exited;
    const status=await inspectSession(out);assert.equal(status.approval_valid,false);assert.equal(status.alive,false);
    assert.equal(await readFile(lock,'utf8'),'preserved');
    if(forced)assert.equal(JSON.parse(await readFile(out+'/abnormal-stop.json')).stage,'ABNORMAL_EXIT');
  });
});

test('all publication/import guards, atomic SQL, frozen data, Worker and production dependencies remain byte-identical',async()=>{
  execFileSync('git',['diff','--exit-code','d0a91352ec7e32744e4f6e8331c88b56347717df','--','scripts/hk2-2026-2027/publication.mjs','scripts/hk2-2026-2027/publication-transport.mjs','scripts/hk2-2026-2027/publication-operator.mjs','scripts/hk2-2026-2027/bulk-import.mjs','scripts/hk2-2026-2027/operator-authorization.mjs','scripts/hk2-2026-2027/production-transport.mjs','data/hk2-2026-2027','cloudflare','components','utils','.github','package-lock.json']);
  const old=JSON.parse(execFileSync('git',['show','d0a91352ec7e32744e4f6e8331c88b56347717df:package.json'],{encoding:'utf8'})),now=JSON.parse(await readFile('package.json'));
  assert.deepEqual(now.dependencies,old.dependencies);assert.deepEqual(now.devDependencies,old.devDependencies);
});
