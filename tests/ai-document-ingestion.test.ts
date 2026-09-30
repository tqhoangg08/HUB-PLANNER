import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprintDocumentRevisions } from '../cloudflare/worker/src/ai-advisor-cache.ts';
import {
  NATIVE_DERIVED_TEXT_PIPELINE,
  OCR_DERIVED_TEXT_PIPELINE,
  assemblePageAwareMarkdown,
  assessNativePageText,
  buildDerivedObjectKey,
  buildDerivedIdentityPatch,
  buildEffectiveIndexRevision,
  buildIngestionRetryKey,
  buildServerDerivedMetadata,
  isAuthorizedCurrentDerivedDocument,
  planMixedPdfExtraction,
  selectSingleActiveDerivedRevision,
  splitDerivedMarkdownByPage,
  verifyPreparedDerivedArtifact,
} from '../cloudflare/worker/src/ai-document-ingestion.ts';
import { validateEvidenceAbstention } from '../cloudflare/worker/src/ai-advisor-evidence.ts';

const DOCUMENT_ID = 'b625ad82-ec5c-4380-9a74-f637c580989c';
const SOURCE_HASH = 'a'.repeat(64);
const DERIVED_HASH = 'b'.repeat(64);

const identity = (overrides: Record<string, unknown> = {}) => ({
  documentId: DOCUMENT_ID,
  sourceVersion: 2,
  sourceContentHash: SOURCE_HASH,
  indexSourceKind: 'original',
  derivedSourceKind: 'native_text' as const,
  extractionPipelineVersion: NATIVE_DERIVED_TEXT_PIPELINE,
  derivedContentHash: DERIVED_HASH,
  indexingStatus: 'completed',
  ...overrides,
});

const cacheRecord = (overrides: Record<string, unknown> = {}) => ({
  id: DOCUMENT_ID,
  version: 2,
  contentHash: SOURCE_HASH,
  indexSourceKind: 'original',
  derivedSourceKind: 'native_text',
  extractionPipelineVersion: NATIVE_DERIVED_TEXT_PIPELINE,
  derivedContentHash: DERIVED_HASH,
  indexingStatus: 'completed',
  ...overrides,
});

test('native and OCR document identities are deterministic and yield different effective revisions', async () => {
  const native = identity();
  const nativeRevisionA = await buildEffectiveIndexRevision(native);
  const nativeRevisionB = await buildEffectiveIndexRevision(native);
  const ocr = identity({
    derivedSourceKind: 'ocr',
    extractionPipelineVersion: OCR_DERIVED_TEXT_PIPELINE,
  });
  assert.equal(nativeRevisionA, nativeRevisionB);
  assert.notEqual(nativeRevisionA, await buildEffectiveIndexRevision(ocr));
  assert.equal(await buildIngestionRetryKey(native), await buildIngestionRetryKey(native));
  assert.notEqual(
    buildDerivedObjectKey(DOCUMENT_ID, nativeRevisionA, 1),
    buildDerivedObjectKey(DOCUMENT_ID, nativeRevisionA, 2),
  );
});

test('derived content, pipeline version, and source revision invalidate deterministic cache identity', async () => {
  const baseline = await fingerprintDocumentRevisions([cacheRecord()]);
  assert.notEqual(baseline, await fingerprintDocumentRevisions([cacheRecord({ derivedContentHash: 'c'.repeat(64) })]));
  assert.notEqual(baseline, await fingerprintDocumentRevisions([cacheRecord({ extractionPipelineVersion: 'native-page-text-v2' })]));
  assert.notEqual(baseline, await fingerprintDocumentRevisions([cacheRecord({ version: 3 })]));
  assert.equal(baseline, await fingerprintDocumentRevisions([cacheRecord()]));
});

test('mixed-page plan identifies only clearly corrupted native pages and assembles deterministic page order', () => {
  const plan = planMixedPdfExtraction([
    { pageNumber: 2, text: 'Điều 2. Sinh viên phải hoàn thành học phần.' },
    { pageNumber: 1, text: 'Trang bìa' },
    { pageNumber: 3, text: 'Lỗi \uFFFD glyph mapping' },
  ]);
  assert.deepEqual(plan.map((entry) => [entry.pageNumber, entry.native.classification]), [
    [1, 'NATIVE_GOOD'], [2, 'NATIVE_GOOD'], [3, 'OCR_REQUIRED'],
  ]);
  assert.equal(assessNativePageText('Điều 10: 75%').classification, 'NATIVE_GOOD');
  const markdown = assemblePageAwareMarkdown([
    { pageNumber: 1, sourceKind: 'native_text', text: 'Nội dung trang một' },
    { pageNumber: 2, sourceKind: 'ocr', text: 'Điều 2: 75%' },
  ]);
  assert.match(markdown, /<!-- page: 1 -->/);
  assert.match(markdown, /<!-- page: 2 -->/);
  assert.ok(markdown.indexOf('trang một') < markdown.indexOf('Điều 2'));
  assert.equal(markdown, assemblePageAwareMarkdown([
    { pageNumber: 1, sourceKind: 'native_text', text: 'Nội dung trang một' },
    { pageNumber: 2, sourceKind: 'ocr', text: 'Điều 2: 75%' },
  ]));
});

test('multipart policy splits only on pages and refuses a single oversized page', () => {
  const pages = [
    { pageNumber: 1, sourceKind: 'native_text' as const, text: 'A'.repeat(20) },
    { pageNumber: 2, sourceKind: 'native_text' as const, text: 'B'.repeat(20) },
  ];
  const parts = splitDerivedMarkdownByPage(pages, 50);
  assert.deepEqual(parts.map((part) => [part.partNumber, part.pageStart, part.pageEnd]), [[1, 1, 1], [2, 2, 2]]);
  assert.throws(() => splitDerivedMarkdownByPage([{ pageNumber: 1, sourceKind: 'ocr', text: 'x'.repeat(100) }], 20), /split semantically/);
});

test('only one active completed derived revision is selectable and stale or unauthorized documents stay filtered', () => {
  const active = {
    documentId: DOCUMENT_ID, effectiveIndexRevision: 'v2-current', active: true, indexingStatus: 'completed', deletedAt: null,
  };
  const stale = {
    documentId: DOCUMENT_ID, effectiveIndexRevision: 'v1-stale', active: false, indexingStatus: 'completed', deletedAt: null,
  };
  assert.equal(selectSingleActiveDerivedRevision([stale, active])?.effectiveIndexRevision, 'v2-current');
  assert.equal(isAuthorizedCurrentDerivedDocument(active, new Set([DOCUMENT_ID])), true);
  assert.equal(isAuthorizedCurrentDerivedDocument(stale, new Set([DOCUMENT_ID])), false);
  assert.equal(isAuthorizedCurrentDerivedDocument(active, new Set<string>()), false);
  assert.throws(() => selectSingleActiveDerivedRevision([active, { ...active, effectiveIndexRevision: 'v3-duplicate' }]), /More than one active/);
});

test('derived R2 metadata is built solely from authoritative values, not client payload metadata', () => {
  const metadata = buildServerDerivedMetadata({
    documentId: DOCUMENT_ID,
    category: 'training_regulation',
    visibility: 'public',
    revision: 'v2-identity',
    active: true,
  });
  assert.deepEqual(metadata, {
    document_id: DOCUMENT_ID,
    category: 'training_regulation',
    visibility: 'public',
    revision: 'v2-identity',
    active: 'true',
  });
  assert.equal(Object.keys(metadata).length, 5);
});

test('a prepared derived artifact is hash-bound to the authoritative original and maps only identity fields to D1', async () => {
  const markdown = '<!-- page: 1 -->\n\nĐiều 1: 75%';
  const derivedHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(markdown));
  const derivedHashHex = Array.from(new Uint8Array(derivedHash), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const verified = await verifyPreparedDerivedArtifact({
    declaredSourceContentHash: SOURCE_HASH,
    markdown,
    declaredDerivedContentHash: derivedHashHex,
    sourceKind: 'ocr',
    extractionPipelineVersion: OCR_DERIVED_TEXT_PIPELINE,
  }, SOURCE_HASH);
  assert.equal(verified.derivedContentHash, derivedHashHex);
  await assert.rejects(() => verifyPreparedDerivedArtifact({
    declaredSourceContentHash: 'c'.repeat(64), markdown, declaredDerivedContentHash: derivedHashHex, sourceKind: 'ocr', extractionPipelineVersion: OCR_DERIVED_TEXT_PIPELINE,
  }, SOURCE_HASH), /source hash/);
  assert.deepEqual(buildDerivedIdentityPatch(identity({ derivedSourceKind: 'ocr', extractionPipelineVersion: OCR_DERIVED_TEXT_PIPELINE })), {
    derived_source_kind: 'ocr', extraction_pipeline_version: OCR_DERIVED_TEXT_PIPELINE, derived_content_hash: DERIVED_HASH,
  });
});

test('evidence abstention requires server-authorized source citations', () => {
  const request = { question: 'Quy chế?', evidence: [{ sourceId: 'S1', documentId: DOCUMENT_ID, revision: 'v2', snippet: 'Điều 1' }] };
  assert.deepEqual(validateEvidenceAbstention(request, { text: 'Có căn cứ.', citedSourceIds: ['S1'] }), { kind: 'ANSWER', citedSourceIds: ['S1'] });
  assert.deepEqual(validateEvidenceAbstention(request, { text: 'Không có căn cứ.', citedSourceIds: ['untrusted'] }), { kind: 'INSUFFICIENT_EVIDENCE' });
});
