import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStagingOcrReview,extractReviewPage,validateReviewPages,reviewedBodies,reviewSha,type ReviewEnv} from '../cloudflare/worker/src/staging/advisor-ocr-review.ts';
import {buildDerivedPageObjectKey,renderDerivedPage} from '../cloudflare/worker/src/ai-document-ingestion.ts';
const DOC='11111111-1111-4111-8111-111111111111',ADMIN='22222222-2222-4222-8222-222222222222';
const ORIGIN='https://hub-advisor-pr88-app-staging.example.workers.dev',BASE='v1-'+ 'a'.repeat(32);
async function fixture(){
  const sql=new DatabaseSync(':memory:');
  for(const migration of ['0032_ai_documents_chat_d1_r2_authority','0044_ai_document_ocr_ingestion','0045_ai_document_public_view_policy','0049_ai_document_derived_index_identity','0054_ai_document_search_ingestion_state'])sql.exec(readFileSync(`cloudflare/migrations/${migration}.sql`,'utf8'));
  sql.exec(readFileSync('staging/advisor/migrations/0001_ocr_review.sql','utf8'));
  const hash=await reviewSha('original pdf fixture');
  sql.prepare(`INSERT INTO ai_documents(id,title,original_file_name,storage_path,mime_type,file_size,content_hash,category,version,indexing_status,uploaded_by,ocr_page_count,ai_search_status,ai_search_revision,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,1,'completed',?,2,'completed',?,'2026-10-10','2026-10-10')`).run(DOC,'Fixture PDF','fixture.pdf','ai-documents/fixture.pdf','application/pdf',20,hash,'training_regulation',ADMIN,BASE);
  const prepare=(query:string)=>{let values:unknown[]=[];const statement={bind(...args:unknown[]){values=args;return statement;},
    async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};},
    async run(){return {meta:{changes:Number(sql.prepare(query).run(...values).changes)}};}};return statement;};
  const db={prepare,async batch(statements:ReturnType<typeof prepare>[]){sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const objects=new Map<string,string>([['ai-documents/fixture.pdf','original pdf fixture']]);
  for(let i=1;i<=2;i++)objects.set(buildDerivedPageObjectKey(DOC,BASE,i),renderDerivedPage({pageNumber:i,text:`OCR trang ${i}: khiêm tôn.`,sourceKind:'ocr',layout:'columns'}));
  const bucket={async get(key:string){const text=objects.get(key);return text===undefined?null:{text:async()=>text,arrayBuffer:async()=>new TextEncoder().encode(text).buffer,size:new TextEncoder().encode(text).length,body:new Blob([text]).stream()};},
    async put(key:string,text:string){if(objects.has(key))return null;objects.set(key,text);return {key};}};
  const identity={role:'admin',userId:ADMIN,email:'fixture@example.invalid'};
  const items:{key:string;status:string;metadata:Record<string,unknown>}[]=[];let uploads=0,fail=false;
  const instance={items:{async upload(key:string,_text:string,{metadata}:{metadata:Record<string,unknown>}){uploads++;if(fail)throw Error('provider timeout');items.push({key,status:'running',metadata});},async list(){return {result:items};}}};
  const env={DB:db,AI_DOCUMENTS_BUCKET:bucket,STAGING_ORIGIN:ORIGIN,AUTH_SERVICE:{fetch:async()=>Response.json(identity)}} as unknown as ReviewEnv;
  const call=(input?:Record<string,unknown>,query='',headers:Record<string,string>={})=>handleStagingOcrReview(new Request(`${ORIGIN}/api/staging/ocr-review?document=${DOC}${query}`,{method:input?'POST':'GET',headers:{Cookie:'fixture=opaque',Origin:ORIGIN,'Content-Type':'application/json',...headers},...(input?{body:JSON.stringify(input)}:{})}),env,instance as unknown as AiSearchInstance);
  const create=async()=>{const r=await call({action:'create',sourceHash:hash,baseRevision:BASE});assert.equal(r.status,201);return (await r.json()).review;};
  const approve=async(r:Record<string,unknown>)=>{const response=await call({action:'approve',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash,confirmation:'I_REVIEWED_THE_ORIGINAL_PDF'});assert.equal(response.status,200);return (await response.json()).review;};
  return {sql,env,objects,identity,items,call,create,approve,hash,get uploads(){return uploads;},set fail(value:boolean){fail=value;}};
}
test('admin can read exact physical pages and original privately; draft leaves live source unchanged',async()=>{
  const f=await fixture();try{
    const r=await f.call(),data=await r.json();assert.equal(r.status,200);assert.equal(data.pages.length,2);assert.match(data.pages[1].text,/trang 2/);
    const pdf=await f.call(undefined,'&file=original');assert.equal(pdf.headers.get('Content-Type'),'application/pdf');assert.equal(pdf.headers.get('X-Frame-Options'),'SAMEORIGIN');
    await f.create();assert.equal(f.sql.prepare('SELECT ai_search_revision FROM ai_documents').get()?.ai_search_revision,BASE);assert.equal(f.uploads,0);
  }finally{f.sql.close();}
});
test('anonymous, user, auditor cannot read, save, approve or index review',async()=>{
  const f=await fixture();try{
    for(const role of ['user','auditor']){f.identity.role=role;assert.equal((await f.call()).status,403);assert.equal((await f.call({action:'approve',approved:true})).status,403);}
    f.identity.role='admin';assert.equal((await f.call(undefined,'',{Cookie:''})).status,401);
  }finally{f.sql.close();}
});
test('same-origin and isolated hostname required before any write',async()=>{
  const f=await fixture();try{
    assert.equal((await f.call({action:'create'},'',{Origin:'https://evil.invalid'})).status,403);
    const r=await handleStagingOcrReview(new Request('https://hotrosinhvienhub.id.vn/api/staging/ocr-review',{headers:{Cookie:'fixture'}}),f.env,{} as AiSearchInstance);assert.equal(r.status,403);
  }finally{f.sql.close();}
});
test('client approved=true, confidence, actor and AI-origin fields do not grant approval',async()=>{
  const f=await fixture();try{const r=await f.create();
    for(const patch of [{approved:true},{confidence:100},{approved_by:ADMIN},{provider:'ai'}])assert.equal((await f.call({action:'save',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash,pages:r.pages,...patch})).status,400);
    assert.equal((await f.call({action:'approve',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash})).status,400);
    assert.equal(f.sql.prepare('SELECT state FROM staging_ocr_reviews').get()?.state,'draft');
  }finally{f.sql.close();}
});
test('saved corrections preserve accent and page; append-only audit has actual authenticated actor/hash/time and before/after',async()=>{
  const f=await fixture();try{const r=await f.create(),pages=r.pages;pages[1].text='2. Khiêm tốn; không tự đoán số 100.';
    const saved=await f.call({action:'save',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash,pages});assert.equal(saved.status,200);
    const updated=(await saved.json()).review;assert.equal(updated.sequence,2);assert.notEqual(updated.draftHash,r.draftHash);
    const audit=f.sql.prepare('SELECT * FROM staging_ocr_review_history ORDER BY change_id DESC').get();assert.equal(audit?.actor_id,ADMIN);assert.equal(audit?.source_hash,f.hash);
    assert.match(String(audit?.before_pages_json),/tôn/);assert.match(String(audit?.after_pages_json),/tốn/);assert.ok(audit?.changed_at);
    assert.throws(()=>f.sql.exec('DELETE FROM staging_ocr_review_history'),/IMMUTABLE/);assert.throws(()=>f.sql.exec("UPDATE staging_ocr_review_history SET actor_id='fake'"),/IMMUTABLE/);
  }finally{f.sql.close();}
});
test('stale draft, changed source or deleted source rejected',async()=>{
  const f=await fixture();try{const r=await f.create();
    assert.equal((await f.call({action:'save',reviewId:r.id,sequence:0,draftHash:r.draftHash,pages:r.pages})).status,409);
    f.sql.prepare('UPDATE ai_documents SET ai_search_revision=?').run('v2-'+ 'b'.repeat(32));
    assert.equal((await f.call({action:'approve',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash,confirmation:'I_REVIEWED_THE_ORIGINAL_PDF'})).status,409);
    f.sql.exec("UPDATE ai_documents SET deleted_at='2026-10-10'");assert.equal((await f.call()).status,409);
  }finally{f.sql.close();}
});
test('source bytes must still match declared PDF hash for approval',async()=>{
  const f=await fixture();try{const r=await f.create();f.objects.set('ai-documents/fixture.pdf','changed bytes');
    const reply=await f.call({action:'approve',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash,confirmation:'I_REVIEWED_THE_ORIGINAL_PDF'});assert.equal(reply.status,409);assert.equal(f.uploads,0);
  }finally{f.sql.close();}
});
test('baseline object changes block approval; completed provider cannot promote changed reviewed object',async()=>{
  const f=await fixture();try{const r=await f.create(),key=buildDerivedPageObjectKey(DOC,BASE,1),before=f.objects.get(key)!;
    f.objects.set(key,before+'changed');
    const args={action:'approve',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash,confirmation:'I_REVIEWED_THE_ORIGINAL_PDF'};
    assert.equal((await f.call(args)).status,409);f.objects.set(key,before);
    const approved=await f.approve(r);await f.call({action:'index',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash});f.items.forEach(p=>p.status='completed');
    f.objects.set(buildDerivedPageObjectKey(DOC,approved.newRevision,1),'tampered reviewed page');f.env.STAGING_OCR_PROMOTION_ENABLED='true';
    assert.equal((await f.call({action:'promote',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash,confirmation:'PROMOTE_THIS_STAGING_REVISION'})).status,409);
    assert.equal(f.sql.prepare('SELECT ai_search_revision FROM ai_documents').get()?.ai_search_revision,BASE);
  }finally{f.sql.close();}
});
test('approval records server actor/time and allocates separate immutable revision, never promotes automatically',async()=>{
  const f=await fixture();try{const r=await f.approve(await f.create());assert.equal(r.state,'approved');assert.notEqual(r.newRevision,BASE);
    assert.equal(f.sql.prepare('SELECT approved_by FROM staging_ocr_reviews').get()?.approved_by,ADMIN);assert.equal(f.sql.prepare('SELECT ai_search_revision FROM ai_documents').get()?.ai_search_revision,BASE);
    assert.equal((await f.call({action:'save',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash,pages:r.pages})).status,409);
    assert.throws(()=>f.sql.exec("UPDATE staging_ocr_reviews SET pages_json='[]'"),/IMMUTABLE/);
  }finally{f.sql.close();}
});
test('index requires approval, uploads ALL pages, readiness reflects real completed statuses; old objects remain byte-identical',async()=>{
  const f=await fixture();try{let r=await f.create();const args=()=>({action:'index',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash});
    assert.equal((await f.call(args())).status,409);r=await f.approve(r);
    const before=new Map(f.objects),response=await f.call(args()),data=await response.json();assert.equal(response.status,200);assert.equal(f.uploads,2);assert.equal(data.index.allPagesReady,false);
    for(const [k,v]of before)assert.equal(f.objects.get(k),v);
    f.items[0].status='completed';let status=await(await f.call(undefined,`&review=${r.id}`)).json();assert.equal(status.index.completedPages,1);assert.equal(status.index.allPagesReady,false);
    f.items[1].status='completed';status=await(await f.call(undefined,`&review=${r.id}`)).json();assert.equal(status.index.allPagesReady,true);
    assert.equal(f.sql.prepare('SELECT ai_search_revision FROM ai_documents').get()?.ai_search_revision,BASE);
  }finally{f.sql.close();}
});
test('provider failure retains approved snapshot and old live revision; explicit index retry is safe',async()=>{
  const f=await fixture();try{const r=await f.approve(await f.create());f.fail=true;
    const input={action:'index',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash};assert.equal((await f.call(input)).status,503);
    assert.equal(f.sql.prepare('SELECT state FROM staging_ocr_reviews').get()?.state,'index_failed');assert.equal(f.sql.prepare('SELECT ai_search_revision FROM ai_documents').get()?.ai_search_revision,BASE);
    f.fail=false;assert.equal((await f.call(input)).status,200);
  }finally{f.sql.close();}
});
test('promotion needs separate disabled-by-default gate and all pages; CAS rejects concurrent base update',async()=>{
  const f=await fixture();try{const r=await f.approve(await f.create());
    await f.call({action:'index',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash});
    const input={action:'promote',reviewId:r.id,sequence:r.sequence,draftHash:r.draftHash,confirmation:'PROMOTE_THIS_STAGING_REVISION'};
    assert.equal((await f.call(input)).status,403);f.env.STAGING_OCR_PROMOTION_ENABLED='true';assert.equal((await f.call(input)).status,409);
    f.items.forEach(i=>i.status='completed');f.sql.prepare('UPDATE ai_documents SET version=2').run();assert.equal((await f.call(input)).status,409);
    f.sql.prepare('UPDATE ai_documents SET version=1').run();assert.equal((await f.call(input)).status,200);
    assert.equal(f.sql.prepare('SELECT ai_search_revision FROM ai_documents').get()?.ai_search_revision,r.newRevision);
    assert.ok(f.objects.has(buildDerivedPageObjectKey(DOC,BASE,1)));assert.ok(f.sql.prepare('SELECT promoted_by FROM staging_ocr_reviews').get()?.promoted_by);
  }finally{f.sql.close();}
});
test('page completeness, text byte caps, unknown fields and missing paragraphs cannot be silently accepted',()=>{
  assert.throws(()=>validateReviewPages([{pageNumber:2,text:'abc'}],1),/INVALID/);
  assert.throws(()=>validateReviewPages([{pageNumber:1,text:'abc',approved:true}],1),/INVALID/);
  assert.throws(()=>validateReviewPages([{pageNumber:1,text:' '}],1),/INVALID/);
  assert.throws(()=>validateReviewPages([{pageNumber:1,text:'a'.repeat(100001)}],1),/INVALID/);
});
test('reviewed pages marked individually while unchanged OCR stays byte-identical and original page numbering retained',()=>{
  const baseline=[1,2].map(i=>renderDerivedPage({pageNumber:i,text:'khiêm tôn',sourceKind:'ocr',layout:'columns'}));
  const bodies=reviewedBodies({id:DOC,source_hash:'a'.repeat(64),base_revision:BASE,baseline_json:JSON.stringify(baseline),pages_json:JSON.stringify([{pageNumber:1,text:'khiêm tôn'},{pageNumber:2,text:'khiêm tốn'}])});
  assert.equal(bodies[0],baseline[0]);assert.match(bodies[1],/extraction: admin_reviewed/);assert.match(bodies[1],/page: 2/);assert.match(bodies[1],/khiêm tốn/);
  assert.equal(extractReviewPage(bodies[1],2).text,'khiêm tốn');
});
test('UI review is staging opt-in; production routes never import the human review or allow automatic approval',()=>{
  const stage=readFileSync('staging/advisor/OcrReviewPage.tsx','utf8'),prod=readFileSync('cloudflare/worker/src/index.ts','utf8');
  assert.match(stage,/Phê duyệt nội dung đã đối chiếu/);assert.match(stage,/Tôi là Admin/);assert.match(stage,/Lưu bản nháp/);assert.match(stage,/canvas/);
  assert.doesNotMatch(prod,/advisor-ocr-review/);assert.doesNotMatch(stage,/approved\s*:\s*true/);
});
test('corrected pages keep existing runtime byte/character bounds; code fences cannot corrupt physical page markers',()=>{
  const baseline=[renderDerivedPage({pageNumber:1,text:'baseline',sourceKind:'ocr',layout:'columns'})];
  const review={id:DOC,source_hash:'a'.repeat(64),base_revision:BASE,baseline_json:JSON.stringify(baseline),pages_json:''};
  assert.throws(()=>reviewedBodies({...review,pages_json:JSON.stringify([{pageNumber:1,text:'x'.repeat(8000)}])}),/RUNTIME_LIMIT/);
  const text='Văn bản ``` và dấu tiếng Việt.';
  assert.equal(extractReviewPage(reviewedBodies({...review,pages_json:JSON.stringify([{pageNumber:1,text}])})[0],1).text,text);
});
