import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {retrieveCompletenessStaging} from '../cloudflare/worker/src/ai-search-completeness-staging.ts';
import {conductTableEvidencePriority,isConductTableQuestion,presentConductTableEvidence,resolveConductTableAnswer} from '../cloudflare/worker/src/ai-advisor-table-evidence.ts';
import {createWorkersAiEvidenceGenerator,WORKERS_AI_EVIDENCE_TOOL} from '../cloudflare/worker/src/ai-advisor-workers-ai.ts';
import {buildDocumentReprocessPlan} from '../shared/ai-document-reprocess.ts';
import {conductExcerptTopic,resolveConductExcerptAnswer} from '../cloudflare/worker/src/ai-advisor-policy-excerpts.ts';
import {buildCompletenessDependencies,completenessEnabled,type CompletenessEnv} from '../cloudflare/worker/src/ai-advisor-completeness-config.ts';
import {executeAiAdvisorV2Document} from '../cloudflare/worker/src/ai-advisor-v2-runtime.ts';
import {evaluateAdvisorQuota} from '../cloudflare/worker/src/ai-advisor-quota.ts';
import {MemoryAdvisorCache} from '../cloudflare/worker/src/ai-advisor-cache.ts';
import {buildDerivedPageObjectKey} from '../cloudflare/worker/src/ai-document-ingestion.ts';
const DOC='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',PRIVATE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const table='| STT | Nội dung đánh giá | Tiêu chí đánh giá | Khung điểm |\n| 1 | Mục đầu tiên | Văn bản gốc | 0—25 điểm |';
const question='Phiếu ĐRL có những nhóm tiêu chí nào?';
const chunk=(id:string,text:string,doc=DOC,revision='v1',visibility='public')=>({id,score:0.9,text,item:{key:`${doc}-page-${id.padStart(3,'0')}.md`,metadata:{document_id:doc,active:true,visibility,revision}}});
test('conduct table query expansion handles Vietnamese, abbreviation and missing accents without injecting expected point values',()=>{
  for(const q of[question,'bang diem ren luyen moi nhat','Bạn có bảng điẻm rèn luyện mới nhất không?'])assert.equal(isConductTableQuestion(q),true);
  assert.equal(isConductTableQuestion('Tôi được bao nhiêu điểm ĐRL?'),false);
  assert.equal(isConductTableQuestion('Lịch tập thể dục'),false);
  assert.equal(conductTableEvidencePriority(table),1);
  assert.equal(conductTableEvidencePriority('Điểm 25 20 20 15 20'),0);
  assert.equal(conductTableEvidencePriority('| 5 | Nhóm cuối | Tiêu chí gốc | 0—20 điểm |'),1);
  assert.equal(resolveConductTableAnswer(question,[{sourceId:'S1',documentId:DOC,pageNumber:3,snippet:'| 5 | Nhóm cuối | Tiêu chí gốc | 0—20 điểm |'}]),null);
});
test('bounded staging reranker recovers later table fragment without page-number hardcoding and retains postauthorization',async()=>{
  let calls=0;
  const r=await retrieveCompletenessStaging(question,[{id:DOC,revision:'v1',visibility:'public'}],async request=>{
    calls++;assert.equal(request.ai_search_options.retrieval.max_num_results,10);
    assert.equal(request.ai_search_options.retrieval.match_threshold,0.4);
    assert.deepEqual(request.ai_search_options.retrieval.filters.document_id,{$in:[DOC]});
    assert.equal(request.ai_search_options.reranking?.enabled,true);
    assert.doesNotMatch(request.query,/25\/20\/20\/15\/20/);
    return{chunks:[chunk('1','Không phải bảng'),chunk('2','Không phải bảng'),chunk('3','Không phải bảng'),chunk('9',table),chunk('10',table+'\n| 5 | Mục cuối | Gốc | 0—20 điểm |'),chunk('11',table,PRIVATE),chunk('12',table,DOC,'stale'),chunk('13',table,DOC,'v1','admin')]};
  });
  assert.equal(calls,1);assert.equal(r.searchCallCount,1);assert.equal(r.sources.length,3);
  assert.deepEqual(r.sources.slice(0,2).map(s=>s.pageNumber),[9,10]);
  assert.ok(r.sources.every(s=>s.documentId===DOC));
});
test('staging completeness makes zero calls with no authorization, one non-reranked call for ordinary questions',async()=>{
  let calls=0;await retrieveCompletenessStaging(question,[],async()=>{calls++;return{chunks:[]};});assert.equal(calls,0);
  await retrieveCompletenessStaging('Học phí là gì?',[{id:DOC}],async r=>{calls++;assert.equal(r.ai_search_options.retrieval.max_num_results,3);assert.equal(r.ai_search_options.reranking,undefined);return{chunks:[]};});assert.equal(calls,1);
});

test('fragmented table hydrates only retrieved authorized pages, deduplicates page reads and respects size bounds',async()=>{
  let reads=0;
  const search=async()=>({chunks:[chunk('2',table),chunk('2',table+'\nfragment'),chunk('3',table),chunk('8',table,PRIVATE)]});
  const r=await retrieveCompletenessStaging(question,[{id:DOC,revision:'v1',visibility:'public'}],search,async s=>{
    reads++;assert.equal(s.documentId,DOC);return s.pageNumber===3?table+'\n| 5 | Original final row | C | 0—20 điểm |':table;
  });
  assert.equal(reads,2);assert.equal(r.sources.length,2);assert.match(r.sources[1].snippet,/Original final row/);
  await assert.rejects(()=>retrieveCompletenessStaging(question,[{id:DOC}],search,async()=> 'x'.repeat(8001)),/bound/);
});
test('staging table view preserves exact OCR words, row-to-range relationship and original evidence, without guessed merged cells',()=>{
  const input=table+'\n| 2 | Chữ<br>OCR | Gốc | 0—20 điểm |\n|  | Tiếp tục | Cột | |\n| 3 | [không đọc rõ] | Gốc | 0—15 điểm |';
  const view=presentConductTableEvidence(input);
  assert.ok(view.endsWith(input));assert.match(view,/STT 2\. Nội dung đánh giá: Chữ OCR\nKhung điểm: 0—20 điểm/);
  assert.doesNotMatch(view.split('--- Bảng vật lý')[0],/STT 3|Tiếp tục/);
  assert.equal(presentConductTableEvidence(input.replace('Nội dung đánh giá','Số lượng')),input.replace('Nội dung đánh giá','Số lượng'));
});
test('complete table answer derives all maxima/count from source, joins only physical continuation, never asserts currentness',()=>{
  const head='Điểm rèn luyện được đánh giá bằng thang điểm 100.\n| STT | Nội dung đánh giá | Tiêu chí đánh giá | Khung điểm |\n';
  const evidence=[{sourceId:'S1',documentId:DOC,pageNumber:2,snippet:head+'| 1 | A | C | 0—25 điểm |\n| 2 | B | C | 0—20 điểm |\n| 3 | C đầu | C | 0—20 điểm |'},
    {sourceId:'S2',documentId:DOC,pageNumber:3,snippet:head.replace('Điểm rèn luyện được đánh giá bằng thang điểm 100.\n','')+'| | tiếp theo | C | |\n| 4 | D | C | 0—15 điểm |\n| 5 | E | C | 0—20 điểm |'}];
  const answer=resolveConductTableAnswer(question,evidence)!;assert.ok(answer);assert.match(answer.reply,/gồm 5 nhóm/);assert.match(answer.reply,/C đầu tiếp theo/);
  assert.deepEqual(answer.reply.match(/tối đa (\d+) điểm/g),['tối đa 25 điểm','tối đa 20 điểm','tối đa 20 điểm','tối đa 15 điểm','tối đa 20 điểm']);
  assert.deepEqual(answer.sourceIds,['S1','S2']);assert.match(answer.reply,/Chưa đủ bằng chứng/);
  assert.equal(resolveConductTableAnswer(question,[evidence[0]]),null);
  assert.equal(resolveConductTableAnswer(question,evidence.map(s=>({...s,snippet:s.snippet.replace('0—25','0—26')}))),null);
  assert.equal(resolveConductTableAnswer(question,evidence.map(s=>({...s,snippet:s.snippet.replace('E |','[không đọc rõ] |')}))),null);
  assert.equal(resolveConductTableAnswer(question,evidence.map((s,i)=>({...s,documentId:i?PRIVATE:DOC}))),null);
});
test('physical table tail reaches generator unchanged within same global budget; invented quotes still rejected',async()=>{
  const snippet=table+'\n'+'Nội dung gốc. '.repeat(125)+'\n| 5 | Nhóm cuối | Tiêu chí | 0—20 điểm |';
  assert.ok(snippet.length>1600&&snippet.length<2200);
  let inputText='';
  const provider=createWorkersAiEvidenceGenerator({AI:{async run(_model,input){const data=JSON.parse(input.messages[1].content);inputText=data.evidence[0].text;
    assert.ok(inputText.includes('| 5 |'));assert.ok(inputText.length<=2200);assert.equal(input.temperature,0);assert.equal(input.seed,42);
    return{choices:[{message:{tool_calls:[{type:'function',function:{name:WORKERS_AI_EVIDENCE_TOOL,arguments:JSON.stringify({supported:true,answer:'20 điểm',source_ids:['S1'],support_spans:[{source_id:'S1',quote:'| 5 | Nhóm cuối | Tiêu chí | 0—21 điểm |'}]})}}]}}]};}}});
  const r=await provider.generate({question,evidence:[{sourceId:'S1',documentId:DOC,snippet,score:1}]});
  assert.equal(inputText,snippet);assert.equal(r.rejectionReason,'INVALID_GROUNDING');
});
test('staging deployment entrypoint has no production routes, schedules, OAuth, arbitrary signup or production Auth binding',()=>{
  const setup=readFileSync('scripts/setup-advisor-app-staging.mjs','utf8'),entry=readFileSync('cloudflare/worker/src/staging/advisor-app.ts','utf8');
  assert.match(setup,/routes:\[\]/);assert.match(setup,/crons:\[\]/);assert.match(setup,/instance_name:NAME/);
  assert.match(entry,/allowsIntegrationSyntheticCredentialRequest/);assert.match(entry,/providers:'none'/);
  assert.doesNotMatch(entry,/PRODUCTION_AUTH_PROFILE|hotrosinhvienhub\.id\.vn|hub-ai-production/);
  assert.doesNotMatch(readFileSync('cloudflare/wrangler.jsonc','utf8'),/staging\/advisor-app/);
});
test('reprocess plan retains source and old revision, requires conditional promotion, rejects ambiguous inputs',()=>{
  const row={id:DOC,mimeType:'application/pdf',sourceHash:'a'.repeat(64),version:1,derivedRevision:'old',visibility:'public' as const};
  const plan=buildDocumentReprocessPlan([row]);
  assert.equal(plan[0].expectedSourceHash,row.sourceHash);assert.equal(plan[0].rollbackRevision,'old');assert.equal(plan[0].promotion,'COMPARE_AND_SWAP_AFTER_ALL_PAGES_READY');
  assert.throws(()=>buildDocumentReprocessPlan([row,row]),/duplicate/);
  assert.throws(()=>buildDocumentReprocessPlan([{...row,sourceHash:'bad'}]),/identity/);
  const retained=buildDocumentReprocessPlan([{...row,originalPath:'ai-documents/source.pdf',previousDerivativePath:'ai-documents/old.md',previousGeminiDocument:'old-provider-ref'}])[0];
  assert.equal(retained.originalPath,'ai-documents/source.pdf');assert.equal(retained.previousDerivativePath,'ai-documents/old.md');
  assert.equal(retained.oldObjectsAction,'RETAIN_IMMUTABLE');assert.equal(retained.previousGeminiDocument,'old-provider-ref');
  assert.throws(()=>buildDocumentReprocessPlan([{...row,originalPath:'private/arbitrary.pdf'}]),/identity/);
});

const miniQuestion='Tham gia mini game trực tuyến có tính điểm rèn luyện không?';
const proofQuestion='Minh chứng hoạt động ngoài trường cần đáp ứng yêu cầu gì?';
const miniSource='SV tham gia các trò chơi trực tuyến (mini game) không được tính điểm rèn luyện.';
const proofSource='Đối với hoạt động ngoài trường: minh chứng phải có xác nhận của cơ quan; văn bản xác nhận phải có chữ ký và đóng dấu tròn theo quy định.';
const source=(snippet:string)=>({sourceId:'S1',documentId:DOC,revision:'v1',pageNumber:14,snippet});

test('page14 mini game and outside-school proof render exact source, no invented verdict, no legal currency',()=>{
  for(const [q,text]of [[miniQuestion,miniSource],[proofQuestion,proofSource]]){
    const r=resolveConductExcerptAnswer(q,[source(text)])!;
    assert.ok(r);assert.ok(r.reply.includes(text));assert.deepEqual(r.sourceIds,['S1']);
    assert.match(r.reply,/chưa đủ bằng chứng/);
  }
  assert.equal(conductExcerptTopic('Lịch học tuần này'),null);
  assert.equal(resolveConductExcerptAnswer(miniQuestion,[]),null);
  assert.equal(resolveConductExcerptAnswer(miniQuestion,[source('SV tham gia hoạt động được cộng điểm.')]),null);
  assert.equal(resolveConductExcerptAnswer(proofQuestion,[source(proofSource.replace(' và đóng dấu tròn',''))]),null);
  assert.equal(resolveConductExcerptAnswer(proofQuestion,[source(proofSource.replace('chữ ký','[không đọc rõ]'))]),null);
  assert.equal(resolveConductExcerptAnswer(proofQuestion,[source(proofSource.slice(0,-1))]),null);
  assert.equal(resolveConductExcerptAnswer(miniQuestion,[source(miniSource),{...source(miniSource.replace('không được','được')),sourceId:'S2'}]),null);
});

test('hybrid lexical recall uses only query topic; no reranker that dropped decisive source, no facts injected',async()=>{
  for(const q of[miniQuestion,proofQuestion]){
    let calls=0,reads=0;
    const r=await retrieveCompletenessStaging(q,[{id:DOC,revision:'v1',visibility:'public'}],async req=>{
      calls++;assert.equal(req.ai_search_options.retrieval.retrieval_type,'hybrid');assert.equal(req.ai_search_options.retrieval.max_num_results,10);
      assert.equal(req.ai_search_options.reranking,undefined);assert.equal(req.ai_search_options.retrieval.match_threshold,0.4);
      assert.doesNotMatch(req.query,/không được|chữ ký|dấu tròn/);
      return{chunks:[chunk('4','Quy chế chung'),chunk('9','Minh chứng chung'),chunk('14',q===miniQuestion?miniSource:proofSource),chunk('14','fragment'),chunk('14',miniSource,PRIVATE)]};
    },async s=>{reads++;return s.pageNumber===14?q===miniQuestion?miniSource:proofSource:null;});
    assert.equal(calls,1);assert.ok(reads<=3);assert.equal(r.sources[0].pageNumber,14);assert.ok(r.sources.every(s=>s.documentId===DOC));
  }
});

test('Public Worker completeness flag defaults off and client-like truthy values cannot enable it',()=>{
  for(const value of[undefined,false,true,1,'on','TRUE','1'])assert.equal(completenessEnabled({AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:value}),false);
  assert.equal(completenessEnabled({AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'true'}),true);
  assert.deepEqual(buildCompletenessDependencies({}, {search:async()=>({})},{text:'text',ocr:'ocr'}),{});
  assert.match(readFileSync('cloudflare/wrangler.jsonc','utf8'),/"AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED": "false"/);
  assert.doesNotMatch(readFileSync('cloudflare/worker/src/ai-advisor.ts','utf8'),/advisorV2StagingCompleteness|advisorV2StagingPageContent/);
});

test('R2 hydration validates D1 public current revision/deletion/readiness and canonical key, at most3 reads',async()=>{
  let reads=0,revision='v1',eligible=true;
  const env:CompletenessEnv={AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'true',
    DB:{prepare:(sql:string)=>{assert.match(sql,/visibility='public'.*deleted_at IS NULL.*ai_search_status='completed'/);return{bind:()=>({first:async()=>eligible?{ai_search_revision:revision}:null})};}} as never,
    AI_DOCUMENTS_BUCKET:{get:async()=>{reads++;return{size:100,body:new ReadableStream(),text:async()=>miniSource};}} as never};
  const deps=buildCompletenessDependencies(env,{search:async()=>({})},{text:'text',ocr:'ocr'});
  const s={documentId:DOC,pageNumber:14,itemKey:buildDerivedPageObjectKey(DOC,'v1',14)};
  assert.equal(await deps.pageContent!({...s,itemKey:'private/arbitrary.md'}),null);assert.equal(reads,0);
  eligible=false;assert.equal(await deps.pageContent!(s),null);eligible=true;
  revision='v2';assert.equal(await deps.pageContent!(s),null);revision='v1';
  for(let i=0;i<4;i++)await deps.pageContent!(s);assert.equal(reads,3);
});

test('hydration rejects oversized objects/text, pre0054 schema and noncanonical pages without writes',async()=>{
  const env:CompletenessEnv={AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'true',DB:{prepare:()=>({bind:()=>({first:async()=>({ai_search_revision:'v1'})})})} as never,
    AI_DOCUMENTS_BUCKET:{get:async()=>({size:32001,body:new ReadableStream(),text:async()=>{throw Error('must not buffer');}})} as never};
  const get=()=>buildCompletenessDependencies(env,{search:async()=>({})},{text:'text',ocr:'ocr'}).pageContent!;
  const s={documentId:DOC,pageNumber:14,itemKey:buildDerivedPageObjectKey(DOC,'v1',14)};
  assert.equal(await get()(s),null);
  env.AI_DOCUMENTS_BUCKET={get:async()=>({size:100,body:new ReadableStream(),text:async()=> 'x'.repeat(8001)})} as never;
  assert.equal(await get()(s),null);assert.equal(await get()({...s,pageNumber:41}),null);
  env.DB={prepare:()=>{throw Error('no such column');}} as never;assert.equal(await get()(s),null);
});

test('complete evidence answer cache avoids both AI and R2; flag and revision changes invalidate caches; quota retains precedence',async()=>{
  let searches=0,generations=0,reads=0;
  const candidate={id:DOC,revision:'v1',visibility:'public',active:true};
  const deps={aiSearchClient:{search:async()=>({})},aiSearchInstances:{text:'text',ocr:'ocr'},quota:evaluateAdvisorQuota(undefined),
    completenessSearch:async()=>{searches++;return{chunks:[chunk('14',miniSource)]};},pageContent:async()=>{reads++;return miniSource;},
    evidenceGenerator:{id:'fixture',isConfigured:()=>true,generate:async()=>{generations++;return{supported:false,answer:'',sourceIds:[]};}},
    answerCache:new MemoryAdvisorCache<import('../cloudflare/worker/src/ai-advisor-v2-runtime.ts').AiAdvisorV2Answer>(),retrievalCache:new MemoryAdvisorCache<import('../cloudflare/worker/src/ai-search-retrieval.ts').AiSearchRetrievalResult>()};
  assert.equal((await executeAiAdvisorV2Document(miniQuestion,[candidate],deps)).kind,'ANSWER');
  const cached=await executeAiAdvisorV2Document(miniQuestion,[candidate],deps);assert.equal(cached.kind,'ANSWER');if(cached.kind==='ANSWER')assert.equal(cached.answerCacheHit,true);
  assert.equal(searches,1);assert.equal(reads,1);assert.equal(generations,0);
  await executeAiAdvisorV2Document(miniQuestion,[candidate],{...deps,quota:evaluateAdvisorQuota({searchUsageRatio:0.99})});assert.equal(searches,1);
  await executeAiAdvisorV2Document(miniQuestion,[{...candidate,revision:'v2'}],deps);assert.equal(searches,2);
  await executeAiAdvisorV2Document(miniQuestion,[candidate],{...deps,completenessSearch:undefined,pageContent:undefined});assert.equal(searches,2);
});

test('fabricated support quote, missing span and unknown source remain INVALID_GROUNDING even with real topic evidence',async()=>{
  for(const [ids,spans]of [[['S1'],[{source_id:'S1',quote:miniSource.replace('không được','được')}]], [['S1'],[]],[['S2'],[{source_id:'S2',quote:miniSource}]]]){
    const provider=createWorkersAiEvidenceGenerator({AI:{run:async()=>({choices:[{message:{tool_calls:[{type:'function',function:{name:WORKERS_AI_EVIDENCE_TOOL,arguments:JSON.stringify({supported:true,answer:'Nguồn trả lời.',source_ids:ids,support_spans:spans})}}]}}]})}});
    const r=await provider.generate({question:miniQuestion,evidence:[{...source(miniSource),score:1}]});assert.equal(r.rejectionReason,'INVALID_GROUNDING');
  }
});
