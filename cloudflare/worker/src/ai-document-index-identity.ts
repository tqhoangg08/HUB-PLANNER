/**
 * D1 contract for the exact derived representation supplied to a retrieval
 * index. Original-file identity alone is intentionally insufficient: changing
 * a deterministic extraction/OCR pipeline changes searchable evidence.
 */
export type DerivedIndexSourceKind = 'native_text' | 'ocr' | 'legacy';

export type AiDocumentIndexIdentity = {
  documentId: string;
  sourceVersion: string | number;
  sourceContentHash: string;
  indexSourceKind: string;
  derivedSourceKind: DerivedIndexSourceKind;
  extractionPipelineVersion: string;
  derivedContentHash: string;
  indexingStatus: string;
};

/** Production page-aware native text representation (not the original PDF). */
export const NATIVE_TEXT_EXTRACTION_PIPELINE_VERSION = 'native-page-text-v1';
export const OCR_PAGE_MARKDOWN_PIPELINE_VERSION = 'ocr-page-markdown-v2-pinned';

const bounded = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

/** Stable serialization for cache/index revision construction; not a hash by itself. */
export const serializeAiDocumentIndexIdentity = (identity: AiDocumentIndexIdentity) => [
  bounded(identity.documentId, 64),
  bounded(identity.sourceVersion, 64),
  bounded(identity.sourceContentHash, 64),
  bounded(identity.indexSourceKind, 64),
  bounded(identity.derivedSourceKind, 32),
  bounded(identity.extractionPipelineVersion, 128),
  bounded(identity.derivedContentHash, 64),
  bounded(identity.indexingStatus, 64),
].join('|');
