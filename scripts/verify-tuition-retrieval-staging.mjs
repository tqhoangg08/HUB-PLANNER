// Read-only real staging provider acceptance. No deployment, upload/index,
// chat-history writes, production targets, fake search results, or generation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {selectAdvisorDocumentCandidatesWithIndexIdentity,routeAdvisorDocuments,resolveDocumentSourcesWithDiagnostics} from '../cloudflare/worker/src/ai-advisor.ts';
import {executeAiAdvisorV2Document} from '../cloudflare/worker/src/ai-advisor-v2-runtime.ts';
import {evaluateAdvisorQuota} from '../cloudflare/worker/src/ai-advisor-quota.ts';
import {buildDerivedPageObjectKey,isCompleteDerivedRevision} from '../cloudflare/worker/src/ai-document-ingestion.ts';
import {extractOfficialDocumentLocators} from '../cloudflare/worker/src/gemini-file-search.ts';
import {areDocumentEvidenceRevisionsCurrent} from '../cloudflare/worker/src/ai-advisor-completeness-config.ts';
import {tuitionPaymentCondition} from '../cloudflare/worker/src/ai-advisor-tuition-condition.ts';
import {normalizeAdvisorIntentText} from '../cloudflare/worker/src/ai-advisor-intents.ts';

const ACCOUNT='6cd8bac6009a55f96bdf9df7c2057548',DB_ID='9f48ac4d-ee81-4d97-9645-921f243ed459',NAME='hub-advisor-pr88-word-staging';
const profile=process.env.APPDATA?path.join(process.env.APPDATA,'xdg.config','.wrangler','config','default.toml'):path.join(os.homedir(),'.config','.wrangler','config','default.toml');
const token=fs.readFileSync(profile,'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if(!token)throw Error('WRANGLER_DEFAULT_AUTH_REQUIRED');
const base=`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
async function api(endpoint,body){
  if(body&&!endpoint.endsWith('/search')&&!(endpoint===`/d1/database/${DB_ID}/query`&&/^\s*SELECT\b/i.test(body.sql)))throw Error('READ_ONLY_GUARD');
  const response=await fetch(base+endpoint,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  const data=await response.json();if(!response.ok||data.success!==true)throw Error(`STAGING_HTTP_${response.status}`);
  if(endpoint.endsWith('/query')&&data.result.some(r=>r.meta?.rows_written>0||r.meta?.changed_db===true))throw Error('READ_ONLY_VIOLATION');
  return data.result;
}
async function main(){
  const identity=await api(`/d1/database/${DB_ID}`);if(identity.uuid!==DB_ID||identity.name!==NAME)throw Error('ISOLATION_FAILED');
  const settings=await api(`/workers/scripts/${NAME}/settings`),bindings=settings.bindings;
  if(bindings.some(b=>b.type==='service'||b.type==='d1'&&b.id!==DB_ID||b.type==='r2_bucket'&&b.bucket_name!==NAME)
    ||bindings.find(b=>b.name==='DB')?.id!==DB_ID||bindings.find(b=>b.name==='STAGING_AI_SEARCH')?.instance_name!==NAME
    ||bindings.find(b=>b.name==='AI_DOCUMENTS_BUCKET')?.bucket_name!==NAME)throw Error('ISOLATION_FAILED');
  const index=`/ai-search/namespaces/default/instances/${NAME}`,instance=await api(index);
  if(instance.id!==NAME||instance.namespace!=='default')throw Error('SEARCH_ISOLATION_FAILED');
  const DB={prepare(sql){if(!/^\s*SELECT\b/i.test(sql))throw Error('READ_ONLY_GUARD');let params=[];return {bind(...p){params=p;return this;},async all(){return (await api(`/d1/database/${DB_ID}/query`,{sql,params}))[0];},async first(){return (await this.all()).results[0]||null;}};}};
  const question='Theo tài liệu quy định học phí, mức thu đối với trường hợp đóng học phí từ 3 kỳ trở lên là bao nhiêu? Hãy trích dẫn nguồn.';
  const route=routeAdvisorDocuments(question),candidates=await selectAdvisorDocumentCandidatesWithIndexIdentity({DB},route);
  const eligible=candidates.filter(d=>d.category==='tuition'&&d.aiSearchStatus==='completed'&&d.derivedSourceKind==='native_text');
  if(eligible.length!==1)throw Error('TUITION_SOURCE_AMBIGUOUS');
  const documents=eligible.map(d=>({...d,revision:d.aiSearchRevision,active:true,visibility:'public',locatorKind:'word_unit'}));
  const document=documents[0],row=await DB.prepare('SELECT index_segment_count,ocr_page_count FROM ai_documents WHERE id=?').bind(document.id).first();
  const expected={id:document.id,revision:document.revision,pages:row.index_segment_count||row.ocr_page_count,visibility:'public'};
  const receipts=await api(index+'/items?per_page=50&metadata_filter='+encodeURIComponent(JSON.stringify({document_id:document.id,revision:document.revision})));
  if(!isCompleteDerivedRevision(expected,receipts))throw Error('RECEIPTS_INCOMPLETE');
  let searchCalls=0,r2Reads=0;const searches=[],readDiagnostics=[];
  const start=Date.now();
  const result=await executeAiAdvisorV2Document(question,documents,{quota:evaluateAdvisorQuota(undefined),aiSearchInstances:{text:NAME,ocr:NAME},
    aiSearchClient:{async search(instanceName,request){if(instanceName!==NAME||searchCalls>=3||request.ai_search_options.retrieval.retrieval_type!=='vector')throw Error('SEARCH_BUDGET');
      searchCalls++;const t=Date.now(),result=await api(index+'/search',request);searches.push({latencyMs:Date.now()-t,units:(result.chunks||[]).map(c=>Number(c.item?.key?.match(/page-(\d+)\.md$/)?.[1])),scores:(result.chunks||[]).map(c=>c.score)});return result;}},
    tuitionConditionContent:async source=>{
      // REST acceptance adapter: independently recheck D1 and exact receipt
      // before fetching a canonical source. No fabricated R2 custom metadata.
      if(r2Reads>=3)return null;
      const current=await DB.prepare("SELECT ai_search_revision FROM ai_documents WHERE id=? AND visibility='public' AND indexing_status='completed' AND ai_search_status='completed' AND deleted_at IS NULL AND derived_source_kind='native_text'").bind(source.documentId).first();
      const ordinal=Number(source.itemKey.match(/page-(\d+)\.md$/)?.[1]);
      if(!current||source.itemKey!==buildDerivedPageObjectKey(source.documentId,current.ai_search_revision,ordinal)
        ||!receipts.some(r=>r.key===source.itemKey&&r.status==='completed'&&r.metadata.revision===current.ai_search_revision))return null;
      r2Reads++;
      const r=await fetch(base+`/r2/buckets/${NAME}/objects/${source.itemKey}`,{redirect:'error',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
      if(!r.ok)return null;
      const reader=r.body.getReader();let length=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>32000){await reader.cancel();return null;}chunks.push(value);}
      const text=Buffer.concat(chunks).toString('utf8');readDiagnostics.push({unit:ordinal,chars:text.length,hasTuition:normalizeAdvisorIntentText(text).includes('hoc phi'),hasDiscount:normalizeAdvisorIntentText(text).includes('giam'),
        paymentRows:text.split('\n').filter(l=>normalizeAdvisorIntentText(l).includes('dong hoc phi')).map(l=>({condition:tuitionPaymentCondition(l),hasRate:/\d+(?:[.,]\d+)?\s*%/.test(l),hasMarkup:/<br>|\\n/.test(l),conditionPhrases:normalizeAdvisorIntentText(l).match(/.{0,15}\b\d{1,3}\s*(?:hoc\s+)?(?:ky|nam).{0,20}/g)}))});return text.length<=8000?text:null;
    },
  });
  let citation=false,correct=false,exactRevision=false,answerUnits=[];
  if(result.kind==='ANSWER'){
    const sources=await resolveDocumentSourcesWithDiagnostics({DB},result.answer.evidence.map(s=>({documentId:s.documentId,locators:extractOfficialDocumentLocators(s.snippet)})),route);
    citation=sources.sources.length===1&&sources.sources[0].documentId===document.id&&sources.sources[0].title===document.title&&sources.sources[0].pageNumber===null;
    exactRevision=await areDocumentEvidenceRevisionsCurrent({DB},result.answer.evidence);
    correct=/đóng học phí\s*3\s*kỳ trở lên/i.test(result.answer.reply)&&/giảm\s*5\s*%/i.test(result.answer.reply)
      &&result.answer.evidence.some(s=>/đóng học phí\s*3\s*kỳ trở lên.{0,30}giảm\s*5\s*%/i.test(s.snippet));
    answerUnits=result.answer.evidence.map(s=>s.unitNumber);
  }
  console.log(JSON.stringify({mode:'LOCAL_PRODUCT_RUNTIME_REAL_STAGING_PROVIDERS',isolation:'PASS',receipts:expected.pages,
    result:result.kind,reason:result.reason||null,answerFromVerifiedRow:correct,citationVerified:citation,exactRevision,answerUnits,searchCalls,r2Reads,
    workersAiCalls:0,geminiCalls:0,hybridRequests:0,latencyMs:Date.now()-start,searches,readDiagnostics,productionChanged:false,documentsChanged:false,
    acceptance:correct&&citation&&exactRevision?'PASS':'FAIL'}));
  if(!correct||!citation||!exactRevision)process.exitCode=1;
}
main().catch(e=>{console.log(JSON.stringify({acceptance:'BLOCKED',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name}));process.exitCode=1;});
