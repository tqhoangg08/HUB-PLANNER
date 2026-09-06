import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  extractGeminiDocumentSources,
  geminiFileSearchConfigured,
} from '../cloudflare/worker/src/gemini-file-search.ts';

const source = (path: string) => readFileSync(path, 'utf8');

test('Gemini File Search is opt-in and requires both server-only bindings', () => {
  assert.equal(geminiFileSearchConfigured({
    GEMINI_FILE_SEARCH_ENABLED: 'true',
    GEMINI_FILE_SEARCH_API_KEY: 'configured',
    GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/example',
  }), true);
  assert.equal(geminiFileSearchConfigured({ GEMINI_FILE_SEARCH_ENABLED: 'true' }), false);
});

test('document citations are deduplicated and expose no session data', () => {
  const interaction = { steps: [{ content: [{ annotations: [
    { type: 'file_citation', file_name: 'Quy-che.pdf', source: 'fileSearchStores/x/documents/11111111-1111-4111-8111-111111111111', page_number: 4 },
    { type: 'file_citation', file_name: 'Quy-che.pdf', source: 'fileSearchStores/x/documents/11111111-1111-4111-8111-111111111111', page_number: 4 },
  ] }] }] };
  assert.deepEqual(extractGeminiDocumentSources(interaction), [{
    documentId: '11111111-1111-4111-8111-111111111111',
    fileName: 'Quy-che.pdf',
    title: 'Quy-che',
    pageNumber: 4,
  }]);
});

test('AI document browser flows use Better Auth private APIs, not Supabase Auth or Storage', () => {
  const frontend = source('components/AdminAIDocuments.tsx') + source('components/AIDocumentSources.tsx');
  assert.match(frontend, /privateApiRequest/);
  assert.match(frontend, /\/api\/admin\/v1\/ai-documents/);
  assert.match(frontend, /\/api\/private\/v1\/ai-document-source/);
  assert.doesNotMatch(frontend, /supabase\.auth|supabase\.storage|Bearer/);
});

test('Cloudflare Worker owns AI document routes and keeps admin mutation authorization strict', () => {
  const worker = source('cloudflare/worker/src/index.ts');
  const handler = source('cloudflare/worker/src/ai-documents.ts');
  assert.match(worker, /\/api\/admin\/v1\/ai-documents/);
  assert.match(worker, /\/api\\\/private\\\/v1\\\/ai-document-source/);
  assert.match(handler, /requireBetterAuthSession/);
  assert.match(handler, /identity\.role !== 'admin'/);
  assert.match(handler, /request\.formData\(\)/);
});
