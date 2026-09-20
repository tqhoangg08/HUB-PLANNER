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
  if (item.type === 'file_citation') annotations.push(item);
  for (const child of Object.values(item)) walk(child, annotations);
};

export const extractGeminiDocumentSources = (interaction: unknown): GeminiDocumentSource[] => {
  const annotations: Record<string, unknown>[] = [];
  walk(interaction, annotations);
  const seen = new Set<string>();
  return annotations.flatMap((item) => {
    const source = String(item.source || item.document_name || '');
    const metadata = record(item.custom_metadata);
    const fileName = String(item.file_name || item.filename || '').trim();
    const pageNumber = Number(item.page_number || 0) || null;
    const match = source.match(/\/documents\/([0-9a-f-]{36})(?:$|\/)/i);
    const metadataDocumentId = String(metadata?.document_id || '').trim();
    const documentId = /^[0-9a-f-]{36}$/i.test(metadataDocumentId) ? metadataDocumentId : match?.[1] || null;
    const key = `${source}|${fileName}|${pageNumber || ''}`;
    if (!fileName || seen.has(key)) return [];
    seen.add(key);
    return [{ documentId, fileName, title: fileName.replace(/\.[^.]+$/, ''), pageNumber }];
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
  const configuredThinking = String(env.GEMINI_THINKING_LEVEL || 'minimal').toLowerCase();
  const thinkingLevel = ['minimal', 'medium', 'high'].includes(configuredThinking) ? configuredThinking : 'minimal';
  const interaction = await ai.interactions.create({
    model: String(env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite'),
    system_instruction: system,
    input: buildGeminiInteractionSteps(history, question),
    generation_config: { thinking_level: thinkingLevel },
    tools: [{
      type: 'file_search',
      file_search_store_names: [String(env.GEMINI_FILE_SEARCH_STORE)],
      metadata_filter: options.metadataFilter || publicDocumentMetadataFilter(),
    }],
  } as never);
  const reply = outputText(interaction);
  if (!reply) throw new Error('Empty Gemini File Search response');
  return { reply, documentSources: extractGeminiDocumentSources(interaction) };
};
