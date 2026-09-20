import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { buildDocumentCandidateMetadataFilter, extractGeminiDocumentSources } from '../cloudflare/worker/src/gemini-file-search.ts';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const BENCHMARK_TIMEOUT_MS = 20_000;
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];
const SYSTEM = 'Bạn là AI Cố vấn học tập HUB Planner. Chỉ trả lời ngắn gọn từ tài liệu chính thức đã truy xuất; nếu không có căn cứ, nói chưa xác minh được.';
const QUESTION = 'Quy đổi điểm thang 4 HUB như thế nào?';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const apiKey = String(process.env.GEMINI_FILE_SEARCH_API_KEY || '').trim();
const store = String(process.env.GEMINI_FILE_SEARCH_STORE || '').trim();
const candidateIds = String(process.env.GEMINI_BENCHMARK_DOCUMENT_IDS || '')
  .split(',').map((id) => id.trim()).filter((id) => UUID.test(id));
const metadataFilter = buildDocumentCandidateMetadataFilter(candidateIds);
const candidateIdSet = new Set(candidateIds);
const selectedModels = String(process.env.GEMINI_BENCHMARK_MODEL || '')
  .split(',').map((model) => model.trim()).filter((model) => MODELS.includes(model));
const selectedPaths = String(process.env.GEMINI_BENCHMARK_API_PATH || '')
  .split(',').map((path) => path.trim()).filter((path) => ['interactions', 'generate_content'].includes(path));

if (!apiKey || !store || !metadataFilter || candidateIds.length !== 3) {
  console.error(JSON.stringify({
    error: 'CONFIG_REQUIRED',
    required: ['GEMINI_FILE_SEARCH_API_KEY', 'GEMINI_FILE_SEARCH_STORE', 'GEMINI_BENCHMARK_DOCUMENT_IDS (exactly 3 UUIDs)'],
  }));
  process.exit(1);
}

const classifyError = (error, elapsedMs) => {
  const record = error && typeof error === 'object' ? error : {};
  const response = record.response && typeof record.response === 'object' ? record.response : {};
  const statusValue = Number(record.status ?? record.statusCode ?? response.status);
  const status = Number.isInteger(statusValue) && statusValue >= 100 && statusValue <= 599 ? statusValue : null;
  if (status === 429) return { result: 'RATE_LIMIT', errorClass: 'HTTP_429', status };
  if (record.name === 'AbortError' || record.name === 'BenchmarkTimeoutError' || elapsedMs >= BENCHMARK_TIMEOUT_MS) return { result: 'TIMEOUT', errorClass: String(record.name || 'AbortError').slice(0, 80), status };
  return { result: 'ERROR', errorClass: String(record.name || 'UnknownError').slice(0, 80), status };
};

const asRecord = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const asArray = (value) => Array.isArray(value) ? value : [];
const firstValue = (value) => {
  const record = asRecord(value);
  if (!record) return typeof value === 'string' ? value : '';
  return String(record.stringValue ?? record.string_value ?? record.numericValue ?? record.numeric_value ?? record.value ?? '').trim();
};

const groundedDocumentIds = (metadata) => {
  if (Array.isArray(metadata)) {
    return metadata.flatMap((item) => {
      const record = asRecord(item);
      const key = String(record?.key ?? record?.name ?? '').trim().toLowerCase();
      const value = firstValue(item);
      return key === 'document_id' && UUID.test(value) ? [value] : [];
    });
  }
  const record = asRecord(metadata);
  const direct = firstValue(record?.document_id ?? record?.documentId);
  return UUID.test(direct) ? [direct] : [];
};

// GenerateContent File Search uses groundingMetadata instead of Interactions'
// file_citation annotations. Keep the benchmark output count-only.
const summarizeGenerateContentGrounding = (response) => {
  const root = asRecord(response);
  const candidate = asArray(root?.candidates)[0];
  const candidateRecord = asRecord(candidate);
  const grounding = asRecord(candidateRecord?.groundingMetadata ?? candidateRecord?.grounding_metadata);
  const chunks = asArray(grounding?.groundingChunks ?? grounding?.grounding_chunks);
  const contexts = chunks.map((chunk) => {
    const record = asRecord(chunk);
    return asRecord(record?.retrievedContext ?? record?.retrieved_context);
  }).filter(Boolean);
  const documentIds = contexts.flatMap((context) => groundedDocumentIds(context.customMetadata ?? context.custom_metadata));
  const pageNumberCount = contexts.filter((context) => Number.isFinite(Number(context.pageNumber ?? context.page_number))).length;
  return {
    hasGrounding: contexts.length > 0,
    groundingChunkCount: chunks.length,
    documentIdMetadataCount: documentIds.length,
    pageNumberCount,
    candidateIdsVerified: documentIds.length > 0 && documentIds.every((id) => candidateIdSet.has(id)),
  };
};

const timed = async (model, apiPath, invoke, summarize = null) => {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timeout;
  try {
    const response = await Promise.race([
      invoke(controller.signal),
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const error = new Error('BENCHMARK_TIMEOUT');
          error.name = 'BenchmarkTimeoutError';
          reject(error);
        }, BENCHMARK_TIMEOUT_MS);
      }),
    ]);
    const interactionSources = apiPath === 'interactions' ? extractGeminiDocumentSources(response) : [];
    const grounding = summarize ? summarize(response) : {};
    return {
      model,
      apiPath,
      durationMs: Date.now() - startedAt,
      success: true,
      citationPresent: interactionSources.length > 0 || Boolean(grounding.documentIdMetadataCount),
      result: 'SUCCESS',
      errorClass: null,
      status: null,
      ...grounding,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    return {
      model, apiPath, durationMs, success: false, citationPresent: false,
      hasGrounding: false, groundingChunkCount: 0, documentIdMetadataCount: 0, pageNumberCount: 0, candidateIdsVerified: false,
      ...classifyError(error, durationMs),
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

const ai = new GoogleGenAI({ apiKey });
const interaction = (model) => timed(model, 'interactions', (abortSignal) => ai.interactions.create({
  model,
  system_instruction: SYSTEM,
  input: [{ type: 'user_input', content: [{ type: 'text', text: QUESTION }] }],
  generation_config: { thinking_level: 'minimal' },
  tools: [{ type: 'file_search', file_search_store_names: [store], metadata_filter: metadataFilter }],
}, { abortSignal, httpOptions: { timeout: BENCHMARK_TIMEOUT_MS } }));

const generateContent = (model) => timed(model, 'generate_content', (abortSignal) => ai.models.generateContent({
  model,
  contents: QUESTION,
  config: {
    systemInstruction: SYSTEM,
    thinkingConfig: { thinkingLevel: 'MINIMAL' },
    tools: [{ fileSearch: { fileSearchStoreNames: [store], metadataFilter } }],
    abortSignal,
    httpOptions: { timeout: BENCHMARK_TIMEOUT_MS },
  },
}), summarizeGenerateContentGrounding);

const modelsToRun = selectedModels.length ? selectedModels : MODELS;
const pathsToRun = selectedPaths.length ? selectedPaths : ['interactions', 'generate_content'];
for (const model of modelsToRun) {
  if (pathsToRun.includes('interactions')) console.log(JSON.stringify(await interaction(model)));
  if (pathsToRun.includes('generate_content')) console.log(JSON.stringify(await generateContent(model)));
}
