import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

// Scripts executed directly by Node do not automatically follow Vite's env
// loading order. Load local development values first, then use `.env` only as
// a fallback so this command behaves the same way as `npm run dev`.
dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });

const apiKey = process.env.GEMINI_FILE_SEARCH_API_KEY?.trim();
if (!apiKey) {
  console.error('Thiếu GEMINI_FILE_SEARCH_API_KEY. Hãy dùng API key của project chuyên dụng cho File Search.');
  process.exit(1);
}

const displayName = 'HUB Planner Knowledge Base';
const embeddingModel = process.env.GEMINI_FILE_SEARCH_EMBEDDING_MODEL || 'models/gemini-embedding-2';
const ai = new GoogleGenAI({ apiKey });
let found = null;
for await (const store of await ai.fileSearchStores.list({ config: { pageSize: 20 } })) {
  if (store.displayName === displayName) { found = store; break; }
}

const store = found || await ai.fileSearchStores.create({ config: { displayName, embeddingModel } });
if (!store?.name) throw new Error('Gemini không trả về tên File Search store.');
console.log(`GEMINI_FILE_SEARCH_STORE=${store.name}`);

