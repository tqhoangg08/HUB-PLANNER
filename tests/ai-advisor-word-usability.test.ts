import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {readRoutingProbeProfile,routingProbeConfig,injectedGeminiFailure} from '../cloudflare/worker/src/staging/advisor-routing-probe.ts';
import {shouldUseAiAdvisorV2,type AiAdvisorV2RuntimeConfig} from '../cloudflare/worker/src/ai-advisor-v2-runtime.ts';
import {GeminiFileSearchError} from '../cloudflare/worker/src/gemini-file-search.ts';
import {sanitizeAIReply} from '../utils/aiSafety.ts';
import {sourceSupportedReply,isRelevantAdvisorEvidence,hasUnsupportedAnswerDetails} from '../cloudflare/worker/src/ai-advisor-grounding.ts';
import {extractOfficialDocumentLocators} from '../cloudflare/worker/src/gemini-file-search.ts';
import {routeAdvisorDocuments,classifyAdvisorIntents} from '../cloudflare/worker/src/ai-advisor.ts';
import {buildEvidenceRetrievalPlan,tuitionTupleQuery,splitPolicyEvidenceQuestions} from '../cloudflare/worker/src/ai-advisor-retrieval-plan.ts';
import {resolvePolicyArticleExcerpt,resolveTuitionTableRow,resolveAcademicMilestone} from '../cloudflare/worker/src/ai-advisor-source-sections.ts';
import {retrieveAiSearchCompleteEvidence} from '../cloudflare/worker/src/ai-search-completeness.ts';
import {refreshOperation,type AiDocumentsEnv} from '../cloudflare/worker/src/ai-documents.ts';
import {useCloudflareDocumentPolicy,createDocumentPolicyDeadline} from '../cloudflare/worker/src/ai-advisor-document-policy.ts';

test('document policy is default-off, literal server flag only and never broadens non-document routing',()=>{
  for(const flag of [undefined,false,true,'false','TRUE','1'])assert.equal(useCloudflareDocumentPolicy({AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:flag},true),false);
  assert.equal(useCloudflareDocumentPolicy({AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:'true'},true),true);
  for(const q of ['Lịch học của mình','Tôi đã tích lũy bao nhiêu tín chỉ?','IT101 có mấy tín chỉ?','Chào bạn']){
    assert.equal(useCloudflareDocumentPolicy({AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED:'true'},routeAdvisorDocuments(q).documentSearch),false,q);
  }
  const config=ts.parseConfigFileTextToJson('cloudflare/wrangler.jsonc',readFileSync('cloudflare/wrangler.jsonc','utf8')).config;
  assert.equal(config.vars.AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED,'false');
});
test('policy deadline shares one budget and cannot start work after a timeout, with no retry',async()=>{
  const budget=createDocumentPolicyDeadline(15);let calls=0;
  await assert.rejects(budget.run(()=>{calls++;return new Promise(()=>{});}),e=>e instanceof DOMException&&e.name==='TimeoutError');
  await assert.rejects(budget.run(async()=>{calls++;return 'late';}));assert.equal(calls,1);
  assert.equal(await createDocumentPolicyDeadline(1000).run(async()=>42),42);
});
test('new policy staging profiles change only request-local flags and preserve real bucket calculation',async()=>{
  for(const p of ['policy-selected','policy-unselected','policy-completeness-off','policy-cloudflare-error','policy-workers-error','policy-gemini-error'] as const){
    const c=await routingProbeConfig(p,'synthetic');
    assert.equal(c.AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED,'true');
    assert.equal(await shouldUseAiAdvisorV2({mode:'canary',canaryPercent:Number(c.AI_ADVISOR_V2_CANARY_PERCENT)},'synthetic'),c.diagnostic.expectedSelected);
    assert.equal(readRoutingProbeProfile(req('?profile='+p),'admin'),p);
  }
});

const origin='https://hub-advisor-pr88-word-staging.example.workers.dev';
const req=(suffix='?profile=canary-selected',method='POST')=>new Request(`${origin}/api/staging/ai-advisor-routing${suffix}`,{method});
test('routing experiments are POST-only, Admin-only, isolated Word staging and static profiles',()=>{
  assert.equal(readRoutingProbeProfile(req(),'admin'),'canary-selected');
  for(const role of ['user','auditor',''])assert.throws(()=>readRoutingProbeProfile(req(),role));
  for(const request of [req('', 'POST'),req('?profile=canary-selected','GET'),req('?profile=on'),req('?profile=canary-selected&userId=other'),req('?profile=canary-selected&profile=canary-unselected'),new Request('https://hotrosinhvienhub.id.vn/api/staging/ai-advisor-routing?profile=canary-selected',{method:'POST'})])assert.throws(()=>readRoutingProbeProfile(request,'admin'));
});
test('selected/nonselected experiments exercise real stable bucket without substituting identity',async()=>{
  for(const id of ['synthetic-a','synthetic-b'])for(const profile of ['canary-selected','canary-unselected','selected-completeness-off','legacy-provider-error','selected-provider-error'] as const){
    const c=await routingProbeConfig(profile,id);
    assert.equal(await shouldUseAiAdvisorV2({mode:c.AI_ADVISOR_V2_MODE,canaryPercent:Number(c.AI_ADVISOR_V2_CANARY_PERCENT)} as AiAdvisorV2RuntimeConfig,id),c.diagnostic.expectedSelected);
    assert.equal(c.AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED,profile==='selected-completeness-off'?'false':'true');
    assert.equal(c.diagnostic.faultInjected,profile.endsWith('provider-error'));
    assert.ok(!JSON.stringify(c).includes(id));
  }
});
test('Gemini fault injection is explicit and contains no source, token or provider receipt',async()=>{
  await assert.rejects(injectedGeminiFailure(),e=>e instanceof GeminiFileSearchError&&e.reason==='GEMINI_REQUEST_TIMEOUT'&&e.diagnostics.durationMs===0);
});
test('probe is absent from production entrypoint, requires trusted staff and does not set persisted flags',()=>{
  const stage=readFileSync('cloudflare/worker/src/staging/advisor-app.ts','utf8'),prod=readFileSync('cloudflare/worker/src/index.ts','utf8');
  assert.match(stage,/await requireBetterAuthStaff\(request,shared\)/);
  assert.doesNotMatch(prod,/advisor-routing-probe|ai-advisor-routing|injectedGeminiFailure/);
  assert.doesNotMatch(readFileSync('cloudflare/worker/src/staging/advisor-routing-probe.ts','utf8'),/\.prepare\(|\.put\(|\.upload\(/);
});
test('real usability runner does not count HTTP success or expected word presence as content PASS',()=>{
  const runner=readFileSync('scripts/verify-advisor-word-usability.mjs','utf8');
  assert.match(runner,/AWAITING_CONTENT_REVIEW/);assert.match(runner,/CORPUS_CHANGED/);assert.match(runner,/STAGING_SOURCE_MISMATCH/);
  assert.match(runner,/sourceHashesUnchanged/);assert.doesNotMatch(runner,/verdict:'PASS'/);
  assert.doesNotMatch(runner,/\.items\.upload|--apply|--reindex|ocrPdf/);
});

test('Word parser envelope does not turn policy evidence into a technical refusal; real secrets remain blocked',()=>{
  for(const envelope of ['<!-- word_unit=7 uncertain_tokens=0 -->','<!-- word_unit: 7 -->\n<!-- extraction: native; uncertain_tokens: 0 -->','<!-- word_unit: 7 -->\n<!-- extraction: native_text; uncertain_tokens: 0 -->\n## Đoạn Word 7']){
    const text=`Điều 7. Phân loại kết quả rèn luyện\n${envelope}\nLoại tốt.`;
    const displayed=sourceSupportedReply(text,[text],'điểm rèn luyện');
    assert.doesNotMatch(displayed,/word_unit|uncertain_tokens/);
    assert.match(sanitizeAIReply(displayed),/Loại tốt/);
  }
  for(const unsafe of ['token: private-value','secret: private-value','<!-- token: private-value -->'])assert.match(sanitizeAIReply(unsafe),/không thể chia sẻ/);
});
test('natural academic and fee aliases route to official documents, not general or course catalog',()=>{
  for(const q of ['So sánh lịch nghỉ Tết của chính quy chuẩn với chương trình tinh hoa','Kế hoạch chương trình tiếng Anh bán phần: tháng 11 đăng ký học kỳ 2','K42 ngành Ngôn ngữ Trung Quốc có mức thu năm và tín chỉ thế nào']){
    assert.equal(routeAdvisorDocuments(q).documentSearch,true);
    assert.ok(classifyAdvisorIntents(q).includes('regulation_document'));
    assert.ok(!classifyAdvisorIntents(q).includes('general'));
  }
  assert.ok(classifyAdvisorIntents('Tra môn học ACC101').includes('course_catalog'));
});
test('fee tuple understands natural/no-accent programs and majors without inventing a default program',()=>{
  assert.deepEqual(tuitionTupleQuery('Mình học K41 Tài chính ngân hàng hệ chuẩn. Theo bảng học phí'),{cohort:'41',major:'tai chinh ngan hang',program:'dai hoc chinh quy chuan'});
  assert.equal(tuitionTupleQuery('hoc phi K39 nganh Ke toan chuong trinh chuan')?.major,'ke toan');
  assert.equal(tuitionTupleQuery('hoc phi K39 nganh Ke toan')?.program,undefined);
});
test('explicit plan aliases scope correctly and comparison searches both authorized plans',()=>{
  const docs=[{id:'a',title:'Kế hoạch học tập chính quy chuẩn',revision:'r',visibility:'public' as const},{id:'b',title:'Kế hoạch tổ chức học tập chương trình tinh hoa',revision:'r',visibility:'public' as const}];
  assert.deepEqual(buildEvidenceRetrievalPlan('ke hoach hoc tap he chuan hoc ky he',docs).scoped.map(d=>d.id),['a']);
  assert.equal(buildEvidenceRetrievalPlan('lịch nghỉ Tết chính quy chuẩn với chương trình tinh hoa',docs).scoped.length,2);
});
const evidence=(snippet:string,sourceId='S1',unitNumber=1)=>({sourceId,documentId:'doc',revision:'r',locatorKind:'word_unit' as const,unitNumber,snippet});
test('classification evaluates retrieved thresholds, not expected fixed labels; overlapping/missing ranges do not manufacture conclusions',()=>{
  const text='Điều 7. Phân loại kết quả rèn luyện\n1. Từ 90 đến 100 điểm: Loại xuất sắc.\n2. Từ 80 đến dưới 90 điểm: Loại tốt.\n3. Dưới 50 điểm: Loại yếu.';
  const result=resolvePolicyArticleExcerpt('89 điểm và 90 điểm rèn luyện xếp loại gì?',[evidence(text)]);
  assert.match(result!.reply,/89: tốt/);assert.match(result!.reply,/90: xuất sắc/);
  assert.match(resolvePolicyArticleExcerpt('drl 49 diem xep loai gi',[evidence(text)])!.reply,/49: yếu/);
  assert.doesNotMatch(resolvePolicyArticleExcerpt('drl 60 diem xep loai gi',[evidence(text)])!.reply,/Mức điểm/);
  assert.match(resolvePolicyArticleExcerpt('drl 89 diem xep loai gi',[evidence(text.replace('Loại tốt','Loại nhãn nguồn'))])!.reply,/89: nhãn nguồn/);
});
test('following chapter is not attached to the preceding cited article',()=>{
  assert.deepEqual(extractOfficialDocumentLocators('Điều 15. Quyền khiếu nại\nNội dung.\nChương V\nTổ chức'),['Điều 15']);
  assert.deepEqual(extractOfficialDocumentLocators('Chương IV\nĐiều 15. Quyền khiếu nại\nNội dung.'),['Chương IV, Điều 15']);
});
test('two requested milestones retain both actual table locators instead of only the first',()=>{
  assert.deepEqual(extractOfficialDocumentLocators('Bảng 1 (thứ tự bảng trong DOCX)\n| Học kỳ Hè | Bắt đầu |\nBảng 2 (thứ tự bảng trong DOCX)\n| Học kỳ Hè | Đăng ký |'),['Bảng 1 (thứ tự bảng trong DOCX)','Bảng 2 (thứ tự bảng trong DOCX)']);
});
test('registration day cannot be substituted by semester start or plan publication month',()=>{
  const source=evidence('I. Kế hoạch tổ chức học tập\nHọc kỳ 2 bắt đầu từ 15/02/2027 đến 18/07/2027.\n1.2. Lịch học HK2 dự kiến ban hành tháng 11/2026.');
  assert.equal(resolveAcademicMilestone('Kế hoạch chương trình tiếng Anh bán phần cho biết chính xác ngày nào trong tháng 11 mở đăng ký học kỳ 2?',[source]),null);
  assert.match(resolveAcademicMilestone('Kế hoạch tổ chức học tập kỳ 2 bắt đầu và kết thúc ngày nào?',[source])!.reply,/15\/02\/2027/);
});
test('fee continuation requires adjacent authorized Word units and cites the actual header/row sources',()=>{
  const header='Bảng 2 (thứ tự bảng trong DOCX)\n| TT | HỆ/CHƯƠNG TRÌNH | Học phí theo năm | Học phí theo tín chỉ |\n| A | Đại học chính quy chuẩn | | |';
  const row='Bảng 3 (thứ tự bảng trong DOCX)\n| Khóa 42 | | | |\n| 18 | Ngành Ngôn ngữ Trung Quốc (Mới) | 28.800.000 | 834.000 |';
  const q='K42 ngành Ngôn ngữ Trung Quốc hệ chuẩn mức thu năm và tín chỉ';
  const r=resolveTuitionTableRow(q,[evidence(header,'S1',5),evidence(row,'S2',6)]);
  assert.ok(r);assert.deepEqual(r.sourceIds,['S1','S2']);assert.match(r.reply,/834.000/);
  assert.ok(!resolveTuitionTableRow(q,[evidence(header,'S1',4),evidence(row,'S2',6)]));
  assert.ok(!resolveTuitionTableRow(q,[evidence(header,'S1',5),{...evidence(row,'S2',6),documentId:'other'}]));
  assert.doesNotMatch(r.sourceExcerpts.S2,/Đại học/);assert.match(r.sourceExcerpts.S2,/Bảng 3/);
});
test('cross-topic evidence remains relevant without weakening quote or numeric checks',()=>{
  const q='điểm rèn luyện tối đa và học phí K39';
  assert.equal(splitPolicyEvidenceQuestions(q).length,2);
  assert.equal(isRelevantAdvisorEvidence(q,'thang điểm 100','Quy chế rèn luyện'),true);
  assert.equal(isRelevantAdvisorEvidence(q,'| K39 | 747.000 |','Mức học phí'),true);
  assert.equal(hasUnsupportedAnswerDetails('748.000',['747.000']),true);
  assert.equal(hasUnsupportedAnswerDetails('Không được',['Được']),false); // quote validator, not numeric guard, handles words/negation
});
test('cross-topic retrieval shares <=3 search and <=3 R2 reads, preserving revision/visibility filters',async()=>{
  let searches=0,reads=0;
  const docs=[{id:'11111111-1111-4111-8111-111111111111',title:'Quy chế rèn luyện',revision:'r',visibility:'public' as const},{id:'22222222-2222-4222-8222-222222222222',title:'Học phí',revision:'r',visibility:'public' as const}];
  const r=await retrieveAiSearchCompleteEvidence('điểm rèn luyện tối đa và học phí K39 ngành Kế toán hệ chuẩn',docs,async request=>{
    searches++;assert.ok(request.ai_search_options.retrieval.filters);
    return {chunks:[]};
  },async()=>{reads++;return null;});
  assert.equal(searches,3);assert.ok(reads<=3);assert.equal(r.searchCallCount,3);
});
test('Gemini reconciliation distinguishes poll outage, absent/wrong receipt, verified completion and terminal failure; writes are CAS guarded',async()=>{
  const row={id:'doc',title:'source',original_file_name:'source.docx',storage_path:'ai-documents/source.docx',mime_type:'text/plain',file_size:1,
    content_hash:'hash',visibility:'public',program_code:'',indexing_status:'completed',ai_search_status:'completed',ai_search_revision:'r',gemini_indexing_status:'failed',gemini_operation_name:'op'};
  let writes=0,bindings:unknown[]=[];
  const env={GEMINI_FILE_SEARCH_STORE:'fileSearchStores/stage',AI_DOCUMENTS_BUCKET:{},DB:{prepare(sql:string){
    if(sql.startsWith('UPDATE'))assert.match(sql,/deleted_at IS NULL AND content_hash=\? AND gemini_operation_name=\? AND COALESCE\(ai_search_revision,''\)=\?/);
    return {bind(...values:unknown[]){if(sql.startsWith('UPDATE'))bindings=values;return this;},async run(){writes++;return{};},async first(){return row;}};
  }}} as unknown as AiDocumentsEnv;
  const outage=await refreshOperation(env,row,async()=>{throw new Error('Transient');});assert.equal(outage,row);assert.equal(writes,0);
  for(const result of [{done:false},{done:true},{done:true,response:{documentName:'fileSearchStores/other/documents/x'}}]){
    await refreshOperation(env,row,async()=>result);assert.equal(writes,0);
  }
  await refreshOperation(env,row,async()=>({done:true,response:{documentName:'fileSearchStores/stage/documents/x'}}));
  assert.equal(writes,1);assert.equal(bindings[1],'completed');assert.equal(bindings.at(-1),'r');
  await refreshOperation(env,row,async()=>({done:true,error:{code:500}}));assert.equal(writes,2);assert.equal(bindings[1],'failed');
  await refreshOperation(env,{...row,gemini_operation_name:null},async()=>{throw Error('must not call');});assert.equal(writes,2);
  await refreshOperation(env,{...row,deleted_at:'deleted'},async()=>{throw Error('must not call');});assert.equal(writes,2);
});
