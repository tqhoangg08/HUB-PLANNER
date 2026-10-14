import {buildDerivedPageObjectKey} from './ai-document-ingestion.ts';
import {AI_DOCUMENT_MAX_SEGMENTS} from '../../../shared/ai-document-limits.ts';
import type {AiAdvisorV2Dependencies} from './ai-advisor-v2-runtime.ts';
import type {AiSearchClient,AiSearchInstanceNames} from './ai-search-retrieval.ts';
import {tuitionPaymentCondition} from './ai-advisor-tuition-condition.ts';

export type CompletenessEnv = {
  AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED?:unknown;
  DB?:D1Database;
  AI_DOCUMENTS_BUCKET?:Pick<R2Bucket,'get'>;
  /** Request-scoped content-free R2 attempt counter; never receives source data. */
  advisorCompletenessTelemetry?:{pageRead():void};
};
/** Trusted deployment flag only, never request parameters. Fail closed by default. */
export const completenessEnabled = (env:CompletenessEnv) => env.AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED==='true';
/** Final policy-only CAS-style read. Legacy V2 remains compatible with old
 * schemas; the new policy requires 0054 and never serves a changed revision. */
export const areDocumentEvidenceRevisionsCurrent = async (env:CompletenessEnv,sources:readonly {documentId:string;revision?:string}[]) => {
  if(!env.DB||!sources.length||sources.length>3)return false;
  const ids=[...new Set(sources.map(s=>s.documentId))];
  try {
    const result=await env.DB.prepare(`SELECT id,version,ai_search_revision,ai_search_status FROM ai_documents
      WHERE id IN (${ids.map(()=>'?').join(',')}) AND visibility='public' AND deleted_at IS NULL AND indexing_status='completed'`)
      .bind(...ids).all<{id:string;version:number;ai_search_revision:string|null;ai_search_status:string}>();
    return sources.every(source=>result.results?.some(row=>row.id===source.documentId
      &&(row.ai_search_status==='completed'||row.ai_search_status==='not_prepared'&&!row.ai_search_revision)
      &&String(row.ai_search_revision||row.version||1)===source.revision));
  } catch {return false;}
};
export const buildCompletenessDependencies = (env:CompletenessEnv,client:AiSearchClient|undefined,instances:AiSearchInstanceNames):Pick<AiAdvisorV2Dependencies,'completenessSearch'|'pageContent'> => {
  if(!completenessEnabled(env)||!client)return {};
  return {completenessSearch:request=>client.search(instances.text,request),pageContent:createAuthorizedSegmentReader(env)};
};
/** The small native-text condition repair works with completeness OFF. It
 * does not select V2 users, mutate flags, or change other document domains. */
export const buildTuitionConditionDependencies=(env:CompletenessEnv,question:string):Pick<AiAdvisorV2Dependencies,'tuitionConditionContent'> =>
  tuitionPaymentCondition(question)?{tuitionConditionContent:createAuthorizedSegmentReader(env,true)}:{};

export const createAuthorizedSegmentReader=(env:CompletenessEnv,strictNative=false):NonNullable<AiAdvisorV2Dependencies['pageContent']>=>{
  let reads=0;
  return async source=>{
      if(!env.DB||!env.AI_DOCUMENTS_BUCKET||reads>=3)return null;
      // Recheck D1 current authorization after search/cache, before R2. No
      // client URL, object key, scope, document ID or page hint is accepted.
      let row:{ai_search_revision:string}|null;
      try{row=await env.DB.prepare("SELECT ai_search_revision FROM ai_documents WHERE id=? AND visibility='public' AND deleted_at IS NULL AND ai_search_status='completed'"+
        (strictNative?" AND indexing_status='completed' AND derived_source_kind='native_text' AND extraction_pipeline_version IN ('admin-text-structured-v1','docx-native-structured-v1')":"")).bind(source.documentId).first<{ai_search_revision:string}>();}
      catch{return null;} // Pre-0054 schema cannot hydrate derived evidence.
      if(!row?.ai_search_revision)return null;
      // Word units use the same bounded storage ordinal, not physical pages.
      // Parse only after D1 authorization, then require exact canonical key.
      const ordinal=Number(source.itemKey.match(/\/page-(\d{3})\.md$/)?.[1]);
      if(!Number.isInteger(ordinal)||ordinal<1||ordinal>AI_DOCUMENT_MAX_SEGMENTS)return null;
      const key=buildDerivedPageObjectKey(source.documentId,row.ai_search_revision,ordinal);
      if(source.itemKey!==key)return null;
      // Recheck after awaited D1 authorization as well: concurrent callers
      // must not each consume a stale copy of the remaining read budget.
      if(reads>=3)return null;
      reads++;
      env.advisorCompletenessTelemetry?.pageRead();
      const object=await env.AI_DOCUMENTS_BUCKET.get(key);
      if(!object||!('body' in object)||object.size>32000){if(object&&'body' in object)await object.body.cancel();return null;}
      if(strictNative&&(object.customMetadata?.document_id!==source.documentId||object.customMetadata?.revision!==row.ai_search_revision
        ||object.customMetadata?.visibility!=='public'||object.customMetadata?.active!=='true')){await object.body.cancel();return null;}
      const text=await object.text();
      return text.trim()&&text.length<=8000?text:null;
  };
};
