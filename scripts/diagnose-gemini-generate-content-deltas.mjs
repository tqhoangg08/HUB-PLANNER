import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { buildPolicyRetrievalInput, routeAdvisorDocuments } from '../cloudflare/worker/src/ai-advisor.ts';
import {
  buildDocumentCandidateMetadataFilter,
  buildGeminiPolicyContents,
  extractSafeGeminiApiErrorDiagnostics,
} from '../cloudflare/worker/src/gemini-file-search.ts';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const TIMEOUT_MS = 20_000;
const MODEL = 'gemini-3.1-flash-lite';
const QUESTION = 'Quy đổi điểm thang 4 HUB như thế nào?';
const apiKey = String(process.env.GEMINI_FILE_SEARCH_API_KEY || '').trim();
const store = String(process.env.GEMINI_FILE_SEARCH_STORE || '').trim();
const candidateIds = String(process.env.GEMINI_BENCHMARK_DOCUMENT_IDS || '')
  .split(',').map((value) => value.trim()).filter(Boolean);
const metadataFilter = buildDocumentCandidateMetadataFilter(candidateIds);

if (!apiKey || !store || !metadataFilter || candidateIds.length !== 3) {
  console.error(JSON.stringify({ error: 'CONFIG_REQUIRED' }));
  process.exit(2);
}

const compactSystem = 'Chỉ trả lời từ tài liệu chính thức đã truy xuất.';
const productionSystem = [
  'Bạn là AI Cố vấn học tập HUB Planner. Trả lời bằng tiếng Việt, thân thiện, rõ ràng.',
  'Chỉ trả lời quy định HUB/BUH dựa trên tài liệu đã truy xuất và được trích dẫn.',
  'Trả lời trực tiếp dữ kiện được hỏi. Nếu nguồn có bảng, danh sách hoặc ngưỡng, nêu đầy đủ dữ liệu liên quan.',
  'Không suy diễn khóa tuyển sinh từ năm học, tên tài liệu, số trang hoặc câu hỏi.',
  'Nêu rõ Phần, Chương, Mục, Điều, Khoản, Điểm và phạm vi áp dụng khi đoạn nguồn hỗ trợ.',
  'Nếu nguồn chính thức không đủ, nói rõ chưa thể xác minh.',
  'Ưu tiên tài liệu hiện hành, đúng chương trình, đúng khóa hoặc năm học được hỏi.',
  'Không sử dụng câu trả lời trước của trợ lý làm căn cứ chính sách.',
].join('\n').repeat(4).slice(0, 4_000);
const history = [
  { role: 'user', content: 'quy đổi điểm ở HUB như nào?' },
  { role: 'assistant', content: 'Nội dung này không được đưa vào retrieval input.' },
  { role: 'user', content: 'khóa 2026 thì sao?' },
];
const currentQuestion = 'mình khóa 2026 á, bạn có bảng quy đổi điểm không';
const route = routeAdvisorDocuments(currentQuestion, history);
const synthesizedInput = buildPolicyRetrievalInput(history, currentQuestion, route);
const ai = new GoogleGenAI({ apiKey });

const fingerprint = (value) => createHash('sha256').update(value).digest('hex').slice(0, 12);
const parity = (actual, expected) => expected ? (actual === expected ? 'MATCH' : 'NO_MATCH') : 'UNKNOWN';
const keyParity = parity(fingerprint(apiKey), String(process.env.GEMINI_PRODUCTION_API_KEY_SHA256 || '').trim());
const storeParity = parity(fingerprint(store), String(process.env.GEMINI_PRODUCTION_STORE_SHA256 || '').trim());
const filterParity = buildDocumentCandidateMetadataFilter(candidateIds) === metadataFilter ? 'MATCH' : 'NO_MATCH';

const groundingChunkCount = (response) => {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?? response?.candidates?.[0]?.grounding_metadata?.grounding_chunks;
  return Array.isArray(chunks) ? chunks.length : 0;
};

const invoke = async ({ testName, contents, systemInstruction, maxOutputTokens }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction,
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        thinkingConfig: { thinkingLevel: 'MINIMAL' },
        tools: [{ fileSearch: { fileSearchStoreNames: [store], metadataFilter } }],
        abortSignal: controller.signal,
        httpOptions: { timeout: TIMEOUT_MS },
      },
    });
    return { testName, status: 200, durationMs: Date.now() - startedAt, groundingChunkCount: groundingChunkCount(response), sanitizedErrorClass: null };
  } catch (error) {
    const diagnostic = extractSafeGeminiApiErrorDiagnostics(error, [apiKey, store, QUESTION, currentQuestion, synthesizedInput, compactSystem, productionSystem]);
    return {
      testName,
      status: diagnostic.status ?? null,
      durationMs: Date.now() - startedAt,
      groundingChunkCount: 0,
      sanitizedErrorClass: diagnostic.google400Classification
        ?? ([diagnostic.errorName, diagnostic.apiErrorStatusText].filter(Boolean).join(':') || 'UNKNOWN_ERROR'),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const tests = [
  { testName: 'A_BASELINE', contents: QUESTION, systemInstruction: compactSystem },
  { testName: 'B_EXPLICIT_CONTENT_ARRAY', contents: buildGeminiPolicyContents(QUESTION), systemInstruction: compactSystem },
  { testName: 'C_MAX_OUTPUT_TOKENS', contents: buildGeminiPolicyContents(QUESTION), systemInstruction: compactSystem, maxOutputTokens: 2_048 },
  { testName: 'D_PRODUCTION_SYSTEM_SIZE', contents: buildGeminiPolicyContents(QUESTION), systemInstruction: productionSystem, maxOutputTokens: 2_048 },
  { testName: 'E_SYNTHESIZED_RETRIEVAL_INPUT', contents: buildGeminiPolicyContents(synthesizedInput), systemInstruction: productionSystem, maxOutputTokens: 2_048 },
];

const results = [];
for (const testCase of tests) results.push(await invoke(testCase));

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
console.log(JSON.stringify({
  installedGoogleGenaiVersion: lock.packages?.['node_modules/@google/genai']?.version || 'UNKNOWN',
  benchmarkKeyMatchesProd: keyParity,
  benchmarkStoreMatchesProd: storeParity,
  metadataFilterFingerprintMatch: filterParity,
  results,
}));
