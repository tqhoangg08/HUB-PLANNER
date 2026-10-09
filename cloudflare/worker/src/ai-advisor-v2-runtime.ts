import {
  buildAnswerCacheKey,
  buildRetrievalCacheKey,
  fingerprintDocumentRevisions,
  type AnswerCache,
  type AdvisorCacheScope,
  type RetrievalCache,
} from './ai-advisor-cache.ts';
import { validateEvidenceAbstention, type AuthorizedEvidenceSource } from './ai-advisor-evidence.ts';
import { containsDocumentInstructions, hasUnsupportedAnswerDetails, isRelevantAdvisorEvidence, sourceSupportedReply } from './ai-advisor-grounding.ts';
import type { EvidenceGenerationProvider } from './ai-advisor-providers.ts';
import type { QuotaDecision, QuotaMode } from './ai-advisor-quota.ts';
import {
  CloudflareAiSearchRetrievalProvider,
  retrieveAiSearchWithCache,
  type AiSearchAuthorizedDocument,
  type AiSearchClient,
  type AiSearchInstanceNames,
  type AiSearchRetrievalErrorReporter,
  type AiSearchRetrievalResult,
} from './ai-search-retrieval.ts';

export type AiAdvisorV2Mode = 'off' | 'shadow' | 'canary' | 'on';
export type AiAdvisorV2RuntimeConfig = {
  mode: AiAdvisorV2Mode;
  canaryPercent: number;
};

export type AiAdvisorV2ConfigEnv = {
  AI_ADVISOR_V2_MODE?: unknown;
  AI_ADVISOR_V2_CANARY_PERCENT?: unknown;
};

export type AiAdvisorV2Candidate = AiSearchAuthorizedDocument & {
  version?: string | number | null;
  contentHash?: string | null;
  canonicalHash?: string | null;
  indexSourceKind?: string | null;
  derivedSourceKind?: string | null;
  extractionPipelineVersion?: string | null;
  derivedContentHash?: string | null;
  indexingStatus?: string | null;
};

export type AiAdvisorV2Dependencies = {
  aiSearchClient?: AiSearchClient;
  aiSearchInstances?: AiSearchInstanceNames;
  onRetrievalError?: AiSearchRetrievalErrorReporter;
  evidenceGenerator?: EvidenceGenerationProvider;
  retrievalCache?: RetrievalCache<AiSearchRetrievalResult>;
  answerCache?: AnswerCache<AiAdvisorV2Answer>;
  quota: QuotaDecision;
};

export type AiAdvisorV2Answer = {
  reply: string;
  evidence: readonly AuthorizedEvidenceSource[];
};

export type AiAdvisorV2Execution =
  | { kind: 'ANSWER'; answer: AiAdvisorV2Answer; searchCallCount: number; retrievalCacheHit: boolean; answerCacheHit: boolean; retrievedChunkCount: number; generatorCalled: boolean; quotaMode: QuotaMode }
  | { kind: 'ABSTAIN'; reason: AiAdvisorV2AbstentionReason; searchCallCount: number; retrievalCacheHit: boolean; retrievedChunkCount: number; generatorCalled: boolean; quotaMode: QuotaMode }
  | { kind: 'UNAVAILABLE'; reason: 'AI_SEARCH_UNAVAILABLE'; retrievedChunkCount: 0; generatorCalled: false; quotaMode: QuotaMode };

export type AiAdvisorV2AbstentionReason =
  | 'NO_AUTHORIZED_DOCUMENTS'
  | 'QUOTA_SURVIVAL'
  | 'AI_SEARCH_TIMEOUT'
  | 'AI_SEARCH_ERROR'
  | 'NO_RETRIEVAL_RESULTS'
  | 'ALL_RESULTS_DROPPED'
  | 'GENERATOR_ERROR'
  | 'GENERATOR_ABSTAINED'
  | 'INVALID_CITATIONS';

const MODE_VALUES = new Set<AiAdvisorV2Mode>(['off', 'shadow', 'canary', 'on']);
const bounded = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export const readAiAdvisorV2Mode = (value: unknown): AiAdvisorV2Mode => {
  const mode = bounded(value, 16).toLowerCase();
  return MODE_VALUES.has(mode as AiAdvisorV2Mode) ? mode as AiAdvisorV2Mode : 'off';
};

export const readAiAdvisorV2CanaryPercent = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.trunc(parsed))) : 0;
};

export const readAiAdvisorV2RuntimeConfig = (env: AiAdvisorV2ConfigEnv): AiAdvisorV2RuntimeConfig => ({
  mode: readAiAdvisorV2Mode(env.AI_ADVISOR_V2_MODE),
  canaryPercent: readAiAdvisorV2CanaryPercent(env.AI_ADVISOR_V2_CANARY_PERCENT),
});

/** Stable, non-secret rollout bucket. It is never logged with the raw user ID. */
export const aiAdvisorV2CanaryBucket = async (userId: string, salt = 'ai-advisor-v2-canary-v1') => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${userId}`));
  return new Uint8Array(digest)[0] % 100;
};

export const shouldUseAiAdvisorV2 = async (config: AiAdvisorV2RuntimeConfig, userId: string) => {
  if (config.mode === 'on' || config.mode === 'shadow') return true;
  if (config.mode !== 'canary' || config.canaryPercent <= 0) return false;
  return (await aiAdvisorV2CanaryBucket(userId)) < config.canaryPercent;
};

const toRevisionRecords = (candidates: readonly AiAdvisorV2Candidate[]) => candidates.map((candidate) => ({
  id: candidate.id,
  version: candidate.version,
  contentHash: candidate.contentHash,
  canonicalHash: candidate.canonicalHash,
  indexSourceKind: candidate.indexSourceKind || 'legacy',
  derivedSourceKind: candidate.derivedSourceKind || 'legacy',
  extractionPipelineVersion: candidate.extractionPipelineVersion,
  derivedContentHash: candidate.derivedContentHash,
  indexingStatus: candidate.indexingStatus || 'completed',
}));

const abstain = (
  reason: AiAdvisorV2AbstentionReason,
  quotaMode: QuotaMode,
  searchCallCount = 0,
  retrievalCacheHit = false,
  retrievedChunkCount = 0,
  generatorCalled = false,
): AiAdvisorV2Execution => ({
  kind: 'ABSTAIN', reason, searchCallCount, retrievalCacheHit, retrievedChunkCount, generatorCalled, quotaMode,
});

/**
 * Executes exactly one retrieval pass and one optional evidence generation
 * call. It is dependency-injected: missing bindings fail closed and never
 * fall back to general chat.
 */
export const executeAiAdvisorV2Document = async (
  question: string,
  candidates: readonly AiAdvisorV2Candidate[],
  dependencies: AiAdvisorV2Dependencies,
): Promise<AiAdvisorV2Execution> => {
  const quotaMode = dependencies.quota.mode;
  const allowed = candidates.filter((candidate) => candidate.active !== false);
  if (!allowed.length) return abstain('NO_AUTHORIZED_DOCUMENTS', quotaMode);
  if (quotaMode === 'SURVIVAL' || !dependencies.quota.allowGeneration) return abstain('QUOTA_SURVIVAL', quotaMode);
  if (!dependencies.aiSearchClient || !dependencies.aiSearchInstances) {
    return { kind: 'UNAVAILABLE', reason: 'AI_SEARCH_UNAVAILABLE', retrievedChunkCount: 0, generatorCalled: false, quotaMode };
  }

  const revisionFingerprint = await fingerprintDocumentRevisions(toRevisionRecords(allowed));
  const scope: AdvisorCacheScope = { kind: 'PUBLIC' };
  const answerCacheKey = dependencies.answerCache
    ? await buildAnswerCacheKey({
      question, scope, sourceRevisionFingerprint: revisionFingerprint,
      providerOrFormatterVersion: dependencies.evidenceGenerator?.id || 'v2-generator-unavailable',
      promptVersion: 'evidence-abstention-grounded-v2', answerPathVersion: 'ai-search-full-authorized-conduct-v3',
    })
    : undefined;
  if (dependencies.answerCache && answerCacheKey) {
    try {
      const hit = await dependencies.answerCache.get(answerCacheKey);
      if (hit) return { kind: 'ANSWER', answer: hit, searchCallCount: 0, retrievalCacheHit: false, answerCacheHit: true, retrievedChunkCount: 0, generatorCalled: false, quotaMode };
    } catch { /* Optional cache failure must not affect an authoritative answer. */ }
  }

  const provider = new CloudflareAiSearchRetrievalProvider(dependencies.aiSearchClient, dependencies.aiSearchInstances, true, dependencies.onRetrievalError);
  const retrievalCacheKey = await buildRetrievalCacheKey({
    question, scope, allowedDocumentRevisionFingerprint: revisionFingerprint, retrievalConfigVersion: 'ai-search-full-authorized-topk3-threshold04-chunks-v3',
  });
  let retrieved: Awaited<ReturnType<typeof retrieveAiSearchWithCache>>;
  try {
    retrieved = await retrieveAiSearchWithCache(dependencies.retrievalCache, retrievalCacheKey, provider, {
      question,
      allowedDocuments: allowed,
      topK: 3,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return abstain(name === 'TimeoutError' || name === 'AbortError' ? 'AI_SEARCH_TIMEOUT' : 'AI_SEARCH_ERROR', quotaMode);
  }
  if (!retrieved.sources.length) {
    return abstain(retrieved.rawChunkCount ? 'ALL_RESULTS_DROPPED' : 'NO_RETRIEVAL_RESULTS', quotaMode, retrieved.searchCallCount, retrieved.cacheHit, retrieved.rawChunkCount);
  }
  let generatorConfigured = false;
  try { generatorConfigured = Boolean(dependencies.evidenceGenerator?.isConfigured({})); } catch { generatorConfigured = false; }
  if (!dependencies.evidenceGenerator || !generatorConfigured) {
    return abstain('GENERATOR_ERROR', quotaMode, retrieved.searchCallCount, retrieved.cacheHit, retrieved.sources.length);
  }
  const evidence: AuthorizedEvidenceSource[] = retrieved.sources
    .filter((source) => !containsDocumentInstructions(source.snippet) && isRelevantAdvisorEvidence(question, source.snippet,
      allowed.find((candidate) => candidate.id === source.documentId)?.title))
    .slice(0, 3).map((source) => ({
    sourceId: source.sourceId,
    documentId: source.documentId,
    revision: String(allowed.find((candidate) => candidate.id === source.documentId)?.revision || ''),
    snippet: source.snippet,
  }));
  if (!evidence.length) return abstain('ALL_RESULTS_DROPPED', quotaMode, retrieved.searchCallCount, retrieved.cacheHit, retrieved.rawChunkCount);
  try {
    const generated = await dependencies.evidenceGenerator.generate({
      question: bounded(question, 2_000),
      evidence: evidence.map((source) => ({ ...source, score: retrieved.sources.find((item) => item.sourceId === source.sourceId)?.score ?? null })),
    });
    if (!generated.supported) return abstain(generated.rejectionReason === 'INVALID_GROUNDING' ? 'INVALID_CITATIONS' : 'GENERATOR_ABSTAINED', quotaMode, retrieved.searchCallCount, retrieved.cacheHit, retrieved.sources.length, true);
    if (hasUnsupportedAnswerDetails(generated.answer, evidence.filter((source) => generated.sourceIds.includes(source.sourceId)).map((source) => source.snippet))) {
      return abstain('INVALID_CITATIONS', quotaMode, retrieved.searchCallCount, retrieved.cacheHit, retrieved.sources.length, true);
    }
    const decision = validateEvidenceAbstention({ question, evidence }, { text: generated.answer, citedSourceIds: generated.sourceIds });
    if (decision.kind !== 'ANSWER') return abstain('INVALID_CITATIONS', quotaMode, retrieved.searchCallCount, retrieved.cacheHit, retrieved.sources.length, true);
    const citedEvidence = evidence.filter((source) => decision.citedSourceIds.includes(source.sourceId));
    const answer: AiAdvisorV2Answer = { reply: sourceSupportedReply(generated.answer.trim(), citedEvidence.map((source) => source.snippet), question), evidence: citedEvidence };
    if (dependencies.answerCache && answerCacheKey) {
      try { await dependencies.answerCache.put(answerCacheKey, answer, 120); } catch { /* optional */ }
    }
    return { kind: 'ANSWER', answer, searchCallCount: retrieved.searchCallCount, retrievalCacheHit: retrieved.cacheHit, answerCacheHit: false, retrievedChunkCount: retrieved.sources.length, generatorCalled: true, quotaMode };
  } catch {
    return abstain('GENERATOR_ERROR', quotaMode, retrieved.searchCallCount, retrieved.cacheHit, retrieved.sources.length, true);
  }
};
