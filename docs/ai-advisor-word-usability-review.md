# PR #88 — Word-first usability and routing review

## Decision: NO-GO production

This review supplements, **does not replace**, the previous ten-question acceptance report. The ten narrowly worded source-verifiable acceptance cases passed previously. Twenty **new** queries through the real staging UI expose substantial usability failures: **3 PASS / 17 FAIL** under the strict requirement that the student sees a correct, sufficiently complete answer with the correct source locator, or an appropriate insufficient-source response. HTTP 200, expected-word presence and `SUPPORTED_VALID_CITATIONS` are not quality verdicts.

PR #88 remains Draft. No production Public/Auth deployment, merge, production migration/backfill/indexing, source repair, OCR, Admin OCR review approval or promotion occurred. The five owner-selected DOCX originals, source hashes and current derived revisions remain unchanged. AI Search item enumeration still reports **73/73 completed**. Existing legal-identity/current-effect questions remain **NOT VERIFIED**.

## Reproducibility and boundaries

- Real UI batch: deployed product `a24e001a10f71b8e79074734a82545fe0d197a03`, already present at baseline commit `559b7d9`. Twenty sequential queries, a new conversation each, disposable Chrome and an isolated synthetic Better Auth account. This was not a production student session.
- Staging: https://hub-advisor-pr88-word-staging.tqhoangg2.workers.dev . Same five current authorized D1 documents, separate D1/R2/AI Search. No source upload/reindex was needed for this review.
- Routing batch: staging-only instrumentation commit **`4ff1cf77169fa1e98f04b7275cad2d4eea7d797c`**; health SHA checked before probing. No production code path was changed. The report-only follow-up does not pretend that the twenty-query product run was on a different SHA.
- The same authenticated staging account exercised the real stable bucket comparison by using server-selected **ephemeral staging thresholds** on either side of its bucket. These are not two real student accounts under the production 7% threshold. Existing 7%-selection regression fixtures remain a separate local check.
- The probe requires staging Admin, exact isolated Word origin, POST and a fixed profile allowlist. It cannot change persisted flags or impersonate a requested user. Anonymous probe HTTP **401**; user/auditor/production-origin/extra-parameter rejection tested locally. No equivalent endpoint is present in the production entrypoint.
- Raw responses, source passages, provider receipts, screenshots, identities and credentials remain in ignored local `.cache`, not in this report/commit/PR comment. No original Word/PDF was committed.
- Read-only production settings API returned HTTP 200: mode **canary**, percent **7**. The completeness binding was **absent**, not an explicit `false`; `completenessEnabled` accepts only the literal `true`, so its effective state remains **OFF**. No setting was written.

## Twenty new UI cases

Expected values below were checked against the selected real native Word text/tables, not injected into the retrieval/prompt or production code. Source-sensitive legal authority is not inferred from the upload date or file name. The table summarizes queries rather than disclosing source passages.

| # | New question / expected scope | Observed result | Strict UI verdict | UI ms |
| --- | --- | --- | --- | ---: |
| 1 | 85 ĐRL: classify under Article 7 | Backend retrieved thresholds including “tốt”; UI replaced answer with internal-technical refusal | FAIL | 7886 |
| 2 | No accents: `drl 49 diem` | No retrieval results despite available Article 7; safe but unnecessary abstention | FAIL | 1847 |
| 3 | Compare 89 and 90 ĐRL | `INVALID_CITATIONS`; no answer although thresholds are available | FAIL | 5627 |
| 4 | Discipline warning: ranking cap | Correct cap in backend excerpt; UI technical refusal | FAIL | 6810 |
| 5 | Suspension versus expulsion: evaluated or not | Correct Article 8 excerpt; UI technical refusal | FAIL | 5522 |
| 6 | DRL complaint timing and resolving units | Facts present in backend excerpt, but wrong **Chapter V / Article 15** citation; Article 15 belongs to Chapter IV. UI also refuses | FAIL | 7335 |
| 7 | Student-affairs class leadership headcount | Actual 01 class leader / at most 02 deputies present; UI refuses | FAIL | 6783 |
| 8 | Smoking/alcohol at school under student-affairs rules | Relevant Article 6 clause present; UI refuses | FAIL | 4077 |
| 9 | Psychological support for newly enrolled students | Workers AI generator deadline; safe abstention instead of available Article 18 answer | FAIL | 27726 |
| 10 | No accents, standard-program summer start + registration | Standard scope not recognized; selected **special-program plan**, not the requested standard plan; UI refuses | FAIL | 7743 |
| 11 | Partial-English-program HK2 start/end | Correct dates in backend excerpt, but unnecessary letterhead/other table locators; UI technical refusal | FAIL | 8069 |
| 12 | Compare standard/elite Tết breaks | HTTP 503, not a usable sourced comparison | FAIL | 400 |
| 13 | Natural wording K41 finance/banking standard annual + credit fee | Requested K41 row missed; visible excerpt starts K35/K36 fees, requested 752,000 credit value absent | FAIL | 6283 |
| 14 | No accents K39 accounting annual + credit fee | 25,600,000 / 742,000 present, but citation points at **Table 2 / Article 4**, not the requested row's Table 3; includes unrelated rows | FAIL | 7836 |
| 15 | K42 Chinese-language “mức thu” year + credit | HTTP 503; phrasing without literal “học phí” misses document routing | FAIL | 600 |
| 16 | Cross-topic maximum ĐRL + K39 finance/banking credit fee | `ALL_RESULTS_DROPPED`, no answer to either requested fact | FAIL | 1788 |
| 17 | My personal ĐRL this semester | Explicit no-access response; no fabricated personal score or GPA substitution | PASS (insufficient private source) | 420 |
| 18 | K45 fees in 2028–2029 | Safe abstention; no invented future fee | PASS (insufficient source) | 5466 |
| 19 | Special-plan exact November registration day, when source gives month only | HTTP 503 rather than explaining the source only gives a month | FAIL (insufficient source handling) | 257 |
| 20 | Exact DRL points for volunteering on Mars | Safe abstention, no invented points | PASS (insufficient source) | 3713 |

There are **16 source-answerable** cases and **4 insufficient-source/private-data** cases. **0/16** satisfies the full strict UI/correct-locator acceptance in this new batch; **3/4** insufficient-source cases are handled safely and usefully. Some failed cases contain correct facts server-side; they are not counted as successful student answers. Eight UI responses were replaced by the technical refusal (#1,4,5,6,7,8,10,11). Screenshots of these cases and the misleading fee excerpts were inspected. No fake physical Word page was shown; returned document IDs stayed within the five authorized current sources. Incorrect article/table associations still fail citation quality even though the ID is authorized.

## Verified failure mechanisms, not speculative repairs

| Mechanism | Evidence / code |
| --- | --- |
| Source comments leak into extractive reply and trip the frontend safety filter | Native excerpts contain a `word_unit` / `uncertain_tokens` HTML comment. `sourceSupportedReply` copies it; `sanitizeAIReply` normalizes then substring-matches **`token`**, replacing the entire reply. `components/AIAdvisor.tsx:121` uses this sanitizer for live replies and line 189 for history. Confirmed by raw response → existing sanitizer replay and actual UI screenshots. This is not an OCR error. |
| Raw quotation fallback is not a useful synthesized answer | `ai-advisor-grounding.ts:88` accepts an entire generated reply only if it is an exact evidence substring, otherwise emits up to three **1,200-character** quote windows. Generic excerpts can expose unrelated fee cohorts, native `<br>` markup or incomplete answers. Valid support spans do not guarantee that the final quoted window answers the user's tuple. |
| Fragile input selectors / single-scope narrowing | `ai-advisor-retrieval-plan.ts:6` requires literal `ngành` for a fee tuple; colloquial K41 question lacks it. `he chuan` is not the recognized standard-program selector. Cross-program queries prefer the specialized branch whenever that marker appears. `ai-advisor-intents.ts:12` requires narrow academic-policy wording. Queries #12/#15/#19 reach the general-provider path; staging lacks that provider and returns 503. **Production behavior of those misrouted questions was not tested**; it may differ when general AI is configured. |
| Location association is not source-hierarchy aware | `gemini-file-search.ts:268` extracts first chapter/article/table occurrences anywhere in a bounded passage. A following chapter or preceding table inside a combined Word unit can be wrongly associated with the requested article/row. Actual #6 and #14 demonstrate this. No invented decision/page is needed for a locator still to be wrong. |
| Strict citation refusal remains active | #3 returns `INVALID_CITATIONS` rather than accepting unsupported output. The staging adapter did not expose a narrower rejection subtype for this case; **generator-contract vs final answer-check subtype is NOT VERIFIED**, not guessed. |
| Timeout risk remains | #9 reaches the Workers AI deadline and safely abstains. It is **not a Gemini timeout**. No extra V2 attempt/second verifier was added. |

This task adds only diagnostic/test instrumentation, not a prompt/OCR rewrite or relaxation of validation. The defects above are **not fixed by this review**. They are explicit release blockers, not hidden behind passing local tests.

## Gemini: the two plans have different actual states

Read-only staging D1 + Gemini GET operation/document listing was used. No new Gemini upload, retry-index, repair write or production inspection of source content was performed.

| Source | Local D1 status | Actual isolated provider evidence | Conclusion |
| --- | --- | --- | --- |
| Standard-program plan | failed | Original operation `done=true`, no provider error, document receipt exists; one matching `STATE_ACTIVE` document | **False/stale local failure**, not a currently failed provider index |
| Partial-English/special/elite plan | failed; no operation/document receipt | No matching provider document | Did not get a persisted successful upload receipt; provider ingestion is **not verified/recovered** |
| Conduct, student affairs, tuition | completed | Each original operation done without error; one `STATE_ACTIVE` matching document each | Provider status verified active; does not alone prove arbitrary-query answer quality |

Thus actual provider active coverage is **4/5**, versus **3/5** completed statuses in D1. The isolated Gemini store also contains previous staging PDF objects; all runtime/candidate-source checks for this run restrict access to the five current Word IDs.

`ai-documents.ts:197–209`: `refreshOperation` permanently writes `gemini_indexing_status='failed'` when a status GET throws, even though that is not evidence of failed indexing. The guard then polls only `uploading/processing`, so a transient polling error cannot reconcile a later completed operation. This explains the observed standard-plan inconsistency. The original transient HTTP/transport class was not retained, so its precise status is **NOT VERIFIED**.

`ai-documents.ts:388–393`: native upload exceptions are reduced to a generic failed status, discarding transport/error classification before an operation receipt is persisted. This prevents a retrospective precise root cause for the other plan. There is no evidence to blame DOCX MIME, filename length, timeout or the document's content specifically. Restoring bounded diagnostic classification/reconciliation and reproducing the missing upload on an isolated revision are required before claiming a Gemini fix. Do not mark it completed manually.

## Actual routing probes

All probes use the same known full-DRL-table question. Responses were read and compared with the real conduct source; no HTTP-success shortcut. Error injection is **labelled test evidence**, not a successful live Gemini request.

| Staging profile | Result / content | Search / Workers generator / R2 / Gemini | End-to-end ms |
| --- | --- | --- | ---: |
| Canary-selected, completeness ON, real providers | Full 100-point / five-group table, correct conduct source | 1 / 0 / 3 / 0 | 7639 |
| Canary-unselected, real Gemini | Safe `provider_error` abstention, no table | 0 / 0 / 0 / 1 | 1246 |
| Selected, completeness OFF, real providers | Generator abstains on raw chunks, then real legacy Gemini returns `provider_error`; safe abstention, no table | 1 / 1 / 0 / 1 | 4261 |
| Unselected, injected Gemini timeout | Safe `provider_timeout` abstention; no invented answer | 0 / 0 / 0 / 1 injected adapter call | 968 |
| Selected, injected Gemini timeout | Full grounded table unchanged; failing legacy adapter is never called | 1 / 0 / 3 / 0 | 2801 |

No real Gemini timeout occurred in these two real legacy attempts; both failed quickly. Their exact provider-error subtype was not surfaced to the content-free staging response. **Gemini runtime availability/timeout resolution remains unproven**. Earlier successful mini-game/tuition Gemini answers in the previous report remain valid observations, not evidence that today's failures are fixed.

Completeness is **not a provider-routing switch**: it adds bounded retrieval/hydration only after V2 selection. With unchanged production 7%, roughly the remaining buckets still depend on legacy Gemini for recognized document questions. Shipping Word ingestion with completeness OFF therefore does **not** imply that all students receive the demonstrated Word table path. Existing local fixtures also verify real 7% bucket selection and authorization/fallback isolation. Staging synthetic-role/session differences are a remaining limit; these probes are not a production canary benchmark.

The probe's legacy `resultClass` can misleadingly default to `SUPPORTED_VALID_CITATIONS` for zero-AI/safe legacy outcomes. The report instead uses the actual reply, document status and `releaseMetrics.grounding_result`. Do not use that staging label as a success numerator.

## Usage / latency / abstention

Twenty UI questions: **17 HTTP 200 / 3 HTTP 503**. Across the 17 responses that exposed metrics: **18 AI Search calls, 14 Workers AI generator calls, 12 R2 reads**, maximum **2 / 1 / 3** per request respectively. Gemini calls **0** in this V2-ON batch. Metrics for the three early 503s were not returned by the old stage handler; zero calls for them is **not assumed**.

Median all-question UI elapsed **5,574.5ms**, HTTP-200 median **6,283ms**, maximum **27,726ms**. Observed generator deadline: **1/20**. Returned completion telemetry reports safe abstention on #2,3,9,16,18,20 (**6/20**); #17 is an intentional personal-data no-access reply, reported separately. This is not an inferred semantic-quality success rate. Eight frontend technical refusals are a distinct failure class, not insufficient-source abstention.

Workers AI supplied usage for **13** completed generator calls: **24,338 input / 1,548 output tokens**. Usage for the timed-out call was unavailable. No provider dollar cost, search/embedding/indexing tokens or account billing total was returned, so total cost is **NOT VERIFIED**, not zero. The staging preconstructed generator bypasses the release wrapper's Workers-AI counter; its `workers_ai_calls=0` must not be used. The direct staging `generatorCalls`/`workersUsage` above count actual attempts. This is an instrumentation limitation, not proof of a production counter defect.

Five routing probes additionally used **3 search / 1 real Workers generator / 6 R2 reads / 2 real Gemini calls**, plus **1 injected** adapter failure. Actual completed Workers usage in that batch: **1,339 input / 36 output tokens**. Injected calls incur no Gemini inference usage and are not included as billable successful provider calls. Small single-run timings are not an SLA or matched before/after benchmark.

## Cloudflare-first proposal — conditional, not enabled

The known table path shows that authorized native Word evidence **can** answer without Gemini/generator dependence. The broader twenty-query batch does **not** justify enabling it for all students yet. Proposed future release architecture, subject to separate implementation/review/approval:

1. Independent server-controlled **document-provider policy**, separate from V2 user bucketing and completeness. Official-document intents can prefer authorized Cloudflare AI Search; personal/schedule/course/general intents retain their existing authorities.
2. Normalize natural aliases and preserve multiple requested domains/programs instead of selecting one by precedence. Split only a bounded number of subqueries under a shared request budget; authorize every current revision before/after search and before R2 hydration. Keep per-request search/read/generator caps, quota and revision-aware cache keys.
3. Native source cleanup removes only parser metadata from the display/generator view; source support remains exact and bound to immutable evidence. Use the actual relevant table row/article and source hierarchy for locators. Do not globally weaken the safety filter or add fuzzy quote validation.
4. Present a directly responsive supported answer; reject wrong-scope/partial evidence or clearly identify the unanswered part. One bounded grounded legacy fallback only if usable; provider failure ends in safe abstention, never unrelated general generation for a missed official-policy intent.
5. Gradual approved staging→Public-only rollout with provider/grounding latency/cost metrics and immediate flag rollback. Original DOCX/revisions remain immutable; OCR/backfill and production reindex remain separate approved operations.

These are recommendations, **not features claimed implemented or enabled in this review**. Production canary 7% and completeness OFF are unchanged.

## Validation and release gates

Local targeted Advisor **274/274**, new isolated probe/runner guards **5/5**, full suite **667/667**: PASS, zero failures; known D1 baseline did not recur. Frontend typecheck, Worker typecheck, production frontend build and diff check: PASS. Independent non-deploy CI result on the report head is recorded in the PR update; not predeclared here. Real-provider/UI failures above remain failures despite green CI.

Remaining required gates:

- Fix and re-probe the demonstrated display/filter, locator hierarchy, natural routing/program/tuple and multi-topic completeness defects. Preserve citation authorization and exact support validation; no prompt/OCR detour.
- Reconcile Gemini status safely; capture sanitized transport class and reproduce the missing plan upload on a separate staging revision. Real Worker fallback/provider availability and timeout need repeatable evidence.
- Run the same twenty cases plus the old ten through the final UI/product SHA; include both real student bucket paths or a clearly isolated equivalent, completeness OFF/ON, and safe provider-failure tests. Require source-specific content/citations, not a response flag.
- Improve end-to-end telemetry attribution and measure search/index/provider billing if available. Do not claim known cost from response tokens alone.
- Owner confirms source inconsistencies/legal identity/current effect where required. The two legal claims remain NOT VERIFIED; do not edit the source to force PASS.
- Obtain separate production release/migration/reprocessing approvals only after these gates. Keep PR Draft/NO-GO now. Rollback remains a Public-only version/flag action under the previous release checklist; no production rollback is needed because nothing was deployed there.

Reproduce with the private state and the exact owner sources already present (no new upload):

```powershell
node scripts/verify-advisor-word-usability.mjs --ui
node scripts/verify-advisor-word-usability.mjs --index-diagnosis
node scripts/verify-advisor-word-usability.mjs --routing --expected-source 4ff1cf77169fa1e98f04b7275cad2d4eea7d797c
npm run test:advisor
npm run test:word-usability
npm run typecheck
npm run cf:typecheck
npm run build
npm test
git diff --check
```

`--ui` is intentionally pinned to the original a24e001 product run and will reject the updated staging instrumentation SHA rather than silently retesting a different revision. Replay requires explicit version accounting. `--routing` verifies its supplied SHA. The added staging routes/tests/tools do not change production routing, ingestion, model, prompt, OCR, permissions or corpus.
