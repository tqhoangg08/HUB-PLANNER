import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {textFixture,ADMIN,TEXT_ORIGIN} from './fixtures/ai-text-documents.ts';
import {parseDocumentTags,documentTagScore,documentTagSearchQuery} from '../shared/ai-document-tags.ts';
import {attachDocumentTags,saveDocumentTags} from '../cloudflare/worker/src/ai-document-tags.ts';
import {selectAdvisorDocumentCandidatesWithIndexIdentity,routeAdvisorDocuments,resolveDocumentSourcesWithDiagnostics,type AiAdvisorEnv} from '../cloudflare/worker/src/ai-advisor.ts';
import {handleAdminAiDocuments} from '../cloudflare/worker/src/ai-documents.ts';
import {tuitionMajorQuery,resolveTuitionMajorAnswer,TUITION_SCOPE_QUESTION} from '../cloudflare/worker/src/ai-advisor-tuition-major.ts';
import {sourceSupportedReply,hasUnsupportedAnswerDetails} from '../cloudflare/worker/src/ai-advisor-grounding.ts';
import {executeAiAdvisorV2Document} from '../cloudflare/worker/src/ai-advisor-v2-runtime.ts';
import {evaluateAdvisorQuota} from '../cloudflare/worker/src/ai-advisor-quota.ts';
import {CloudflareAiSearchRetrievalProvider,type AiSearchSearchRequest} from '../cloudflare/worker/src/ai-search-retrieval.ts';
import {fingerprintDocumentRevisions,MemoryAdvisorCache} from '../cloudflare/worker/src/ai-advisor-cache.ts';
import {buildDerivedPageObjectKey} from '../cloudflare/worker/src/ai-document-ingestion.ts';
import {extractOfficialDocumentLocators} from '../cloudflare/worker/src/gemini-file-search.ts';
import {buildEvidenceRetrievalPlan} from '../cloudflare/worker/src/ai-advisor-retrieval-plan.ts';
import type {AiAdvisorV2Answer} from '../cloudflare/worker/src/ai-advisor-v2-runtime.ts';
import type {AiSearchRetrievalResult} from '../cloudflare/worker/src/ai-search-retrieval.ts';
const ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const question='Mức học phí của ngành Kinh tế quốc tế là bao nhiêu ạ?';
// Entirely synthetic values; not a statement about production fees.
const table=(cohort='41',fee='18.000.000',program='Đại học chính quy chuẩn')=>`Bảng 2. Học phí\nNăm học 2026-2027\n| STT | Ngành | Học phí theo năm (đồng/năm) | Học phí theo tín chỉ (đồng/tín chỉ) |\n| --- | --- | --- | --- |\n| | ${program} | | |\n| Khóa ${cohort} | | | |\n| 1 | Ngành Kế toán | 19.000.000 | 700.000 |\n| 2 | Ngành Kinh tế quốc tế | ${fee} | 600.000 |\n| 3 | Ngành Kinh tế | 21.000.000 | 800.000 |`;
const evidence=(snippet=table(),sourceId='S1')=>({sourceId,documentId:ID,documentTitle:'Thông báo học phí kiểm thử',revision:'v1-fixture',snippet});
const migration=(f:ReturnType<typeof textFixture>)=>f.sql.exec(readFileSync('cloudflare/migrations/0057_ai_document_tags.sql','utf8'));
const fileRequest=(f:ReturnType<typeof textFixture>,body?:unknown,query='')=>{
  const request=new Request(`${TEXT_ORIGIN}/api/admin/v1/ai-documents${query}`,{method:body?'POST':'GET',headers:{Cookie:'fixture=opaque',Origin:TEXT_ORIGIN,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  return handleAdminAiDocuments(request,new URL(request.url),f.env);
};

test('major identity is exact, accent-insensitive and does not consume polite question suffix',()=>{
  assert.equal(tuitionMajorQuery(question)?.major,'kinh te quoc te');
  assert.equal(tuitionMajorQuery('hoc phi nganh Kinh te quoc te la bao nhieu')?.major,'kinh te quoc te');
  assert.equal(tuitionMajorQuery('Điểm của ngành Kinh tế quốc tế?'),null);
  assert.equal(tuitionMajorQuery('Học phí ngành Kinh tế quốc tế khóa 41 hệ chuẩn?')?.cohort,'41');
});
test('one major returns only exact related rows with literal cohort/program/year/units and evidence',()=>{
  const answer=resolveTuitionMajorAnswer(question,[evidence()])!;
  assert.match(answer.reply,/18\.000\.000/);assert.match(answer.reply,/600\.000/);assert.match(answer.reply,/khóa 41/);
  assert.match(answer.reply,/2026-2027/);assert.match(answer.reply,/đồng\/tín chỉ/);
  assert.doesNotMatch(answer.reply,/Kế toán|19\.000\.000|21\.000\.000/);
  assert.deepEqual(answer.sourceIds,['S1']);assert.ok(answer.sourceExcerpts.S1.includes('| 2 | Ngành Kinh tế quốc tế |'));
  assert.equal(hasUnsupportedAnswerDetails(answer.reply,[answer.sourceExcerpts.S1]),false);
  assert.ok(extractOfficialDocumentLocators(answer.sourceExcerpts.S1).includes('Bảng 2'));
  const credit=resolveTuitionMajorAnswer('Học phí ngành Kinh tế quốc tế theo tín chỉ là bao nhiêu?', [evidence()])!;
  assert.match(credit.reply,/600\.000/);assert.doesNotMatch(credit.reply,/18\.000\.000|\| Ngành \|/);assert.match(credit.reply,/khóa 41/);
});
test('missing scope shows short labeled alternatives only when each is proven, never another table header',()=>{
  const answer=resolveTuitionMajorAnswer(question,[evidence(table()+'\n'+table('42','20.000.000','Đại học chất lượng cao'))])!;
  assert.match(answer.reply,/khóa 41/);assert.match(answer.reply,/khóa 42/);assert.match(answer.reply,/chất lượng cao/);
  assert.match(answer.reply,/20\.000\.000/);assert.ok(answer.reply.split('\n').length<18);
  const scoped=resolveTuitionMajorAnswer('Học phí ngành Kinh tế quốc tế khóa 41 hệ chuẩn?', [evidence(table()+'\n'+table('42','20.000.000'))])!;
  assert.match(scoped.reply,/18\.000\.000/);assert.doesNotMatch(scoped.reply,/20\.000\.000/);
});
test('incomplete/mismatched/conflicting scope asks for clarification, not a table dump or guessed rate',()=>{
  for(const source of [table().replace('| Khóa 41 | | | |',''),table().replace('| | Đại học chính quy chuẩn | | |',''),
    table()+'\n'+table('41','20.000.000'),table()+'\nBảng 3. Bảng khác\n| 4 | Ngành Kinh tế quốc tế | 99.000.000 | 900.000 |',
    '4 Ngành Kinh tế quốc tế 18.000.000 600.000 5 Ngành Kế toán 19.000.000 700.000']){
    const a=resolveTuitionMajorAnswer(question,[evidence(source)])!;assert.equal(a.reply,TUITION_SCOPE_QUESTION);assert.equal(a.sourceIds.length,0);
  }
  assert.equal(resolveTuitionMajorAnswer(question,[evidence(),{...evidence(),documentId:OTHER,sourceId:'S2'}])!.reply,TUITION_SCOPE_QUESTION);
  assert.equal(resolveTuitionMajorAnswer('Học phí ngành Kinh tế quốc tế hệ chưa xác định?', [evidence()])!.reply,TUITION_SCOPE_QUESTION);
  assert.equal(resolveTuitionMajorAnswer('Học phí ngành Kinh tế quốc tế năm 2026?', [evidence()])!.reply,TUITION_SCOPE_QUESTION);
  const bare='| 4 | Ngành Kinh tế quốc tế | 99.000.000 | 900.000 |';
  for(const boundary of ['Điều 3. Chương trình khác','Một chính sách khác.','| STT | Ngành | Học phí theo năm (đồng/năm) | Học phí theo tín chỉ (đồng/tín chỉ) |']){
    assert.equal(resolveTuitionMajorAnswer(question,[evidence(table()+`\n${boundary}\n${bare}`)])!.reply,TUITION_SCOPE_QUESTION);
  }
});
test('fallback suppresses unrelated long fee rows even if model returns a literal source dump',()=>{
  const source=table()+'\n'+Array.from({length:30},(_,i)=>`| ${i+4} | Ngành khác ${i} | 90.000.000 | 900.000 |`).join('\n');
  const reply=sourceSupportedReply(source,[source],question);
  assert.doesNotMatch(reply,/Ngành khác|90\.000\.000/);assert.match(reply,/18\.000\.000/);
  assert.equal(sourceSupportedReply('AI guessed',[source.replace(/\n/g,' ')],question),TUITION_SCOPE_QUESTION);
});
test('default V2 completeness OFF uses exact rows without a model and preserves citation identity',async()=>{
  const result=await executeAiAdvisorV2Document(question,[{id:ID,title:'Thông báo học phí',revision:'v1-fixture',visibility:'public',category:'tuition',active:true}],{
    quota:evaluateAdvisorQuota(undefined),aiSearchInstances:{text:'test',ocr:'test'},aiSearchClient:{async search(){return {chunks:[{id:'unit',text:table(),score:0.9,item:{key:buildDerivedPageObjectKey(ID,'v1-fixture',1),metadata:{document_id:ID,revision:'v1-fixture',visibility:'public',active:true}}}]};}}});
  assert.equal(result.kind,'ANSWER');if(result.kind==='ANSWER'){
    assert.equal(result.generatorCalled,false);assert.equal(result.searchCallCount,1);assert.match(result.answer.reply,/18\.000\.000/);
    assert.equal(result.answer.evidence[0].documentId,ID);assert.equal(result.answer.evidence[0].revision,'v1-fixture');
    assert.doesNotMatch(result.answer.evidence[0].snippet,/Ngành Kế toán/);
  }
});
test('tags normalize Vietnamese/case/whitespace/aliases; reject excessive and unsafe input',()=>{
  assert.deepEqual(parseDocumentTags([' HỌC PHÍ ','hoc phi','Học phí','Rèn luyện'.normalize('NFD')]),['học phí','rèn luyện']);
  assert.ok(documentTagScore('muc thu nam nay',['học phí'])>0);assert.ok(documentTagScore('bang DRL',['rèn luyện'])>0);
  for(const input of [null,'tag',Array(13).fill('x'),['x'.repeat(61)],['<script>'],['x; DROP TABLE'],[1],['']])assert.throws(()=>parseDocumentTags(input));
  assert.equal(documentTagSearchQuery('Môn học nào?',[]),'Môn học nào?');
});
test('SQLite tags save independently, Admin-only + exact Origin and no upload/reindex',async()=>{
  const f=textFixture();try{migration(f);const s:any=await f.save();
    await f.call({action:'update_tags',documentId:s.documentId,tags:['Học phí','2026-2027']});
    const d:any=await f.call(undefined,s.documentId);assert.deepEqual(d.tags,['2026-2027','học phí']);assert.equal(f.uploads,0);assert.equal(f.objects.size,1);
    const version=f.sql.prepare('SELECT version FROM ai_text_revisions').get()?.version;
    await f.call({action:'update_tags',documentId:s.documentId,tags:[]});assert.equal(f.sql.prepare('SELECT version FROM ai_text_revisions').get()?.version,version);
    for(const role of ['user','auditor']){f.identity.role=role;await assert.rejects(()=>f.call({action:'update_tags',documentId:s.documentId,tags:['x']}),e=>(e as {status:number}).status===403);}
    f.identity.role='admin';await assert.rejects(()=>f.call({action:'update_tags',documentId:s.documentId,tags:['x']},undefined,{Origin:'https://evil.invalid'}),e=>(e as {status:number}).status===403);
    await assert.rejects(()=>f.call({action:'update_tags',documentId:s.documentId,tags:['<script>']}),e=>(e as {status:number}).status===400);
  }finally{f.sql.close();}
});
test('file tags cover old uploads and search; no source/revision/status mutation, role bypass or Text-first alias write',async()=>{
  const f=textFixture();try{migration(f);const s:any=await f.save();await f.ready(s.revision.id);
    f.sql.prepare("UPDATE ai_documents SET extraction_pipeline_version='native-docx-test',indexing_status='completed' WHERE id=?").run(s.revision.id);
    const before=f.sql.prepare('SELECT * FROM ai_documents').get();
    await fileRequest(f,{action:'update_tags',id:s.revision.id,tags:['học phí theo ngành']});
    assert.deepEqual(f.sql.prepare('SELECT * FROM ai_documents').get(),before);
    const found:any=await fileRequest(f,undefined,'?search=hoc%20phi%20theo%20nganh');assert.equal(found.total,1);assert.equal(found.documents[0].tags[0],'học phí theo ngành');
    f.identity.role='auditor';await assert.rejects(()=>fileRequest(f,{action:'update_tags',id:s.revision.id,tags:[]}),e=>(e as {status:number}).status===403);
    f.identity.role='admin';f.sql.prepare("UPDATE ai_documents SET extraction_pipeline_version='admin-text-structured-v1' WHERE id=?").run(s.revision.id);
    await assert.rejects(()=>fileRequest(f,{action:'update_tags',id:s.revision.id,tags:[]}),e=>(e as {status:number}).status===409);
  }finally{f.sql.close();}
});
test('logical Text-first tags survive draft/new publication; public candidates exclude draft/private/deleted/stale',async()=>{
  const f=textFixture();try{migration(f);const one:any=await f.save('Điều 1. Văn bản kiểm thử học phí.',{category:'tuition'});
    await f.call({action:'update_tags',documentId:one.documentId,tags:['học phí']});await f.ready(one.revision.id);
    const env=f.env as AiAdvisorEnv,route=routeAdvisorDocuments('học phí');
    assert.equal((await selectAdvisorDocumentCandidatesWithIndexIdentity(env,route)).length,0);
    await f.call({action:'publish',revisionId:one.revision.id,expectedLiveDocumentId:null,confirmation:'PUBLISH_REVIEWED_TEXT'});
    const two:any=await f.save('Điều 1. Văn bản kiểm thử học phí mới.',{documentId:one.documentId,sequence:one.sequence,category:'tuition'});
    assert.deepEqual((await f.call(undefined,one.documentId) as {tags:string[]}).tags,['học phí']);
    await f.ready(two.revision.id);await f.call({action:'publish',revisionId:two.revision.id,expectedLiveDocumentId:one.revision.id,confirmation:'PUBLISH_REVIEWED_TEXT'});
    let docs=await selectAdvisorDocumentCandidatesWithIndexIdentity(env,route);assert.equal(docs.length,1);assert.equal(docs[0].id,two.revision.id);assert.deepEqual(docs[0].tags,['học phí']);
    const citations=await resolveDocumentSourcesWithDiagnostics(env,[{documentId:two.revision.id}],route);assert.equal(citations.sources[0].documentId,two.revision.id);
    for(const patch of ["visibility='admin'","visibility='public',deleted_at='now'","deleted_at=NULL,indexing_status='pending'"]){f.sql.exec(`UPDATE ai_documents SET ${patch} WHERE id='${two.revision.id}'`);assert.equal((await selectAdvisorDocumentCandidatesWithIndexIdentity(env,route)).length,0);}
  }finally{f.sql.close();}
});
test('tag edit invalidates both routing/retrieval and answer fingerprints, without changing source revision',async()=>{
  const f=textFixture();try{migration(f);const s:any=await f.save();await f.ready(s.revision.id);await f.call({action:'publish',revisionId:s.revision.id,expectedLiveDocumentId:null,confirmation:'PUBLISH_REVIEWED_TEXT'});
    const before=await attachDocumentTags(f.env.DB!,[{id:s.revision.id,version:'same'}]);
    await f.call({action:'update_tags',documentId:s.documentId,tags:['học phí']});const after=await attachDocumentTags(f.env.DB!,[{id:s.revision.id,version:'same'}]);
    assert.notEqual(await fingerprintDocumentRevisions(before),await fingerprintDocumentRevisions(after));assert.equal(before[0].version,after[0].version);
    assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM ai_document_tags').get()?.n,1);
    assert.throws(()=>f.sql.prepare('INSERT INTO ai_document_tags(file_document_id,text_document_id,tags_json,updated_by,updated_at) VALUES(?,?,?,?,?)').run(s.revision.id,s.documentId,'[]',ADMIN,'now'),/CHECK/);
  }finally{f.sql.close();}
});
test('tag queries never exclude multi-topic authorized IDs; empty hint result falls back within three calls',async()=>{
  const calls:AiSearchSearchRequest[]=[];
  const provider=new CloudflareAiSearchRetrievalProvider({async search(_,request){calls.push(request);return {chunks:request.query.includes('Từ khóa')?[]:[{id:'ok',text:'Học phí có nguồn',score:0.9,item:{key:'safe',metadata:{document_id:OTHER,active:true}}}]};}},{text:'test',ocr:'test'},true);
  const result=await provider.retrieve({question:'Mức thu?',allowedDocuments:[{id:ID,visibility:'public',tags:['học phí']},{id:OTHER,visibility:'public',tags:['rèn luyện']}]});
  assert.equal(result.sources[0].documentId,OTHER);assert.equal(calls.length,2);assert.equal(calls[1].query,'Mức thu?');
  for(const request of calls)assert.deepEqual(request.ai_search_options.retrieval.filters.document_id?.$in,[ID,OTHER]);
});
test('migration absent preserves legacy catalog and unrelated DB errors do not get swallowed',async()=>{
  const f=textFixture();try{assert.deepEqual(await attachDocumentTags(f.env.DB!,[{id:ID}]),[{id:ID,tags:[]}]);
    await assert.rejects(()=>saveDocumentTags(f.env.DB!,ID,'file',[],ADMIN),/no such table/);
  }finally{f.sql.close();}
  await assert.rejects(()=>attachDocumentTags({prepare(){throw new Error('DB_DOWN');}} as never,[{id:ID}]),/DB_DOWN/);
});
test('actual answer/retrieval caches miss after tag edit and still hit when only catalog ordering changes',async()=>{
  const answerCache=new MemoryAdvisorCache<AiAdvisorV2Answer>(),retrievalCache=new MemoryAdvisorCache<AiSearchRetrievalResult>();let searches=0,generations=0;
  const deps={quota:evaluateAdvisorQuota(undefined),answerCache,retrievalCache,aiSearchInstances:{text:'test',ocr:'test'},
    aiSearchClient:{async search(){searches++;return {chunks:[{id:'one',text:'Quy định học phí.',score:0.9,item:{key:'source.md',metadata:{document_id:ID,visibility:'public',active:true,revision:'v1'}}}]};}},
    evidenceGenerator:{id:'fixture',isConfigured:()=>true,async generate(){generations++;return {supported:true,answer:'Quy định học phí.',sourceIds:['S1']};}}};
  const doc={id:ID,title:'Quy định học phí',revision:'v1',visibility:'public',active:true,tags:['học phí']};
  const first=await executeAiAdvisorV2Document('học phí',[doc],deps);assert.equal(first.kind,'ANSWER');
  const cached=await executeAiAdvisorV2Document('học phí',[doc],deps);assert.equal(cached.kind,'ANSWER');if(cached.kind==='ANSWER')assert.equal(cached.answerCacheHit,true);
  const changed=await executeAiAdvisorV2Document('học phí',[{...doc,tags:['năm học']}],deps);assert.equal(changed.kind,'ANSWER');
  assert.equal(searches,2);assert.equal(generations,2);if(changed.kind==='ANSWER')assert.equal(changed.answerCacheHit,false);
});
test('matching tags rank without supplying evidence; a no-tag/no-match query retains broad retrieval',async()=>{
  const docs=[{id:ID,title:'Quy chế rèn luyện',tags:['rèn luyện'],active:true},{id:OTHER,title:'Văn bản chính thức',tags:['bảng ĐRL'],active:true}];
  const plan=buildEvidenceRetrievalPlan('Phiếu ĐRL có các nhóm nào?',docs);
  assert.ok(plan.scoped.some(d=>d.id===OTHER),'matching tag can identify a source whose title alone misses the subject');
  const noMatch=buildEvidenceRetrievalPlan('Hỏi một quy định khác',docs);assert.equal(noMatch.scoped.length,2);
  const provider=new CloudflareAiSearchRetrievalProvider({async search(){return {chunks:[]};}},{text:'test',ocr:'test'},true);
  const result=await provider.retrieve({question:'học phí',allowedDocuments:[{id:ID,visibility:'public',tags:['học phí']}]});
  assert.equal(result.sources.length,0);assert.equal(result.searchCallCount,2);
});
test('tagged provider still rejects stale revision, private metadata and inactive/unauthorized results',async()=>{
  const provider=new CloudflareAiSearchRetrievalProvider({async search(){return {chunks:[
    {id:'stale',text:table(),item:{key:'old',metadata:{document_id:ID,visibility:'public',active:true,revision:'old'}}},
    {id:'private',text:table(),item:{key:'private',metadata:{document_id:ID,visibility:'admin',active:true,revision:'v1'}}},
    {id:'inactive',text:table(),item:{key:'inactive',metadata:{document_id:ID,visibility:'public',active:false,revision:'v1'}}},
    {id:'other',text:table(),item:{key:'other',metadata:{document_id:OTHER,visibility:'public',active:true,revision:'v1'}}},
  ]};}},{text:'test',ocr:'test'},true);
  const result=await provider.retrieve({question,allowedDocuments:[{id:ID,visibility:'public',active:true,revision:'v1',tags:['học phí']}]});
  assert.equal(result.sources.length,0);assert.equal(result.searchCallCount,2);
});
test('multi-topic/comparison questions cannot lose an untagged source to tag priority',async()=>{
  let calls=0;
  const provider=new CloudflareAiSearchRetrievalProvider({async search(_,r){calls++;assert.equal(r.query,'Học phí và ĐRL?');return {chunks:[
    ...[0.8,0.7,0.6].map((score,i)=>({id:`fee-${i}`,score,text:`Học phí ${i}`,item:{key:`fee-${i}`,metadata:{document_id:ID,active:true}}})),
    {id:'conduct',score:0.99,text:'Quy định điểm rèn luyện',item:{key:'conduct',metadata:{document_id:OTHER,active:true}}},
  ]};}},{text:'test',ocr:'test'},true);
  const docs=[{id:ID,visibility:'public',tags:['học phí']},{id:OTHER,visibility:'public',tags:[]}];
  const result=await provider.retrieve({question:'Học phí và ĐRL?',allowedDocuments:docs});
  assert.equal(calls,1);assert.ok(result.sources.some(s=>s.documentId===OTHER));assert.ok(result.sources.some(s=>s.documentId===ID));
  assert.equal(buildEvidenceRetrievalPlan('So sánh học phí và bảng ĐRL',docs).scoped.length,2);
});
