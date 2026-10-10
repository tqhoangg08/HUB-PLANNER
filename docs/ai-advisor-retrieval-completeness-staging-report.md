# PR #88 — retrieval completeness and authenticated staging acceptance

Date: 2026-10-10. Base: `15127ae`. Branch: `fix/ai-advisor-grounded-retrieval`.

**Retrieval/table completeness repaired on staging; overall eight-question quality gate NOT MET. Keep Draft. No production or Auth Worker deployment, merge, production reprocess, or production writes.** This report supersedes the previous report's page13-pending and authenticated-staging-unavailable checkpoints, not its historical observations.

## Verified causes, not assumptions

1. The previous isolated index now reports **14/14 completed**, including page13, under the expected current revision/active/visibility metadata. An initial status request encountered expired local Cloudflare OAuth; refreshing CLI authentication restored observation. It did not change index state. Page13 completed asynchronously; the cause of its earlier processing delay is **not independently established**. No status was forced or item reuploaded.
2. Real vector topK3 retrieval returned pages4/10/5 for the table question and4/10/1 for the five-group question, not both table pages2–3. Increasing topK alone still missed page3. OCR presence and indexing completion do not prove recall.
3. The actual authenticated app exposed a **revision mapping error**: D1 document version `1` was compared against the hash-derived AI Search item revision. Authorized results were rejected as `ALL_RESULTS_DROPPED`. `selectAdvisorDocumentCandidatesWithIndexIdentity` now reads current `ai_search_revision`/`ai_search_status`; V2 receives that revision and excludes noncompleted derived indexes. Numeric version remains the legacy fallback on older schemas. A SQLite + real handler regression covers both schemas and current-revision postauthorization. Permission filters were not bypassed.
4. A second app-level issue:512-token AI Search chunks split a single Markdown page. The retrieved page3 fragment stopped before group5, or contained group5 without its page header. Selecting three high-scoring chunks confused fragment presence with complete table coverage. The staging policy prioritizes literal score-table fragments, deduplicates page identities, and reads complete **already-retrieved, authorized** page Markdown from isolated R2. It does not assume that a particular page is the answer, invent a missing row, or fetch every document.
5. The generator's1600-character per-source presentation could cut table tails. Physical conduct-table inputs now receive up to2200 characters inside the unchanged6000-character aggregate budget. Other inputs retain1600. Model, temperature0, seed42,300-token Workers AI output,25-second deadline,240-character exact support quotes and no retry remain unchanged.
6. Backend already merged page numbers per document, but source-card deduplication/display kept only the first page. The UI now preserves validated `pageNumbers` and displays **Trang2,3** in one authorized source card. No duplicate source IDs or fabricated page locations.
7. Screenshot review exposed a Unicode locator bug: JavaScript `\b` treated “điểm rèn” as the legal point “điểm r”; a bare paragraph before the named article was also incorrectly attached to that article. Unicode letter boundaries and article-local numbered parsing now prevent those invented locators. Actual final UI source metadata contains `Chương II, Điều 5`, not the spurious point/clause.

Code locations: `cloudflare/worker/src/ai-advisor.ts`, `ai-search-retrieval.ts`, `ai-search-completeness-staging.ts`, `ai-advisor-v2-runtime.ts`, `ai-advisor-workers-ai.ts`, `ai-advisor-table-evidence.ts`; `utils/aiDocumentSources.ts`, `components/AIDocumentSources.tsx`.

## Actual PDF and isolation

Source: the existing [public conduct PDF](https://hotrosinhvienhub.id.vn/api/public/v1/ai-documents/4255f763-6dca-4152-8b2c-daa686103cc1/file). SHA256 `da56531f29c98a6545b9bcec69a2c78fddbdb6623a5c0cdac06f40682996ca25`,14 pages. The source file, derived Markdown, screenshots, answers, provider payloads and test credentials are outside the commit set.

- Original PDF pages2–3 visually establish100 points and five maxima25/20/20/15/20. Page14 supplies the online-mini-game exclusion and outside-school confirmation/signature/stamp requirements. Handwritten decision number/date and legal currentness are **UNVERIFIED**;3529/3549 are not inserted as facts.
- New isolated app: `hub-advisor-pr88-app-staging`, separate D1, R2, private AI Search Items instance and Gemini test store; no production bindings, routes, queues, schedules or production sessions. The source PDF was uploaded only to **isolated staging R2**, never committed or put into production.
- Staging URL: https://hub-advisor-pr88-app-staging.tqhoangg2.workers.dev. Existing Better Auth implementation is reused inline in the standalone staging Public Worker with one synthetic verified `.invalid` test account, independent session cookies, existing origin/CSRF checks, no OAuth/signup/reset/email delivery. No Auth Worker was deployed. Credentials remain local and are not in this report.
- Real `AdminAIDocuments` browser upload performed OCR14/14 pages, **277432ms**,65 uncertain tokens,0 JavaScript errors. The actual OCR warning was acknowledged; uncertainty was not suppressed or legally interpreted. Upload initially returned `derived_ready`, Gemini `processing`; readiness was not assumed. Subsequent normal provider checks established **14/14 completed**, Gemini completed. Original and page objects exist in isolated R2 with D1 hash/revision metadata.
- Upload runner initially stopped on the real uncertainty dialog before any document write; the harness was corrected to acknowledge it explicitly. The successful upload was not duplicated. A first benchmark attempt stopped before questions while index processing was incomplete.
- Eight questions use real UI/API/Better Auth and real Workers AI, each in a fresh conversation. Synthetic admin session is used, not a production/student account. No private student score is available in this account.

## Bounded real retrieval experiments

Two table questions, six variants each, repeated once after table prioritization, plus two bounded two-step controls: **28 search calls**, no generator calls. Same authorization filters and threshold0.4 throughout.

| Variant | Table query pages2+3 | Five-group query pages2+3 |
|---|---|---|
| vector topK3 /5 | No | No |
| vector topK10 | Page2 only | Page2 only |
| neutral query expansion, vector10 | Still incomplete | Still incomplete |
| expanded hybrid10 | Yes for table query | Incomplete |
| expanded vector10 + reranker | Yes | Yes |
| two-step3 then expanded/reranked10 | Yes | Yes |

Two-step controls cost2 searches +1 rerank,1272/1313ms. The chosen **staging-only** policy uses one expanded/reranked search for table questions, at most10 raw results, at most3 authorized evidence pages, at most3 R2 reads; normal questions retain vector3 without reranking. Page content is capped at8000 characters /32000 object bytes. Server verifies exact object key against current D1 revision, public visibility, completion and deletion state before any R2 read. No client can enable the experiment or nominate an R2 key. Default production factory remains topK3/hardmax5/threshold0.4.

A complete deterministic table answer is accepted only from actual four-column headers/rows, explicit100-point source text, unique consecutive row numbers, actual maxima summing100, and readable cells. Cross-page blank-cell continuation is joined only for adjacent retrieved page identities. Incomplete, uncertain, conflicting or other-document evidence abstains. No fuzzy quote matching or LLM output is rescued. Both Gemini prompt and deterministic presentation preserve original OCR text; they do not semantically repair accents/numbers.

## Eight actual UI questions: semantic assessment

All eight ran in the authenticated staging UI, not merely a mock or HTTP probe. The final full batch followed revision repair and page hydration. Case4 was then retested once after the demonstrated headerless-fragment selection fix (3110ms), and once after citation-locator repair (4425ms); the other results are explicitly from the full batch, not a claim of a new8/8 run on the last revision. These are explicit code-change verifications, not automatic provider retries.

| Case | Observed result | Search / generator / R2 reads | Latency | Quality gate |
|---|---|---|---:|---|
|1 DRL table/latest | Full five groups25/20/20/15/20; sources2,3; latest/effective status explicitly unverified |1/0/2 |6505ms | Table PASS; legal-currentness NOT VERIFIED |
|2 document identity/decision/date | Generator safely abstained; no guessed decision/date |1/1/0 |4379ms | BLOCKED identity; not complete requested answer |
|3 typo “điẻm” | Same complete conduct table, not GPA/exercise schedule; sources2,3 |1/0/2 |1790ms | Table PASS |
|4 five groups/maxima | Initial batch hit generation error after26979ms; following fragment/citation fixes, exact UI retest returns full five groups, sources2,3 | Retest1/0/3 | Final4425ms | Complete table PASS on retest |
|5 online mini game | `INVALID_CITATIONS`; normal safe insufficiency response, no incorrect affirmative answer |1/1/0 |4623ms | FAIL answer quality; grounding safety PASS |
|6 outside-school proof | `INVALID_CITATIONS`; normal safe insufficiency response |1/1/0 |4703ms | FAIL answer quality; grounding safety PASS |
|7 exact personal score | Explicitly unavailable, no fabricated score, no provider calls |0/0/0 |817ms | Safe personal-score PASS; no real student score integration claim |
|8 latest/effective | Generator abstained; legal authority/currentness not invented |1/1/0 |2081ms | Safe abstention; legal-currentness NOT VERIFIED |

Eight visible responses,0 browser errors. Desktop source card visibly shows both pages and all five groups in actual screenshots. This is **not8/8 content acceptance**. Initial pre-revision batch:7 document requests all dropped; after revision repair but before hydration, table recall/completeness still failed. Those failures are preserved as evidence, not omitted as reruns until green.

Final full batch:7 searches,5 Workers AI invocations,7 bounded R2 page reads; each of the two case4-only retests:1 search,0 generator,3 page reads. No automatic retry, second grounding verifier or production request. The AI Search reranker is a retrieval model with additional usage, not a grounding verifier. Its internal billing/inference count cannot be measured from these counters. The stage diagnostic initially labeled case7 supported because the generic local-answer telemetry lacks a personal-score class; this label is not treated as evidence of a supported personal score.

## Gemini: completeness and timeout assessed separately

An additional real Gemini evidence-component batch used actual authorized AI Search passages and the existing support-first function schema/exact validator:7 document cases +1 zero-AI personal classification; one controlled case4 retest after lossless cell presentation. Model `gemini-3.1-flash-lite`, temperature0/seed42;1024 output-token cap and25-second experimental deadline. This adapter is **not** the production Gemini File Search model/tool path, and is not represented as equivalent E2E.

- Raw case4 generated all five maxima25/20/20/15/20, but altered/paraphrased support quotes; deterministic validation returned `INVALID_CITATIONS`. Lossless table presentation alone still failed exact quotes. **Raw completeness PASS; served/grounded Gemini answer FAIL**. Validation was not weakened.
- Cases5/6 passed the real component validator; cases1–4 failed grounding, case8 abstained. This does not override their separate UI/Workers AI results.
- Eight Gemini calls total: **18802 tokens** (16991 input,1811 output). Generator times1267–9414ms, no observed timeout in this experimental batch. This is not proof that File Search timeout is fixed.
- Prior File Search batch timed out at30013ms; a plain-generation control took17919ms; successful File Search calls previously reached28056ms. Root cause of that intermittent timeout remains **NOT ISOLATED / NOT FIXED**. The26979ms UI generation-error attempt is consistent with the unchanged25s Workers AI deadline; its original safe result did not expose a timeout subtype, so it is not asserted to be a proven Gemini timeout. Pending generation reported0ms at response time, not “instant generation”.
- Currency cost, internal embedding/rerank/tool tokens and total billing are **NOT MEASURED**. Reported explicit calls/tokens/latencies are not a dollar estimate. No retry/model/deadline tuning or production quota change.

## Existing-PDF reprocess/backfill plan — no production execution

`scripts/plan-ai-document-reprocess.mjs` and `shared/ai-document-reprocess.ts` implement **dry planning only**, no apply path/provider calls. Local manifest/output must be outside Git. UUID/hash/version/MIME/visibility/duplicate guards and a40-document bound fail closed. Read-only production metadata shows **11 document records,1 deleted record,10 PDFs by both MIME and filename**, and10 active PDFs eligible for this dry plan. A valid10-document plan was generated. Confirm the intended11-source inventory with the owner before claiming full-corpus coverage; do not restore deleted data or guess missing source identity. No production original, derivative, status, schema or index changed.

After explicit release approval, a safe operator flow is:

1. Inventory all intended PDFs, source hashes/versions, visibility and the currently serving revision. Snapshot rollback metadata first. The present10-document dry plan uses null prior derived revisions because pre0054 production has no that column; **null is not a completed rollback snapshot**.
2. Read immutable originals; verify SHA. Reprocess each independently in isolated staging. Save new versioned derived objects side by side; never overwrite source/old derivative or change visibility.
3. Human visual verification for uncertain cells, handwritten identifiers, tables, dates/points and8-question real-provider benchmark. Do not let confidence or100-point arithmetic establish legal currency.
4. After approved code/migration rollout, schedule bounded new production derivative indexing only with separate authorization. Keep old serving revision while every new page indexes; pending/failed pages do not promote.
5. Promote by compare-and-swap on original source hash + document version + previous revision, only after all page identities/filters complete and human approval. Recheck concurrent document edits/deletion/permissions. No bulk mutation of `indexing_status` to fake readiness.
6. Rollback to snapshotted serving revision/config if quality/safety fails; retain originals and prior derivatives. Delete only explicitly approved obsolete derivatives after retention/review, never raw PDFs.

This planner is not a production backfill executor. The remaining PDFs in the intended corpus have not been independently OCR/E2E-validated here. Old production uploads will not automatically acquire derived pages just from releasing upload code.

## Validation, release gate and rollback

- Targeted Advisor: **197/197 PASS**, including9 new completeness tests, current-revision/old-schema regression, page-card merge and Unicode locator regressions.
- Final full suite: **585/585 PASS**,0 failed/cancelled/skipped; known D1 event-storage503 did not reproduce. Typecheck, cf:typecheck, production build, standalone staging frontend build and diff-check PASS. Build retains existing Browserslist/large-chunk warnings. Intermediate full runs were superseded after code changes; an overlapping superseded run was stopped before the final single-process validation, not retried to hide a failing test.
- Production read-only reconfirmed: Public `9bcf3e62-00db-4794-8020-4c4891929896`@100%, mode=canary,7%; homepage200, anonymous Advisor401. Production/Auth deployment, production D1/R2/index mutations, main merge/push: **NO**.
- Scope: Advisor/retrieval/source UI, isolated staging tooling, dry planner, tests/report only. No Event DRL AI, support, ranking, Student Directory, extension or Auth implementation changes.
- **Release gate BLOCKED** by UI cases5/6 grounding failures, incomplete decision identity/legal currency evidence, unisolated intermittent Gemini File Search timeout, and unconfirmed11-vs10 source inventory. No NotebookLM-parity claim.
- No owner infrastructure permissions were needed for the isolated resources with current access. Owner assistance remains necessary for authoritative legible identity/currentness and locating the eleventh PDF. Staging test credentials are not shared here; production credentials are never reused.
- Staging rollback: redeploy the previous isolated test entrypoint or stop using the isolated origin; leave original/staging artifacts for audit. Production requires no rollback because unchanged. Future production release still needs explicit approval, preserved canary7%/bindings/observability,0054 migration sequencing and a fresh stable-version rollback target.

Skills applied: Cloudflare and Wrangler for isolated resource/binding guards; PDF for page-based source comparison. References: [AI Search retrieval/reranking](https://developers.cloudflare.com/ai-search/configuration/retrieval/reranking/), [search REST contract](https://developers.cloudflare.com/ai-search/api/search/rest-api/), [private Items contract](https://developers.cloudflare.com/ai-search/api/items/rest-api/).
