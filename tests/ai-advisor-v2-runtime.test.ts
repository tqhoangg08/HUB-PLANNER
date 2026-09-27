import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryAdvisorCache } from '../cloudflare/worker/src/ai-advisor-cache.ts';
import { evaluateAdvisorQuota } from '../cloudflare/worker/src/ai-advisor-quota.ts';
import {
  aiAdvisorV2CanaryBucket,
  executeAiAdvisorV2Document,
  readAiAdvisorV2CanaryPercent,
  readAiAdvisorV2Mode,
  shouldUseAiAdvisorV2,
  type AiAdvisorV2Candidate,
} from '../cloudflare/worker/src/ai-advisor-v2-runtime.ts';
import type { AiSearchClient, AiSearchSearchRequest } from '../cloudflare/worker/src/ai-search-retrieval.ts';

const DOCUMENT_ID = 'b625ad82-ec5c-4380-9a74-f637c580989c';
const UNAUTHORIZED_DOCUMENT_ID = 'cebb4a1b-4646-4b9d-96f3-1681989e6435';
const candidate: AiAdvisorV2Candidate = {
  id: DOCUMENT_ID, category: 'training_regulation', visibility: 'public', revision: 2, active: true,
  indexSourceKind: 'original', derivedSourceKind: 'ocr', extractionPipelineVersion: 'ocr-page-markdown-v2-pinned',
  contentHash: 'a'.repeat(64), derivedContentHash: 'b'.repeat(64), indexingStatus: 'completed',
};

const fakeClient = (chunks: unknown[]) => {
  const calls: AiSearchSearchRequest[] = [];
  const client: AiSearchClient = { async search(_instance, request) { calls.push(request); return { chunks: chunks as never[] }; } };
  return { client, calls };
};

const authorizedChunk = (documentId = DOCUMENT_ID, score = 0.7) => ({
  id: 'chunk-1', score, text: 'Điều 10 quy định 75% tín chỉ.', item: { key: 'safe-part.md', metadata: { document_id: documentId, active: true } },
});

const generator = (result = { supported: true, answer: 'Nội dung được nguồn xác nhận.', sourceIds: ['S1'] }) => ({
  id: 'fake-evidence-generator', isConfigured: () => true, async generate() { return result; },
});

const dependencies = (client: AiSearchClient, override: Record<string, unknown> = {}) => ({
  aiSearchClient: client,
  aiSearchInstances: { text: 'text', ocr: 'ocr' },
  evidenceGenerator: generator(),
  quota: evaluateAdvisorQuota(undefined),
  ...override,
});

test('feature mode is OFF by default and invalid values fail closed', () => {
  assert.equal(readAiAdvisorV2Mode(undefined), 'off');
  assert.equal(readAiAdvisorV2Mode('unknown'), 'off');
  assert.equal(readAiAdvisorV2Mode('ON'), 'on');
  assert.equal(readAiAdvisorV2CanaryPercent(undefined), 0);
  assert.equal(readAiAdvisorV2CanaryPercent(-20), 0);
  assert.equal(readAiAdvisorV2CanaryPercent(120), 100);
});

test('canary bucketing is stable, privacy-safe, and zero percent never selects a user', async () => {
  assert.equal(await aiAdvisorV2CanaryBucket('user-authoritative-id'), await aiAdvisorV2CanaryBucket('user-authoritative-id'));
  assert.equal(await shouldUseAiAdvisorV2({ mode: 'canary', canaryPercent: 0 }, 'user-authoritative-id'), false);
  assert.equal(await shouldUseAiAdvisorV2({ mode: 'canary', canaryPercent: 100 }, 'user-authoritative-id'), true);
});

test('no authorized documents and SURVIVAL quota make zero search and generator calls', async () => {
  const { client, calls } = fakeClient([authorizedChunk()]);
  const noDocuments = await executeAiAdvisorV2Document('Quy chế?', [], dependencies(client));
  assert.equal(noDocuments.kind, 'ABSTAIN');
  assert.equal(noDocuments.reason, 'NO_AUTHORIZED_DOCUMENTS');
  const survival = await executeAiAdvisorV2Document('Quy chế?', [candidate], dependencies(client, { quota: evaluateAdvisorQuota({ searchUsageRatio: 0.99 }) }));
  assert.equal(survival.kind, 'ABSTAIN');
  assert.equal(survival.reason, 'QUOTA_SURVIVAL');
  assert.equal(calls.length, 0);
});

test('V2 explicitly requests vector topK 3 threshold .4 and server-derived authorization filters', async () => {
  const { client, calls } = fakeClient([authorizedChunk()]);
  const result = await executeAiAdvisorV2Document('Quy chế?', [candidate], dependencies(client));
  assert.equal(result.kind, 'ANSWER');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].ai_search_options.retrieval, {
    retrieval_type: 'vector', match_threshold: 0.4, max_num_results: 3,
    filters: { document_id: { $in: [DOCUMENT_ID] }, active: true, visibility: 'public' },
  });
});

test('post-retrieval authorization drops unauthorized chunks and does not generate from empty evidence', async () => {
  const { client, calls } = fakeClient([authorizedChunk(UNAUTHORIZED_DOCUMENT_ID)]);
  let generated = false;
  const result = await executeAiAdvisorV2Document('Quy chế?', [candidate], dependencies(client, {
    evidenceGenerator: { id: 'generator', isConfigured: () => true, async generate() { generated = true; return { supported: true, answer: 'bad', sourceIds: ['S1'] }; } },
  }));
  assert.equal(result.kind, 'ABSTAIN');
  assert.equal(result.reason, 'ALL_RESULTS_DROPPED');
  assert.equal(calls.length, 1);
  assert.equal(generated, false);
});

test('no result, abstaining generator, invalid citations, and generator errors fail closed', async () => {
  const noResult = fakeClient([]);
  const noResults = await executeAiAdvisorV2Document('Quy chế?', [candidate], dependencies(noResult.client));
  assert.equal(noResults.kind, 'ABSTAIN');
  assert.equal(noResults.reason, 'NO_RETRIEVAL_RESULTS');
  const abstaining = fakeClient([authorizedChunk()]);
  const abstained = await executeAiAdvisorV2Document('Quy chế?', [candidate], dependencies(abstaining.client, { evidenceGenerator: generator({ supported: false, answer: '', sourceIds: [] }) }));
  assert.equal(abstained.kind, 'ABSTAIN');
  assert.equal(abstained.reason, 'GENERATOR_ABSTAINED');
  const invalid = fakeClient([authorizedChunk()]);
  const invalidCitation = await executeAiAdvisorV2Document('Quy chế?', [candidate], dependencies(invalid.client, { evidenceGenerator: generator({ supported: true, answer: 'bad', sourceIds: ['unknown'] }) }));
  assert.equal(invalidCitation.kind, 'ABSTAIN');
  assert.equal(invalidCitation.reason, 'INVALID_CITATIONS');
  const throwing = fakeClient([authorizedChunk()]);
  const errored = await executeAiAdvisorV2Document('Quy chế?', [candidate], dependencies(throwing.client, { evidenceGenerator: { id: 'throw', isConfigured: () => true, async generate() { throw new Error('injected'); } } }));
  assert.equal(errored.kind, 'ABSTAIN');
  assert.equal(errored.reason, 'GENERATOR_ERROR');
});

test('answer and retrieval caches are revision-aware and eliminate repeated calls', async () => {
  const { client, calls } = fakeClient([authorizedChunk()]);
  const answerCache = new MemoryAdvisorCache<any>();
  const retrievalCache = new MemoryAdvisorCache<any>();
  const first = await executeAiAdvisorV2Document('Quy chế?', [candidate], dependencies(client, { answerCache, retrievalCache }));
  const second = await executeAiAdvisorV2Document('Quy chế?', [candidate], dependencies(client, { answerCache, retrievalCache }));
  const changed = await executeAiAdvisorV2Document('Quy chế?', [{ ...candidate, derivedContentHash: 'c'.repeat(64) }], dependencies(client, { answerCache, retrievalCache }));
  assert.equal(first.kind, 'ANSWER');
  assert.equal(second.kind, 'ANSWER');
  assert.equal(second.answerCacheHit, true);
  assert.equal(changed.kind, 'ANSWER');
  assert.equal(calls.length, 2);
});

test('V2 binding absence is explicit and never falls back to an ungrounded generator', async () => {
  const result = await executeAiAdvisorV2Document('Quy chế?', [candidate], {
    quota: evaluateAdvisorQuota(undefined), evidenceGenerator: generator(),
  });
  assert.deepEqual(result, { kind: 'UNAVAILABLE', reason: 'AI_SEARCH_UNAVAILABLE', retrievedChunkCount: 0, generatorCalled: false, quotaMode: 'NORMAL' });
});
