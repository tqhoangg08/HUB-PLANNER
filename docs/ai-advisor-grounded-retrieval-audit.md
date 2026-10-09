# AI Advisor grounded retrieval — audit and PR acceptance report

Date: 2026-10-09. Base: `059f73364d257fdf15b8878b8160e7c94bfc5a75` (`main`). Branch: `fix/ai-advisor-grounded-retrieval`.

Scope: Advisor routing, authorized document retrieval, grounded responses, source presentation and regression tests. No production deployment, ingestion/reindex, data backfill or main push is authorized by this PR. Event DRL prediction, ranking, Student Directory, Support, extension and Auth Worker are unchanged.

## Verified root causes

The reproduction uses the committed baseline, loaded by the local benchmark script, not a guessed reconstruction of its router.

| Finding | Baseline evidence | Repair / regression evidence |
|---|---|---|
| Common mark typo bypassed official retrieval | `ai-advisor.ts:routeAdvisorDocuments/classifyAdvisorIntents`: no conduct policy domain; accent-sensitive event cues. “Bạn có bảng điẻm rèn luyện mới nhất không?” classifies as `general` on the base commit. Correctly spelled DRL could instead classify as an event listing. | Query-only accent folding and a specific conduct classifier. Regulations, personal score, event eligibility, portal help and event listing are distinct. General health/exercise requests stay general. |
| Relevant documents could be excluded before retrieval | `selectAdvisorDocumentCandidates*` queried the newest 48 public/completed records, category-filtered them and kept only 12. This is a proven code risk, **not** an explanation proven to have affected the current 11-row production catalog. | Keyset pages of 128 scan the entire authorized catalog; 4096-document safety bound fails closed instead of silently truncating. A 151-public-document fixture retrieves an old relevant source beyond both former caps; private records are excluded. |
| V2 returned no displayable document citations | `chat` V2 success persisted internal source IDs but returned `documentSources: []`. | Re-resolve current D1 source authority after generation/cache, then return and persist safe titles, IDs and source-supplied locators/pages. No snippet is persisted in citation metadata. |
| Citation existence was incorrectly sufficient for legacy prose | `chat` accepted model prose after D1 citation resolution; a one-document fallback also parsed locators/applicability from the model answer. The compatibility parser used attributed answer byte spans as if they were source text. | Require actual retrieved passages, topical relevance and current D1 authorization. Unknown/private/revoked sources fail closed. Answer byte offsets are not evidence. Exact source-supported text may be retained; otherwise return bounded source quotations, never unsupported model prose. |
| Legal currency was inferred without proof | Resolved sources always set `inferredCurrent: true`; upload timestamps/version were ranking hints, not verified effective status. | `inferredCurrent: false`; no source is called current/latest on that basis. Quotations that include currency language are explicitly qualified as not independently verified. Scope labels come only from retrieved text or existing academic-year metadata. |
| Provider errors could leak content in diagnostic text | `logFileSearchDiagnostic` spread provider diagnostics, including error text/reason. Redaction is not a complete content guarantee. | Structural allowlist only: coarse classification/status, configured model, call counts, timing and coarse location. Test proves provider query/document sentinels are not logged. |

These establish the failure path. They do not independently establish what the old live model generated: the reported weekly schedule is user-provided evidence; the benchmark uses a deliberately off-topic model stub to prove that old routing allowed that path.

Repair locations in this PR: `ai-advisor-intents.ts:2,9` (normalization/classifier), `ai-advisor.ts:470,499` (routing), `ai-advisor.ts:1123,1142,1164` (catalog paging), `ai-advisor.ts:1269` (no inferred currency), `ai-advisor.ts:1294` (safe diagnostics), `ai-advisor.ts:1718,1888` (post-generation authorization/citations), `gemini-file-search.ts:525` (actual passage grounding), `ai-advisor-v2-runtime.ts:186` (relevance gate), and `ai-advisor-grounding.ts:44` (exact/extractive output). Paths here are relative to `cloudflare/worker/src/`. The before/after benchmark loads the base commit independently; these are current repair locations, not historic line numbers.

## Request and ingestion audit

1. `components/AIAdvisor.tsx` and mobile Advisor use `utils/aiAdvisorApi.ts` → `privateApiRequest` → `POST /api/private/v1/ai-advisor`.
2. `cloudflare/worker/src/index.ts` → `handleAiAdvisor` → Better Auth service identity. Chat/history are owner-scoped. Identity is not supplied by client parameters.
3. `retrieveAdvisorContext` uses only the needed owner-scoped D1 domains. A personal DRL request gets a deterministic explanation that personal DRL scores are not available; GPA is not substituted for DRL.
4. Existing structured zero-AI/cache/quota precedence remains. Ordinary general conversation retains its current general provider.
5. Official document requests select public, non-deleted, completed D1 documents. The existing chatbot policy does **not** authorize program/admin-private documents, even for a staff chat. This is also stated in `AdminAIDocuments`; this PR does not widen it.
6. Nonselected 7% canary requests use Gemini File Search (`GenerateContent`). Selected requests use AI Search search-only retrieval + the existing one-call Workers AI support-span generator. Failed/unusable V2 results fall through to the now-grounded legacy provider. No V2 retry or second verifier was added.
7. For catalogs up to 12, filters retain explicit server-authorized IDs. Above 12, the provider searches its public scope rather than silently cutting IDs. AI Search also requires active metadata. D1 authorization is rechecked after retrieval/generation; stale, unknown, deleted or private results cannot be returned. Non-public/mixed large authorization sets cannot use the broad-filter shortcut.
8. `ai-document-ingestion.ts` binds original/derived hashes, versions, pipeline identity and R2 metadata. `ai-documents.ts` owns Gemini upload/poll/retry/delete. Existing native/OCR tests remain. No ingestion code/schema/production index was changed.
9. The existing `indexing_status` is primarily Gemini operation status. AI Search availability/index sync is separate; D1 completion alone is **not proof** a particular AI Search index can retrieve a document. The response truthfully reports missing evidence and, when present, unfinished public indexing without asserting that the requested PDF is the pending item.
10. Admin document list pagination is presentation only; it no longer limits Advisor candidates. `version`, `academic_year`, category and upload dates are hints, not effective/issued/superseded legal metadata. No new dates are invented.
11. Numbered decisions may be identified by the actual D1 title even when a retrieved page does not repeat the decision number. Provider presentation titles are rechecked against D1 and cannot impersonate a numbered decision. Titles are identity hints, never support quotes.
12. Document instruction-like content is rejected as evidence; existing support-first instructions also mark evidence/history as data. Exact/extractive output prevents arbitrary model instructions or invented claims from becoming an official answer. The instruction detector is a conservative heuristic, not a universal semantic injection detector.

References checked: [Cloudflare metadata](https://developers.cloudflare.com/ai-search/configuration/indexing/metadata/), [AI Search filtering](https://developers.cloudflare.com/ai-search/configuration/retrieval/filtering/), [Gemini File Search](https://ai.google.dev/gemini-api/docs/file-search), and [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/). Local SDK/types and existing binding contracts were checked; no runtime bindings were added.

## Production read-only findings

- Active Public version observed: `9bcf3e62-00db-4794-8020-4c4891929896`, 100% Worker traffic.
- Version bindings read back: `AI_ADVISOR_V2_MODE=canary`, `AI_ADVISOR_V2_CANARY_PERCENT=7`.
- Homepage GET: 200. Anonymous Advisor GET: 401 (no generation or chat write).
- D1 catalog: 11 records; 10 public, completed, non-deleted documents. Public/completed categories: training regulation 5, discipline 2, handbook 1, tuition 1, legacy “Quy chế” 1.
- Aggregate title/original-filename search for `3529`: 0 matches. Reads reported zero writes / unchanged database.
- This does **not** prove the PDF is absent: it could have another name or be in a different index/store. Presence, access, actual retrieval and effective status of Decision 3529 on production are **NOT VERIFIED**. No private document contents, account data or corpus content were printed or downloaded.
- The supplied NotebookLM benchmark and synthetic tests do not attest production contents. No production Advisor benchmark/request, upload or AI Search sync was run.
- Production is **NOT DEPLOYED / UNCHANGED** by this task. Observability/configuration files were not modified. No Auth deployment.

## Old versus new behavior

| Input/state | Before | After |
|---|---|---|
| Typo “bảng điẻm rèn luyện…” | `general`; off-topic model output could pass without document citations | `regulation_document` / `drl_regulations`; authorized evidence or short safe abstention |
| Personal “Tôi được bao nhiêu điểm ĐRL kỳ này?” | Could mix academic/event cues | Deterministic unavailable-personal-DRL response; zero model calls; no invented score |
| Portal how-to | No distinct conduct workflow path | Workflow-specific retrieval; verified source instructions are not discarded as generic website deflection |
| Citation but unrelated weekly schedule | Citation existence could permit prose | Exact source text or bounded relevant quotations; off-topic model prose is not returned |
| No source / private source / indexing | Generic document unavailable path or wrong intent path | No general-policy fabrication; indexing caveat when unfinished public documents exist |
| Two regulation versions | Upload/version priority could exclude other candidates and imply currentness | Both searchable; only source-backed scope shown; legal currency not assumed |

Example new no-evidence answer: “Mình chưa thể xác minh thông tin hiện hành của HUB Planner hoặc BUH từ nguồn chính thức…” It does not invent a weekly plan. Successful fixture answers cite the fixture D1 title/ID and actual supplied page/locator; no fixture legal provisions are claimed to be real production content.

## Benchmark and cost

`node --experimental-strip-types scripts/benchmark-advisor-grounded-retrieval.mjs` loads the exact base commit using esbuild and runs 30 synthetic, nonselected-canary requests per phase, local SQLite + provider stubs. Temporary compiled baseline is removed afterward.

| Local mock measurement | Before | After |
|---|---:|---:|
| General generation calls/request | 1 | 0 |
| Gemini document calls/request | 0 | 1 |
| Returned document sources | 0 | 1 |
| Off-topic schedule stub exposed | yes | no |
| p50, ms (latest run) | 1.86 | 4.61 |
| p95, ms (latest run) | 9.37 | 6.52 |

These numbers measure local control-flow overhead, **not network/provider/production latency or LLM quality**; concurrent validation and cold/warm module effects affect them. They are not evidence of a production speedup.

Selected-canary fixture: successful V2 = one AI Search call + one Workers AI generator call + zero legacy calls. Invalid V2 = one search + one generator + one successful Gemini fallback. No-source and personal-DRL fixtures = zero generation calls. No extra semantic verifier. Existing mixed TEXT/OCR behavior can make one search per backend (at most two); the current shared production instance/default candidate backend uses one. TopK 3 / hard max 5 / threshold 0.4, model, temperature 0 and seed 42 remain unchanged.

Correct routing necessarily replaces a general call with paid document retrieval; a selected V2 failure can retain the existing extra legacy call. Existing legacy transient retry/broad-citation fallback is unchanged, bounded by the existing 30-second total budget; **no new retry** was introduced. Paging costs one D1 page for today's catalog and approximately one page per 128 authorized documents for larger catalogs.

## Acceptance fixtures

`tests/ai-advisor-quality.test.ts` uses synthetic documents and a synthetic 3529 title/date. Additional existing suites verify support spans, cache identity, provider deadlines, auth, private scope, OCR, quota, chat ownership and source UI.

| # | Required benchmark | Local status / expectation |
|---:|---|---|
| 1 | Bảng điểm rèn luyện mới nhất | PASS: conduct regulations, retrieval |
| 2 | Bảng điẻm rèn luyện mới nhất | PASS: same route, not general |
| 3 | bang diem ren luyen moi nhat | PASS: same route |
| 4 | Phiếu ĐRL hiện hành | PASS: regulations; abbreviated/dotted ĐRL also covered |
| 5 | Quyết định 3529/QĐ-ĐHNH | PASS fixture: real D1 identity + body evidence; spoofed provider title rejected. **Production NOT VERIFIED** |
| 6 | Mini game tính ĐRL | PASS: event eligibility policy intent, not event listing |
| 7 | Tự đánh giá trên cổng sinh viên | PASS: workflow retrieval and grounded instructions |
| 8 | Personal DRL score | PASS: no fictional score, zero AI |
| 9 | Unrelated everyday request | PASS: general provider still available |
| 10 | No matching/relevant evidence | PASS: safe abstention, no improvised policy |
| 11 | Indexing document | PASS: excluded as evidence; truthful indexing caveat |
| 12 | Two versions | PASS: neither excluded by upload cap; no inferred currentness |
| 13 | Private/not-authorized document | PASS: pre/post checks; mid-generation revocation blocks exposure |
| 14 | Gemini error/timeout | PASS: bounded safe response, no Groq policy fabrication |
| 15 | V2 canary not selected / legacy fallback | PASS: default 7% fixture and selected success/invalid fallback counters |
| 16 | Prompt injection in document | PASS: source discarded / no off-topic model output exposed |

Additional regressions: old relevant source beyond 48/12; 4096 cap fails closed; later relevant passage keeps actual page; changed number/URL/locator blocked; attributed model text cannot create locators; provider-content telemetry privacy; document source cards do not contain evidence/support text.

## Final validation

Final full-suite run completed successfully on the final implementation. The known event-storage 503 baseline did not reproduce. Commit/PR identity is recorded in the PR and final handoff.

- Targeted Advisor: **163/163 PASS**, including 24 new quality tests.
- Full suite: **551/551 PASS**, zero failures/skips/cancellations. Groups: Advisor 163, Student Directory 16, recovery 3, Event DRL 6, unit 337, authority/browser bridge 25, D1 read optimization 1.
- Typecheck: PASS.
- Cloudflare typecheck: PASS after final Worker changes.
- Frontend build: PASS (3440 modules); existing large-chunk / Browserslist age warnings remain. Final changes after build are Worker/test-only.
- Diff check: PASS; also rechecked on the staged commit set.
- Live production UI/generation and Decision 3529 retrieval: NOT VERIFIED, not substituted with fixtures.

## Intended changed files

- `cloudflare/worker/src/ai-advisor-intents.ts` (new)
- `cloudflare/worker/src/ai-advisor-grounding.ts` (new)
- `cloudflare/worker/src/ai-advisor.ts`
- `cloudflare/worker/src/ai-advisor-v2-runtime.ts`
- `cloudflare/worker/src/ai-search-retrieval.ts`
- `cloudflare/worker/src/gemini-file-search.ts`
- `shared/ai-document-categories.ts`
- `components/AIDocumentSources.tsx`
- `tests/ai-advisor-quality.test.ts` (new)
- `tests/ai-advisor-intent-retrieval.test.ts`
- `tests/ai-advisor-message-ui.test.ts`
- `scripts/benchmark-advisor-grounded-retrieval.mjs` (new)
- `package.json` (Advisor suite is now part of `npm test`; no dependency changes)
- This report.

The existing `docs/ai-advisor-v2/` local plan remains untracked and untouched. No PDFs, XLSX, secrets, raw provider payloads or private student data belong in this commit.

## Risks, release gate and rollback

1. Exact/extractive policy output is intentionally conservative: fluent paraphrases can become quotations, and missing provider passage text leads to abstention even if a citation ID exists. Real Gemini/AI Search responses must be confirmed before release; a citation alone is not sufficient evidence.
2. Relevance/injection detection is bounded and conservative, not a general semantic proof. The exact/extractive output gate avoids exposing unsupported model prose; false negatives can still produce abstention or partial quotes. TopK does not guarantee every relevant passage will be returned.
3. D1 has no comprehensive issued/effective/expiry/supersedes/authority metadata. This PR does not manufacture legal status. An authorized owner must identify the 3529 document, verify applicability and indexing in the intended providers before claiming current production support.
4. Public catalog greater than 4096 is an explicit availability blocker, not a partial/unsecured fallback. Future larger catalogs need a revised bounded search index strategy.
5. Current public-only chatbot authorization is retained. Program/admin-private documents remain unavailable to Advisor until separately designed/approved.
6. `.github/workflows/deploy-cloudflare-production.yml` runs on main push and deploys **both Auth and Public**. Do not merge/push main or trigger that workflow as part of this task. Release requires explicit approval and a Public-only method preserving runtime `canary=7` and existing safe observability/bindings.
7. No migrations or production data changes: rollback after an approved future deployment can return Public traffic to the recorded healthy version `9bcf3e62-00db-4794-8020-4c4891929896` (reconfirm active rollback target at release), preserving runtime canary 7% and observability. Code rollback is a normal revert of the PR, never reset/force-push.

**Code review readiness is not production activation approval.** Production acceptance for the actual 3529 PDF, real-provider latency/cost, and post-release authenticated UI remains NOT VERIFIED. Request explicit release confirmation after those evidence gates; do not auto-deploy this PR.
