import {normalizeAdvisorIntentText} from './ai-advisor-intents.ts';
import {buildDerivedPageObjectKey} from './ai-document-ingestion.ts';
import {buildAiSearchAuthorizationFilter,normalizeAuthorizedAiSearchChunks,type AiSearchAuthorizedDocument,type AiSearchRawChunk,type AiSearchRetrievalResult} from './ai-search-retrieval.ts';
import type {CompletenessSearchRequest} from './ai-search-completeness.ts';
import type {AuthorizedEvidenceSource} from './ai-advisor-evidence.ts';
import {containsDocumentInstructions} from './ai-advisor-grounding.ts';
import {AI_DOCUMENT_MAX_SEGMENTS} from '../../../shared/ai-document-limits.ts';

/** Parse a requested condition, not a fee/discount or a document identity. */
export function tuitionPaymentCondition(question:string){
  const q=normalizeAdvisorIntentText(question);
  if(!/\bhoc phi\b/.test(q)||! /\b(?:dong|thanh toan|nop)\b/.test(q))return null;
  const matches=[...q.matchAll(/\b(tu\s+|tren\s+)?(\d{1,3})\s*(?:hoc\s+)?(ky|nam)(\s+tro len)?\b/g)];
  if(matches.length!==1)return null;
  const [,prefix,n,unit,suffix]=matches[0],count=Number(n);
  if(count<1||count>128)return null;
  const comparison=prefix?.trim()==='tren'?'gt':prefix||suffix?'gte':'eq';
  const term=unit==='ky'?'kỳ':'năm';
  return {count,unit,comparison,queries:[`Đóng học phí ${comparison==='gt'?'trên ':''}${count} ${term}${comparison==='gte'?' trở lên':''}`,
    `Chính sách miễn giảm ưu đãi khi đóng học phí nhiều ${term}`]};
}
const conditionMatches=(question:string,line:string)=>{
  const requested=tuitionPaymentCondition(question),actual=tuitionPaymentCondition(line);
  return Boolean(requested&&actual&&requested.count===actual.count&&requested.unit===actual.unit&&requested.comparison===actual.comparison);
};

/** Three bounded vector searches. Query expansion is input-only; no answers,
 * known segment numbers or index configuration changes are injected. */
export async function retrieveTuitionConditionEvidence(question:string,documents:readonly AiSearchAuthorizedDocument[],
  search:(r:CompletenessSearchRequest)=>Promise<{chunks?:AiSearchRawChunk[]}>,
  read:(source:{documentId:string;itemKey:string})=>Promise<string|null>,
  original?:(source:{documentId:string;revision:string})=>Promise<readonly {number:number;text:string}[]|null>):Promise<AiSearchRetrievalResult>{
  const start=Date.now(),condition=tuitionPaymentCondition(question);
  const scoped=documents.filter(d=>d.active!==false&&d.visibility==='public'&&d.category==='tuition'&&typeof d.revision==='string');
  // No legal/version precedence is inferred between competing fee sources.
  const filters=scoped.length===1?buildAiSearchAuthorizationFilter(scoped):null;
  if(!condition||!filters)return {sources:[],rawChunkCount:0,searchCallCount:0,backends:[],latencyMs:0};
  const byId=new Map(scoped.map(d=>[d.id,d])),chunks:AiSearchRawChunk[]=[];
  let searchCalls=0;
  try{for(const [index,query]of [question.slice(0,2000),...condition.queries].entries()){
    searchCalls++;
    const response=await search({query,ai_search_options:{retrieval:{retrieval_type:'vector',match_threshold:0.4,max_num_results:index===0?3:5,filters}}});
    if(response.chunks&&!Array.isArray(response.chunks))throw new TypeError('Invalid AI Search chunks response.');
    chunks.push(...(response.chunks||[]).slice(0,index===0?3:5));
  }}catch(error){if(!original)throw error;} // A verified source is independent of vector/provider availability.
  if(original){
    // Text-first original is immutable, hash/revision/publication verified by
    // the server reader. Scan lossless segments, not guessed keys or topK.
    // Include every matching condition to detect contradictory rows; never
    // truncate multiple matches into one apparently certain answer.
    const d=scoped[0],segments=await original({documentId:d.id,revision:String(d.revision)});
    const matches=segments?.filter(s=>s.text.split(/\r?\n/).some(l=>conditionMatches(question,l)))||[];
    if(matches.length>3)return {sources:[],rawChunkCount:chunks.length,searchCallCount:searchCalls,backends:['TEXT'],latencyMs:Date.now()-start};
    const sources=matches.map((s,i)=>({sourceId:`S${i+1}`,documentId:d.id,snippet:s.text,score:null,backend:'TEXT' as const,
      chunkId:`source-unit-${s.number}`,itemKey:buildDerivedPageObjectKey(d.id,String(d.revision),s.number)}));
    return {sources,rawChunkCount:chunks.length,searchCallCount:searchCalls,backends:['TEXT'],latencyMs:Date.now()-start};
  }
  const authorized=chunks.filter(c=>{const m=c.item?.metadata,d=byId.get(String(m?.document_id)),ordinal=Number(String(c.item?.key).match(/\/page-(\d{3})\.md$/)?.[1]);
    return d&&m?.visibility==='public'&&(m.active===true||m.active==='true')&&m.revision===d.revision
      &&Number.isInteger(ordinal)&&ordinal>=1&&ordinal<=AI_DOCUMENT_MAX_SEGMENTS&&c.item?.key===buildDerivedPageObjectKey(d.id,String(d.revision),ordinal);});
  const normalized=normalizeAuthorizedAiSearchChunks(authorized,scoped);
  const score=(text:string)=>text.split(/\r?\n/).some(l=>conditionMatches(question,l))?2:/\b(?:mien giam|giam hoc phi|uu dai)\b/.test(normalizeAdvisorIntentText(text))?1:0;
  const byKey=new Map<string,typeof normalized[number]>();
  for(const s of normalized.sort((a,b)=>score(b.snippet)-score(a.snippet)||(b.score||0)-(a.score||0)))if(!byKey.has(s.itemKey))byKey.set(s.itemKey,s);
  const units=[...byKey.values()].slice(0,3);
  const sources=[];
  for(const s of units){const text=await read(s);if(text===null)continue;
    if(!text.trim()||text.length>8000)throw new TypeError('Evidence exceeds bound.');
    // Hydration is authoritative. A vector snippet cannot stand in for a
    // missing/stale R2 object, and irrelevant fragments cannot reach generation.
    if(text.split(/\r?\n/).some(l=>conditionMatches(question,l)))sources.push({...s,snippet:text,sourceId:`S${sources.length+1}`});
  }
  return {sources,rawChunkCount:chunks.length,searchCallCount:searchCalls,backends:['TEXT'],latencyMs:Date.now()-start};
}

/** Quote exact rows with their own proven heading/header. No inferred amounts,
 * nearest thresholds, table numbers, dates, or physical Word pages. */
export function resolveTuitionConditionAnswer(question:string,evidence:readonly AuthorizedEvidenceSource[]){
  // This bounded MVP proves a payment threshold, not a cohort/program tuple.
  // Do not transplant a generic discount into an explicitly scoped question.
  if(/\b(?:khoa|nganh|chuong trinh|he chuan|chinh quy|bolton|tieng anh|tinh hoa|dac biet|toan phan|ban phan)\b/.test(normalizeAdvisorIntentText(question)))return null;
  const matches:Array<{source:AuthorizedEvidenceSource;row:string;excerpt:string}>=[];
  for(const source of evidence){
    if(containsDocumentInstructions(source.snippet))continue;
    const lines=source.snippet.split(/\r?\n/);let heading='',header='';
    for(const line of lines){
      if(/^(?:#{1,6}\s|(?:Điều|Khoản|Mục|Phụ lục|Bảng)\s)/iu.test(line.trim())){heading=line;header='';}
      if((line.includes('\t')||/^\s*\|/.test(line))&&! /\d+\s*%/.test(line)&&/\b(?:muc|chinh sach|ty le|noi dung|doi tuong|dieu kien)\b/.test(normalizeAdvisorIntentText(line)))header=line;
      if(!conditionMatches(question,line))continue;
      const rates=line.match(/\d+(?:[.,]\d+)?\s*%/g)||[];
      // Only an explicit reduction relationship is safe for this MVP.
      const n=normalizeAdvisorIntentText(line);
      if(rates.length!==1||! /\bgiam\b/.test(n)||/\b(?:khong|chua|tru|ngoai tru|neu|tuy|hoac|tam|du kien)\b/.test(n))return null;
      matches.push({source,row:line.trim(),excerpt:[heading,header,line].filter(Boolean).join('\n')});
    }
  }
  // Multiple matching rows/scopes are not interchangeable, even at equal rates.
  const unique=[...new Map(matches.map(m=>[JSON.stringify([m.source.documentId,m.excerpt]),m])).values()];
  if(unique.length!==1)return null;
  const match=unique[0];
  return {reply:`Theo đoạn nguồn:\n\n> ${match.row}\n\nChưa xác nhận hiệu lực hiện hành ngoài nội dung tài liệu đã công bố.`,sourceIds:[match.source.sourceId],sourceExcerpts:{[match.source.sourceId]:match.excerpt}};
}
