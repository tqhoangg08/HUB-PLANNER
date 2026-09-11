import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../cloudflare/worker/src/index.ts';
import {EventParticipationError,listEventParticipations,mutateEventParticipation,parseParticipationEventId,parseParticipationUserId} from '../cloudflare/worker/src/event-participations.ts';

const USER='d9428888-122b-4f0f-b88f-1c8f4f762b22';
const OTHER='b42a6f01-a58e-4046-b90c-73ffa2aeee26';
function fixture() {
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync('cloudflare/migrations/0010_create_user_event_participations.sql','utf8'));
 sql.exec("CREATE TABLE public_events(id INTEGER PRIMARY KEY,status TEXT,is_deleted INTEGER); INSERT INTO public_events VALUES(42,'published',0)");
 const DB={prepare(query:string) {
  let args:any[]=[];
  const s={bind(...values:any[]){args=values;return s;},
   async all(){return {results:sql.prepare(query).all(...args)};},
   async run(){return {meta:{changes:sql.prepare(query).run(...args).changes}};}
  }; return s;
 }} as unknown as D1Database;
 return {sql,DB};
}
test('identifiers remain bounded',()=>{
 assert.equal(parseParticipationEventId('42'),42);
 assert.equal(parseParticipationUserId(USER.toUpperCase()),USER);
 assert.throws(()=>parseParticipationEventId(0),EventParticipationError);
 assert.throws(()=>parseParticipationUserId('not-a-user'),EventParticipationError);
});
test('D1-only event join, duplicate join, reload and leave preserve the contract',async()=>{
 const {sql,DB}=fixture();try{
  assert.deepEqual(await mutateEventParticipation({DB},USER,42,true),{success:true,eventId:42,participated:true,mirrorSynced:true});
  const before=sql.prepare('SELECT created_at FROM user_event_participations').get()?.created_at;
  await mutateEventParticipation({DB},USER,42,true);
  assert.equal(sql.prepare('SELECT created_at FROM user_event_participations').get()?.created_at,before);
  assert.deepEqual(await listEventParticipations({DB},USER),{success:true,data:[42]});
  await mutateEventParticipation({DB},USER,42,false);
  await mutateEventParticipation({DB},USER,42,false);
  assert.deepEqual(await listEventParticipations({DB},USER),{success:true,data:[]});
 }finally{sql.close();}
});
test('leave cannot delete another owner and remains possible after event removal',async()=>{
 const {sql,DB}=fixture();try{
  await mutateEventParticipation({DB},OTHER,42,true);
  await mutateEventParticipation({DB},USER,42,false);
  assert.deepEqual((await listEventParticipations({DB},OTHER)).data,[42]);
  sql.exec('DELETE FROM public_events');
  await mutateEventParticipation({DB},OTHER,42,false);
  assert.deepEqual((await listEventParticipations({DB},OTHER)).data,[]);
 }finally{sql.close();}
});
test('missing, hidden, deleted and unpublished event registrations are rejected',async()=>{
 const {sql,DB}=fixture();try{
  for(const status of ['pending','draft','unpublished','rejected','hidden','deleted']) {
   sql.prepare('UPDATE public_events SET status=?').run(status);
   await assert.rejects(()=>mutateEventParticipation({DB},USER,42,true),(e:any)=>e.status===404);
  }
  sql.exec("UPDATE public_events SET status='published',is_deleted=1");
  await assert.rejects(()=>mutateEventParticipation({DB},USER,42,true),(e:any)=>e.status===404);
  await assert.rejects(()=>mutateEventParticipation({DB},USER,999,true),(e:any)=>e.status===404);
  assert.deepEqual((await listEventParticipations({DB},USER)).data,[]);
 }finally{sql.close();}
});
test('closed public events remain trackable without changing registration UX',async()=>{
 const {sql,DB}=fixture();try{
  sql.exec("UPDATE public_events SET status='Đã kết thúc'");
  await mutateEventParticipation({DB},USER,42,true);
  assert.deepEqual((await listEventParticipations({DB},USER)).data,[42]);
 }finally{sql.close();}
});
function request(DB:D1Database,role:string,path='',method='GET',authenticated=true) {
 return worker.fetch(new Request('https://hotrosinhvienhub.id.vn/api/user/v1/event-participations'+path,{
  method,headers:authenticated?{Cookie:'hubplanner_auth.session_token=test'}:{}
 }),{DB,ALLOWED_ORIGINS:'https://hotrosinhvienhub.id.vn',
 AUTH_SERVICE:{fetch:async()=>authenticated?Response.json({userId:USER,email:'test@example.com',role}):Response.json({error:'unauthorized'},{status:401})}} as never,{} as never);
}
test('actual routes enforce cookie authentication and server-scoped writes',async()=>{
 const {sql,DB}=fixture();try{
  assert.equal((await request(DB,'user','/42','PUT',false)).status,401);
  assert.equal((await request(DB,'user','/42?userId='+OTHER,'PUT')).status,200);
  assert.deepEqual((await listEventParticipations({DB},USER)).data,[42]);
  assert.deepEqual((await listEventParticipations({DB},OTHER)).data,[]);
  assert.equal((await request(DB,'user','?userId='+OTHER)).status,403);
  assert.equal((await request(DB,'user','/42','DELETE')).status,200);
 }finally{sql.close();}
});
test('admin and auditor can read other owners but never write on their behalf',async()=>{
 const {sql,DB}=fixture();try{
  await mutateEventParticipation({DB},OTHER,42,true);
  for(const role of ['admin','auditor']) {
   const response=await request(DB,role,'?userId='+OTHER);
   assert.equal(response.status,200);assert.deepEqual((await response.json() as any).data,[42]);
   await request(DB,role,'/42?userId='+OTHER,'DELETE');
   assert.deepEqual((await listEventParticipations({DB},OTHER)).data,[42]);
  }
 }finally{sql.close();}
});
test('participation runtime has no remote storage, sync or legacy owner dependency',()=>{
 const source=readFileSync('cloudflare/worker/src/event-participations.ts','utf8');
 assert.doesNotMatch(source,/supabase|fetch\(/i);
 const index=readFileSync('cloudflare/worker/src/index.ts','utf8');
 assert.doesNotMatch(index,/syncEventParticipations|requireStaffRole/);
 assert.doesNotMatch(readFileSync('cloudflare/worker/src/account-delete.ts','utf8'),/\['user_participations'/);
});
