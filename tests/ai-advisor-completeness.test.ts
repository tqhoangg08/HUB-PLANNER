import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {retrieveCompletenessStaging} from '../cloudflare/worker/src/ai-search-completeness-staging.ts';
import {conductTableEvidencePriority,isConductTableQuestion,presentConductTableEvidence,resolveConductTableAnswer} from '../cloudflare/worker/src/ai-advisor-table-evidence.ts';
import {createWorkersAiEvidenceGenerator,WORKERS_AI_EVIDENCE_TOOL} from '../cloudflare/worker/src/ai-advisor-workers-ai.ts';
import {buildDocumentReprocessPlan} from '../shared/ai-document-reprocess.ts';
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
  await retrieveCompletenessStaging('Mini game trực tuyến có tính điểm rèn luyện không?',[{id:DOC}],async r=>{calls++;assert.equal(r.ai_search_options.retrieval.max_num_results,3);assert.equal(r.ai_search_options.reranking,undefined);return{chunks:[]};});assert.equal(calls,1);
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
});
