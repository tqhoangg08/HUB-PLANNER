# PR88 — Word-first staging acceptance

> Follow-up usability review: [Twenty new queries, actual Gemini status and routing gates](ai-advisor-word-usability-review.md). The original ten-case results below remain historical observations, **not** a release approval. The broader UI batch is 3 PASS / 17 FAIL; the standard plan's Gemini provider document is now confirmed ACTIVE despite stale local failure. Production remains NO-GO.

## Decision and scope

**NO-GO production; keep PR88 Draft.** The native Word path is implemented and its ten source-verifiable UI scenarios pass with real isolated retrieval. This is not an all-provider release approval. Document identity/legal currency remain **NOT VERIFIED**, and Gemini indexing of the two academic plans remains **FAILED**.

The owner-selected directory exists: `C:\Users\tqhoa\OneDrive\Documents\Quy chế và Thông báo`. Exactly the five DOCX below were read and uploaded through the staging Admin document UI. No Downloads duplicate, `(1)` copy, fixture substituted for a real source, or OCR was used. Original files were not edited or committed.

Staging: https://hub-advisor-pr88-word-staging.tqhoangg2.workers.dev

- Separate Word staging D1, R2 and AI Search instance; five authorized current documents only, source hashes verified against the selected local files.
- The Gemini store is an existing **isolated staging** store, not a production store and not a new five-file-only store. It also holds prior staging PDF objects; runtime D1 authorization restricts this test to the five current Word document IDs.
- A disposable browser used a synthetic staging Better Auth account, not a production session. Each acceptance question started a new conversation.
- Staging enables completeness/V2 for the experiment. No production configuration, data, index, Worker or Auth Worker was changed; no main merge/push. Production canary remains untouched at 7%, completeness OFF.
- OCR proofreading is paused. No pending OCR draft was approved, indexed or promoted. The previous four-PDF environment is preserved.

## Sources and actual extraction/index status

| Selected DOCX | Paragraphs | Tables / rows | Logical units | AI Search | Gemini |
| --- | ---: | ---: | ---: | --- | --- |
| Kế hoạch học tập dành cho sinh viên đại học chính quy chuẩn năm học 2026–2027.docx | 432 | 16 / 70 | 5 | completed | failed |
| Kế hoạch tổ chức học tập năm học 2026–2027 hệ đại học chính quy chương trình tiếng Anh bán phần, chương trình đặc biệt, chương trình tinh hoa.docx | 467 | 29 / 118 | 5 | completed | failed |
| Quy chế công tác sinh viên đối với chương trình đào tạo đại học chính quy.docx | 610 | 0 / 0 | 33 | completed | completed |
| Quy chế đánh giá kết quả rèn luyện sinh viên.docx | 407 | 3 / 78 | 18 | completed | completed |
| Quyết định về mức thu học phí và các loại giá dịch vụ năm học 2026–2027 cho các hệ đào tạo.docx | 1952 | 42 / 456 | 12 | completed | completed |

Actual AI Search item enumeration confirms **73/73 completed**, not merely upload accepted or a client-side readiness label. Native extraction reports zero OCR pages/errors. Upload plus indexing waits took approximately 29.3s, 35.7s, 112.9s, 76.1s and 51.4s respectively; these are single observations, not an SLA.

### Source issues retained, not repaired

- Tuition contains **14 literal `[KHÔNG ĐỌC RÕ]` markers**, including an unreadable decision identifier, and some malformed text/list numbering. These are preserved. An uncertain requested cell must not become an invented answer.
- The conduct Word cover reads **5549/QĐ-ĐHNH, 02/10/2026**, whereas the earlier user benchmark referenced 3529. Reading the Word literal is not independent legal authentication or confirmation of current effect. Owner/authoritative-source review is required.
- The student-affairs Word Article 3 is **Nguyên tắc thực hiện**. It is not the earlier PDF's Article 3 in the separate learner-conduct document. Its passing answer does **not** establish repair of the old PDF OCR defect.
- DOCX physical pagination was not rendered/verified. Cached footer page fields and derived storage ordinals are not page evidence. Citations therefore use title and actual article/heading/table locator, with no invented physical page.
- `Bảng N (thứ tự bảng trong DOCX)` identifies extraction order, not a claim that the original document labelled its table with that number.

## Verified root causes and repairs

| Previous behavior / observed failure | Repair and evidence |
| --- | --- |
| DOCX was uploaded raw for Gemini while Cloudflare-derived text preparation was PDF-only. | `ai-document-docx.ts`, `ai-documents.ts`, `ai-document-ingestion.ts`: server-side native OOXML extraction, source/derived hashes and immutable original R2 object; all five real sources now have completed Cloudflare-derived items. |
| Derived `page-NNN` Word keys could be presented as physical PDF pages. | Trusted D1 pipeline/format flows through retrieval, evidence and final citation canonicalization. Word uses logical units/actual source headings, no provider-invented physical pages; regression test rejects that presentation. |
| Academic intent recognized only “kế hoạch học tập”; program scope could bleed between standard and special plans. | Intent/retrieval-plan scope recognizes “kế hoạch tổ chức học tập”, distinguishes the two program families and excludes program words from tuition-major matching. Real registration and Tết probes select the correct document. |
| A raw source excerpt cut at the beginning could omit the requested date or article even when retrieved. | Bounded source-driven selection of the relevant native semester row/holiday heading/whole requested student-affairs article. Missing, contradictory or uncertain source cells fail closed; conclusions are not hardcoded. |
| DRL resolver required the 100-point statement inside the table fragment, though the real search retrieved both adjacent scale and table units. | Authorize both fragments from the same document, verify all five sequential table groups and 100-point sum, and cite the actual Article 4 scale alongside Article 5/table. Real retrieval already found both; no extra search was necessary for that case. |
| Tuition parsing assumed the old PDF cohort-column shape and page-number mapping, not native Word first-cell `Khóa 39` and logical units. | Native row/header association and cohort/program/major selection preserve the exact requested source values. Conflicts or incomplete evidence are not accepted. |
| Native table `<br>` line breaks were shown as literal markup in the fee answer. | Presentation-only conversion to whitespace; original supporting evidence stays unchanged. Final desktop screenshot was reviewed. |
| Browser visibility assertions normalized the anchor but not Markdown rendered in the body; a mobile screenshot raced drawer closing. | Test-only normalization on both sides and bounded wait for the drawer transition; layout-only replay reads existing history without a new provider question. |

Files changed in implementation commits: the new native DOCX module; `ai-documents`, ingestion, AI Search retrieval, completeness config, evidence, grounding/source-locator extraction, runtime, Advisor, intent/retrieval-plan, source-sections/table-evidence, Gemini File Search; source/Admin UI components; staging entry/setup/browser/verification scripts; pinned dependencies and focused tests. The follow-up acceptance/report commit changes only browser tooling and this report.

No model/prompt rewrite, semantic/fuzzy quote matching, relaxation of support-span/citation validation, auth architecture change, automatic V2 retry or second verifier was introduced. Source authorization/current revision checks remain mandatory.

### Bounds and unsupported structures

Native extraction caps source size at 20MB, ZIP entries at 512, actual inflated XML at 4MB, text at 1MB, units at 40, unit text at 6,000 characters and table grid at 30 columns. It rejects unsafe ZIP paths/macros, DTD/entities, invalid namespace/XML, tracked changes, unsupported automatic numbering/drawings/embedded/nested structures instead of guessing their text. These five files pass those constraints; future complex DOCX may require a separate reviewed conversion path.

Runtime hydration remains bounded to **3 R2 reads**, canonical authorized current-revision keys, 32,000 bytes / 8,000 characters per unit. Cache versions separate the new native path. No arbitrary client object key or private/deleted document bypass is allowed. Existing migration 0054 is used in isolated staging; this work adds no new production migration and runs none there.

## Final real UI acceptance

Tested product code: **`a24e001a10f71b8e79074734a82545fe0d197a03`**. The runner verified the deployed staging source SHA matched the clean tracked checkout before the ten-question run. A later report/browser-only commit does not change that deployed product code and is not falsely represented as a newly deployed revision.

These checks required the expected source-derived content, correct authorized document, source locator and visible rendered response, not just HTTP 200 or citation presence. Raw responses and screenshots remain ignored local artifacts.

| Scenario | Verified answer content | Result | UI latency | Search / generator / R2 reads |
| --- | --- | --- | ---: | ---: |
| Full DRL table | 100 points; all five groups 25 / 20 / 20 / 15 / 20; Article 5/table and Article 4 scale citations | PASS | 7305ms | 1 / 0 / 3 |
| Online mini game | Actual source exclusion, no invented points | PASS | 4436ms | 1 / 0 / 3 |
| Outside-school proof | Confirmation, signature and round stamp requirements | PASS | 3378ms | 1 / 0 / 3 |
| Standard HK2 registration | 16/11/2026 from the standard plan | PASS | 3631ms | 1 / 0 / 3 |
| Special-program HK2 registration | Expected month 11/2026; no invented exact date | PASS | 4468ms | 1 / 0 / 3 |
| Standard Tết break | 27/01/2027–14/02/2027 | PASS | 3470ms | 1 / 0 / 3 |
| Elite/special plan Tết break | 01/02/2027–14/02/2027 | PASS | 8220ms | 1 / 0 / 3 |
| K39 Tài chính ngân hàng standard tuition | 25.600.000 đồng/year and 747.000 đồng/credit, correct cohort/program/row | PASS | 8049ms | 2 / 0 / 3 |
| Student-affairs Article 3 | All three source principles, including transparency/objectivity, digital transformation and family/society | PASS | 3688ms | 1 / 0 / 3 |
| Conduct scale | 100 points, not a 10-point GPA scale | PASS | 3072ms | 1 / 0 / 3 |
| Independent legal identity / decision number | Conflicting or unreadable source identifiers; no independent authority supplied | NOT VERIFIED | not counted | not counted |
| Current legal effect | Source reading alone does not establish current effect | NOT VERIFIED | not counted | not counted |

This is a **new five-Word, ten-question content suite**, not a claim to have rerun the old four-PDF twelve-case suite. Desktop and mobile 390px pass: no horizontal overflow or page JS errors; mobile source labels are readable. A separate layout-only replay confirmed the drawer was fully closed without generating another answer.

Totals: **11 real AI Search calls, 0 Workers AI generator calls, 30 R2 reads**. The answers use deterministic, validated source extraction after real retrieval, not mock providers. Median UI latency **4062ms**, maximum **8220ms**; observed request timeouts **0** in this batch. Server latency and UI elapsed time are distinct (render/network overhead included in the latter).

Earlier real probes had a missing full-table answer (~16.6s), truncated special-plan excerpts and a student-affairs generator failure. Those led to the repairs above; they are not a matched statistical latency benchmark.

## Gemini evidence and remaining risk

- Real provider status: three Word documents completed, **two academic plans failed indexing**. Cause of both provider-index failures is not fully established; do not label the five-document Gemini path PASS.
- Two bounded, separate real legacy-Gemini probes (on the earlier working revision, **not** the final UI acceptance SHA) returned the correct mini-game and K39 fee content with the expected authorized source: **6877ms** and **8746ms**, one Gemini call each.
- Provider reported usage: 691 + 64 and 703 + 170 input/output tokens, **1628 total**. No timeout occurred in these two observations. This does **not** establish resolution of the previously reported Gemini timeout.
- Cloudflare Word retrieval does not depend solely on Gemini. No fabricated substitute is returned on provider failure; existing fail-closed grounding/fallback regression tests remain enabled.
- Dollar cost, indexing/embedding token usage and total billable retrieval cost were not provided/measured. Zero generator calls does not imply zero AI Search/indexing cost.

## Validation and reproducibility

- Targeted Advisor suite: **274/274 PASS**, including 17 native Word focused tests and trusted D1 citation regression.
- Full local suite: **662/662 PASS**, zero failures. The known D1 event-storage 503 did not recur in this run.
- Auxiliary CI tests: **2/2 PASS**.
- Frontend typecheck, Worker typecheck, frontend build, isolated staging build and `git diff --check`: **PASS**.
- Independent non-deployment CI on tested product SHA a24e001: **SUCCESS** — https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/38064172833 . Final report/tooling-head CI is recorded separately in the PR update; this report does not predeclare its result.
- Regression coverage includes unsafe archives/actual inflation limits, original hashes, table associations, leading-zero strings, unknown markers, bounded/authorized native hydration, cohort conflicts, program selection, complete scale/article extraction and no fake Word page numbers.

Local reproduction (private staging state and exact owner files required):

```powershell
node scripts/verify-advisor-word-staging.mjs --inspect --source "C:\Users\tqhoa\OneDrive\Documents\Quy chế và Thông báo"
node scripts/verify-advisor-word-staging.mjs --index-detail
node scripts/browser-advisor-app-staging.mjs --word-first --benchmark --manifest .cache/advisor-word-staging/acceptance-private.json --require-final-commit
node scripts/browser-advisor-app-staging.mjs --word-first --layout-only
npm run test:advisor
npm run typecheck
npm run cf:typecheck
npm run build
npm test
git diff --check
```

`--require-final-commit` deliberately refuses a mismatched staging SHA or dirty tracked checkout. The current staging product is a24e001, so replaying after a documentation/tooling-only commit requires explicitly accounting for that difference rather than pretending the SHA matches. Never upload duplicates or deploy staging automatically merely to make an assertion pass.

## Remaining gates / handoff

1. Owner checks the unreadable/inconsistent Word source text and supplies authoritative document-identity/current-effect evidence where required. Do not correct OCR/Word text by inference.
2. Diagnose the two Gemini academic-plan indexing failures separately and measure/reproduce provider timeout risk. Two successful answers are not proof of recovery of every provider path.
3. Broader arbitrary-query quality, unsupported complex Word layouts, independent pagination/render verification and provider monetary cost remain limited/not verified. These ten questions are not an exhaustive quality claim.
4. Keep Draft/NO-GO; obtain a separate release decision. No production reprocessing of the ten active PDFs, migration, indexing or backfill has run. Word upload code does not retroactively repair old indexed PDFs.
5. Any later approved production rollout must follow the existing Public-only approval/backup/rollback checklist, start completeness OFF and preserve canary 7%. Original/previous revisions must remain available. Staging product can be rolled back to its previous version without production action.

Source documents, source text/Markdown exports, provider responses, screenshots, credentials and the local AI plan remain outside the committed diff. No original Word/PDF file is tracked.
