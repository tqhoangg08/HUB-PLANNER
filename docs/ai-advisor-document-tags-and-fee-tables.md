# Document tags and bounded tuition answers

Local branch based on main `7fa10b992fa22df146d7bb3c61037a274e042794`
(after PR #96). No production data, index, flags or release guards are changed.

## Tuition table repair

The single-major question previously missed the full cohort/major/program tuple
selector. The generated paraphrase then fell back to a 1,200-character source
window, flattening multiple unrelated table rows in the chat.

The default V2 path now identifies a major from the question, independently of
completeness/Cloudflare-first flags. A deterministic selector returns only exact
major rows with their own proven table header, cohort, program and fee units.
Each table/source starts fresh; incomplete headers, missing scope, conflicting
amounts or competing documents cause a clarification request, not guessed fees.
At most four labeled alternatives (up to two fee columns each) are displayed.
Year labels come only from literal source context. Quotes/excerpts keep original
bytes; citations continue through the existing source/revision validators.
The general extractive fallback no longer dumps long fee tables. Mobile GFM
tables stay inside a scrollable container, not the page viewport.

## Tags: metadata, not evidence

`0057_ai_document_tags.sql` is additive and has **not** been applied live.
It depends on the existing `ai_documents` and `ai_text_documents` tables.
It stores at most twelve validated tags, actor and timestamp. A row belongs to
exactly one file document or Text-first logical root (foreign keys and unique
indexes). Text-first revisions therefore inherit tags without copying mutable
tags into immutable source revisions or changing publication/index receipts.

Both Admin interfaces use the shared chip editor with an explicit **Lưu tag**
metadata-only action. File uploads can be tagged after upload; a new Text-first
document can be tagged after its first draft save. No provider call/reindex,
content change, publication or revision increment occurs on a tag save.
Students/auditors cannot manage tags. Same-origin checks and backend Admin
identity remain mandatory. Names/tags can be searched in the Admin lists.

Tag matching folds Vietnamese accents/case/spacing and a small documented family
of search aliases (mức thu/học lệ phí/tuition; ĐRL/điểm rèn luyện; phiếu/bảng ĐRL).
Matching tags augment query terms and rank authorized results; they do not prove
amounts, dates, program applicability, legal currency or document authority.
All authorized IDs remain in the normal search filter, including multi-topic
questions. An empty/irrelevant hinted result falls back to the original query,
within three total Search calls and the shared 30-second hint deadline. No new
R2 reads or generation quota is added. Completeness keeps its existing queries
and budgets, with tag-aware metadata ranking. Edited tags participate in the
revision fingerprint for both retrieval and answer caches, so old routing results
cannot be reused by the next request.

## Review/release constraints

Focused regressions use synthetic tables and real local SQLite migrations.
Local browser checks cover chip add/remove/save and tables at 1280px/390px.
They are not live-provider or production acceptance. No source tuition value
has been edited. Ambiguous/flattened tables intentionally ask for clarification.

Before a future separately approved release: apply only migration 0057 after
schema/ledger/backup review, then deploy the exact CI-approved Public SHA.
Without the additive table, reads preserve legacy behavior with empty tags;
metadata writes fail safely with an availability error. No auto-migration is
introduced. Rollback keeps the additive table and tags; older Workers ignore
them. Do not drop data or change flags to make a test pass.

## Local validation

- New regressions: 17/17; combined focused regressions: 121/121.
- Full suite: 886/886 passed, zero failures or skipped tests.
- TypeScript, Cloudflare typecheck, frontend build and diff-check passed.
- Local browser checks: 1280px and 390px passed (tag editing and contained tables).
- No live provider/production acceptance or remote CI was run for this branch;
  pushing, migration application and deployment remain separate owner actions.
