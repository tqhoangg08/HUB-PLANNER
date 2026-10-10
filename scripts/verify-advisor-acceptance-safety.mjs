// Read-only catalog/schema + bounded isolated Gemini controls. No production writes.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import dotenv from 'dotenv';
import {probe} from './diagnose-gemini-advisor.mjs';
import {CONDUCT_ACCEPTANCE_QUESTIONS} from './verify-advisor-conduct-providers.mjs';
import {buildGeminiPolicyContents,buildDocumentCandidateMetadataFilter,extractGenerateContentDocumentSources,groundGeminiReply} from '../cloudflare/worker/src/gemini-file-search.ts';
async function main(){
  const state=JSON.parse(readFileSync('.cache/advisor-app-staging/private-state.json','utf8'));
  if(state.name!=='hub-advisor-pr88-app-staging')throw Error('ISOLATION_FAILED');
  const token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if(!token)throw Error('AUTH_UNAVAILABLE');
  const cf=async(path,body)=>{const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${state.account}/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok||!j.success)throw Error('READ_FAILED');return j.result;};
  if(process.argv.includes('--inventory')){
    const sql="SELECT COUNT(*) AS records, SUM(CASE WHEN deleted_at IS NULL AND mime_type='application/pdf' THEN 1 ELSE 0 END) AS active_pdfs, SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted_records FROM ai_documents; SELECT COUNT(*) AS columns_present FROM pragma_table_info('ai_documents') WHERE name IN ('ai_search_status','ai_search_revision','ocr_uncertain_tokens','gemini_indexing_status')";
    const output=await new Promise((res,rej)=>{const p=spawn(process.execPath,['scripts/run-wrangler.mjs','d1','execute','hub-planner-public-dev','--remote','--config','cloudflare/wrangler.jsonc','--json','--command',sql],{stdio:['ignore','pipe','pipe']});let s='';p.stdout.on('data',b=>s+=b);p.stderr.resume();p.on('close',c=>c?rej(Error('READ_FAILED')):res(s));});
    const result=JSON.parse(output);if(result.some(r=>r.meta?.rows_written||r.meta?.changed_db))throw Error('READ_ONLY_GUARD');
    console.log(JSON.stringify({phase:'production_catalog',...result[0].results[0],productionChanged:false}));
    console.log(JSON.stringify({phase:'production_0054',columnsPresent:result[1].results[0].columns_present,migrationAppliedByTask:false}));
    const [schema]=await cf(`d1/database/${state.db}/query`,{sql:'PRAGMA table_info(ai_documents)'});
    if(schema.meta?.rows_written||schema.meta?.changed_db)throw Error('READ_ONLY_GUARD');
    const columns=new Set(schema.results.map(c=>c.name));
    console.log(JSON.stringify({phase:'staging_0054',columnsPresent:['ai_search_status','ai_search_revision','ocr_uncertain_tokens','gemini_indexing_status'].every(c=>columns.has(c)),productionMigrationApplied:false}));
    const deployments=await cf('workers/scripts/hub-planner-public-dev-api/deployments');
    const settings=await cf('workers/scripts/hub-planner-public-dev-api/settings');
    const bindings=settings.bindings||[],binding=n=>bindings.find(b=>b.name===n)?.text;
    console.log(JSON.stringify({phase:'production_state',versions:deployments.deployments?.[0]?.versions,mode:binding('AI_ADVISOR_V2_MODE'),canaryPercent:binding('AI_ADVISOR_V2_CANARY_PERCENT'),completenessFlag:binding('AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED')||'UNSET_OFF',productionChanged:false}));
    const homepage=await fetch('https://hotrosinhvienhub.id.vn/'),anonymous=await fetch('https://hotrosinhvienhub.id.vn/api/private/v1/ai-advisor');
    console.log(JSON.stringify({phase:'production_health',homepageHttp:homepage.status,anonymousAdvisorHttp:anonymous.status,syntheticProductionQuestionSent:false}));return;
  }
  if(!process.argv.includes('--gemini-controls'))throw Error('ACTION_REQUIRED');
  dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
  const key=process.env.GEMINI_FILE_SEARCH_API_KEY;
  const gemini=JSON.parse(readFileSync('C:/Users/tqhoa/AppData/Local/Temp/hub-advisor-pr88-ocr-cells-final/gemini-staging-state.json','utf8'));
  if(!key||gemini.label!=='hub-pr88-ocr-isolated-staging'||gemini.store===process.env.GEMINI_FILE_SEARCH_STORE)throw Error('ISOLATION_FAILED');
  const doc=JSON.parse(readFileSync('.cache/advisor-app-staging/browser-results/index-status-local.json','utf8')).document;
  for(const test of['plain_control','file_search_case5','file_search_case6']){
    const q=CONDUCT_ACCEPTANCE_QUESTIONS[test==='file_search_case6'?5:4];
    const response=await probe({key,path:'models/gemini-3.1-flash-lite:generateContent',timeoutMs:30000,sensitive:[gemini.store,q],body:{
      contents:buildGeminiPolicyContents(q),systemInstruction:{parts:[{text:'Chỉ trả lời từ nguồn được truy xuất. Không bịa dữ kiện hoặc trích dẫn. Nếu thiếu nguồn thì nói rõ chưa xác minh được.'}]},
      generationConfig:{maxOutputTokens:2048,thinkingConfig:{thinkingLevel:'MINIMAL'}},
      ...(test==='plain_control'?{}:{tools:[{fileSearch:{fileSearchStoreNames:[gemini.store],metadataFilter:buildDocumentCandidateMetadataFilter([doc.id])}}]})}});
    const sources=extractGenerateContentDocumentSources(response.data),text=(response.data?.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('');
    const grounded=groundGeminiReply(text,q,sources.filter(s=>s.documentId===doc.id).map(s=>({...s,title:doc.title})));
    writeFileSync(resolve('.cache/advisor-app-staging/citation-diagnostics',`${test}-local.json`),JSON.stringify({text,sources,grounded}));
    console.log(JSON.stringify({phase:'gemini_control',test,providerCalls:1,retries:0,httpStatus:response.diagnostic.status||null,durationMs:response.diagnostic.durationMs,
      result:response.diagnostic.result||(response.diagnostic.ok?'RESPONSE':'PROVIDER_ERROR'),authorizedSources:sources.filter(s=>s.documentId===doc.id).length,groundingVerified:grounded.groundingVerified,
      inputTokens:response.data?.usageMetadata?.promptTokenCount||null,outputTokens:response.data?.usageMetadata?.candidatesTokenCount||null,cost:'NOT_MEASURED',productionChanged:false}));
  }
}
main().catch(e=>{console.log(JSON.stringify({phase:'acceptance_safety',result:'BLOCKED',safeError:['ISOLATION_FAILED','AUTH_UNAVAILABLE','READ_FAILED','READ_ONLY_GUARD','ACTION_REQUIRED'].includes(e.message)?e.message:e.name}));process.exitCode=1;});
