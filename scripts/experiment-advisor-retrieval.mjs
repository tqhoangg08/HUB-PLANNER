// Bounded, private staging experiments. No production writes or chat requests.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {buildAiSearchAuthorizationFilter,normalizeAuthorizedAiSearchChunks} from '../cloudflare/worker/src/ai-search-retrieval.ts';
import {CONDUCT_ACCEPTANCE_QUESTIONS} from './verify-advisor-conduct-providers.mjs';
import {conductTableEvidencePriority} from '../cloudflare/worker/src/ai-advisor-table-evidence.ts';
const INSTANCE='hub-advisor-pr88-ocr-cells-staging';
const DOC='4255f763-6dca-4152-8b2c-daa686103cc1';
const emit=(v)=>console.log(JSON.stringify(v));
async function main(){
  const ix=process.argv.indexOf('--artifact');if(ix<0)throw Error('ARTIFACT_REQUIRED');
  const path=resolve(process.argv[ix+1]),local=relative(process.cwd(),path);
  if(!local.startsWith('..')&&!isAbsolute(local))throw Error('ARTIFACT_INSIDE_GIT');
  const artifact=JSON.parse(readFileSync(path,'utf8'));
  const token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if(!token)throw Error('AUTH_UNAVAILABLE');
  const api=async(path,body)=>{
    if(body&&!path.endsWith(`/instances/${INSTANCE}/search`))throw Error('WRITE_GUARD');
    const r=await fetch(`https://api.cloudflare.com/client/v4/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    const j=await r.json();if(!r.ok||!j.success)throw Error(`PROVIDER_HTTP_${r.status}`);return j.result;
  };
  const accounts=await api('accounts');if(accounts.length!==1)throw Error('ACCOUNT_AMBIGUOUS');
  const base=`accounts/${accounts[0].id}/ai-search/namespaces/default/instances/${INSTANCE}`;
  const instance=await api(base);if(instance.source||instance.public_endpoint_params?.enabled)throw Error('ISOLATION_FAILED');
  const items=await api(`${base}/items?per_page=50`);const rows=Array.isArray(items)?items:items.result||[];
  const revision=`staging-${artifact.derivedContentHash.slice(0,32)}`;
  if(rows.length!==14||rows.some((i)=>i.status!=='completed'||i.metadata?.revision!==revision||i.metadata?.document_id!==DOC))throw Error('INDEX_NOT_READY');
  const docs=[{id:DOC,active:true,visibility:'public'}],filters=buildAiSearchAuthorizationFilter(docs);
  const variants=[
    {name:'vector_k3',k:3,type:'vector'},
    {name:'vector_k5',k:5,type:'vector'},
    {name:'vector_k10',k:10,type:'vector'},
    {name:'expanded_k10',k:10,type:'vector',expansion:true},
    {name:'hybrid_k10',k:10,type:'hybrid',expansion:true},
    {name:'reranked_k10',k:10,type:'vector',expansion:true,rerank:true},
  ];
  for(const index of [0,3])for(const v of variants){
    const started=Date.now();
    try{
      const response=await api(`${base}/search`,{query:CONDUCT_ACCEPTANCE_QUESTIONS[index]+(v.expansion?'\nBảng tiêu chí: nội dung đánh giá, thang điểm rèn luyện, khung điểm.':''),ai_search_options:{retrieval:{retrieval_type:v.type,max_num_results:v.k,match_threshold:0.4,filters,...(v.type==='hybrid'?{keyword_match_mode:'or'}:{})},...(v.rerank?{reranking:{enabled:true,model:'@cf/baai/bge-reranker-base'}}:{})}});
      const sources=normalizeAuthorizedAiSearchChunks(response.chunks||[],docs);
      writeFileSync(resolve(dirname(path),`experiment-${index+1}-${v.name}.json`),JSON.stringify({sources,response}));
      const text=sources.map((s)=>s.snippet).join('\n');
      emit({case:index+1,variant:v.name,status:'RESPONSE',pages:sources.map((s)=>s.pageNumber),authorized:sources.length,retrieved:response.chunks?.length||0,hasPage2:sources.some((s)=>s.pageNumber===2),hasPage3:sources.some((s)=>s.pageNumber===3),scale100:/thang điểm 100/i.test(text),durationMs:Date.now()-started,searchCalls:1,generatorCalls:0,rerankerCalls:v.rerank?1:0});
    }catch(e){emit({case:index+1,variant:v.name,status:'BLOCKED',safeError:/^PROVIDER_HTTP_\d+$/.test(e.message)?e.message:e.name,durationMs:Date.now()-started});}
  }
  if(process.argv.includes('--multi-step'))for(const index of[0,3]){
    const started=Date.now();const pool=[];
    for(const [step,k]of[3,10].entries()){
      const response=await api(`${base}/search`,{query:CONDUCT_ACCEPTANCE_QUESTIONS[index]+(step?'\nBảng tiêu chí: nội dung đánh giá, thang điểm rèn luyện, khung điểm.':''),ai_search_options:{retrieval:{retrieval_type:'vector',max_num_results:k,match_threshold:0.4,filters},...(step?{reranking:{enabled:true,model:'@cf/baai/bge-reranker-base'}}:{})}});
      pool.push(...normalizeAuthorizedAiSearchChunks(response.chunks||[],docs));
    }
    const sources=[...new Map(pool.map(s=>[s.itemKey,s])).values()].sort((a,b)=>conductTableEvidencePriority(b.snippet)-conductTableEvidencePriority(a.snippet)||(b.score??0)-(a.score??0)).slice(0,3);
    writeFileSync(resolve(dirname(path),`experiment-${index+1}-multi-step.json`),JSON.stringify({sources}));
    emit({case:index+1,variant:'multi_step_bounded',pages:sources.map(s=>s.pageNumber),hasPage2:sources.some(s=>s.pageNumber===2),hasPage3:sources.some(s=>s.pageNumber===3),searchCalls:2,rerankerCalls:1,generatorCalls:0,durationMs:Date.now()-started});
  }
}
main().catch((e)=>{emit({status:'BLOCKED',safeError:['ARTIFACT_REQUIRED','ARTIFACT_INSIDE_GIT','AUTH_UNAVAILABLE','ACCOUNT_AMBIGUOUS','ISOLATION_FAILED','INDEX_NOT_READY'].includes(e.message)?e.message:e.name});process.exitCode=1;});
