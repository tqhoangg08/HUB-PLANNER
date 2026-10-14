import {buildDerivedPageObjectKey,buildEffectiveIndexRevision} from './ai-document-ingestion.ts';
import {AI_DOCUMENT_MAX_SEGMENTS} from '../../../shared/ai-document-limits.ts';
import {segmentDocumentText,renderTextSegment,TEXT_FIRST_PIPELINE} from '../../../shared/ai-document-text.ts';
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
export const buildTuitionConditionDependencies=(env:CompletenessEnv,question:string):Pick<AiAdvisorV2Dependencies,'tuitionConditionContent'|'tuitionConditionOriginal'> => {
  if(!tuitionPaymentCondition(question))return {};
  const budget={reads:0};
  return {tuitionConditionContent:createAuthorizedSegmentReader(env,true,budget),tuitionConditionOriginal:createAuthorizedTextSourceReader(env,budget)};
};

export const createAuthorizedSegmentReader=(env:CompletenessEnv,strictNative=false,budget={reads:0}):NonNullable<AiAdvisorV2Dependencies['pageContent']>=>{
  return async source=>{
      if(!env.DB||!env.AI_DOCUMENTS_BUCKET||budget.reads>=3)return null;
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
      if(budget.reads>=3)return null;
      budget.reads++;
      env.advisorCompletenessTelemetry?.pageRead();
      const object=await env.AI_DOCUMENTS_BUCKET.get(key);
      if(!object||!('body' in object)||object.size>32000){if(object&&'body' in object)await object.body.cancel();return null;}
      if(strictNative&&(object.customMetadata?.document_id!==source.documentId||object.customMetadata?.revision!==row.ai_search_revision
        ||object.customMetadata?.visibility!=='public'||object.customMetadata?.active!=='true')){await object.body.cancel();return null;}
      const text=await object.text();
      return text.trim()&&text.length<=8000?text:null;
  };
};

/** One bounded original read, only for a server-authorized published Text-first
 * revision. No client path, arbitrary document scan, DOCX parser or guessed page.
 * Source + derived hashes reproduce the exact revision that was indexed. */
export const createAuthorizedTextSourceReader=(env:CompletenessEnv,budget={reads:0}):NonNullable<AiAdvisorV2Dependencies['tuitionConditionOriginal']>=>async source=>{
  if(!env.DB||!env.AI_DOCUMENTS_BUCKET||budget.reads>=3)return null;
  const sql=`SELECT a.id,a.version,a.ai_search_revision,a.storage_path,a.content_hash,a.file_size,a.index_segment_count,a.derived_content_hash,r.document_id AS text_document_id
    FROM ai_documents a JOIN ai_text_revisions r ON r.id=a.id JOIN ai_text_documents d ON d.id=r.document_id
    WHERE a.id=? AND a.ai_search_revision=? AND a.visibility='public' AND a.category='tuition' AND a.deleted_at IS NULL
      AND a.indexing_status='completed' AND a.ai_search_status='completed' AND a.derived_source_kind='native_text'
      AND a.extraction_pipeline_version='admin-text-structured-v1' AND r.state='published' AND d.live_document_id=a.id
      AND r.ai_search_revision=a.ai_search_revision AND r.content_hash=a.content_hash AND r.storage_path=a.storage_path
      AND r.file_size=a.file_size AND r.segment_count=a.index_segment_count AND r.version=a.version AND r.visibility=a.visibility AND r.category=a.category`;
  type Row={id:string;version:number;ai_search_revision:string;storage_path:string;content_hash:string;file_size:number;index_segment_count:number;derived_content_hash:string;text_document_id:string};
  try{
    const row=await env.DB.prepare(sql).bind(source.documentId,source.revision).first<Row>();
    if(!row||row.id!==source.documentId||row.ai_search_revision!==source.revision
      ||!Number.isInteger(row.file_size)||row.file_size<1||row.file_size>1048576
      ||!Number.isInteger(row.index_segment_count)||row.index_segment_count<1||row.index_segment_count>AI_DOCUMENT_MAX_SEGMENTS
      ||row.storage_path!==`ai-documents/text-first/${row.text_document_id}/${row.id}/original.txt`||budget.reads>=3)return null;
    budget.reads++;env.advisorCompletenessTelemetry?.pageRead();
    const object=await env.AI_DOCUMENTS_BUCKET.get(row.storage_path);
    if(!object||!('body' in object))return null;
    if(object.size!==row.file_size||object.customMetadata?.sha256!==row.content_hash){await object.body.cancel();return null;}
    const reader=object.body.getReader(),parts:Uint8Array[]=[];let length=0;
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>row.file_size){await reader.cancel();return null;}parts.push(value);}
    if(length!==row.file_size)return null;
    const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
    const digest=async(value:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value))).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(await digest(bytes)!==row.content_hash)return null;
    const segments=segmentDocumentText(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));
    if(segments.length!==row.index_segment_count)return null;
    const derivedHash=await digest(new TextEncoder().encode(segments.map(renderTextSegment).join('')));
    if(derivedHash!==row.derived_content_hash||await buildEffectiveIndexRevision({documentId:row.id,sourceVersion:row.version,sourceContentHash:row.content_hash,
      indexSourceKind:'ocr_text',derivedSourceKind:'native_text',extractionPipelineVersion:TEXT_FIRST_PIPELINE,derivedContentHash:derivedHash,indexingStatus:'completed'})!==source.revision)return null;
    const current=await env.DB.prepare(sql).bind(source.documentId,source.revision).first<Row>();
    if(!current||JSON.stringify(current)!==JSON.stringify(row))return null;
    return segments;
  }catch{return null;}
};
