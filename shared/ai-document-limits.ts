/** Count of index segments, not invented physical pages. Retrieval budgets stay unchanged. */
export const AI_DOCUMENT_MAX_SEGMENTS = 128;
export const AI_DOCUMENT_MAX_TEXT_BYTES = 1024 * 1024;
export const AI_DOCUMENT_RECEIPTS_PER_PAGE = 50;
export function getAiDocumentSegmentCount(document:{index_segment_count?:unknown;ocr_page_count?:unknown}):number|null {
  const modern=document.index_segment_count!==null&&document.index_segment_count!==undefined;
  const count=modern?document.index_segment_count:document.ocr_page_count;
  return typeof count==='number'&&Number.isInteger(count)&&count>=1&&count<=(modern?AI_DOCUMENT_MAX_SEGMENTS:40)?count:null;
}
