import {buildDerivedPageObjectKey} from './ai-document-ingestion.ts';
import type {AiAdvisorV2Dependencies} from './ai-advisor-v2-runtime.ts';
import type {AiSearchClient,AiSearchInstanceNames} from './ai-search-retrieval.ts';
import {AI_DOCUMENT_MAX_SEGMENTS} from '../../../shared/ai-document-limits.ts';

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
  let reads=0;
  return {
    completenessSearch:request=>client.search(instances.text,request),
    pageContent:async source=>{
      if(!env.DB||!env.AI_DOCUMENTS_BUCKET||reads>=3)return null;
      // Recheck D1 current authorization after search/cache, before R2. No
      // client URL, object key, scope, document ID or page hint is accepted.
      let row:{ai_search_revision:string}|null;
      try{row=await env.DB.prepare("SELECT ai_search_revision FROM ai_documents WHERE id=? AND visibility='public' AND deleted_at IS NULL AND ai_search_status='completed'").bind(source.documentId).first<{ai_search_revision:string}>();}
      catch{return null;} // Pre-0054 schema cannot hydrate derived evidence.
      if(!row?.ai_search_revision)return null;
      // Word units use the same bounded storage ordinal, not physical pages.
      // Parse only after D1 authorization, then require exact canonical key.
      const ordinal=Number(source.itemKey.match(/\/page-(\d{3})\.md$/)?.[1]);
      if(!Number.isInteger(ordinal)||ordinal<1||ordinal>AI_DOCUMENT_MAX_SEGMENTS)return null;
      const key=buildDerivedPageObjectKey(source.documentId,row.ai_search_revision,ordinal);
      if(source.itemKey!==key)return null;
      reads++;
      env.advisorCompletenessTelemetry?.pageRead();
      const object=await env.AI_DOCUMENTS_BUCKET.get(key);
      if(!object||!('body' in object)||object.size>32000){if(object&&'body' in object)await object.body.cancel();return null;}
      const text=await object.text();
      return text.trim()&&text.length<=8000?text:null;
    },
  };
};
