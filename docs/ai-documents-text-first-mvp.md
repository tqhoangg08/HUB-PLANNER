# Admin Text-first — behavior and maintenance

## Scope and reuse

PR #93 is merged and Text-first is deployed. PR #92's separate parser/OCR work
is not imported. For the last verified serving snapshot and release caveats,
see [production release notes](text-first-production-release.md).
Reuse: Better Auth Admin identity, private API, existing R2 binding, canonical
AI Search per-segment keys, revision identity, receipt authorization and grounded
citations. No OCR, Gemini upload, new provider, background infrastructure,
retrieval quota increase or production flags are required by this MVP.

## Admin flow

1. AI Documents → **Tạo tài liệu**. Name, category, year, intended scope/program.
   Default intended scope is Admin. Scope is not proof of official authority or
   legal effectiveness; Admin must verify source/version/permission themselves.
2. Paste plain text or Markdown, including pipe/TSV tables. Preview is safe GFM
   and literal TSV tables; HTML, images and external preview links are disabled.
3. **Lưu bản nháp** stores the exact UTF-8 source in a new private, non-overwriting
   R2 object. Metadata is in `ai_text_documents`/`ai_text_revisions`, not the
   Advisor's `ai_documents` candidate set. Each save appends a revision, with CAS
   on the editing sequence. No provider is called on draft save/preview.
4. **Lưu và lập chỉ mục AI** materializes an unpublished `ai_documents` row and
   indexes at most 8 segments per request. The UI executes at most 16 batches.
   R2 source/hash and deterministic revision are checked. Failed uploads retain
   source/cursor and the previous live revision; confirmed earlier segments are
   not uploaded again. Provider timeouts with unknown in-flight state do not
   authorize a forced unlock, deletion or automatic duplicate retry.
5. **Kiểm tra đủ index** verifies canonical keys + document ID + revision + scope
   + active + actual completed status. At most 3 pages of 50 receipts. Pending,
   missing, wrong metadata or an API outage cannot become completed.
6. A separate confirmation and **Công bố revision đã kiểm tra** recheck receipts
   and source. Only then does the new row become `indexing_status=completed`.
   An atomic D1 batch/trigger guards publication. Updating an existing Text-first
   document withdraws only its own prior revision from retrieval; original bytes,
   old metadata and old index objects remain retained. No other document is
   silently replaced. Program/admin scope remains excluded from the currently
   public-only Advisor policy even after publication.

## Bounds and citations

- Original ≤1 MiB; ≤128 segments; each atomic block ≤6,000 characters.
- Split at actual heading/paragraph boundaries; keep pipe/TSV tables and fenced
  blocks intact. An oversized table/paragraph is rejected with an actionable
  validation error, not cut/truncated/reconstructed by AI. This is an explicit
  MVP limitation, not support for arbitrary rich-text/merged HTML tables.
- Original text/accents/digits/newlines are preserved in R2. Derived pieces are
  lossless slices with a server-owned `text_unit` envelope only.
- Native text uses the existing internal unpaginated locator family. No physical
  page is inferred from segment number. Sources use the D1 title and only actual
  article/clause/section/table text from authenticated evidence. No decision
  number or legal effectiveness is manufactured. Grounding validators unchanged.
- Existing retrieval remains bounded at 3 R2 hydration reads, 8k characters /
  32k bytes per read; Search/generation/cache/quota limits unchanged.

## Schema and change gates

`0055_ai_document_index_segment_count.sql` adds a nullable INTEGER CHECK 1..128.
`0044` and `0054` are untouched. Legacy rows/counts remain unchanged. Long text
revisions set `index_segment_count=N`, `ocr_page_count=NULL`; ≤40 also keep the
legacy count. `0056_ai_text_document_revisions.sql` adds draft/revision tables and
the atomic publication source guard. No rebuild, backfill or automatic migration.

Production migrations 0055/0056 were applied during the approved PR #93 release;
do not replay them. Future changes require current schema/ledger preflight and
separate approval. Partial/drifted state means STOP, not raw ALTER repair.
Staging writes still require verified D1/R2/AI Search isolation and owner approval.
Deployment never authorizes publication of a document. File upload remains
available with its existing behavior.

## Rollback / remaining limits

Before publication, close the editor or keep the revision unpublished; old live
source continues serving. Worker rollback does not require dropping additive
columns/tables. Because the old Worker does not understand Text-first publishing,
rollback **after** publication needs a separately approved D1 pointer/readiness
plan to restore the previous revision; no automatic restore is implemented.
Retained objects/rows are not swept by file deletion. Failed saves can leave an
unreferenced newly allocated R2 object; operator-reviewed cleanup is deferred,
never deleting originals. A stuck `working` request requires read-only diagnosis
and explicit recovery approval. Existing identical active content hashes are
rejected (including metadata-only edits with identical body), preventing duplicate
sources. The historical file editor cannot delete/retry/publish Text-first rows.

Regression coverage lives in `tests/ai-text-documents.test.ts` and
`tests/ai-advisor-tuition-condition.test.ts`. Local tests do not establish live
provider/UI acceptance. The bounded published-source retrieval repair and its
verified evidence are described in [retrieval notes](text-first-tuition-retrieval-fix.md).
