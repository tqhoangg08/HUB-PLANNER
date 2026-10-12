// Isolated File Search diagnosis. No production store/index/chat mutations.
// State and generated results stay outside Git. SDK retries disabled.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import dotenv from 'dotenv';
import {GoogleGenAI,UploadToFileSearchStoreOperation} from '@google/genai';
import {parsePreparedPdfPages} from '../cloudflare/worker/src/ai-document-ingestion.ts';
import {buildDocumentCandidateMetadataFilter,extractGenerateContentDocumentSources,groundGeminiReply,buildGeminiPolicyContents} from '../cloudflare/worker/src/gemini-file-search.ts';
import {CONDUCT_ACCEPTANCE_QUESTIONS} from './verify-advisor-conduct-providers.mjs';
import {classifyConductIntent} from '../cloudflare/worker/src/ai-advisor-intents.ts';
import {probe} from './diagnose-gemini-advisor.mjs';
const DOC='4255f763-6dca-4152-8b2c-daa686103cc1';
const LABEL='hub-pr88-ocr-isolated-staging';
const emit=(value)=>console.log(JSON.stringify(value));
async function main(){
  const action=['--prepare','--status','--benchmark'].find((v)=>process.argv.includes(v));
  const idx=process.argv.indexOf('--artifact');if(!action||idx<0)throw Error('ARGUMENT_REQUIRED');
  const path=resolve(process.argv[idx+1]);const local=relative(process.cwd(),path);
  if(!local.startsWith('..')&&!isAbsolute(local))throw Error('ARTIFACT_MUST_STAY_OUTSIDE_GIT');
  const artifact=JSON.parse(readFileSync(path,'utf8'));
  if(artifact.sourceContentHash!=='da56531f29c98a6545b9bcec69a2c78fddbdb6623a5c0cdac06f40682996ca25')throw Error('SOURCE_HASH_MISMATCH');
  const prepared=await parsePreparedPdfPages(JSON.stringify(artifact),artifact.sourceContentHash);
  const statePath=resolve(dirname(path),'gemini-staging-state.json');
  dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
  const key=process.env.GEMINI_FILE_SEARCH_API_KEY;if(!key)throw Error('KEY_UNAVAILABLE');
  const ai=new GoogleGenAI({apiKey:key,httpOptions:{timeout:60000,retryOptions:{attempts:1}}});
  let state;
  if(action==='--prepare'){
    if(existsSync(statePath))throw Error('STAGING_STORE_ALREADY_CREATED');
    const store=await ai.fileSearchStores.create({config:{displayName:LABEL}});
    if(!store.name||store.name===process.env.GEMINI_FILE_SEARCH_STORE)throw Error('STAGING_ISOLATION_FAILED');
    state={store:store.name,label:LABEL,hash:prepared.derivedContentHash};
    // Persist before upload; failure cannot accidentally recreate/reupload.
    writeFileSync(statePath,JSON.stringify(state));
    const operation=await ai.fileSearchStores.uploadToFileSearchStore({fileSearchStoreName:store.name,
      file:new Blob([prepared.markdown],{type:'text/plain'}),config:{mimeType:'text/plain',displayName:'Quy chế đánh giá kết quả rèn luyện sinh viên',
        customMetadata:[{key:'document_id',stringValue:DOC},{key:'visibility',stringValue:'public'}]}});
    state.operation=operation.name;state.completed=operation.done===true&&!operation.error;
    writeFileSync(statePath,JSON.stringify(state));
    emit({phase:'gemini_staging_index',storeCreated:true,uploadAttempted:true,completed:state.completed,productionChanged:false});return;
  }
  state=JSON.parse(readFileSync(statePath,'utf8'));
  if(state.label!==LABEL||state.hash!==prepared.derivedContentHash||state.store===process.env.GEMINI_FILE_SEARCH_STORE)throw Error('STAGING_ISOLATION_FAILED');
  const store=await ai.fileSearchStores.get({name:state.store});if(store.displayName!==LABEL)throw Error('STAGING_ISOLATION_FAILED');
  if(action==='--status'){
    if(!state.operation)throw Error('STAGING_UPLOAD_NOT_CONFIRMED');
    const operation=new UploadToFileSearchStoreOperation();operation.name=state.operation;
    const status=await ai.operations.get({operation});
    state.completed=status.done===true&&!status.error;writeFileSync(statePath,JSON.stringify(state));
    emit({phase:'gemini_staging_status',completed:state.completed,failed:Boolean(status.error),embeddingModel:store.embeddingModel||'PROVIDER_DEFAULT_NOT_EXPOSED',productionChanged:false});return;
  }
  if(!state.completed)throw Error('STAGING_INDEX_NOT_READY');
  for(const [i,question]of CONDUCT_ACCEPTANCE_QUESTIONS.entries()){
    if(classifyConductIntent(question)==='personal_score'){emit({phase:'gemini_staging_benchmark',case:i+1,result:'PERSONAL_SCORE_UNAVAILABLE',providerCalls:0,notRealUserSession:true});continue;}
    const response=await probe({key,path:'models/gemini-3.1-flash-lite:generateContent',timeoutMs:30000,
      body:{contents:buildGeminiPolicyContents(question),tools:[{fileSearch:{fileSearchStoreNames:[state.store],metadataFilter:buildDocumentCandidateMetadataFilter([DOC])}}]},sensitive:[state.store,question]});
    const sources=response.data?extractGenerateContentDocumentSources(response.data):[];
    const text=(response.data?.candidates?.[0]?.content?.parts||[]).map((p)=>p.text||'').join('');
    const grounded=sources.length?groundGeminiReply(text,question,sources.filter((s)=>s.documentId===DOC)
      .map((s)=>({...s,title:'Quy chế đánh giá kết quả rèn luyện sinh viên'}))):null;
    writeFileSync(resolve(dirname(path),`gemini-case-${i+1}-local-review.json`),JSON.stringify({text,sources,grounded}));
    emit({phase:'gemini_staging_benchmark',case:i+1,httpStatus:response.diagnostic.status||null,durationMs:response.diagnostic.durationMs,
      result:response.diagnostic.result||(!response.diagnostic.ok?'PROVIDER_ERROR':grounded?.groundingVerified?'GROUNDED_RESPONSE':'NO_GROUNDED_RESPONSE'),
      providerCalls:1,citations:sources.length,notRealUserSession:true,productionChanged:false});
  }
}
main().catch((error)=>{emit({phase:'gemini_staging',result:'BLOCKED',errorClass:error.name,status:Number.isInteger(error.status)?error.status:null});process.exitCode=1;});
