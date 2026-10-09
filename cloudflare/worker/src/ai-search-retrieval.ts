import type { RetrievalCache } from './ai-advisor-cache.ts';
import type { RetrievalProvider } from './ai-advisor-providers.ts';

export type AiSearchBackend = 'TEXT' | 'OCR';

export type AiSearchAuthorizedDocument = {
  id: string;
  /** D1-authorized document identity hint; never used as a support quote. */
  title?: string;
  /** Stage 5 will source this from D1 ingestion metadata. Unknown stays TEXT. */
  backend?: AiSearchBackend;
  category?: string;
  visibility?: string;
  revision?: string | number;
  active?: boolean;
};

export type AiSearchMetadataFilter = {
  document_id?: { $in: string[] };
  active: true;
  /** Present only when every server-authorized document has the same visibility. */
  visibility?: string;
};

export type AiSearchSearchRequest = {
  query: string;
  ai_search_options: {
    retrieval: {
      retrieval_type: 'vector';
      match_threshold: number;
      max_num_results: number;
      filters: AiSearchMetadataFilter;
    };
  };
};

export type AiSearchRawChunk = {
  id?: unknown;
  score?: unknown;
  text?: unknown;
  item?: { key?: unknown; metadata?: Record<string, unknown> };
};

export type AiSearchClient = {
  search(instanceName: string, request: AiSearchSearchRequest): Promise<{ chunks?: AiSearchRawChunk[] }>;
};

export type AiSearchRetrievalRequest = {
  question: string;
  allowedDocuments: readonly AiSearchAuthorizedDocument[];
  /** Internal only. Values above five are clamped to the safe maximum. */
  topK?: number;
};

export type RetrievedAiSearchSource = {
  sourceId: string;
  documentId: string;
  snippet: string;
  score: number | null;
  backend: AiSearchBackend;
  /** Internal mapping data only; never return raw provider responses to clients. */
  chunkId: string;
  itemKey: string;
};

export type AiSearchRetrievalResult = {
  sources: RetrievedAiSearchSource[];
  /** Internal-only count before post-retrieval authorization filtering. */
  rawChunkCount: number;
  searchCallCount: number;
  backends: AiSearchBackend[];
  latencyMs: number;
};

export type AiSearchInstanceNames = { text: string; ocr: string };

export type AiSearchRetrievalErrorStage =
  | 'INSTANCE_RESOLUTION' | 'SEARCH_INVOCATION' | 'SEARCH_RESPONSE'
  | 'RESPONSE_NORMALIZATION' | 'POST_AUTHORIZATION';

export type AiSearchRetrievalErrorDiagnostic = {
  retrieval_error_stage: AiSearchRetrievalErrorStage;
  retrieval_error_name: 'Error' | 'TypeError' | 'TimeoutError' | 'AbortError' | 'AI_SEARCH_ERROR' | 'UNKNOWN';
  retrieval_status: number | null;
  retrieval_timeout: boolean;
};

export type AiSearchRetrievalErrorReporter = (stage: AiSearchRetrievalErrorStage, error: unknown) => void;

/** Never copy provider messages, stacks, request data, or arbitrary codes into telemetry. */
export const classifyAiSearchRetrievalError = (
  stage: AiSearchRetrievalErrorStage,
  error: unknown,
): AiSearchRetrievalErrorDiagnostic => {
  let exposedName: unknown;
  let exposedStatus: unknown;
  try {
    const value = error && typeof error === 'object' ? error as { name?: unknown; status?: unknown; response?: { status?: unknown } } : {};
    exposedName = value.name;
    exposedStatus = value.status ?? value.response?.status;
  } catch { /* An error with throwing accessors must not affect shadow isolation. */ }
  const name = exposedName === 'Error' || exposedName === 'TypeError' || exposedName === 'TimeoutError'
    || exposedName === 'AbortError' || exposedName === 'AI_SEARCH_ERROR' ? exposedName : 'UNKNOWN';
  const retrievalStatus = Number.isSafeInteger(exposedStatus) && Number(exposedStatus) >= 100 && Number(exposedStatus) <= 599
    ? Number(exposedStatus) : null;
  return {
    retrieval_error_stage: stage,
    retrieval_error_name: name,
    retrieval_status: retrievalStatus,
    retrieval_timeout: name === 'TimeoutError' || name === 'AbortError',
  };
};

export const DEFAULT_AI_SEARCH_TOP_K = 3;
export const MAX_AI_SEARCH_TOP_K = 5;
export const MAX_AI_SEARCH_AUTHORIZED_DOCUMENTS = 12;
export const DEFAULT_AI_SEARCH_MATCH_THRESHOLD = 0.4;

const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const boundedText = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

const clampTopK = (value: unknown) => {
  if (!Number.isFinite(value)) return DEFAULT_AI_SEARCH_TOP_K;
  return Math.min(MAX_AI_SEARCH_TOP_K, Math.max(1, Math.trunc(Number(value))));
};

/**
 * D1 owns authorization. This only turns its bounded, server-derived IDs into
 * an AI Search efficiency filter; no question or client-provided filter enters.
 */
export const buildAiSearchAuthorizationFilter = (documents: readonly AiSearchAuthorizedDocument[]): AiSearchMetadataFilter | null => {
  const byId = new Map<string, AiSearchAuthorizedDocument>();
  for (const document of documents) {
    if (!DOCUMENT_ID_PATTERN.test(document.id)) throw new Error('Invalid authorized AI Search document ID.');
    if (document.active === false) continue;
    byId.set(document.id, document);
  }
  const ids = [...byId.keys()].sort();
  if (!ids.length) return null;
  const visibility = [...new Set([...byId.values()].map((document) => boundedText(document.visibility, 64)).filter(Boolean))];
  if (ids.length > MAX_AI_SEARCH_AUTHORIZED_DOCUMENTS) {
    if (visibility.length !== 1 || visibility[0] !== 'public'
      || [...byId.values()].some((document) => document.visibility !== 'public')) throw new Error('Authorized AI Search document limit exceeded.');
    return { active: true, visibility: 'public' };
  }
  return {
    document_id: { $in: ids },
    active: true,
    ...(visibility.length === 1 ? { visibility: visibility[0] } : {}),
  };
};

const backendFor = (document: AiSearchAuthorizedDocument): AiSearchBackend => document.backend === 'OCR' ? 'OCR' : 'TEXT';

const postAuthorizeResults = (
  chunks: readonly AiSearchRawChunk[],
  allowedIds: ReadonlySet<string>,
) => chunks.filter((chunk) => {
  const documentId = boundedText(chunk.item?.metadata?.document_id, 64);
  if (!allowedIds.has(documentId)) return false;
  const active = chunk.item?.metadata?.active;
  return active === undefined || active === true || active === 'true';
});

const normalizeResults = (
  chunks: readonly AiSearchRawChunk[],
  backend: AiSearchBackend,
) => chunks.flatMap((chunk) => {
  const documentId = boundedText(chunk.item?.metadata?.document_id, 64);
  const snippet = boundedText(chunk.text, 8_000);
  const chunkId = boundedText(chunk.id, 256);
  const itemKey = boundedText(chunk.item?.key, 1_024);
  if (!documentId || !snippet || !chunkId || !itemKey) return [];
  const score = typeof chunk.score === 'number' && Number.isFinite(chunk.score) ? chunk.score : null;
  return [{ sourceId: '', documentId, snippet, score, backend, chunkId, itemKey }];
});

const mergeAiSearchSources = (sources: readonly Omit<RetrievedAiSearchSource, 'sourceId'>[], topK: number) => {
  const deduped = new Map<string, Omit<RetrievedAiSearchSource, 'sourceId'>>();
  for (const source of sources) {
    // A PDF/object can contain multiple relevant chunks (e.g. both pages of a
    // criteria table). Deduplicate identical text, not the entire source file.
    // Exact comparison only: no accent folding/fuzzy evidence normalization.
    const key = JSON.stringify([source.documentId, source.itemKey, source.snippet]);
    const current = deduped.get(key);
    const currentScore = current?.score ?? Number.NEGATIVE_INFINITY;
    const sourceScore = source.score ?? Number.NEGATIVE_INFINITY;
    if (!current || sourceScore > currentScore || (sourceScore === currentScore && source.chunkId < current.chunkId)) deduped.set(key, source);
  }
  return [...deduped.values()]
    .sort((left, right) => (right.score ?? Number.NEGATIVE_INFINITY) - (left.score ?? Number.NEGATIVE_INFINITY)
      || left.documentId.localeCompare(right.documentId)
      || left.itemKey.localeCompare(right.itemKey)
      || left.chunkId.localeCompare(right.chunkId))
    .slice(0, topK)
    .map((source, index) => ({ ...source, sourceId: `S${index + 1}` }));
};

/** Disabled by default and deliberately absent from the active provider factory. */
export class CloudflareAiSearchRetrievalProvider
  implements RetrievalProvider<AiSearchRetrievalRequest, AiSearchRetrievalResult> {
  readonly id = 'cloudflare-ai-search-sandbox';
  private readonly client: AiSearchClient;
  private readonly instances: AiSearchInstanceNames;
  private readonly enabled: boolean;
  private readonly onError?: AiSearchRetrievalErrorReporter;

  constructor(client: AiSearchClient, instances: AiSearchInstanceNames, enabled = false, onError?: AiSearchRetrievalErrorReporter) {
    this.client = client;
    this.instances = instances;
    this.enabled = enabled;
    this.onError = onError;
  }

  private reportError(stage: AiSearchRetrievalErrorStage, error: unknown) {
    try { this.onError?.(stage, error); } catch { /* diagnostics never change retrieval outcomes */ }
  }

  isConfigured(_env: unknown) { return this.enabled; }

  async retrieve(request: AiSearchRetrievalRequest): Promise<AiSearchRetrievalResult> {
    const startedAt = Date.now();
    const filter = buildAiSearchAuthorizationFilter(request.allowedDocuments);
    if (!filter) return { sources: [], rawChunkCount: 0, searchCallCount: 0, backends: [], latencyMs: Date.now() - startedAt };
    const allowedDocuments = request.allowedDocuments.filter((document) => document.active !== false);
    const topK = clampTopK(request.topK);
    const backends = [...new Set(allowedDocuments.map(backendFor))].sort() as AiSearchBackend[];
    const sources: Array<Omit<RetrievedAiSearchSource, 'sourceId'>> = [];
    let rawChunkCount = 0;
    let searchCallCount = 0;
    for (const backend of backends) {
      const backendIds = new Set(allowedDocuments.filter((document) => backendFor(document) === backend).map((document) => document.id));
      const backendFilter: AiSearchMetadataFilter = {
        ...filter,
        ...(filter.document_id ? { document_id: { $in: filter.document_id.$in.filter((id) => backendIds.has(id)) } } : {}),
      };
      if (backendFilter.document_id && !backendFilter.document_id.$in.length) continue;
      searchCallCount += 1;
      let response: Awaited<ReturnType<AiSearchClient['search']>>;
      try {
        response = await this.client.search(backend === 'TEXT' ? this.instances.text : this.instances.ocr, {
          query: boundedText(request.question, 2_000),
          ai_search_options: {
            retrieval: {
              retrieval_type: 'vector',
              match_threshold: DEFAULT_AI_SEARCH_MATCH_THRESHOLD,
              max_num_results: topK,
              filters: backendFilter,
            },
          },
        });
      } catch (error) {
        this.reportError('SEARCH_INVOCATION', error);
        throw error;
      }
      let chunks: readonly AiSearchRawChunk[];
      try {
        chunks = response.chunks || [];
        if (!Array.isArray(chunks)) throw new TypeError('Invalid AI Search chunks response.');
      } catch (error) {
        this.reportError('SEARCH_RESPONSE', error);
        throw error;
      }
      rawChunkCount += chunks.length;
      let authorizedChunks: AiSearchRawChunk[];
      try { authorizedChunks = postAuthorizeResults(chunks, backendIds); }
      catch (error) { this.reportError('POST_AUTHORIZATION', error); throw error; }
      try { sources.push(...normalizeResults(authorizedChunks, backend)); }
      catch (error) { this.reportError('RESPONSE_NORMALIZATION', error); throw error; }
    }
    return {
      sources: mergeAiSearchSources(sources, topK),
      rawChunkCount,
      searchCallCount,
      backends,
      latencyMs: Date.now() - startedAt,
    };
  }
}

/** Future cache composition. Callers must use a revision-aware key from Stage 2. */
export const retrieveAiSearchWithCache = async (
  cache: RetrievalCache<AiSearchRetrievalResult> | undefined,
  cacheKey: string | undefined,
  provider: CloudflareAiSearchRetrievalProvider,
  request: AiSearchRetrievalRequest,
  ttlSeconds = 21_600,
) => {
  if (cache && cacheKey) {
    const hit = await cache.get(cacheKey);
    if (hit) return { ...hit, searchCallCount: 0, cacheHit: true };
  }
  const result = await provider.retrieve(request);
  if (cache && cacheKey) await cache.put(cacheKey, result, ttlSeconds);
  return { ...result, cacheHit: false };
};
