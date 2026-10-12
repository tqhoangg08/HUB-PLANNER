# PR #88 main synchronization and release gates — 2026-10-12

**Decision: production NO-GO.** Owner cancelled the proposed 12-turn staging re-test. This task merges main into the PR branch, not the PR into main, and performs no Cloudflare operation, staging deployment/provider probe, migration, document ingestion or flag change.

## Merge resolution

Inputs: PR head `763882dc7ca4165ada2d5aadbd1371cf272d30f1`; main/merged PR #89 `a9766e14ea5962b2971e5690c7d734dee49aa317`. Use a normal two-parent merge; no rebase or force push.

Only `.github/workflows/ai-advisor-pr-validation.yml` has an add/add conflict. The combined workflow retains:

- Main's immutable action SHAs, `persist-credentials: false`, `npm ci --ignore-scripts`, branch-specific concurrency and metadata-probe security suite.
- PR #88's focused Advisor suite, full offline suite, frontend/Worker typechecks, both frontend/staging builds, whitespace check and real short-lived GitHub Checks/Actions read-capability check.
- Exact required check name `AI Advisor independent validation`; read-only permissions; no protected environment, owner/Cloudflare secrets, production commands or migrations in CI.

The probe workflow and documentation from #89 are retained. The bootstrap test's old assertion prohibiting scripts absent from pre-#88 main is replaced with checks that the newly present Advisor script and both security/Advisor validation steps exist, including pinned actions and lifecycle-script restrictions. None of the actual probe authorization/security cases is removed.

`package-lock.json` merges without conflict. Main's `@emnapi/core`/`@emnapi/wasi-threads` optional dependency closure remains, alongside PR #88's pinned native DOCX dependencies `fast-xml-parser@5.11.2` and `fflate@0.8.3`. Both citation/telemetry patch commits remain ancestors. Release guard and Public deployment config are unchanged.

Validation: local full suite rerun **831/831 PASS**, focused release/probe suites **205/205 PASS**, additional CI regressions **2/2 PASS**, frontend/Worker typechecks, frontend/staging builds and diff-check PASS. The first local parallel run hit the existing 2.5-second isolated ZIP64 test deadline; the DOCX suite subsequently passed alone (18/18) at the original deadline, followed by the complete full-suite pass. No timeout was raised or test excluded. Exact-head independent CI results are recorded in the handoff after push. Existing asset/chunk build warnings remain unrelated.

## GitHub evidence (GET only)

- PR #89 is merged; main is the SHA above.
- Environment API 200: `public-production`, administrator bypass false, wait timer 5 minutes. Policy API 200: exactly one branch `main`, not a tag/wildcard.
- Ruleset 24867954: Active; this authenticated API response contains an empty bypass array, plus deletion/force-push/PR/required-check protections. Missing metadata would not be interpreted as empty.
- Old `Deploy Cloudflare production` workflow: **disabled_manually**. Independent CI and metadata probe are active.
- Owner's existing [metadata-only probe run](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/38148427869), on main SHA above, succeeded at 2026-10-11 21:49 Asia/Saigon. Actual log output: Classic protection PASS HTTP 200; PAT variables read PASS HTTP 200; approval variables absent; release approval NOT EVALUATED. This verifies the split read-only PAT capability, not permission to release.
- Direct unauthenticated classic/variable reads still return 401; this does not mean protections are absent. The probe is dated evidence, not a perpetual certification. Final release guard must read live protections again.

No setting, token, secret, approval variable or workflow enablement was changed. No probe/release workflow was dispatched here. Other visible automation: existing Supabase-to-R2 backup is scheduled, not main-push triggered; retired crawler is manual-only. Its independent scheduled writes are outside this task and are not a D1 backup/rehearsal substitute. No tracked main-push deployment remains in the proposed PR source; unobservable external Apps/webhooks are not certified.

## Documents: source readiness is separate from code readiness

The existing accepted Word-first **staging snapshot**, not a newly queried production catalog, contains:

| Source | Logical units |
|---|---:|
| Quy chế đánh giá kết quả rèn luyện sinh viên | 18 |
| Quy chế công tác sinh viên đối với chương trình đào tạo đại học chính quy | 33 |
| Kế hoạch học tập dành cho sinh viên đại học chính quy chuẩn năm học 2026–2027 | 5 |
| Kế hoạch tổ chức học tập năm học 2026–2027: tiếng Anh bán phần / đặc biệt / tinh hoa | 5 |
| Quyết định về mức thu học phí và các loại giá dịch vụ năm học 2026–2027 | 12 |

Prior approved postflight records 73/73 completed units and five original-byte hashes matching the accepted extraction snapshot. No current remote-readiness claim is made in this task. The last recorded production catalog was ten active PDFs plus one deleted record; these five staging DOCX are **not** claimed deployed in production.

Local files addressed by the extraction report's display filenames currently match the accepted hashes for the two regulations, but not the two plans and tuition. The three differing local files are rejected by the current parser (table-merge conflict or unsupported/review-required structure). The provider's stored original filenames are sanitized variants, not reliable local-path identity. Do not select a copy by name or replace staging/production automatically. Before cutover the Admin must provide/attest bytes matching the accepted hashes, or separately authorize review/testing of a different source version. This is not a claim that the existing accepted staging corpus changed.

Current official-site inspection also identifies material needing authority review:

- [HUB faculty's 2026–2027 DRL form notice](https://khoalkt.hub.edu.vn/thong-bao/cac-hoat-dong-khac/thong-bao-mau-phieu-danh-gia-ket-qua-ren-luyen-sinh-vien-nam-hoc-2026-2027-230509.html) corroborates total 100 and five groups 25/20/20/15/20. It does not authenticate the exact staged Word bytes, decision identifier or every appendix note.
- [HUB faculty's notice concerning Circular 40/2026](https://khoalkt.hub.edu.vn/thong-bao/cac-hoat-dong-khac/thong-bao-ve-thong-tu-so-40-2026-tt-bgddt-quy-dinh-ve-cong-tac-sinh-vien-230510.html) states an effective date of 30/6/2026 and that conflicting provisions cease to apply. The signed complete text and applicability against both staged regulations require Admin/authority review. Do not infer that every old provision is automatically invalid or silently rewrite the corpus.
- The Word's conduct cover identifier (5549, 02/10/2026) differs from the earlier supplied 3529 benchmark. Independent identity/current effect remains NOT VERIFIED. Tuition retains fourteen literal unreadable markers, including its decision identifier. Dates/program scope and unreadable requested cells must remain source-constrained, not guessed.

No upload, replacement, reindex or source edit is authorized. Before production use, approve exact source hashes/applicability and a reversible eligibility cutover preserving old objects/revisions and the deleted record. Generic delete removes objects and is not safe supersession. The two different program plans must not replace each other. Superseded or unverified sources must not stay simultaneously eligible just because they share a title or are uploaded later.

## Database: 0054 is required by the intended release

The only new migration relative to main is `0054_ai_document_search_ingestion_state.sql`: four additive columns on `ai_documents` (`ai_search_status`, `ai_search_revision`, `ocr_uncertain_tokens`, `gemini_indexing_status`). Native ingestion and provider-status reconciliation write these fields; the Public live-state preflight requires all four even with feature flags OFF. Some legacy Advisor reads tolerate an older schema, but that is **not** permission to bypass the migration gate or declare the whole release compatible without 0054.

All earlier migrations are existing dependencies, not permission to reapply a pending batch. No 0055/new migration is needed for these sync/citation/telemetry changes. Production's last observed snapshot had 0/4 columns; current schema/ledger is NOT re-read here.

Approved fixture-only backup/migration/Time Travel restore rehearsal passed. **Full production-copy rehearsal is DEFERRED by owner, not PASS.** It therefore provides no proof that all real tables, constraints, row digests and concurrent writes can be restored intact.

Minimum separate authorization before any production D1 change:

1. Approve the exact database UUID, migration file/hash and maintenance scope; read current schema/ledger and verify preceding schema assumptions. Partial 1–3 columns means STOP; four existing columns require a matching ledger, not raw ALTER replay.
2. Approve a private complete export, hash/schema/all-row digests, Time Travel bookmark, backup storage/retention and a safe restore-verification method. No private backup or credential enters Git.
3. Either authorize the deferred full-copy rehearsal or explicitly accept its residual recovery risk and approve a bounded alternative. Fixture success cannot silently waive it.
4. Apply ONLY 0054 through an isolated migration directory/ledger, using a separate approved migration credential. Validate old rows, defaults, schema and ledger; no bulk pending-migration apply.

Rollback code first, keep additive columns. Whole-D1 restore is a separately approved last resort, requiring a write pause and accepted data-loss window; it affects every shared domain. Do not drop columns to roll back the Worker.

## Deployment and AI gates

The proposed `.github/workflows/deploy-cloudflare-production.yml` is manual-only, exact main SHA/solo-owner dispatch, protected environment, fresh separately recorded owner SHA/run-ID confirmations, independent exact-main manual CI provenance and live Cloudflare schema/settings preflight. It runs only Public/frontend `wrangler deploy --config cloudflare/wrangler.jsonc --keep-vars`; no Auth deploy, migrations, documents or backfill.

The live workflow ID remains Disabled. **Never enable today's main source**, which still contains the old shared deploy. After a separately approved PR merge, first inspect the resulting manual/Public-only source; only then can owner separately approve enabling that replacement and dispatching it. This task approves neither action. Public-scoped Cloudflare release credentials/resource permissions remain NOT VERIFIED here; do not grant D1/R2 write or AI Search indexing merely for the deployment. Workers Scripts Edit is account-scoped and does not itself guarantee Auth isolation.

Initial code-only configuration must remain:

```text
AI_ADVISOR_V2_MODE=canary
AI_ADVISOR_V2_CANARY_PERCENT=7
AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED=false
AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED=false
AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT=0
```

Bind/settings/observability drift means STOP, not overriding live state to match repo defaults. Record the approved previous Public version/settings as rollback; `--keep-vars` alone is not preservation proof.

Cloudflare-first selected document requests do not automatically fall back to Gemini/general generation when evidence/provider fails. They abstain safely. Consequently the special-plan Gemini missing receipt/timeout does **not** block a verified Cloudflare-only document pilot where Gemini is not used; it remains an unresolved issue for excluded users/legacy routing and must not be marked fixed. Personal/structured/general routing stays outside document policy.

Citation and staging metrics fixes have local/CI evidence, but **no post-patch staging UI/provider acceptance**. Prior 1190fd6 testing had correct answer content but two locator failures per routing batch; prior b90131c baseline had 30/30 per bucket and 9/9 controls. Do not substitute these for verification of the merged head. Owner cancelled the 12-turn plan; no new provider suite is started or required by this report. Before activating policy, owner must accept/resolve the remaining verification gap under a separately scoped decision.

Policy caps remain 3 searches, 3 hydration reads and 1 generator per request, with bounded deadline/auth/current-revision checks. Counters/usage are not a daily USD limiter; persistent production cache savings and measured billing are unavailable. Before pilot, accept a monitored budget/kill switch or authorize a hard limit separately. Gemini repair, broader OCR and Admin OCR review expansion can be deferred; source applicability, database safety, approval guards and false-citation risk cannot be hidden behind green tests.

## Minimal release sequence and stop points

1. **Code/GitHub only:** finish this merge-to-PR, exact-head CI, owner review; keep Draft/NO-GO. Resolve source-version decisions and review remaining dependency risks without Cloudflare writes. Separately approve merge of #88; keep old workflow disabled; manually validate exact resulting main SHA without deploy.
2. **Database approval:** authorize the backup/recovery-risk decision and exact 0054 operation above. Stop on UUID/schema/ledger/backup uncertainty. No deployment job applies it.
3. **Public code OFF:** separately verify/approve minimum-scope credentials, live settings/bindings and previous version; approve replacement workflow activation, main-SHA dispatch and fresh owner variables. Deploy Public only with all new flags OFF. Stop on auth/health/schema/observability drift; restore previous Public version/settings, leaving 0054 additive fields.
4. **Sources:** separate Admin approval and reversible source cutover/indexing; preserve originals/revisions, verify exact hashes and all real receipts. Stop on unverified authority, conflicting eligibility, unreadable requested data or incomplete index. Roll back eligibility, never delete originals.
5. **Limited policy pilot:** separate cohort/verification-gap/budget approval, monitored bounded pilot, no synthetic production data. OFF/0 is immediate policy rollback; keep V2 canary 7%. Safety/cost/latency breaches stop expansion; each increase requires approval.

No stage above is authorized by CI PASS. At handoff distinguish CODE READY (merge + tests/CI), STAGING VERIFIED (partial/historical), DATABASE READY (blocked), DOCUMENT READY (blocked for production applicability/cutover) and PRODUCTION RELEASE READY (NO-GO).
