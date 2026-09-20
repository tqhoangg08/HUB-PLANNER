import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AiDocumentOcrError, assertPdfOcrPageLimit, hasUsablePdfText, AI_DOCUMENT_OCR_MAX_PAGES } from '../utils/aiDocumentOcr.ts';
import { sha256AiDocumentBlob } from '../cloudflare/worker/src/ai-documents.ts';

const source = (path: string) => readFileSync(path, 'utf8');

test('searchable PDFs skip OCR while image-only PDFs take the client OCR path', () => {
  assert.equal(hasUsablePdfText(['Đây là lớp văn bản có thể tìm kiếm. '.repeat(8)]), true);
  assert.equal(hasUsablePdfText(['  ', 'x']), false);
  assert.equal(AI_DOCUMENT_OCR_MAX_PAGES, 40);
});

test('page limit applies only after a PDF needs OCR', () => {
  assert.doesNotThrow(() => assertPdfOcrPageLimit(80, false));
  assert.throws(() => assertPdfOcrPageLimit(80, true), AiDocumentOcrError);
  assert.doesNotThrow(() => assertPdfOcrPageLimit(40, true));
});

test('OCR derivative hash belongs to extracted text, not the original PDF', async () => {
  const pdfHash = await sha256AiDocumentBlob(new Blob(['%PDF-1.7 original bytes']));
  const textHash = await sha256AiDocumentBlob(new Blob(['Văn bản OCR tiếng Việt']));
  assert.notEqual(pdfHash, textHash);
  assert.equal(textHash.length, 64);
});

test('client OCR is lazy, bounded, cancellable and uses Vietnamese plus English', () => {
  const client = source('utils/aiDocumentOcr.ts');
  const ui = source('components/AdminAIDocuments.tsx');
  assert.match(client, /import\('tesseract\.js'\)/);
  assert.match(client, /createWorker\('vie\+eng'\)/);
  assert.match(client, /AbortSignal/);
  assert.match(client, /AI_DOCUMENT_OCR_MAX_PAGES/);
  assert.match(ui, /inspectPdfTextLayer/);
  assert.match(ui, /runPdfOcrInBrowser/);
  assert.match(ui, /Hủy OCR/);
  assert.doesNotMatch(client + ui, /AI_OCR_SERVICE|AI_DOCUMENT_INGEST_QUEUE|hub-planner-ai-document-ingest/);
});

test('OCR migration and upload route retain original PDF while Gemini indexes a text derivative', () => {
  const migration = source('cloudflare/migrations/0044_ai_document_ocr_ingestion.sql');
  const handler = source('cloudflare/worker/src/ai-documents.ts');
  const config = source('cloudflare/wrangler.jsonc');
  assert.match(migration, /ocr_text_path/);
  assert.match(migration, /index_source_kind/);
  assert.match(handler, /ai-documents\/\$\{id\}\/extracted\.txt/);
  assert.match(handler, /mimeType: sourceKind === 'ocr_text' \? 'text\/plain'/);
  assert.match(handler, /document\.ocr_text_path \|\| document\.storage_path/);
  assert.match(handler, /const derivativeHash = await sha256AiDocumentBlob\(derivative\)/);
  assert.match(handler, /aiDocumentIndexingFailurePatch\(Boolean\(ocr\), ocrDerivativeStored\)/);
  assert.match(handler, /document\.storage_path/);
  assert.doesNotMatch(config, /AI_DOCUMENT_INGEST_QUEUE|hub-planner-ai-document-ingest/);
  assert.match(config, /hub-planner-push-events/);
});
