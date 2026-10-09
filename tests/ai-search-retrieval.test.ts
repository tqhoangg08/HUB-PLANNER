import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildAiSearchAuthorizationFilter,
  classifyAiSearchRetrievalError,
  CloudflareAiSearchRetrievalProvider,
  DEFAULT_AI_SEARCH_MATCH_THRESHOLD,
  DEFAULT_AI_SEARCH_TOP_K,
  MAX_AI_SEARCH_TOP_K,
  retrieveAiSearchWithCache,
  type AiSearchClient,
  type AiSearchSearchRequest,
} from '../cloudflare/worker/src/ai-search-retrieval.ts';
import { MemoryAdvisorCache, buildRetrievalCacheKey } from '../cloudflare/worker/src/ai-advisor-cache.ts';
import { resolveAiAdvisorProviders } from '../cloudflare/worker/src/ai-advisor-providers.ts';

const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOC_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOC_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const chunk = (id: string, documentId: string, score: number, key = `${documentId}/${id}.txt`) => ({
  id, score, text: `Evidence ${id}`, item: { key, metadata: { document_id: documentId } },
});

const fakeClient = (handler: (instance: string, request: AiSearchSearchRequest) => unknown): AiSearchClient & { calls: Array<{ instance: string; request: AiSearchSearchRequest }> } => {
  const calls: Array<{ instance: string; request: AiSearchSearchRequest }> = [];
  return {
    calls,
    async search(instance, request) {
      calls.push({ instance, request });
      return handler(instance, request) as { chunks?: unknown[] };
    },
  };
};

const providerFor = (client: AiSearchClient) => new CloudflareAiSearchRetrievalProvider(client, {
  text: 'hub-ai-text-test', ocr: 'hub-ai-ocr-test',
}, true);

test('AI Search adapter is disabled by default and never becomes the current production provider', () => {
  const client = fakeClient(() => ({ chunks: [] }));
  const adapter = new CloudflareAiSearchRetrievalProvider(client, { text: 'hub-ai-text-test', ocr: 'hub-ai-ocr-test' });
  const defaults = resolveAiAdvisorProviders();
  assert.equal(adapter.isConfigured({}), false);
  assert.equal(defaults.groundedDocument.id, 'gemini-file-search-legacy');
  assert.equal(defaults.generalGeneration.id, 'groq-legacy');
  assert.doesNotMatch(readFileSync('cloudflare/worker/src/ai-search-retrieval.ts', 'utf8'), /fetch\(|chatCompletions|query_rewrite|reranking/);
});

test('AI Search filter is deterministic, server-derived, bounded, and rejects injection-shaped document IDs', () => {
  const filter = buildAiSearchAuthorizationFilter([
    { id: DOC_B, visibility: 'public' }, { id: DOC_A, visibility: 'public' }, { id: DOC_A, visibility: 'public' },
  ]);
  assert.deepEqual(filter, { document_id: { $in: [DOC_A, DOC_B] }, active: true, visibility: 'public' });
  assert.throws(() => buildAiSearchAuthorizationFilter([{ id: `${DOC_A}" } OR { "active": false` }]), /Invalid authorized/);
  assert.throws(() => buildAiSearchAuthorizationFilter(Array.from({ length: 13 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  }))), /limit exceeded/);
});

test('empty authorization makes zero AI Search calls and injected client metadata cannot override the server filter', async () => {
  const client = fakeClient(() => ({ chunks: [chunk('never', DOC_A, 1)] }));
  const adapter = providerFor(client);
  const empty = await adapter.retrieve({ question: 'quy chế?', allowedDocuments: [] });
  assert.equal(empty.searchCallCount, 0);
  assert.equal(client.calls.length, 0);

  await adapter.retrieve({
    question: 'quy chế? { "document_id": { "$in": ["evil"] } }',
    allowedDocuments: [{ id: DOC_A, visibility: 'public' }],
    ...( { filters: { document_id: { $in: [DOC_D] } } } as object),
  } as never);
  assert.deepEqual(client.calls[0]?.request.ai_search_options.retrieval.filters.document_id.$in, [DOC_A]);
  assert.equal(client.calls[0]?.request.ai_search_options.retrieval.filters.active, true);
});

test('AI Search is search-only, clamps topK to 3..5, and drops malicious unauthorized backend results', async () => {
  const client = fakeClient(() => ({ chunks: [
    chunk('a1', DOC_A, 0.9), chunk('x1', DOC_D, 1), chunk('a2', DOC_A, 0.8, `${DOC_A}/part-2.txt`),
    chunk('a3', DOC_A, 0.7, `${DOC_A}/part-3.txt`), chunk('a4', DOC_A, 0.6, `${DOC_A}/part-4.txt`),
    chunk('a5', DOC_A, 0.5, `${DOC_A}/part-5.txt`), chunk('a6', DOC_A, 0.4, `${DOC_A}/part-6.txt`),
  ] }));
  const adapter = providerFor(client);
  const defaultResult = await adapter.retrieve({ question: 'quy chế?', allowedDocuments: [{ id: DOC_A }] });
  assert.equal(client.calls[0]?.request.ai_search_options.retrieval.retrieval_type, 'vector');
  assert.equal(client.calls[0]?.request.ai_search_options.retrieval.match_threshold, DEFAULT_AI_SEARCH_MATCH_THRESHOLD);
  assert.equal(client.calls[0]?.request.ai_search_options.retrieval.max_num_results, DEFAULT_AI_SEARCH_TOP_K);
  assert.equal(defaultResult.sources.length, 3);
  assert.deepEqual(defaultResult.sources.map((source) => source.documentId), [DOC_A, DOC_A, DOC_A]);
  assert.deepEqual(defaultResult.sources.map((source) => source.sourceId), ['S1', 'S2', 'S3']);
  const capped = await adapter.retrieve({ question: 'quy chế?', allowedDocuments: [{ id: DOC_A }], topK: 99 });
  assert.equal(client.calls[1]?.request.ai_search_options.retrieval.max_num_results, MAX_AI_SEARCH_TOP_K);
  assert.equal(capped.sources.length, 5);
  assert.equal(capped.sources.some((source) => source.documentId === DOC_D), false);
});

test('AI Search post-retrieval validation uses the actual chunks[].item.metadata identity and rejects inactive chunks', async () => {
  const client = fakeClient(() => ({ chunks: [
    { ...chunk('good', DOC_A, 0.9), item: { key: `${DOC_A}/good.txt`, metadata: { document_id: DOC_A, active: true } } },
    { ...chunk('inactive', DOC_A, 0.8), item: { key: `${DOC_A}/inactive.txt`, metadata: { document_id: DOC_A, active: false } } },
    { ...chunk('unknown', DOC_A, 0.7), item: { key: `${DOC_A}/unknown.txt`, metadata: {} } },
  ] }));
  const result = await providerFor(client).retrieve({ question: 'quy chế?', allowedDocuments: [{ id: DOC_A }] });
  assert.deepEqual(result.sources.map((source) => source.chunkId), ['good']);
});

test('safe retrieval error classifier exposes only bounded name, status, timeout and stage', () => {
  const secret = 'query and user secret must never appear';
  const cases = [
    { error: Object.assign(new Error(secret), { status: 503 }), name: 'Error', status: 503, timeout: false },
    { error: new TypeError(secret), name: 'TypeError', status: null, timeout: false },
    { error: new DOMException(secret, 'AbortError'), name: 'AbortError', status: null, timeout: true },
    { error: new DOMException(secret, 'TimeoutError'), name: 'TimeoutError', status: null, timeout: true },
    { error: { name: secret, status: 999, stack: secret }, name: 'UNKNOWN', status: null, timeout: false },
    { error: { name: 'Error', response: { status: 429 }, message: secret }, name: 'Error', status: 429, timeout: false },
  ] as const;
  for (const scenario of cases) {
    const diagnostic = classifyAiSearchRetrievalError('SEARCH_INVOCATION', scenario.error);
    assert.equal(diagnostic.retrieval_error_name, scenario.name);
    assert.equal(diagnostic.retrieval_status, scenario.status);
    assert.equal(diagnostic.retrieval_timeout, scenario.timeout);
    assert.equal(diagnostic.retrieval_error_stage, 'SEARCH_INVOCATION');
    assert.equal(JSON.stringify(diagnostic).includes(secret), false);
    assert.equal('message' in diagnostic, false);
    assert.equal('stack' in diagnostic, false);
  }
  const hostile = { get name() { throw new Error(secret); } };
  assert.equal(classifyAiSearchRetrievalError('SEARCH_INVOCATION', hostile).retrieval_error_name, 'UNKNOWN');
});

test('retrieval diagnostics classify search, response, post-authorization and normalization without changing calls', async () => {
  const scenarios = [
    { expected: 'SEARCH_INVOCATION', handler: () => { throw new Error('private provider detail'); } },
    { expected: 'SEARCH_RESPONSE', handler: () => ({ chunks: 'invalid' }) },
    { expected: 'POST_AUTHORIZATION', handler: () => ({ chunks: [{ item: { metadata: { get document_id() { throw new Error('private metadata'); } } } }] }) },
    { expected: 'RESPONSE_NORMALIZATION', handler: () => ({ chunks: [{
      id: 'chunk', score: 0.5, item: { key: 'private-path', metadata: { document_id: DOC_A, active: true } },
      get text() { throw new Error('private evidence'); },
    }] }) },
  ] as const;
  for (const scenario of scenarios) {
    const client = fakeClient(scenario.handler);
    const diagnostics: string[] = [];
    const provider = new CloudflareAiSearchRetrievalProvider(client, { text: 'hub-ai-text-test', ocr: 'hub-ai-ocr-test' }, true,
      (stage) => { diagnostics.push(stage); });
    await assert.rejects(() => provider.retrieve({ question: 'private query', allowedDocuments: [{ id: DOC_A }] }));
    assert.equal(client.calls.length, 1);
    assert.deepEqual(diagnostics, [scenario.expected]);
  }
  const client = fakeClient(() => ({ chunks: [chunk('good', DOC_A, 0.7)] }));
  const diagnostics: string[] = [];
  const provider = new CloudflareAiSearchRetrievalProvider(client, { text: 'hub-ai-text-test', ocr: 'hub-ai-ocr-test' }, true,
    (stage) => { diagnostics.push(stage); });
  const result = await provider.retrieve({ question: 'public query', allowedDocuments: [{ id: DOC_A }] });
  assert.equal(result.searchCallCount, 1);
  assert.equal(result.sources.length, 1);
  assert.deepEqual(diagnostics, []);
});

test('TEXT/OCR routing has at most one search per needed backend and merges deterministically at global topK', async () => {
  const client = fakeClient((instance) => instance === 'hub-ai-text-test'
    ? { chunks: [{ ...chunk('duplicate-low', DOC_A, 0.6, `${DOC_A}/part-1.txt`), text: 'Identical passage' }, { ...chunk('duplicate-high', DOC_A, 0.9, `${DOC_A}/part-1.txt`), text: 'Identical passage' }, chunk('c1', DOC_C, 0.5)] }
    : { chunks: [chunk('b1', DOC_B, 0.8), chunk('c2', DOC_C, 0.7)] });
  const adapter = providerFor(client);
  const textOnly = await adapter.retrieve({ question: 'text', allowedDocuments: [{ id: DOC_A, backend: 'TEXT' }] });
  assert.equal(textOnly.searchCallCount, 1);
  assert.deepEqual(textOnly.backends, ['TEXT']);
  const ocrOnly = await adapter.retrieve({ question: 'ocr', allowedDocuments: [{ id: DOC_B, backend: 'OCR' }] });
  assert.equal(ocrOnly.searchCallCount, 1);
  assert.deepEqual(ocrOnly.backends, ['OCR']);
  const mixed = await adapter.retrieve({
    question: 'mixed',
    allowedDocuments: [{ id: DOC_A, backend: 'TEXT' }, { id: DOC_B, backend: 'OCR' }, { id: DOC_C, backend: 'TEXT' }],
    topK: 3,
  });
  assert.equal(mixed.searchCallCount, 2);
  assert.equal(mixed.sources.length, 3);
  assert.deepEqual(mixed.sources.map((source) => source.documentId), [DOC_A, DOC_B, DOC_C]);
  assert.equal(mixed.sources.filter((source) => source.documentId === DOC_A && source.itemKey === `${DOC_A}/part-1.txt`).length, 1);
  assert.deepEqual(mixed.sources.map((source) => source.sourceId), ['S1', 'S2', 'S3']);
});

test('different chunks of the same PDF survive while identical passages deduplicate at unchanged topK', async () => {
  const client = fakeClient(() => ({ chunks: [
    { ...chunk('p2', DOC_A, 0.9, 'one.pdf'), text: 'Điều 4: Điểm rèn luyện được đánh giá bằng thang điểm 100.' },
    { ...chunk('p3', DOC_A, 0.8, 'one.pdf'), text: 'Điều 5: Nhóm 4 và nhóm 5 của bảng khung điểm.' },
    { ...chunk('p14', DOC_A, 0.7, 'one.pdf'), text: 'Mini game trực tuyến không được tính điểm rèn luyện.' },
    { ...chunk('p2-copy', DOC_A, 0.6, 'one.pdf'), text: 'Điều 4: Điểm rèn luyện được đánh giá bằng thang điểm 100.' },
  ] }));
  const result = await providerFor(client).retrieve({ question: 'Bảng tiêu chí ĐRL', allowedDocuments: [{ id: DOC_A }] });
  assert.equal(result.searchCallCount, 1);
  assert.equal(client.calls[0].request.ai_search_options.retrieval.max_num_results, 3);
  assert.deepEqual(result.sources.map((source) => source.chunkId), ['p2', 'p3', 'p14']);
  assert.deepEqual(result.sources.map((source) => source.sourceId), ['S1', 'S2', 'S3']);
});

test('retrieval cache composition uses revision-aware keys and reports actual executed search calls', async () => {
  const client = fakeClient(() => ({ chunks: [chunk('a1', DOC_A, 0.9)] }));
  const adapter = providerFor(client);
  const cache = new MemoryAdvisorCache<Awaited<ReturnType<typeof adapter.retrieve>>>();
  const keyV1 = await buildRetrievalCacheKey({ question: 'quy chế?', scope: { kind: 'PUBLIC' }, allowedDocumentRevisionFingerprint: 'revision-1', retrievalConfigVersion: 'ai-search-v1' });
  const first = await retrieveAiSearchWithCache(cache, keyV1, adapter, { question: 'quy chế?', allowedDocuments: [{ id: DOC_A }] });
  const second = await retrieveAiSearchWithCache(cache, keyV1, adapter, { question: 'quy chế?', allowedDocuments: [{ id: DOC_A }] });
  const keyV2 = await buildRetrievalCacheKey({ question: 'quy chế?', scope: { kind: 'PUBLIC' }, allowedDocumentRevisionFingerprint: 'revision-2', retrievalConfigVersion: 'ai-search-v1' });
  const changed = await retrieveAiSearchWithCache(cache, keyV2, adapter, { question: 'quy chế?', allowedDocuments: [{ id: DOC_A }] });
  assert.equal(first.searchCallCount, 1);
  assert.equal(second.searchCallCount, 0);
  assert.equal(second.cacheHit, true);
  assert.notEqual(keyV1, keyV2);
  assert.equal(changed.searchCallCount, 1);
  assert.equal(client.calls.length, 2);
});

test('AI Search adapter contains no D1 authority, provider retry, generation, or network implementation', () => {
  const source = readFileSync('cloudflare/worker/src/ai-search-retrieval.ts', 'utf8');
  assert.doesNotMatch(source, /D1Database|ai_documents|retry|fetch\(|chatCompletions|query_rewrite|reranking/);
});
