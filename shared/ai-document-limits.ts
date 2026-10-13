/** One bounded revision, not physical Word pagination. 128 page/unit objects
 * => at most 256 R2 put/head calls, 3 receipt pages (50 each), <1 MiB text.
 * Retrieval keeps its independent 3-read / 8k-character hydration budget. */
export const AI_DOCUMENT_MAX_SEGMENTS = 128;
export const AI_DOCUMENT_MAX_TEXT_BYTES = 1024 * 1024;
export const AI_DOCUMENT_RECEIPTS_PER_PAGE = 50;
export const AI_DOCUMENT_OCR_BATCH_PAGES = 8;
export const AI_DOCUMENT_OCR_PAGE_TIMEOUT_MS = 120_000;
export const AI_DOCUMENT_OCR_INIT_TIMEOUT_MS = 60_000;
