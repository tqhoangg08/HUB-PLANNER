import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {textFixture,TEXT_ORIGIN,ADMIN} from './fixtures/ai-text-documents.ts';
import {segmentDocumentText,renderTextSegment,isUnpaginatedNativePipeline,TEXT_FIRST_PIPELINE} from '../shared/ai-document-text.ts';
import {getAiDocumentSegmentCount} from '../shared/ai-document-limits.ts';
import {refreshAiSearchDocument,refreshOperation,handleAdminAiDocuments} from '../cloudflare/worker/src/ai-documents.ts';
import {normalizeAuthorizedAiSearchChunks} from '../cloudflare/worker/src/ai-search-retrieval.ts';
import {extractOfficialDocumentLocators} from '../cloudflare/worker/src/gemini-file-search.ts';
import {buildCompletenessDependencies} from '../cloudflare/worker/src/ai-advisor-completeness-config.ts';
import {buildDerivedPageObjectKey} from '../cloudflare/worker/src/ai-document-ingestion.ts';
const longText=(n:number)=>Array.from({length:n},(_,i)=>`Điều ${i+1}. Quy định có nguồn\n\nNội dung ${i+1}: 25.600.000 đồng/năm; 747.000 đồng/tín chỉ.\n\n`).join('');
const publish=(f:ReturnType<typeof textFixture>,id:string,live:null|string=null)=>f.call({action:'publish',revisionId:id,expectedLiveDocumentId:live,confirmation:'PUBLISH_REVIEWED_TEXT'});

test('semantic segmentation preserves literal numbers/accents/tables without invented pages',()=>{
  const table='Bảng 2. Học phí\n\n| Khóa | Năm | Tín chỉ |\n|---|---|---|\n|39|25.600.000|747.000|\n';
  const text=`Điều 3. Nội dung\n\n1. Không được suy đoán.\n\n${table}\nMục 2. Phạm vi\n\nNgoài trường.\n`;
  const segments=segmentDocumentText(text);
  assert.equal(segments.map(s=>s.text).join(''),text);assert.ok(segments.some(s=>s.text.includes('|39|25.600.000|747.000|')));
  assert.ok(segments.some(s=>s.text.includes('| Khóa |')&&s.text.includes('|39|')));
  assert.doesNotMatch(segments.map(renderTextSegment).join(''),/<!-- page:|## Trang/);
  assert.throws(()=>segmentDocumentText('Bảng 1\n'+('| x | y |\n'.repeat(800))),/bảng\/đoạn/);
  assert.throws(()=>segmentDocumentText('```\nmissing close'),/chưa đóng/);
  assert.throws(()=>segmentDocumentText('x'.repeat(1048577)),/1 MB/);
  assert.throws(()=>segmentDocumentText('x\0y'),/NUL/);
  assert.throws(()=>segmentDocumentText(longText(129)),/128/);
});

test('real SQLite additive count preserves 0044 CHECK, defaults and legacy rows',async()=>{
  const f=textFixture();try{
    const saved:any=await f.save();await f.call({action:'index',revisionId:saved.revision.id});
    const id=saved.revision.id;
    f.sql.prepare('UPDATE ai_documents SET index_segment_count=NULL,ocr_page_count=40 WHERE id=?').run(id);
    assert.equal(getAiDocumentSegmentCount(f.sql.prepare('SELECT * FROM ai_documents').get()!),40);
    for(const count of [1,40,52,79,128]){f.sql.prepare('UPDATE ai_documents SET index_segment_count=?,ocr_page_count=NULL WHERE id=?').run(count,id);assert.equal(getAiDocumentSegmentCount(f.sql.prepare('SELECT * FROM ai_documents').get()!),count);}
    for(const count of [0,-1,129,1.5,'not-a-number'])assert.throws(()=>f.sql.prepare('UPDATE ai_documents SET index_segment_count=? WHERE id=?').run(count,id),/CHECK/);
    assert.throws(()=>f.sql.prepare('UPDATE ai_documents SET ocr_page_count=52 WHERE id=?').run(id),/CHECK/);
    assert.equal(getAiDocumentSegmentCount({index_segment_count:129,ocr_page_count:1}),null);
    assert.equal(getAiDocumentSegmentCount({ocr_page_count:52}),null);
    assert.equal(getAiDocumentSegmentCount({index_segment_count:'52',ocr_page_count:1}),null);
  }finally{f.sql.close();}
});

test('Admin-only reads/writes, exact Origin and strict fields block role/approval forgery',async()=>{
  const f=textFixture();try{
    for(const role of ['user','auditor']){f.identity.role=role;await assert.rejects(()=>f.save(),e=>(e as {status:number}).status===403);await assert.rejects(()=>f.call(),e=>(e as {status:number}).status===403);}
    f.identity.role='admin';await assert.rejects(()=>f.call(undefined,undefined,{Cookie:''}),e=>(e as {status:number}).status===401);
    await assert.rejects(()=>f.call({action:'save'},undefined,{Origin:'https://evil.invalid'}),e=>(e as {status:number}).status===403);
    await assert.rejects(()=>f.save('text',{approved:true}),/Trường/);
    await assert.rejects(()=>f.save('text',{visibility:'program',programCode:'all'}),/mã chương trình/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM ai_text_revisions').get()?.n,0);
  }finally{f.sql.close();}
});

test('draft stores exact raw bytes privately, no Advisor row/provider call, edit appends version',async()=>{
  const f=textFixture();try{
    const raw='Điều 3. Nội dung'.normalize('NFD')+'\r\n\r\nA\t100\r\nB\t25\r\n';
    const s:any=await f.save(raw),d:any=await f.call(undefined,s.documentId);
    assert.equal(d.text,raw);assert.equal(d.revision.state,'draft');assert.equal(f.uploads,0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM ai_documents').get()?.n,0);
    const first=[...f.objects.values()][0].bytes.slice();
    await f.save(raw+'\r\nMục 2. Bổ sung',{documentId:s.documentId,sequence:s.sequence});
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM ai_text_revisions').get()?.n,2);assert.deepEqual([...f.objects.values()][0].bytes,first);
    await assert.rejects(()=>f.save('stale',{documentId:s.documentId,sequence:s.sequence}),e=>(e as {status:number}).status===409);
  }finally{f.sql.close();}
});

test('52/79/128 segments index all exact keys/revisions in batches, no old CHECK violation',async()=>{
  for(const n of [52,79,128]){
    const f=textFixture();try{
      const s:any=await f.save(longText(n));assert.equal(s.revision.segments,n);await f.ready(s.revision.id);
      const row=f.sql.prepare('SELECT * FROM ai_documents').get()!;
      assert.equal(row.index_segment_count,n);assert.equal(row.ocr_page_count,null);assert.equal(row.indexing_status,'processing');
      assert.equal(f.receipts.size,n);assert.equal(f.uploads,n);assert.ok(f.lists<=3);
      assert.equal(f.sql.prepare('SELECT state FROM ai_text_revisions').get()?.state,'ready');
      assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM ai_documents WHERE indexing_status='completed'").get()?.n,0);
      await publish(f,s.revision.id);assert.equal(f.sql.prepare('SELECT indexing_status FROM ai_documents').get()?.indexing_status,'completed');
      for(const [i,receipt] of [...f.receipts.values()].entries()){assert.equal(receipt.key,buildDerivedPageObjectKey(s.revision.id,String(row.ai_search_revision),i+1));assert.equal(receipt.metadata.revision,row.ai_search_revision);}
    }finally{f.sql.close();}
  }
});

test('partial/wrong/pending/error receipts never publish; generic file GET cannot bypass explicit publication',async()=>{
  const f=textFixture();try{
    const s:any=await f.save(longText(52));await f.call({action:'index',revisionId:s.revision.id});
    for(let i=0;i<7;i++)await f.call({action:'index_batch',revisionId:s.revision.id});
    await f.call({action:'check',revisionId:s.revision.id});assert.equal(f.sql.prepare('SELECT state FROM ai_text_revisions').get()?.state,'awaiting_receipts');
    for(const item of f.receipts.values())item.status='completed';const last=[...f.receipts.values()][51];last.metadata.revision='other';
    await f.call({action:'check',revisionId:s.revision.id});assert.equal(f.sql.prepare('SELECT state FROM ai_text_revisions').get()?.state,'awaiting_receipts');
    last.metadata.revision=f.sql.prepare('SELECT ai_search_revision FROM ai_documents').get()?.ai_search_revision;
    f.faults.list=true;const checked:any=await f.call({action:'check',revisionId:s.revision.id});assert.equal(checked.receiptStatus,'unavailable');
    f.faults.list=false;await f.call({action:'check',revisionId:s.revision.id});
    const row=f.sql.prepare('SELECT * FROM ai_documents').get() as Parameters<typeof refreshAiSearchDocument>[1];
    assert.equal((await refreshAiSearchDocument(f.env,row)).indexing_status,'processing');assert.equal((await refreshOperation(f.env,row)).indexing_status,'processing');
    await assert.rejects(()=>publish(f,s.revision.id,'wrong'),e=>(e as {status:number}).status===409);
    await assert.rejects(()=>f.call({action:'publish',revisionId:s.revision.id,expectedLiveDocumentId:null,approved:true}),/Trường/);
    last.status='running';await assert.rejects(()=>publish(f,s.revision.id),/receipts/);
  }finally{f.sql.close();}
});

test('provider/R2 failure keeps source, draft and previous live; resume only missing segments',async()=>{
  const f=textFixture();try{
    const s:any=await f.save(longText(12));await f.call({action:'index',revisionId:s.revision.id});await f.call({action:'index_batch',revisionId:s.revision.id});
    const before=f.uploads;f.faults.upload=true;await assert.rejects(()=>f.call({action:'index_batch',revisionId:s.revision.id}),/chưa thành công/);
    assert.equal(f.sql.prepare('SELECT cursor FROM ai_text_revisions').get()?.cursor,8);
    assert.equal(f.sql.prepare('SELECT indexing_status FROM ai_documents').get()?.indexing_status,'processing');assert.ok(f.objects.size>=10);
    f.faults.upload=false;await f.call({action:'index_batch',revisionId:s.revision.id});assert.equal(f.uploads,before+1+4);
    for(const item of f.receipts.values())item.status='completed';await f.call({action:'check',revisionId:s.revision.id});await publish(f,s.revision.id);
    const next:any=await f.save(longText(12)+'\nĐiều 13. Bổ sung',{documentId:s.documentId,sequence:s.sequence});await f.call({action:'index',revisionId:next.revision.id});
    f.faults.r2=true;await assert.rejects(()=>f.call({action:'index_batch',revisionId:next.revision.id}),/chưa thành công/);
    assert.equal(f.sql.prepare('SELECT live_document_id FROM ai_text_documents').get()?.live_document_id,s.revision.id);
    assert.equal(f.sql.prepare('SELECT indexing_status FROM ai_documents WHERE id=?').get(s.revision.id)?.indexing_status,'completed');
  }finally{f.sql.close();}
});

test('D1 materialization failure rolls back transaction; never deletes raw draft or falsely completes',async()=>{
  const f=textFixture();try{
    const s:any=await f.save(longText(52));f.faults.sql=true;await assert.rejects(()=>f.call({action:'index',revisionId:s.revision.id}),/fixture D1/);
    assert.equal(f.sql.prepare('SELECT state FROM ai_text_revisions').get()?.state,'draft');assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM ai_documents').get()?.n,0);
    assert.equal(f.objects.size,1);assert.equal(f.uploads,0);
  }finally{f.sql.close();}
});

test('publish swaps only its own previous Text-first revision, preserves original/source/history, actor server-derived',async()=>{
  const f=textFixture();try{
    const first:any=await f.save();await f.ready(first.revision.id);await publish(f,first.revision.id);const objectsBefore=[...f.objects.keys()];
    const next:any=await f.save('Điều 4. Revision mới\n\n100 điểm.',{documentId:first.documentId,sequence:first.sequence});await f.ready(next.revision.id);
    assert.equal(f.sql.prepare('SELECT indexing_status FROM ai_documents WHERE id=?').get(first.revision.id)?.indexing_status,'completed');
    await publish(f,next.revision.id,first.revision.id);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM ai_documents WHERE indexing_status='completed'").get()?.n,1);
    assert.equal(f.sql.prepare('SELECT live_document_id FROM ai_text_documents').get()?.live_document_id,next.revision.id);
    assert.ok(objectsBefore.every(k=>f.objects.has(k)));assert.equal(f.sql.prepare('SELECT published_by FROM ai_text_revisions WHERE id=?').get(next.revision.id)?.published_by,ADMIN);
    const r=new Request(`${TEXT_ORIGIN}/api/admin/v1/ai-documents?id=${next.revision.id}`,{method:'DELETE',headers:{Cookie:'fixture'}});
    await assert.rejects(()=>handleAdminAiDocuments(r,new URL(r.url),f.env),/không xóa/);
  }finally{f.sql.close();}
});

test('concurrent deletion aborts publication atomically; does not deactivate previous live',async()=>{
  const f=textFixture();try{
    const first:any=await f.save();await f.ready(first.revision.id);await publish(f,first.revision.id);
    const next:any=await f.save('Điều 4. Revision mới',{documentId:first.documentId,sequence:first.sequence});await f.ready(next.revision.id);
    f.listingHook=()=>{f.sql.prepare("UPDATE ai_documents SET deleted_at='fixture' WHERE id=?").run(next.revision.id);};
    await assert.rejects(()=>publish(f,next.revision.id,first.revision.id),/TEXT_PUBLICATION_SOURCE_CHANGED/);
    assert.equal(f.sql.prepare('SELECT state FROM ai_text_revisions WHERE id=?').get(next.revision.id)?.state,'ready');
    assert.equal(f.sql.prepare('SELECT indexing_status FROM ai_documents WHERE id=?').get(first.revision.id)?.indexing_status,'completed');
    assert.equal(f.sql.prepare('SELECT live_document_id FROM ai_text_documents').get()?.live_document_id,first.revision.id);
  }finally{f.sql.close();}
});

test('native text source citations preserve real title/article/table; segment ordinal is never a page; budget unchanged',async()=>{
  const id='11111111-1111-4111-8111-111111111111';assert.equal(isUnpaginatedNativePipeline(TEXT_FIRST_PIPELINE),true);
  const snippet='Điều 3. Nội dung\nKhoản 2. Phạm vi\nBảng 1. Học phí\n100 điểm.';
  const sources=normalizeAuthorizedAiSearchChunks([{id:'chunk',text:snippet,item:{key:buildDerivedPageObjectKey(id,'revision',79),metadata:{document_id:id,active:true}}}],[{id,locatorKind:'word_unit',revision:'revision'}]);
  assert.equal(sources[0].pageNumber,undefined);assert.ok(extractOfficialDocumentLocators(snippet).some(l=>l.includes('Điều 3')));
  let reads=0;const deps=buildCompletenessDependencies({AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'true',DB:{prepare:()=>({bind:()=>({first:async()=>({ai_search_revision:'revision'})})})} as never,AI_DOCUMENTS_BUCKET:{get:async()=>{reads++;return {body:new Blob([snippet]).stream(),size:snippet.length,text:async()=>snippet};}} as never},{search:async()=>({})},{text:'local',ocr:'local'});
  for(const ordinal of [52,79,128])assert.equal(await deps.pageContent!({documentId:id,itemKey:buildDerivedPageObjectKey(id,'revision',ordinal)}),snippet);
  assert.equal(await deps.pageContent!({documentId:id,itemKey:buildDerivedPageObjectKey(id,'revision',1)}),null);assert.equal(reads,3);
  assert.doesNotMatch(readFileSync('cloudflare/worker/src/ai-text-documents.ts','utf8'),/console\.log|GEMINI_FILE_SEARCH_API_KEY/);
});
