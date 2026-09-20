import { GoogleGenAI } from '@google/genai';

export interface GeminiFileSearchEnv {
  GEMINI_FILE_SEARCH_ENABLED?: string;
  GEMINI_FILE_SEARCH_API_KEY?: string;
  GEMINI_FILE_SEARCH_STORE?: string;
  GEMINI_CHAT_MODEL?: string;
  GEMINI_THINKING_LEVEL?: string;
}

export interface GeminiDocumentSource {
  documentId: string | null;
  fileName: string;
  title: string | null;
  pageNumber: number | null;
}

/**
 * Internal-only stage labels. These intentionally contain no request, source,
 * document-content, credential, or storage-path data.
 */
export type GeminiFileSearchFailureReason =
  | 'CONFIG_DISABLED'
  | 'GEMINI_REQUEST_FAILED'
  | 'GEMINI_EMPTY_REPLY'
  | 'GEMINI_NO_FILE_CITATION'
  | 'D1_CITATION_NOT_FOUND'
  | 'D1_CITATION_NOT_ACTIVE'
  | 'D1_CITATION_CATEGORY_REJECTED'
  | 'SUCCESS';

export class GeminiFileSearchError extends Error {
  readonly reason: Extract<GeminiFileSearchFailureReason, 'GEMINI_REQUEST_FAILED' | 'GEMINI_EMPTY_REPLY'>;
  readonly diagnostics: { model: string; errorName?: string; status?: number };

  constructor(
    reason: Extract<GeminiFileSearchFailureReason, 'GEMINI_REQUEST_FAILED' | 'GEMINI_EMPTY_REPLY'>,
    diagnostics: { model: string; errorName?: string; status?: number },
  ) {
    super(reason);
    this.name = 'GeminiFileSearchError';
    this.reason = reason;
    this.diagnostics = diagnostics;
  }
}

export type GeminiFileSearchOptions = {
  /** A server-selected public-document filter; never derived directly from user input. */
  metadataFilter?: string;
};

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export const geminiFileSearchConfigured = (env: GeminiFileSearchEnv) =>
  env.GEMINI_FILE_SEARCH_ENABLED === 'true'
  && Boolean(String(env.GEMINI_FILE_SEARCH_API_KEY || '').trim())
  && Boolean(String(env.GEMINI_FILE_SEARCH_STORE || '').trim());

export const publicDocumentMetadataFilter = (category?: string | null) => {
  const normalizedCategory = String(category || '').trim().toLowerCase();
  return normalizedCategory && /^[a-z_]{2,64}$/.test(normalizedCategory)
    ? `visibility = "public" AND category = "${normalizedCategory}"`
    : 'visibility = "public"';
};

const walk = (value: unknown, annotations: Record<string, unknown>[]) => {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, annotations);
    return;
  }
  const item = record(value);
  if (!item) return;
  if (item.type === 'file_citation' || item.type === 'fileCitation') annotations.push(item);
  for (const child of Object.values(item)) walk(child, annotations);
};

export const extractGeminiDocumentSources = (interaction: unknown): GeminiDocumentSource[] => {
  const annotations: Record<string, unknown>[] = [];
  walk(interaction, annotations);
  const seen = new Set<string>();
  return annotations.flatMap((item) => {
    // @google/genai's JavaScript objects use camelCase, while stored/mocked
    // interaction payloads can use the REST API's snake_case. Normalize both
    // before D1 performs the actual authority check.
    const source = String(item.documentUri || item.document_uri || item.source || item.documentName || item.document_name || '').trim();
    const metadata = record(item.customMetadata) || record(item.custom_metadata);
    const fileName = String(item.fileName || item.file_name || item.filename || '').trim();
    const pageNumber = Number(item.pageNumber ?? item.page_number ?? 0) || null;
    const match = source.match(/(?:\/documents\/|\b)([0-9a-f-]{36})(?:$|[\/?#])/i);
    const documentNameMatch = source.match(/\/documents\/([A-Za-z0-9._-]{1,256})(?:$|[\/?#])/);
    const metadataDocumentId = String(metadata?.document_id || metadata?.documentId || '').trim();
    const documentId = /^[0-9a-f-]{36}$/i.test(metadataDocumentId)
      ? metadataDocumentId
      : match?.[1] || documentNameMatch?.[1] || null;
    const key = `${documentId || source}|${fileName}|${pageNumber || ''}`;
    // A citation with a D1 identifier remains useful even if Gemini omits its
    // presentation filename: the authoritative D1 row supplies that later.
    if ((!fileName && !documentId) || seen.has(key)) return [];
    seen.add(key);
    return [{ documentId, fileName, title: fileName ? fileName.replace(/\.[^.]+$/, '') : null, pageNumber }];
  });
};

export const buildGeminiInteractionSteps = (
  history: Array<{ role: string; content: string }>,
  question: string,
) => [
  ...history.flatMap((message) => {
    const text = String(message.content || '').trim();
    if (!text) return [];
    return [{
      type: message.role === 'assistant' ? 'model_output' : 'user_input',
      content: [{ type: 'text', text }],
    }];
  }),
  {
    type: 'user_input',
    content: [{ type: 'text', text: question.trim() }],
  },
];

const outputText = (interaction: unknown) => {
  const value = record(interaction);
  if (typeof value?.outputText === 'string') return value.outputText.trim();
  if (typeof value?.output_text === 'string') return value.output_text.trim();
  const texts: string[] = [];
  const collect = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(collect);
    const item = record(node);
    if (!item) return;
    if (item.type === 'text' && typeof item.text === 'string') texts.push(item.text);
    else Object.values(item).forEach(collect);
  };
  collect(interaction);
  return texts.join('\n').trim();
};

export const answerWithGeminiFileSearch = async (
  env: GeminiFileSearchEnv,
  system: string,
  history: Array<{ role: string; content: string }>,
  question: string,
  options: GeminiFileSearchOptions = {},
) => {
  if (!geminiFileSearchConfigured(env)) return null;
  const ai = new GoogleGenAI({ apiKey: String(env.GEMINI_FILE_SEARCH_API_KEY) });
  const model = String(env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite');
  const configuredThinking = String(env.GEMINI_THINKING_LEVEL || 'minimal').toLowerCase();
  const thinkingLevel = ['minimal', 'medium', 'high'].includes(configuredThinking) ? configuredThinking : 'minimal';
  let interaction: unknown;
  try {
    interaction = await ai.interactions.create({
      model,
      system_instruction: system,
      input: buildGeminiInteractionSteps(history, question),
      generation_config: { thinking_level: thinkingLevel },
      tools: [{
        type: 'file_search',
        file_search_store_names: [String(env.GEMINI_FILE_SEARCH_STORE)],
        metadata_filter: options.metadataFilter || publicDocumentMetadataFilter(),
      }],
    } as never);
  } catch (error) {
    const candidate = record(error);
    const response = record(candidate?.response);
    const statusValue = candidate?.status ?? candidate?.statusCode ?? response?.status;
    const parsedStatus = Number(statusValue);
    const status = Number.isInteger(parsedStatus) && parsedStatus >= 100 && parsedStatus <= 599
      ? parsedStatus
      : undefined;
    const errorName = typeof candidate?.name === 'string' ? candidate.name.slice(0, 80) : undefined;
    throw new GeminiFileSearchError('GEMINI_REQUEST_FAILED', { model, errorName, status });
  }
  const reply = outputText(interaction);
  if (!reply) throw new GeminiFileSearchError('GEMINI_EMPTY_REPLY', { model });
  return { reply, documentSources: extractGeminiDocumentSources(interaction) };
};
