// Two bounded real-provider probes. Staging only; raw material stays ignored.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {retrieveCompletenessStaging} from '../cloudflare/worker/src/ai-search-completeness-staging.ts';
import {createWorkersAiEvidenceGenerator} from '../cloudflare/worker/src/ai-advisor-workers-ai.ts';
import {hasUnsupportedAnswerDetails} from '../cloudflare/worker/src/ai-advisor-grounding.ts';
import {CONDUCT_ACCEPTANCE_QUESTIONS} from './verify-advisor-conduct-providers.mjs';
async function main(){
  const state=JSON.parse(readFileSync('.cache/advisor-app-staging/private-state.json','utf8'));
  if(state.name!=='hub-advisor-pr88-app-staging')throw Error('ISOLATION_FAILED');
  const token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if(!token)throw Error('AUTH_UNAVAILABLE');
  const api=async(path,body)=>{const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${state.account}/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(35000)});const j=await r.json();if(!r.ok||!j.success)throw Error('STAGING_PROVIDER_FAILED');return j.result;};
  const document=JSON.parse(readFileSync('.cache/advisor-app-staging/browser-results/index-status-local.json','utf8')).document;
  const docs=[{id:document.id,title:document.title,revision:document.ai_search_revision,visibility:'public',active:true}];
  const dir=resolve('.cache/advisor-app-staging/citation-diagnostics');mkdirSync(dir,{recursive:true});
  if(process.argv.includes('--inventory')){
    const items=await api(`ai-search/namespaces/default/instances/${state.name}/items?per_page=50`);const rows=Array.isArray(items)?items:items.result||[];
    console.log(JSON.stringify({items:rows.length,pages:rows.map(i=>({page:Number(i.key?.match(/page-(\d+)/)?.[1]),status:i.status,chunks:i.chunks_count,revisionMatches:i.metadata?.revision===document.ai_search_revision}))}));
    const key=`ai-search/text/${document.id}/${document.ai_search_revision}/page-014.md`;
    const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${state.account}/r2/buckets/${state.name}/objects/${key}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
    console.log(JSON.stringify({page14ObjectHttp:r.status}));if(r.ok){const text=await r.text();writeFileSync(resolve(dir,'page-14-local.md'),text);console.log(JSON.stringify({chars:text.length,miniGame:/mini game/i.test(text),outsideSchool:/ngoài trường/i.test(text),proof:/minh chứng/i.test(text)}));}return;
  }
  for(const c of [5,6]){
    const question=CONDUCT_ACCEPTANCE_QUESTIONS[c-1];
    const retrieved=await retrieveCompletenessStaging(question,docs,async r=>{const response=await api(`ai-search/namespaces/default/instances/${state.name}/search`,process.argv.includes('--expanded')?{...r,query:(c===5?'mini game':'hoạt động ngoài trường'),ai_search_options:{...r.ai_search_options,retrieval:{...r.ai_search_options.retrieval,retrieval_type:process.argv.includes('--hybrid')?'hybrid':'vector',max_num_results:10},...(process.argv.includes('--no-rerank')?{}:{reranking:{enabled:true,model:'@cf/baai/bge-reranker-base'}})}}:r);if(process.argv.includes('--retrieval-only')){writeFileSync(resolve(dir,`case-${c}-chunks-local.json`),JSON.stringify(response));console.log(JSON.stringify({case:c,allPages:response.chunks?.map(s=>Number(s.item?.key?.match(/page-(\d+)/)?.[1])),allTopics:response.chunks?.map(s=>/mini game|ngoài trường|minh chứng/i.test(s.text))}));}return response;});
    if(process.argv.includes('--retrieval-only')){writeFileSync(resolve(dir,`case-${c}-retrieval-local.json`),JSON.stringify(retrieved));console.log(JSON.stringify({case:c,searchCalls:1,pages:retrieved.sources.map(s=>s.pageNumber),lengths:retrieved.sources.map(s=>s.snippet.length),decisiveTopic:retrieved.sources.map(s=>c===5?/mini game|trò chơi trực tuyến/i.test(s.snippet):/ngoài trường|minh chứng/i.test(s.snippet))}));continue;}
    let input,raw,calls=0;
    const generator=createWorkersAiEvidenceGenerator({AI:{run:async(model,request)=>{calls++;input=request;raw=await api(`ai/run/${model}`,request);return raw;}}});
    const started=Date.now();const result=await generator.generate({question,evidence:retrieved.sources.map(s=>({...s,revision:document.ai_search_revision}))});
    writeFileSync(resolve(dir,`case-${c}-local.json`),JSON.stringify({retrieved,input,raw,result}));
    const sent=JSON.parse(input.messages[1].content).evidence;
    let args;try{args=JSON.parse(raw.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments);}catch{}
    const norm=s=>s.normalize('NFC').replace(/\s+/gu,' ').trim().replace(/\. +(?=\+ )/gu,'.');
    const spans=args?.support_spans||[];
    console.log(JSON.stringify({case:c,searchCalls:1,generatorCalls:calls,durationMs:Date.now()-started,pages:retrieved.sources.map(s=>s.pageNumber),supported:result.supported,modelSupported:args?.supported,
      spans:spans.map(s=>({knownSource:sent.some(e=>e.source_id===s.source_id),length:String(s.quote||'').length,exactMatch:sent.some(e=>e.source_id===s.source_id&&norm(e.text).includes(norm(String(s.quote||''))))})),
      unsupportedAnswerDetails:args?.answer?hasUnsupportedAnswerDetails(args.answer,retrieved.sources.filter(s=>args.source_ids?.includes(s.sourceId)).map(s=>s.snippet)):null,rejection:result.rejectionReason||null}));
  }
}
main().catch(e=>{console.log(JSON.stringify({phase:'citation_diagnosis',result:'BLOCKED',safeError:['ISOLATION_FAILED','AUTH_UNAVAILABLE','STAGING_PROVIDER_FAILED'].includes(e.message)?e.message:e.name}));process.exitCode=1;});
