import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';
import {
  buildDocumentCandidateMetadataFilter,
  extractGenerateContentDocumentSources,
  extractGeminiDocumentSources,
  extractSafeGeminiApiErrorDiagnostics,
} from '../cloudflare/worker/src/gemini-file-search.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
const QUESTION = 'Điều kiện để đạt học bổng xuất sắc là gì? Chỉ trả lời từ tài liệu được trích dẫn.';

// Direct REST avoids SDK retries obscuring each individual diagnostic attempt.
// The abort remains active through body consumption, not just response headers.
export async function probe({ key, path, body, timeoutMs = 12000, fetchImpl = fetch, sensitive = [] }) {
  const start = Date.now();
  const controller = new AbortController();
  let timer;
  try {
    const request = (async () => {
      const response = await fetchImpl(`${BASE}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      const data = await response.json();
      return { response, data };
    })();
    const { response, data } = await Promise.race([
      request,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('Diagnostic deadline exceeded'), { name: 'TimeoutError' }));
        }, timeoutMs);
      }),
    ]);
    return {
      diagnostic: {
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - start,
        ...(!response.ok ? extractSafeGeminiApiErrorDiagnostics(
          { status: response.status, error: data.error }, [key, ...sensitive],
        ) : {}),
      },
      // Internal only; callers must never print raw provider data.
      data: response.ok ? data : undefined,
    };
  } catch (error) {
    return { diagnostic: {
      ok: false,
      result: controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_OR_RESPONSE_ERROR',
      durationMs: Date.now() - start,
    } };
  } finally {
    clearTimeout(timer);
  }
}

export function summarize(rows) {
  const baseline = rows.find(row => row.test === 'plain_generate' && row.keySlot === 'file_search');
  const comparison = rows.filter(row => row.test === 'plain_generate' && row.keySlot !== 'file_search');
  const search = rows.find(row => row.test === 'filtered_file_search');
  return {
    baselineFailedWithoutDocuments: baseline ? !baseline.ok : null,
    anotherKeySucceeded: comparison.some(row => row.ok),
    groundedSearchSucceeded: Boolean(search?.ok && search?.matchedCitationCount > 0),
    note: 'Local credentials/network only. Key slots are not proof of distinct Google projects. Production equivalence is not assumed.',
  };
}

async function main() {
  dotenv.config({ path: '.env.local', quiet: true });
  dotenv.config({ quiet: true });
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: npm run diagnose:gemini -- [--compare-chat-keys] [--model=gemini-3.1-flash-lite]');
    console.log('Read-only store inspection plus bounded inference calls (may incur API usage). Does not upload, delete, deploy, or change settings. Each call: 12 seconds, no retry. Default model matches the Worker fallback, not .env.local. Optional comparison tests up to 4 existing chat keys without documents.');
    return;
  }
  if (args.some(arg => arg !== '--compare-chat-keys' && !arg.startsWith('--model='))) throw new Error('INVALID_ARGUMENT');
  const model = args.find(arg => arg.startsWith('--model='))?.slice(8) || 'gemini-3.1-flash-lite';
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) throw new Error('INVALID_MODEL');
  const key = process.env.GEMINI_FILE_SEARCH_API_KEY?.trim();
  const store = process.env.GEMINI_FILE_SEARCH_STORE?.trim();
  if (!key) throw new Error('MISSING_FILE_SEARCH_KEY');
  if (store && !/^fileSearchStores\/[a-zA-Z0-9_-]+$/.test(store)) throw new Error('INVALID_STORE_NAME');
  const rows = [];
  const emit = row => { rows.push(row); console.log(JSON.stringify(row)); };
  const call = (apiKey, path, body) => probe({ key: apiKey, path, body, sensitive: [store, QUESTION] });
  const path = `models/${model}:generateContent`;
  const plain = { contents: [{ role: 'user', parts: [{ text: 'Reply only OK' }] }] };
  console.log(JSON.stringify({ test: 'configuration', model, localConfiguredModel: process.env.GEMINI_CHAT_MODEL || null, storeConfigured: Boolean(store), runtime: 'local_node', timeoutMs: 12000 }));
  const baseline = await call(key, path, plain);
  emit({ test: 'plain_generate', keySlot: 'file_search', model, ...baseline.diagnostic });
  if (args.includes('--compare-chat-keys')) {
    const keys = [...new Set((process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(/[,\n]/).map(value => value.trim()).filter(value => value && value !== key))].slice(0, 4);
    for (const [index, comparisonKey] of keys.entries()) {
      const result = await call(comparisonKey, path, plain);
      emit({ test: 'plain_generate', keySlot: `chat_${index + 1}`, model, ...result.diagnostic });
    }
  }
  const legacy = await call(key, 'interactions', { model, input: 'Reply only OK', store: false });
  emit({ test: 'plain_interactions', model, ...legacy.diagnostic });
  if (store) {
    const result = await call(key, store);
    emit({ test: 'store_inventory', ...result.diagnostic, ...(result.data ? {
      activeDocuments: Number(result.data.activeDocumentsCount || 0),
      pendingDocuments: Number(result.data.pendingDocumentsCount || 0),
      failedDocuments: Number(result.data.failedDocumentsCount || 0),
      sizeBytes: Number(result.data.sizeBytes || 0),
    } : {}) });
    const listing = await call(key, `${store}/documents?pageSize=20`);
    const documents = (listing.data?.documents || []).filter(document => document.state === 'STATE_ACTIVE');
    const ids = documents.filter(document => document.customMetadata?.some(item => item.key === 'visibility' && item.stringValue === 'public'))
      .map(document => document.customMetadata?.find(item => item.key === 'document_id')?.stringValue).filter(Boolean);
    emit({ test: 'document_metadata', ...listing.diagnostic, activeInPage: documents.length, publicIdsInPage: ids.length, truncated: Boolean(listing.data?.nextPageToken) });
    const metadataFilter = buildDocumentCandidateMetadataFilter(ids);
    if (metadataFilter) {
      const search = await call(key, path, {
        ...plain,
        contents: [{ role: 'user', parts: [{ text: QUESTION }] }],
        tools: [{ fileSearch: { fileSearchStoreNames: [store], metadataFilter } }],
      });
      const citations = extractGenerateContentDocumentSources(search.data);
      emit({ test: 'filtered_file_search', model, ...search.diagnostic, citationCount: citations.length,
        matchedCitationCount: citations.filter(source => ids.includes(source.documentId)).length });
      const oldSearch = await call(key, 'interactions', {
        model, input: QUESTION, store: false,
        tools: [{ type: 'file_search', file_search_store_names: [store], metadata_filter: metadataFilter }],
      });
      emit({ test: 'filtered_interactions', model, ...oldSearch.diagnostic,
        citationCount: extractGeminiDocumentSources(oldSearch.data).length });
    } else emit({ test: 'filtered_file_search', skipped: 'NO_PUBLIC_DOCUMENT_IDS' });
  }
  console.log(JSON.stringify({ test: 'summary', ...summarize(rows) }));
  if (rows.some(row => row.ok === false)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(JSON.stringify({ result: 'DIAGNOSTIC_SETUP_FAILED', hint: 'Check arguments and local Gemini configuration. Use --help. Raw errors are suppressed to protect credentials.' }));
    process.exitCode = 1;
  });
}
