// Real-provider staging harness. It can write ONLY to this private test
// instance, never production D1/R2/index/chat. No PDF is sent, only derived MD.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import dotenv from 'dotenv';
import {parsePreparedPdfPages,renderDerivedPage,buildServerDerivedMetadata} from '../cloudflare/worker/src/ai-document-ingestion.ts';
import {CloudflareAiSearchRetrievalProvider} from '../cloudflare/worker/src/ai-search-retrieval.ts';
import {createWorkersAiEvidenceGenerator} from '../cloudflare/worker/src/ai-advisor-workers-ai.ts';
import {executeAiAdvisorV2Document} from '../cloudflare/worker/src/ai-advisor-v2-runtime.ts';
import {classifyConductIntent} from '../cloudflare/worker/src/ai-advisor-intents.ts';
import {CONDUCT_ACCEPTANCE_QUESTIONS} from './verify-advisor-conduct-providers.mjs';
import {probe} from './diagnose-gemini-advisor.mjs';
const INSTANCE='hub-advisor-pr88-ocr-cells-staging';
const DOCUMENT='4255f763-6dca-4152-8b2c-daa686103cc1';
const emit=(v)=>console.log(JSON.stringify(v));
const allowedActions=['--create','--index','--status','--retrieval-proof','--benchmark','--gemini-control'];
async function main(){
  if(process.argv.includes('--help')){console.log('Isolated provider harness only (not browser/BetterAuth E2E). --create | --index --artifact <outside-Git JSON> | --status | --benchmark | --gemini-control. Requires local Wrangler OAuth. Never writes production. No retries. No secrets/source/answers in stdout.');return;}
  const action=allowedActions.find((a)=>process.argv.includes(a));
  if(!action||allowedActions.filter((a)=>process.argv.includes(a)).length!==1)throw Error('ARGUMENT_INVALID');
  const token=readFileSync('.cache/cloudflare/xdg/.wrangler/config/default.toml','utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if(!token)throw Error('CF_AUTH_UNAVAILABLE');
  let account;
  const api=async(path,method='GET',body)=>{
    // Every write is structurally restricted to the isolated instance; no
    // namespace-wide update or production index sync is available here.
    if(method!=='GET'&&!path.includes(`/namespaces/default/instances/${INSTANCE}`)&&!(method==='POST'&&path.endsWith('/namespaces/default/instances')&&body?.id===INSTANCE)
      &&!path.includes('/ai/run/'))throw Error('PRODUCTION_WRITE_GUARD');
    const multipart=body instanceof FormData;
    const response=await fetch(`https://api.cloudflare.com/client/v4/${path}`,{method,
      headers:{Authorization:`Bearer ${token}`,...(!multipart?{'Content-Type':'application/json'}:{})},
      ...(body?{body:multipart?body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});
    const json=await response.json();
    if(!response.ok||!json.success){emit({phase:'provider',httpStatus:response.status,errorCodes:json.errors?.map((e)=>Number(e.code)).filter(Number.isFinite)});throw Error('STAGING_PROVIDER_FAILED');}
    return json.result;
  };
  const accounts=await api('accounts');if(accounts.length!==1)throw Error('CF_ACCOUNT_AMBIGUOUS');account=accounts[0].id;
  const base=`accounts/${account}/ai-search/namespaces/default/instances/${INSTANCE}`;
  if(action==='--create'){
    // Create, never PUT/update. Repeated creation cannot reset another index.
    const production=await api(`accounts/${account}/ai-search/namespaces/hub-ai-production/instances/hub-ai-text-production`);
    const result=await api(`accounts/${account}/ai-search/namespaces/default/instances`,'POST',{
      id:INSTANCE,engine_version:3,embedding_model:production.embedding_model,chunk_size:production.chunk_size||512,
      chunk_overlap:production.chunk_overlap||10,public_endpoint_params:{enabled:false},
      custom_metadata:[{field_name:'document_id',data_type:'text'},{field_name:'category',data_type:'text'},
        {field_name:'visibility',data_type:'text'},{field_name:'revision',data_type:'text'},{field_name:'active',data_type:'boolean'}]});
    emit({phase:'staging_create',instance:INSTANCE,publicEndpointEnabled:result.public_endpoint_params?.enabled===true,productionChanged:false});return;
  }
  const instance=await api(base);
  if(instance.id!==INSTANCE||instance.public_endpoint_params?.enabled===true||instance.source)throw Error('STAGING_ISOLATION_NOT_VERIFIED');
  if(action==='--index'){
    const arg=process.argv.indexOf('--artifact');if(arg<0)throw Error('ARTIFACT_REQUIRED');
    const path=resolve(process.argv[arg+1]),r=relative(process.cwd(),path);
    if(!r.startsWith('..')&&!isAbsolute(r))throw Error('ARTIFACT_MUST_STAY_OUTSIDE_GIT');
    const input=JSON.parse(readFileSync(path,'utf8'));
    // Exact source audited as the public PDF; cannot upload another source
    // accidentally or replace production representation under this command.
    if(input.sourceContentHash!=='da56531f29c98a6545b9bcec69a2c78fddbdb6623a5c0cdac06f40682996ca25')throw Error('SOURCE_HASH_MISMATCH');
    const prepared=await parsePreparedPdfPages(JSON.stringify(input),input.sourceContentHash);
    const revision=`staging-${prepared.derivedContentHash.slice(0,32)}`;
    for(const page of prepared.pages){
      const form=new FormData();form.set('file',new Blob([renderDerivedPage(page)],{type:'text/markdown'}),`${DOCUMENT}-page-${String(page.pageNumber).padStart(3,'0')}.md`);
      form.set('metadata',JSON.stringify(buildServerDerivedMetadata({documentId:DOCUMENT,category:'training_regulation',visibility:'public',revision,active:true})));
      const result=await api(`${base}/items`,'POST',form);
      emit({phase:'staging_index',page:page.pageNumber,status:result.status,metadataWarnings:result.warnings?.length||0});
    }
    return;
  }
  if(action==='--status'){
    const items=await api(`${base}/items?per_page=50`);
    const rows=Array.isArray(items)?items:items.result||[];
    emit({phase:'staging_status',items:rows.length,statuses:rows.reduce((a,i)=>(a[i.status]=(a[i.status]||0)+1,a),{}),
      chunks:rows.reduce((n,i)=>n+(i.chunks_count||0),0),allMetadataAuthorized:rows.every((i)=>i.metadata?.document_id===DOCUMENT&&i.metadata?.visibility==='public'),
      revisions:[...new Set(rows.map((i)=>i.metadata?.revision).filter(Boolean))],
      pages:rows.map((i)=>({page:Number(String(i.key).match(/page-(\d+)\.md$/)?.[1])||null,status:i.status,chunks:i.chunks_count||0})),
      publicEndpointEnabled:false,productionChanged:false});return;
  }
  if(action==='--gemini-control'){
    dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
    const key=process.env.GEMINI_FILE_SEARCH_API_KEY;
    if(!key)throw Error('GEMINI_KEY_UNAVAILABLE');
    const result=await probe({key,path:'models/gemini-3.1-flash-lite:generateContent',timeoutMs:30000,
      body:{contents:[{role:'user',parts:[{text:'Reply with OK.'}]}]},sensitive:[]});
    emit({phase:'gemini_plain_control',providerCalls:1,httpStatus:result.diagnostic.status||null,result:result.diagnostic.result||'RESPONSE',durationMs:result.diagnostic.durationMs,productionChanged:false});return;
  }
  const artifactArg=process.argv.indexOf('--artifact');
  if(artifactArg<0)throw Error('ARTIFACT_REQUIRED');
  const artifactPath=resolve(process.argv[artifactArg+1]);
  const artifactRelative=relative(process.cwd(),artifactPath);
  if(!artifactRelative.startsWith('..')&&!isAbsolute(artifactRelative))throw Error('ARTIFACT_MUST_STAY_OUTSIDE_GIT');
  const artifact=JSON.parse(readFileSync(artifactPath,'utf8'));
  const expectedRevision=`staging-${artifact.derivedContentHash.slice(0,32)}`;
  const listed=await api(`${base}/items?per_page=50`);
  const indexed=Array.isArray(listed)?listed:listed.result||[];
  const allPagesComplete=indexed.length===artifact.pages.length&&indexed.every((i)=>i.status==='completed'
    &&i.metadata?.document_id===DOCUMENT&&i.metadata?.revision===expectedRevision
    &&[true,'true'].includes(i.metadata?.active)&&i.metadata?.visibility==='public');
  if(action!=='--retrieval-proof'&&!allPagesComplete)throw Error('STAGING_INDEX_NOT_READY');
  if(indexed.some((i)=>i.metadata?.document_id!==DOCUMENT||i.metadata?.revision!==expectedRevision
    ||![true,'true'].includes(i.metadata?.active)||i.metadata?.visibility!=='public'))throw Error('STAGING_INDEX_NOT_READY');
  const client={search:(_name,request)=>api(`${base}/search`,'POST',request)};
  const candidates=[{id:DOCUMENT,title:'Quy chế đánh giá kết quả rèn luyện sinh viên',visibility:'public',active:true,backend:'TEXT'}];
  if(action==='--retrieval-proof'){
    const provider=new CloudflareAiSearchRetrievalProvider(client,{text:INSTANCE,ocr:INSTANCE},true);
    const expanded=process.argv.includes('--expanded-queries');
    for(const index of expanded?[0,3]:[0,3,4,5]){
      const query=CONDUCT_ACCEPTANCE_QUESTIONS[index]+(expanded?'\nBảng tiêu chí: nội dung đánh giá, thang điểm rèn luyện, khung điểm.':'');
      const response=await provider.retrieve({question:query,allowedDocuments:candidates});
      const text=response.sources.map((s)=>s.snippet).join('\n');
      writeFileSync(resolve(dirname(artifactPath),`retrieval-case-${index+1}-local-review.json`),JSON.stringify(response));
      emit({phase:'staging_retrieval_proof',case:index+1,expandedQueryControl:expanded,allPagesComplete,searchCalls:response.searchCallCount,
        retrieved:response.rawChunkCount,authorized:response.sources.length,pages:response.sources.map((s)=>s.pageNumber||null),durationMs:response.latencyMs,
        scale100:/thang điểm 100/i.test(text),miniGameNegative:/mini game.*không được tính điểm rèn luyện/is.test(text),
        outsideAll:/xác nhận/.test(text)&&/chữ ký/.test(text)&&/dấu tròn/.test(text),
        tableMaxima:{score25:/25/.test(text),score20:/20/.test(text),score15:/15/.test(text)},generatorCalls:0,notFullAppE2E:true});
    }return;
  }
  for(const [index,question]of CONDUCT_ACCEPTANCE_QUESTIONS.entries()){
    if(classifyConductIntent(question)==='personal_score'){emit({phase:'staging_benchmark',case:index+1,result:'PERSONAL_SCORE_UNAVAILABLE',searchCalls:0,generatorCalls:0,notRealUserSession:true});continue;}
    let searchCalls=0,generatorCalls=0,retrieved=[];
    const scopedClient={search:async(name,request)=>{searchCalls++;const response=await client.search(name,request);retrieved=response.chunks||[];return response;}};
    const generator=createWorkersAiEvidenceGenerator({AI_ADVISOR_V2_GENERATOR_MODEL:'@cf/zai-org/glm-4.7-flash',AI:{run:async(model,input)=>{generatorCalls++;return api(`accounts/${account}/ai/run/${model}`,'POST',input);}}});
    const started=Date.now();
    // Same runtime authorization/retrieval/generator/grounding, no manual
    // snippets, cache or real-user chat history. One independent case each.
    const result=await executeAiAdvisorV2Document(question,candidates,{aiSearchClient:scopedClient,
      aiSearchInstances:{text:INSTANCE,ocr:INSTANCE},evidenceGenerator:generator,
      quota:{mode:'NORMAL',allowGeneration:true,allowRetrieval:true}});
    const answer=result.kind==='ANSWER'?result.answer.reply:'';
    const evidence=result.kind==='ANSWER'?result.answer.evidence:[];
    const facts=(text)=>({scale100:/thang điểm 100/i.test(text),miniGame:/mini game.*không được tính điểm rèn luyện/is.test(text),
      outsideEvidence:/ngoài trường.*xác nhận/is.test(text),fiveMaxima:/0\s*[–-]\s*25/.test(text)&&/0\s*[–-]\s*15/.test(text)&&/0\s*[–-]\s*20/.test(text)});
    writeFileSync(resolve(dirname(artifactPath),`workers-case-${index+1}-local-review.json`),JSON.stringify({result,retrieved}));
    emit({phase:'staging_benchmark',case:index+1,result:result.kind==='ANSWER'?'VALIDATED_ANSWER':result.reason,
      searchCalls,generatorCalls,durationMs:Date.now()-started,sourceDocumentIds:[...new Set(evidence.map((e)=>e.documentId))],
      pages:[...new Set(evidence.flatMap((e)=>e.pageNumber?[e.pageNumber]:[...e.snippet.matchAll(/(?:<!--\s*page:\s*|Trang\s+)(\d+)/g)].map((m)=>Number(m[1]))))],
      retrievedFacts:facts(retrieved.map((c)=>c.text||'').join('\n')),
      generatorHeadFacts:facts(retrieved.map((c)=>String(c.text||'').trim().slice(0,1600)).join('\n')),
      scale100:/thang điểm 100/i.test(answer),miniGameNegative:/mini game.*không được tính điểm rèn luyện/is.test(answer),
      outsideEvidence:/ngoài trường.*xác nhận/is.test(answer),notRealUserSession:true,cost:'NOT_MEASURED'});
  }
}
main().catch((error)=>{emit({phase:'staging',result:'BLOCKED',reason:['ARGUMENT_INVALID','CF_AUTH_UNAVAILABLE','CF_ACCOUNT_AMBIGUOUS','PRODUCTION_WRITE_GUARD','STAGING_PROVIDER_FAILED','STAGING_ISOLATION_NOT_VERIFIED','STAGING_INDEX_NOT_READY','ARTIFACT_REQUIRED','ARTIFACT_MUST_STAY_OUTSIDE_GIT','SOURCE_HASH_MISMATCH','GEMINI_KEY_UNAVAILABLE'].includes(error.message)?error.message:error.name==='TimeoutError'?'TIMEOUT':'STAGING_SETUP_FAILED'});process.exitCode=1;});
