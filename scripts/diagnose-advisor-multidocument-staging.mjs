// Actual providers, read-only staging resources. Raw evidence stays ignored/local.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {routeAdvisorDocuments,classifyAdvisorIntents,selectAdvisorDocumentCandidatesWithIndexIdentity} from '../cloudflare/worker/src/ai-advisor.ts';
import {executeAiAdvisorV2Document} from '../cloudflare/worker/src/ai-advisor-v2-runtime.ts';
import {buildCompletenessDependencies} from '../cloudflare/worker/src/ai-advisor-completeness-config.ts';
import {createWorkersAiEvidenceGenerator,WORKERS_AI_EVIDENCE_TOOL} from '../cloudflare/worker/src/ai-advisor-workers-ai.ts';
import {hasUnsupportedAnswerDetails} from '../cloudflare/worker/src/ai-advisor-grounding.ts';
import {evaluateAdvisorQuota} from '../cloudflare/worker/src/ai-advisor-quota.ts';
import {CONDUCT_ACCEPTANCE_QUESTIONS} from './verify-advisor-conduct-providers.mjs';
async function main(){
  const state=JSON.parse(readFileSync('.cache/advisor-app-staging/private-state.json','utf8'));
  if(state.name!=='hub-advisor-pr88-app-staging'||state.db==='88d702e1-60d3-490a-8514-38ef881cf133')throw Error('ISOLATION_FAILED');
  const token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if(!token)throw Error('AUTH_UNAVAILABLE');
  const base=`https://api.cloudflare.com/client/v4/accounts/${state.account}/`;
  const api=async(path,body)=>{if(body&&!path.startsWith(`d1/database/${state.db}/query`)&&!path.startsWith(`ai-search/namespaces/default/instances/${state.name}/search`)&&!path.startsWith('ai/run/'))throw Error('READ_ONLY_GUARD');
    const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(35000)});
    const j=await r.json();if(!r.ok||!j.success)throw Error(`STAGING_PROVIDER_HTTP_${r.status}`);return j.result;};
  const live=await api(`d1/database/${state.db}`);if(live.name!==state.name)throw Error('ISOLATION_FAILED');
  const DB={prepare(sql){if(!/^\s*(SELECT|PRAGMA)\b/i.test(sql))throw Error('READ_ONLY_GUARD');let params=[];const statement={bind(...p){params=p;return statement},async all(){const [r]=await api(`d1/database/${state.db}/query`,{sql,params});return r},async first(){return(await statement.all()).results[0]||null}};return statement}};
  const bucket={async get(key){if(!key.startsWith('ai-search/text/'))throw Error('READ_ONLY_GUARD');const r=await fetch(base+`r2/buckets/${state.name}/objects/${key}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});if(!r.ok)return null;const bytes=await r.arrayBuffer();return{size:bytes.byteLength,body:new ReadableStream(),text:async()=>new TextDecoder().decode(bytes)}}};
  const manifest=JSON.parse(readFileSync('C:/Users/tqhoa/AppData/Local/Temp/hub-pr88-release-gates/multi-pdf-cases-private.json','utf8'));
  const cases=[...manifest.map((c,i)=>({...c,label:`topic-${i+1}`})),{question:CONDUCT_ACCEPTANCE_QUESTIONS[0],label:'conduct-1'}];
  const dir=resolve('.cache/advisor-app-staging/multi-diagnostics');mkdirSync(dir,{recursive:true});
  for(const c of cases){if(process.argv.includes('--case')&&c.label!==process.argv[process.argv.indexOf('--case')+1])continue;
    const route=routeAdvisorDocuments(c.question),candidates=await selectAdvisorDocumentCandidatesWithIndexIdentity({DB},route);
    if(!route.documentSearch){console.log(JSON.stringify({case:c.label,route:route.domain,intents:classifyAdvisorIntents(c.question),documentSearch:false,authorizedCandidates:candidates.length}));continue}
    const docs=candidates.map(d=>({id:d.id,title:d.title,category:d.category,visibility:'public',revision:d.aiSearchRevision||d.version,active:d.aiSearchStatus==='completed'}));
    let rawSearch,searchInput,input,raw,generatorResult,reads=0,rejectionSubtype=null;
    const searches=[],hydrated=[];
    const client={search:async(_n,r)=>{if(process.argv.includes('--experiment')){
      const pattern=c.label==='conduct-1'?/rèn luyện/i:c.topic==='academic'?/kế hoạch học tập/i:c.topic==='tuition'?/học phí/i:/quy tắc ứng xử/i;
      const selected=docs.filter(d=>pattern.test(d.title));if(!selected.length)throw Error('NO_TOPIC_DOCUMENT');
      const query=process.argv.includes('--query')?process.argv[process.argv.indexOf('--query')+1]:c.label==='conduct-1'?'Nội dung đánh giá Khung điểm':c.label==='topic-1'?'đăng ký môn học học kỳ 2':c.label==='topic-2'?'thực tập cuối khóa':c.label==='topic-3'?'Khóa 39':'Điều 3 Trách nhiệm với bản thân gia đình và xã hội';
      r={query,ai_search_options:{retrieval:{...r.ai_search_options.retrieval,retrieval_type:process.argv.includes('--keyword')?'keyword':'hybrid',max_num_results:10,filters:{active:true,visibility:'public',document_id:{$in:selected.map(d=>d.id)}}}}};
    }searchInput=r;rawSearch=await api(`ai-search/namespaces/default/instances/${state.name}/search`,r);searches.push({input:r,result:rawSearch});return rawSearch}};
    const generator=createWorkersAiEvidenceGenerator({AI:{run:async(m,r)=>{input=r;return raw=await api('ai/run/'+m,r)}}},{onValidationFailure:s=>{rejectionSubtype=s}});
    const deps=buildCompletenessDependencies({DB,AI_DOCUMENTS_BUCKET:{get:async key=>{const o=await bucket.get(key);if(o){const text=await o.text();hydrated.push({key,text});return{...o,text:async()=>text}}return null}},AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'true',advisorCompletenessTelemetry:{pageRead(){reads++}}},client,{text:state.name,ocr:state.name});
    const t=Date.now(),result=await executeAiAdvisorV2Document(c.question,docs,{...deps,aiSearchClient:client,aiSearchInstances:{text:state.name,ocr:state.name},quota:evaluateAdvisorQuota(undefined),evidenceGenerator:{...generator,generate:async r=>{if(process.argv.includes('--retrieval-only'))return{supported:false,answer:'',sourceIds:[]};generatorResult=await generator.generate(r);return generatorResult}}});
    if(process.argv.includes('--read-pages'))for(const chunk of rawSearch?.chunks||[]){const key=chunk.item?.key;if(!key)continue;const o=await bucket.get(key);if(o)writeFileSync(resolve(dir,c.label+'-page-'+Number(key.match(/page-(\d+)/)?.[1])+'.md'),await o.text())}
    writeFileSync(resolve(dir,c.label+'-private.json'),JSON.stringify({route,docs,searches,hydrated,searchInput,rawSearch,input,raw,generatorResult,rejectionSubtype,result}));
    let args;try{const call=raw.choices[0].message.tool_calls[0];if(call.function.name===WORKERS_AI_EVIDENCE_TOOL)args=JSON.parse(call.function.arguments)}catch{}
    const sent=input?JSON.parse(input.messages[1].content).evidence:[];
    const norm=s=>String(s).normalize('NFC').replace(/\s+/gu,' ').trim().replace(/\. +(?=\+ )/gu,'.');
    const classify=span=>{const e=sent.find(e=>e.source_id===span.source_id);if(!e)return'UNKNOWN_SOURCE_ID';if(!span.quote)return'EMPTY_SUPPORT_SPAN';if(span.quote.length>240)return'SUPPORT_SPAN_TOO_LONG';return norm(e.text).includes(norm(span.quote))?'EXACT_MATCH':'SUPPORT_QUOTE_NOT_FOUND'};
    console.log(JSON.stringify({case:c.label,route:route.domain,intents:classifyAdvisorIntents(c.question),authorizedCandidates:docs.length,result:result.kind,reason:result.reason||null,wallMs:Date.now()-t,r2Reads:reads,
      searchCalls:searches.length,hydratedPages:hydrated.map(p=>Number(p.key.match(/page-(\d+)/)?.[1])),goldNumbersInHydrated:hydrated.some(p=>p.text.includes('25.600.000')&&p.text.includes('747.000')),rejectionSubtype,
      rawPages:searches.map(r=>r.result?.chunks?.map(s=>({topic:docs.find(d=>d.id===s.item?.metadata?.document_id)?.category,page:Number(s.item?.key?.match(/page-(\d+)/)?.[1])}))),generatorSupported:args?.supported??null,adapterRejection:generatorResult?.rejectionReason||null,
      supportClass:args?.support_spans?.map(classify),unsupportedAnswerDetails:args?.answer?hasUnsupportedAnswerDetails(args.answer,sent.filter(s=>args.source_ids?.includes(s.source_id)).map(s=>s.text)):null,sentLengths:sent.map(s=>s.text.length),usage:raw?.usage||null}));
  }
}
main().catch(e=>{console.log(JSON.stringify({phase:'multi_document_diagnosis',result:'BLOCKED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name}));process.exitCode=1});
