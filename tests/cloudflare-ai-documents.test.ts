import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildGeminiInteractionSteps,
  extractGeminiDocumentSources,
  geminiFileSearchConfigured,
} from '../cloudflare/worker/src/gemini-file-search.ts';
import {
  AiDocumentsError,
  isSafeAiDocumentObjectKey,
  validateAiDocumentFile,
} from '../cloudflare/worker/src/ai-documents.ts';

const source = (path: string) => readFileSync(path, 'utf8');

test('Gemini File Search is opt-in and requires both server-only bindings', () => {
  assert.equal(geminiFileSearchConfigured({
    GEMINI_FILE_SEARCH_ENABLED: 'true',
    GEMINI_FILE_SEARCH_API_KEY: 'configured',
    GEMINI_FILE_SEARCH_STORE: 'fileSearchStores/example',
  }), true);
  assert.equal(geminiFileSearchConfigured({ GEMINI_FILE_SEARCH_ENABLED: 'true' }), false);
});

test('Gemini File Search uses steps-based interactions for current Gemini models', () => {
  assert.deepEqual(buildGeminiInteractionSteps([
    { role: 'user', content: 'Previous question' },
    { role: 'assistant', content: 'Previous answer' },
  ], 'Current question'), [
    { type: 'user_input', content: [{ type: 'text', text: 'Previous question' }] },
    { type: 'model_output', content: [{ type: 'text', text: 'Previous answer' }] },
    { type: 'user_input', content: [{ type: 'text', text: 'Current question' }] },
  ]);
});

test('AI document admin UI uses a canonical category select instead of a free-form legacy label', () => {
  const frontend = source('components/AdminAIDocuments.tsx');
  const worker = source('cloudflare/worker/src/ai-documents.ts');
  assert.match(frontend, /AI_DOCUMENT_CATEGORY_OPTIONS/);
  assert.match(frontend, /<select[\s\S]*value=\{category\}/);
  assert.match(worker, /normalizeAiDocumentCategory\(form\.get\('category'\)\)/);
  assert.match(worker, /normalizeAiDocumentCategory\(document\.category\)/);
});

test('document citations are deduplicated and expose no session data', () => {
  const interaction = { steps: [{ content: [{ annotations: [
    { type: 'file_citation', file_name: 'Quy-che.pdf', source: 'fileSearchStores/x/documents/generated-name', custom_metadata: { document_id: '11111111-1111-4111-8111-111111111111' }, page_number: 4 },
    { type: 'file_citation', file_name: 'Quy-che.pdf', source: 'fileSearchStores/x/documents/generated-name', custom_metadata: { document_id: '11111111-1111-4111-8111-111111111111' }, page_number: 4 },
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

test('Gemini JavaScript camelCase file citations normalize to the same safe source shape', () => {
  const interaction = { modelOutput: { content: [{ type: 'text', text: 'Theo tài liệu.', annotations: [
    {
      type: 'file_citation',
      fileName: 'Quy-che-2026.pdf',
      documentUri: 'fileSearchStores/x/documents/generated-name',
      customMetadata: { document_id: '22222222-2222-4222-8222-222222222222' },
      pageNumber: 18,
    },
  ] }] } };
  assert.deepEqual(extractGeminiDocumentSources(interaction), [{
    documentId: '22222222-2222-4222-8222-222222222222',
    fileName: 'Quy-che-2026.pdf',
    title: 'Quy-che-2026',
    pageNumber: 18,
  }]);
});

test('AI document and chat production runtime is D1/R2 authoritative and Supabase-free', () => {
  const documents = source('cloudflare/worker/src/ai-documents.ts');
  const advisor = source('cloudflare/worker/src/ai-advisor.ts');
  const config = source('cloudflare/wrangler.jsonc');
  const migration = source('cloudflare/migrations/0032_ai_documents_chat_d1_r2_authority.sql');
  const accountDelete = source('cloudflare/worker/src/account-delete.ts');
  assert.doesNotMatch(documents, /SUPABASE|rest\/v1|storage\/v1/);
  assert.doesNotMatch(advisor, /SUPABASE|rest\/v1/);
  assert.match(documents, /AI_DOCUMENTS_BUCKET/);
  assert.match(documents, /INSERT INTO ai_documents/);
  assert.match(advisor, /INSERT INTO ai_chat_logs/);
  assert.match(advisor, /WHERE id = \?1 AND user_id = \?2/);
  assert.match(config, /"binding": "AI_DOCUMENTS_BUCKET"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_documents/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ai_chat_logs/);
  assert.doesNotMatch(accountDelete.match(/const SOURCE_OWNER_TABLES[\s\S]*?\];/)?.[0] || '', /ai_chat_logs/);
  assert.match(accountDelete, /DELETE FROM ai_chat_logs WHERE user_id = \?/);
});

test('R2 document keys and file signatures fail closed', async () => {
  assert.equal(isSafeAiDocumentObjectKey('ai-documents/user/id-file.pdf'), true);
  assert.equal(isSafeAiDocumentObjectKey('ai-documents/../secret.pdf'), false);
  assert.equal(isSafeAiDocumentObjectKey('support/file.pdf'), false);
  const valid = new File([new TextEncoder().encode('%PDF-1.7\nfixture')], 'fixture.pdf', { type: 'application/pdf' });
  assert.equal((await validateAiDocumentFile(valid)).mimeType, 'application/pdf');
  const invalid = new File([new TextEncoder().encode('not-a-pdf')], 'fixture.pdf', { type: 'application/pdf' });
  await assert.rejects(
    () => validateAiDocumentFile(invalid),
    (error: unknown) => error instanceof AiDocumentsError && error.status === 400,
  );
});

test('AI document source resolves to an authenticated same-origin R2 stream route', () => {
  const worker = source('cloudflare/worker/src/index.ts');
  const handler = source('cloudflare/worker/src/ai-documents.ts');
  assert.match(worker, /ai-document-file/);
  assert.match(handler, /handleAiDocumentFile/);
  assert.match(handler, /requireBetterAuthSession/);
  assert.match(handler, /Content-Disposition/);
  assert.doesNotMatch(handler, /signedURL|publicUrl/);
});

test('cutover tooling preserves Gemini IDs and never reindexes migrated documents', () => {
  const script = source('scripts/migrate-ai-domain-d1-r2.mjs');
  assert.match(script, /gemini_document_name/);
  assert.match(script, /gemini_operation_name/);
  assert.match(script, /content_hash/);
  assert.match(script, /R2 upload failed/);
  assert.doesNotMatch(script, /uploadToFileSearchStore|interactions\.create/);
});

test('persisted Gemini upload operations are rehydrated with the SDK operation type before polling', () => {
  const handler = source('cloudflare/worker/src/ai-documents.ts');
  assert.match(handler, /new UploadToFileSearchStoreOperation\(\)/);
  assert.match(handler, /persistedOperation\.name = String\(document\.gemini_operation_name\)/);
  assert.match(handler, /operations\.get\(\{ operation: persistedOperation \}\)/);
  assert.doesNotMatch(handler, /operations\.get\(\{ operation: \{ name:/);
});

test('public document viewing uses explicit policy gates and a controlled same-origin viewer', () => {
  const documents = source('cloudflare/worker/src/ai-documents.ts');
  const worker = source('cloudflare/worker/src/index.ts');
  const viewer = source('components/PublicAIDocumentViewer.tsx');
  const migration = source('cloudflare/migrations/0045_ai_document_public_view_policy.sql');
  assert.match(migration, /public_view_policy TEXT NOT NULL DEFAULT 'none'/);
  assert.match(migration, /official_source_url TEXT/);
  assert.match(documents, /public_view_policy <> 'none'/);
  assert.match(documents, /'local_rehost'/);
  assert.match(documents, /Content-Disposition': 'inline'/);
  assert.match(worker, /handlePublicAiDocumentMetadata/);
  assert.match(viewer, /\/api\/public\/v1\/ai-documents/);
  assert.doesNotMatch(viewer, /storage_path|AI_DOCUMENTS_BUCKET|Download|print\(/);
});
