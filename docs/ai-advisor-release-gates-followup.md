# PR #88 — remaining release gates from 5f8e812

Date: 2026-10-10. Decision: **NO-GO for production and completeness ON**.
Keep Draft/unmerged. Only isolated PR88 staging has been used. No production/Auth
deployment, production migration, backfill, index write or canary change is authorized.
No OCR algorithm, prompt, provider, deadline, retrieval budget or retry policy was tuned.

This is the checked-in runbook/evidence snapshot before final-SHA execution. The PR
conversation records final SHA, independent CI and actual UI/provider results. A
successful HTTP response or presence of a citation is not a semantic acceptance.

## Three additional real PDFs: upload and OCR evidence

Original public PDFs were read from existing R2, hashed, kept outside Git, and uploaded
through the normal AdminAIDocuments UI to isolated D1/R2/AI Search/Gemini resources.
No original PDF, raw OCR/provider answer, private catalog, credential or screenshot
is committed. The synthetic Better Auth session is staging-only.

| Topic | Actual PDF | Pages OCR'd | Browser uncertainty markers | Upload/OCR wall time |
| --- | --- | ---: | ---: | ---: |
| Academic | Kế hoạch học tập dành cho sinh viên đại học chính quy chuẩn năm học 2026-2027 | 10/10 | 166 | 138878 ms |
| Tuition | Quyết định về mức thu học phí và các loại giá dịch vụ năm học 2026-2027 cho các hệ đào tạo | 24/24 | 143 | 502188 ms |
| Other regulation | Quy định thực hiện quy tắc ứng xử của người học | 6/6 | 93 | 133189 ms |

All three required OCR despite existing text; the real browser displayed the OCR
warning and it was acknowledged for staging. Uploads returned HTTP200 with derived
page metadata. This proves upload/OCR, **not** index completion or correct answers.
Local preparation and browser OCR are separate executions; uncertainty counts differ.

Rendered originals were visually checked against extracted facts, not guessed from
OCR: academic page2 registration date 16/11/2026 and 12-week internship; tuition
page4 K39 Finance/Banking annual 25.600.000 and per-credit 747.000; regulation page3
Article3 duties. Other uncertain cells/handwritten decision numbers are not repaired
or used as legal identity/currentness evidence.

At 04:26 UTC the actual AI Search item list showed 54 pages: 30 completed and 24
tuition pages queued for INDEX, no provider error. Academic and regulation were
complete; tuition was not. A benchmark preflight stopped INDEX_NOT_READY before
calling AI. Never mark queued pages completed. Final state and semantic results
must come from a fresh UI run against the committed/deployed staging SHA.

Final semantic suite: academic date, academic duration, tuition table row, regulation
Article3. Each requires actual document ID/page matching, correct values, visible
answer, no unsupported additions; fresh chat per case. Repeat the original 8 conduct
cases as regression, retaining two legal questions NOT VERIFIED absent authority.
The browser harness checks the staging health SHA equals clean Git HEAD.

## D1 staging backup/restore and 0054: actual PASS

`scripts/rehearse-advisor-d1-staging.mjs` exported the real isolated app D1
(63524 bytes,16 tables at snapshot), imported into a newly created rehearsal DB,
and compared sorted row digests for every normal table: **all matched**.
Neither production nor the original app DB was restored.

A second fresh rehearsal DB represented pre0054 schema and synthetic legacy records.
The initial synthetic seed violated an existing source identity constraint and
stopped; correcting that rehearsal fixture did not modify production. Applying
only0054 through a private one-file migration directory produced exactly one ledger
entry. The four columns/defaults and unchanged old fields were verified.
Time Travel restore on that disposable DB restored the pre-migration schema and
all row digests: **PASS**. Guards reject production DB and original staging DB.
Backups, bookmarks, IDs and raw SQL remain outside Git; no restoration credentials
are logged. This rehearsal is not authorization to restore a live database.

Production read-only preflight specifically stops `0054_MIGRATION_APPROVAL_REQUIRED`:
production still has 0/4 new columns. Its live vars/bindings/observability comparison
passed before that stop. Do not apply every pending migration or blindly repeat a
partially applied ALTER. Owner must approve exact0054 and a production backup/window.

## Public-only release workflow: fail closed

The proposed workflow no longer has a main push trigger. `workflow_dispatch` defaults
approval false, requires main plus an exact40-character approved HEAD. There is no
Auth deploy, migration application, backfill or reindex step.

Before release, the approval checker reads `public-production` environment protections
and requires reviewers, no self-review, no admin bypass. The release job separately
requires owner-approved SHA via `PUBLIC_RELEASE_APPROVAL_SHA`. Missing/unreadable
protection or SHA mismatch stops. Only the new Public release credentials are used;
the old shared deployment secret is not reused.

Read-only preflight checks Public config identity, all configured variables and
binding identities, observability and0054 compatibility. Completeness stays false,
canary7, then only `wrangler deploy --config cloudflare/wrangler.jsonc --keep-vars`.
Routes/crons/queue consumers and account-specific deploy-token permissions still
require owner-reviewed snapshots; the guard is not a claim of complete Cloudflare
configuration/billing audit. No release dispatch or environment mutation was done.
Until this PR is approved/merged, **the old main workflow still exists**; do not merge
as an incidental part of testing.

Owner setup required: protected environment/reviewers, an independently scoped
release token, account ID, exact SHA approval and API visibility for protection checks.
Check the guard using validation credentials before an approved release. It intentionally
fails closed on restricted GitHub plans/permissions rather than silently deploying.
Reference: [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## Content-free telemetry and cost

New `ai_advisor_request_completed` is emitted after foreground completion including
legacy fallback, not only before routing. Request-scoped counters: grounding class,
fallback, timeout, end-to-end latency, search calls, R2 page gets, Workers AI/Gemini/
general-provider calls, reported input/output tokens. It correlates a canary trace
without user identity. No question, answer, evidence, source URL, support span,
cookie/token/header or raw provider error is included.

Lazy binding access preserves OFF/zero-AI/shadow isolation. Tests caught and fixed an
initial eager-access regression before release. Shadow diagnostics remain separate
from foreground counters. Adapter deadline is observed before a late AI.run result;
no new retry or verifier is introduced. Actual R2 gets include failed read attempts.

Provider-reported USD is **null/NOT MEASURED**, not zero. Reported tokens cover only
providers returning supported usage fields; search embedding/rerank/indexing/storage
billing is not inferred. Local OCR runs on CPU, but browser/provider/index latency is
not a cost figure. Account billing export/cost ceilings and persisted dashboard/alert
verification remain owner gates; synthetic request counters do not prove production
observability retention or factual answer quality.

## Reprocess 10 active PDFs: dry-run, not production apply

Read-only inventory:11 records,10 active PDFs,1 deleted. The private planner manifest
contains source hashes/versions and previous original/derivative/Gemini references.
Dry-run produced10 plans, zero source/production writes. Deleted record is excluded.
Original objects READ_ONLY; new page revisions side-by-side; old objects immutable,
old indexes retained until an approved rollback window. No sweep or deletion.

The staging-only rehearsal route verifies original hash, preflights unused new keys,
creates next revision, and checks original/old page digests plus unchanged D1 live
pointer. It uploads only to the private staging index; **no D1 promotion**. New pages
may remain pending and are not counted ready. It is not imported by production routes.
Actual one-document result is recorded on the PR after final staging deployment.

Production CAS promotion/apply tooling is not authorized/validated here. Before any
future apply: per-document visual review and semantic benchmarks; all pages actually
ready; expected old hash/version/revision/visibility/deleted state checked atomically;
private rollback manifest; retain old revisions; no concurrent edit/delete/promotion.

## Gate decisions / owner approval order

1. Review/push only this Draft branch; independent no-deploy PR CI and final-SHA UI.
2. Resolve incomplete/failed topic semantic/provider gates; do not tune OCR/prompt
   without a new proven defect. Two legal questions remain NOT VERIFIED.
3. Approve workflow/environment controls and exact0054 backup/maintenance window
   separately. Repeat snapshot/preflight; no all-pending migration runner.
4. Only after explicit approval: initial **Public-only**, completenessOFF/canary7.
   No Auth deployment implied. Default-OFF regressions and health must be checked.
5. Separately approve one-document side-by-side reprocess pilot, preserve all originals
   and rollback revisions; never restore the deleted record. No bulk production apply.
6. Enable completeness only after semantic gates, safe telemetry/latency/cost ceilings
   and explicit feature approval. Canary increase/fullON is a different decision.

Rollback: first turn completeness off (keepcanary7/Gemini); if default-OFF behavior
regresses, restore the approved prior Public version, not Auth. Schema recovery is
separately approved; a full D1 restore can erase unrelated writes and is not routine
code rollback. Safe abstention protects correctness, not availability. Gemini's
previous intermittent30s timeout remains a separate unroot-caused risk.

## Verification record boundaries

Focused tests, full suite, both typechecks, builds, whitespace and independent CI
are reported with exact counts/SHA on PR88. No mock result substitutes for actual
PDF/index/provider/UI quality. Staging resources/backups/private results are retained
for review; cleanup requires a reviewed exact staging-only resource list.
No production deployment, migration, reindex, backfill, main push or Auth modification.
