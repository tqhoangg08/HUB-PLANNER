import { GoogleGenAI } from '@google/genai';

export const DEFAULT_GEMINI_CHAT_MODEL = 'gemini-3.5-flash-lite';
export const DEFAULT_THINKING_LEVEL = 'minimal';
export const VALID_THINKING_LEVELS = new Set(['minimal', 'medium', 'high']);

export const getGeminiChatModel = () =>
  String(process.env.GEMINI_CHAT_MODEL || DEFAULT_GEMINI_CHAT_MODEL).trim();

export const getGeminiThinkingLevel = () => {
  const value = String(process.env.GEMINI_THINKING_LEVEL || DEFAULT_THINKING_LEVEL)
    .trim()
    .toLowerCase();
  return VALID_THINKING_LEVELS.has(value) ? value : DEFAULT_THINKING_LEVEL;
};

export const getChatApiKeys = () =>
  String(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

export const isFileSearchConfigured = () =>
  String(process.env.GEMINI_FILE_SEARCH_ENABLED || 'false').toLowerCase() === 'true'
  && Boolean(process.env.GEMINI_FILE_SEARCH_API_KEY?.trim())
  && Boolean(process.env.GEMINI_FILE_SEARCH_STORE?.trim());

export const createGeminiClient = (apiKey, timeout = 30_000) => new GoogleGenAI({
  apiKey,
  httpOptions: { timeout, retryOptions: { attempts: 1 } },
});

const shuffle = (items) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};

const isRetryableGeminiError = (error) => {
  const status = Number(error?.status || error?.code || error?.response?.status || 0);
  const text = String(error?.message || '').toLowerCase();
  return [408, 429, 500, 502, 503, 504].includes(status)
    || text.includes('timeout')
    || text.includes('unavailable')
    || text.includes('high demand')
    || text.includes('rate limit');
};

export async function runWithChatKeyPool(callback) {
  const keys = shuffle(getChatApiKeys());
  if (!keys.length) throw new Error('GEMINI_API_KEYS is not configured');

  let lastError;
  for (const key of keys) {
    try {
      return await callback(createGeminiClient(key));
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error)) throw error;
    }
  }
  throw lastError || new Error('All Gemini chat keys failed');
}

export const createFileSearchClient = () => {
  const apiKey = process.env.GEMINI_FILE_SEARCH_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_FILE_SEARCH_API_KEY is not configured');
  return createGeminiClient(apiKey, 120_000);
};

