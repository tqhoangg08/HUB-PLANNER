# Admin Text-first MVP — review only, no deployment approval

## Scope and reuse

This branch starts from main `be7b6738138a190230273af90d585af38c18be6a`.
PR #92 stays Draft; its parser/OCR changes and interrupted work are not imported.
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

## Schema and rollout gate (plan only)

`0055_ai_document_index_segment_count.sql` adds a nullable INTEGER CHECK 1..128.
`0044` and `0054` are untouched. Legacy rows/counts remain unchanged. Long text
revisions set `index_segment_count=N`, `ocr_page_count=NULL`; ≤40 also keep the
legacy count. `0056_ai_text_document_revisions.sql` adds draft/revision tables and
the atomic publication source guard. No rebuild, backfill or automatic migration.

Before any staging write, obtain separate owner approval:

1. Verify live isolation of staging D1/R2/AI Search and the exact commit/config.
2. Backup staging outside Git; verify hash, schema, counts and row digests, record
   recovery metadata privately. No backup/migration has been run by this task.
3. Check 0032/0044/0045/0049/0054 schema assumptions, absence/presence of 0055/0056
   and migration ledger. Partial/drifted state means STOP, not raw ALTER repair.
4. Isolated migration directory/config: only approved 0055 and 0056, staging UUID.
   Pending list must match exactly. Apply with D1 ledger, not all repo pending.
5. Check old data/schema unchanged; 52/79/128 counts accepted; out-of-range values
   rejected; new tables empty. Then deploy only the approved staging code.
6. Use one synthetic document to accept preview → draft → all receipts → explicit
   publication → real Search/citation; edit a new revision, verify old is retained.

Production requires separate migration/deployment/document-publication approvals.
No production, Auth, provider tests, live flags, existing documents or PR merges
are changed here. Upload files remains available with its existing behavior.

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

Local SQLite/binding doubles and local Chrome are regression evidence only.
Cloudflare binding upload capability, real provider receipts/citations, staging
latency/cost and production usability remain NOT VERIFIED until separately approved.
