// Opt-in bounded completeness policy. Public runtime flag is off by default.
import {
  buildAiSearchAuthorizationFilter, normalizeAuthorizedAiSearchChunks,
  type AiSearchAuthorizedDocument, type AiSearchRawChunk, type AiSearchRetrievalResult,
} from './ai-search-retrieval.ts';
import {presentConductTableEvidence} from './ai-advisor-table-evidence.ts';
import {buildEvidenceRetrievalPlan} from './ai-advisor-retrieval-plan.ts';

export type CompletenessSearchRequest = {
  query: string;
  ai_search_options: {
    retrieval: {retrieval_type: 'vector'|'hybrid'; match_threshold: number; max_num_results: number; filters: NonNullable<ReturnType<typeof buildAiSearchAuthorizationFilter>>};
    reranking?: {enabled: true; model: '@cf/baai/bge-reranker-base'};
  };
};
export const retrieveAiSearchCompleteEvidence = async (
  question: string, documents: readonly AiSearchAuthorizedDocument[],
  search: (request: CompletenessSearchRequest) => Promise<{chunks?: AiSearchRawChunk[]}>,
  readAuthorizedPage?: (source: {documentId:string;itemKey:string;pageNumber?:number}) => Promise<string|null>,
): Promise<AiSearchRetrievalResult> => {
  const started=Date.now(),plan=buildEvidenceRetrievalPlan(question,documents), filters=buildAiSearchAuthorizationFilter(plan.scoped);
  if(!filters) return {sources:[],rawChunkCount:0,searchCallCount:0,backends:[],latencyMs:0};
  const {table,hydrate}=plan;
  const request:CompletenessSearchRequest={query:plan.query,
    ai_search_options:{retrieval:{retrieval_type:hydrate?'hybrid':'vector',max_num_results:hydrate?10:3,match_threshold:0.4,filters}}};
  const response=await search(request);
  if(response.chunks&&!Array.isArray(response.chunks))throw new TypeError('Invalid AI Search chunks response.');
  const chunks=(response.chunks||[]).slice(0,10);
  let searchCalls=1;
  if(plan.headerQuery){
    const header=await search({...request,query:plan.headerQuery});searchCalls++;
    if(header.chunks&&!Array.isArray(header.chunks))throw new TypeError('Invalid AI Search chunks response.');
    chunks.push(...(header.chunks||[]).slice(0,10));
  }
  // Additional revision/visibility check; a stale private/provider result
  // cannot enter the generator merely because its document ID is authorized.
  const byId=new Map(plan.scoped.map((d)=>[d.id,d]));
  const authorized=chunks.filter((c)=>{const m=c.item?.metadata,d=byId.get(String(m?.document_id));
    return d&&(!d.visibility||m?.visibility===d.visibility)&&(!d.revision||m?.revision===d.revision);});
  const normalized=normalizeAuthorizedAiSearchChunks(authorized,documents);
  const unique=[...new Map(normalized.map((s)=>[JSON.stringify([s.documentId,s.itemKey,s.snippet]),s])).values()];
  const sorted=unique.sort((a,b)=>plan.priority(b.snippet)-plan.priority(a.snippet)
    ||(b.score??0)-(a.score??0)||a.itemKey.localeCompare(b.itemKey));
  // A page can have multiple 512-token chunks. Do not mistake a matching
  // fragment for complete table evidence. Hydrate only already-authorized
  // retrieved page identities, at most three bounded server-owned objects.
  const selected=(hydrate&&readAuthorizedPage?[...new Map(sorted.map(s=>[s.itemKey,s])).values()]:sorted).slice(0,3);
  const sources=[];
  for(const [i,s]of selected.entries()){
    const page=hydrate&&readAuthorizedPage?await readAuthorizedPage(s):null;
    if(page!==null&&(!page.trim()||page.length>8000))throw new TypeError('Page exceeds evidence bound.');
    const snippet=page??s.snippet;
    sources.push({...s,sourceId:`S${i+1}`,snippet:table?presentConductTableEvidence(snippet):snippet});
  }
  return {sources,rawChunkCount:chunks.length,searchCallCount:searchCalls,backends:['TEXT'],latencyMs:Date.now()-started};
};
