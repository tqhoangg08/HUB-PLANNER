# PR #88 — per-page PDF quality/OCR and real-provider staging report

Date: 2026-10-10. Branch: `fix/ai-advisor-grounded-retrieval`. PR remains Draft.

**Local implementation/validation PASS; complete authenticated end-to-end acceptance BLOCKED. Answer completeness also FAILS one real benchmark. Do not merge or deploy on the basis of this report.** This supersedes the earlier report's statement that no ingestion changes or isolated provider indexes existed. It does not supersede the production no-write/no-deploy restriction.

## Proven causes and changes

| Old behavior, verified in source / actual PDF | Current implementation and evidence |
|---|---|
| `aiDocumentOcr.ts` accepted aggregate text >=120 characters, inspecting only the first five pages. The real conduct PDF has long but damaged Vietnamese text layers. | Every page is inspected. Replacement/private-use glyphs, mojibake, broken word mappings and full-page scans trigger OCR. A scan is not trusted merely because it already has a long OCR layer. Later bad pages cannot hide behind a good cover. |
| OCR concatenated text without page/layout identity; old rendering scale could produce low resolution. | Page-ordered Markdown with explicit page/source-kind/confidence/uncertainty metadata. Correct bounded render scale, Vietnamese+English OCR, native good pages retained, column whitespace preserved. |
| Full-page OCR lost associations between table labels and scores. Blank cells could produce noise; correctly read score ranges had insufficient confidence. | Geometric ruled-table detection, tight ink bounds and cell OCR. Empty cells stay empty. Low-confidence numeric cells get a tighter 2x crop; confidence can rise only if both readings agree on the original digits/order and the second exceeds the unchanged threshold. Different digits remain unreadable, never replace the first reading. No dictionary/LLM repair of Vietnamese, decision numbers, dates or clauses. |
| Gemini `indexing_status=completed` was treated as generic readiness. This production PDF had no canonical derived AI Search objects; AI Search's configured source includes `ai-search/text`, not `ai-documents`. | Hash-bound prepared-page upload, original retained, one Markdown object per page under the actual R2 source prefix, five server-authoritative filter metadata fields. Complete Markdown also goes to Gemini. Additive migration 0054 records independent Gemini/AI Search status. R2 put/Gemini completion is not AI Search completion. Every current-revision page must be complete, active and visibility/ID-authorized before readiness is persisted. |
| Removing Markdown page comments during provider chunking could lose displayable page numbers. | One-page `page-NNN.md` identities propagate through retrieval/evidence/citation. Older multi-page `part-NNN` keys and unrelated filenames cannot invent page numbers. |

Locations: `utils/aiDocumentOcr.ts` (`inspectPdfTextLayer`, `runPdfOcrInBrowser`); `utils/aiDocumentPageRecognition.ts`; `shared/ai-document-text-quality.ts`; `shared/ai-document-table-layout.ts`; `components/AdminAIDocuments.tsx` (`submit`, independent status display/polling); `cloudflare/worker/src/ai-document-ingestion.ts` (`parsePreparedPdfPages`, `storeDerivedPdfPages`, `isCompleteDerivedRevision`); `cloudflare/worker/src/ai-documents.ts` (`indexDocument`, `refreshAiSearchDocument`). Citation-only changes are in `ai-search-retrieval.ts`, `ai-advisor-evidence.ts`, `ai-advisor-v2-runtime.ts`, `ai-advisor.ts`.

New native/OCR pipeline identities invalidate artifact/revision hashes. NFC/LF normalization does not collapse spatial columns. Browser MIME-less `.pdf` files cannot skip preparation. Original SHA is recomputed server-side; client metadata, keys, revision and authority are not accepted. Existing admin authorization, legacy upload compatibility, source/public-view policies and original-only download remain.

## Actual PDF and OCR results

Public authorized source: [conduct regulation PDF](https://hotrosinhvienhub.id.vn/api/public/v1/ai-documents/4255f763-6dca-4152-8b2c-daa686103cc1/file).

- Original SHA256: `da56531f29c98a6545b9bcec69a2c78fddbdb6623a5c0cdac06f40682996ca25`; 14 pages; local original/renderings/artifacts outside Git.
- Visual reference: page 2 says 100 points; pages 2–3 give five groups with maxima 25/20/20/15/20. Page 14 excludes online mini games and requires competent-organization confirmation, authorized signature and the prescribed round stamp for outside-school evidence.
- **Decision identity remains UNVERIFIED.** The handwritten number is not safely established by OCR/independent authority; the NotebookLM 3529 fixture is not proof of this PDF's number. The earlier report's visual 3549 reading is not a verified legal identifier. Neither is substituted into the artifact.
- All 14 pages required OCR. Initial page-only OCR: 136 unreadable tokens, failed key table/mini-game coverage. First cell pass: 160 unreadable tokens. Tight-cell/numeric-confirmation pass: **68 unreadable tokens**, Markdown 34,557 bytes, 14 page markers. Critical score cells on pages 2–3 now preserve 25/20/20/15/20; blank continuation score cell stays blank. Mini-game/outside-evidence text is present.
- This is not a claim of perfect transcription: e.g. a nonnumeric OCR typo remains in a score-cell unit, and high confidence cannot prove every accent/word correct. No semantic correction was applied. Admin is warned about unreadable tokens before upload. Only this actual PDF was processed in full; the other ten PDFs have not been independently OCR-validated here.

## Isolation and actual providers

- Private AI Search test instances: `hub-advisor-pr88-ocr-staging` (development) and `hub-advisor-pr88-ocr-cells-staging` (final artifact), default namespace; public endpoints disabled. Production namespace/instance untouched.
- Test instances use managed Items storage, not the production R2 bucket. Only derived Markdown was uploaded, never original PDF. Five metadata fields match runtime authorization. Production embedding/chunk settings were copied read-only.
- Final AI Search revision: `staging-7135b9deb869e80eaf61f70c875cf345`. At final bounded inspection **13/14 items completed; page 13 still running**. Status is not manually rewritten or retried. Full-runtime benchmark refuses an incomplete index. Development index also had slow items; no claim that this provider delay is fixed.
- Two newly created isolated Gemini File Search stores contain only the respective test Markdown; neither is the configured production store. Final upload operation completed. Staging store embedding model is `models/gemini-embedding-001` (provider default), **not assumed production-equivalent**. Generator model remains the observed default `gemini-3.1-flash-lite`.
- These are real-provider **component/pipeline** tests from local Node, not an authenticated deployed staging Public Worker/UI. Local R2/SQLite integration tests prove code/storage contracts, not the live R2→AI Search connector. No safe authenticated staging app/session is configured; no Vite production proxy/chat writes were used.

## AI Search — real current runtime filters, unchanged topK/threshold

Requests use nested `ai_search_options.retrieval`, vector search, topK=3, threshold=0.4, authorized document-ID `$in`, active=true, visibility=public. Post-authorization retained 3/3 chunks on every probe.

| Original acceptance question | Retrieved page identities | Actual evidence outcome |
|---|---|---|
| 1 DRL table/latest | 4,10,5 | **FAIL recall:** 100-point table absent from these passages, despite page 2 already completed. |
| 4 five groups/maxima | 4,10,1 | **FAIL complete recall:** required table pages 2–3 not both present. Merely finding other numbers 15/20 is not proof of the five maxima. |
| 5 online mini game | 4,5,14 | **PASS retrieval component:** exact negative mini-game statement in page 14. |
| 6 outside-school evidence | 5,14,2 | **PASS retrieval component:** confirmation/signature/round-stamp requirements and correct document/page identity. |

Two additional staging query-expansion controls retrieved page 2, but still not page 3. They are **not** accepted as an eight-question benchmark or adopted as a runtime fix. Retrieval/query/model/topK/threshold were not changed to manufacture a pass. Correct authorization filtering and OCR coverage do not prove natural-language recall/completeness.

## Eight questions — final real Gemini File Search batch

One request per nonpersonal question, no retry; case 7 uses local zero-AI routing only. The current deterministic grounding runs on actual returned sources. All returned source IDs matched the authorized PDF; no synthetic passages were supplied.

| Case | HTTP / latency | Actual post-grounding quality assessment |
|---:|---|---|
| 1 table/latest | 200 / 6,806 ms | 100-point statement present with actual citations; legal latest status not established. **PARTIAL**, not legal-currentness PASS. |
| 2 document/decision/date | 200 / 9,412 ms | Source/title found; no guessed 3529/3549. Handwritten identity/date not sufficiently established. **PARTIAL / identity BLOCKED**. |
| 3 typo “điẻm” | 200 / 24,799 ms | 100-point conduct evidence rather than GPA or weekly exercise schedule. **Component PASS**, currentness remains unverified. |
| 4 all five groups/maxima | 200 / 28,056 ms | All five topical labels present but retrieved/post-grounding passages omit the 25-point maximum and do not support the complete requested distribution. **FAIL completeness**. Not counted as PASS merely because Gemini returned citations. |
| 5 online mini game | 200 / 25,220 ms | Exact negative source statement retained. **Component PASS**. |
| 6 outside-school proof | 200 / 8,515 ms | Source confirmation, signature and round stamp retained. **Component PASS**. |
| 7 personal current DRL score | 0 provider calls | Deterministic unavailable-personal-score classifier/fixture PASS; **real authenticated session BLOCKED**, not a live personal-data API test. |
| 8 latest/effective | 200 / 20,952 ms | Grounded extractive output qualifies that current legal effect has not been independently confirmed. **SAFE PARTIAL**, legal currency NOT VERIFIED. |

Final Gemini document batch: 7 calls, 7 HTTP 200; p50 20,952 ms, max/nearest-rank p95 28,056 ms. This is not NotebookLM parity or full application acceptance.

### Gemini timeout is separate and NOT fixed

- Earlier development Markdown batch: cases 1–6 HTTP200 (7,497/6,469/8,061/6,775/6,394/16,874 ms); case 8 timed out at 30,013 ms. Same 30-second budget, no retry.
- Independent plain-generation control without File Search: HTTP200 at 17,919 ms. Earlier report's document/plain timeouts remain real observations.
- Final batch's success shows timeout is intermittent, not proof of a repair. Cause is not isolated to OCR, File Search, key/project, model or network. Several successful final calls are close to the deadline. No production timeout, model, key, retry or fallback settings changed.

### Calls/cost accounting for this OCR stage

- 13 AI Search requests: 7 development partial-index runtime cases, 4 final natural-query retrieval-only probes, 2 expansion controls. The first 7 are not final acceptance results.
- 22 generation requests: 7 development Workers AI, 14 Gemini File Search across two artifact batches, 1 independent plain Gemini control. Personal-score cases made no model calls. No automatic retry/second AI verifier.
- 42 staged AI Search page-upload requests across development/final artifacts, 2 isolated Gemini derivative uploads. Original PDF was not uploaded. Embedding/internal-tool/token/currency cost totals **NOT MEASURED**.

## Validation and production boundary

- Advisor targeted: **185/185 PASS**, including 12 new pipeline tests and locator regression.
- Final full suite: **573/573 PASS**, zero failures/cancellations/skips. The known D1 event-storage 503 baseline did not reproduce.
- Final `npm run typecheck`, `npm run cf:typecheck`, `npm run build`, `git diff --check`: **PASS**. Build retains existing outdated Browserslist/large-chunk warnings, not errors.
- Real local R2 binding stores independent page Markdown/hash/filter metadata. Local SQLite applies 0054 and persists current AI Search readiness independently of Gemini failure. Invalid hashes/order/pipeline/authorization/readiness fail closed. Native+OCR, Unicode, table geometry/blank cells, numeric disagreement and original download compatibility are covered.
- Browser interaction/authenticated staging upload→Advisor UI: **BLOCKED / NOT RUN**, not substituted with source-regex tests or the existing browser-bridge suite.
- Reconfirmed production read-only: Public `9bcf3e62-00db-4794-8020-4c4891929896` at100%, mode=canary, percent=7, homepage200, anonymous Advisor401. No production/Auth deployment, production D1/R2/index writes, production reindex/delete/chat, main merge/push or unrelated feature changes. Migration0054 remains local code only.
- No original PDF, generated Markdown, trained data, provider payload, store-state file, secret, PII or local AI plan is committed.

Changed-file scope: the three OCR/layout/quality modules plus `utils/aiDocumentOcr.ts`; Admin AI Documents UI; Worker ingestion/documents/index identity and citation propagation (evidence/runtime/advisor/retrieval); additive migration0054; focused ingestion/client/page-pipeline/retrieval tests; the advisor test script; three local staging diagnostic tools; this report and the earlier audit's historical-status notice. No unrelated modules or dependency changes.

## Remaining gates / rollback

1. AI Search item13 completion and natural-language recall/completeness for table pages2–3 remain **BLOCKED/FAIL**. Do not assert the complete index is ready or that OCR alone fixes retrieval.
2. A safe isolated staging app/session is needed to test the actual Admin upload API, D1/R2 connector, provider status polling and authenticated Advisor/UI. The harness intentionally does not borrow production sessions or write production chat records.
3. OCR is probabilistic. The68 remaining unreadable tokens and handwriting require owner review; confidence is not proof of correctness. Legal identity/currency requires verified authoritative metadata, not the upload date or this test fixture.
4. Provider latency/timeout and Gemini retrieval of all group maxima need separate acceptance evidence. No timeout/model/retry tuning is smuggled into the OCR change.
5. New upload path is automatic per-page browser preparation followed by provider indexing. The browser must remain open during local OCR;20MB/40-page/1MB text bounds fail explicitly. R2-backed AI Search indexing is asynchronous; existing production documents are **not** automatically reprocessed.
6. Future release requires additive migration0054 before the approved Public code, preserved canary7%/bindings/observability, and explicit release approval. No Auth deployment. This PR stays Draft. Rollback now requires nothing (production unchanged); future approved release can normally revert code/route Public traffic to a freshly reconfirmed stable version. Do not reset/force-push or delete original documents.

References checked: [Cloudflare metadata](https://developers.cloudflare.com/ai-search/configuration/indexing/metadata/), [Items REST](https://developers.cloudflare.com/ai-search/api/items/rest-api/), [Items Workers binding](https://developers.cloudflare.com/ai-search/api/items/workers-binding/), [Gemini File Search](https://ai.google.dev/gemini-api/docs/file-search). Cloudflare PDF-to-Markdown text extraction is not assumed to be OCR for corrupt text layers.
