# HUB Scholarship — pre-deploy cleanup and release audit

Audit date: 2026-10-15. Contract **v1.1.0**. Backend Draft [PR #91](https://github.com/tqhoangg08/HUB-PLANNER/pull/91) targets main; frontend Draft [PR #94](https://github.com/tqhoangg08/HUB-PLANNER/pull/94) targets the backend branch. No release/deployment authorization is implied.

## Cleanup summary and file inventory

| Classification | Files / decision |
| --- | --- |
| KEEP | Scholarship Worker/Admin handlers, shared import validator, CSV/XLSX parser/CLI, migrations 0055–0057, all auth/ownership/publication gates, frontend routes/lazy screens, Me/Studio/Admin and tests. Legacy awardType/summary, optional scholarshipType APIs and historical URLs remain compatible. No new dependency was added by these branches; existing ExcelJS/PapaParse/Miniflare are still used. |
| SAFE CLEANUP — edited | Main lookup removes only the program/type dropdown, per latest audit request. Its URL/API compatibility remains; clear resets it. Removed 36 unused named imports and unused Studio navigation/corner local variables; removed Studio error console logging. Fixed API header to v1.1.0 and private snapshot field types, replaced preview mapping any with ImportMapping. Removed the dead program-selector CSS rule. |
| SAFE CLEANUP — removed | Unused `features/scholarships/ScoreBadges.tsx` (no application consumer; shared score formatter remains). Superseded `docs/hub-scholarship-ui-refinement.md`. 41 obsolete intermediate screenshots/exports; the two synthetic Story/Feed PNG binaries are not test fixtures and were removed. Git history retains earlier evidence. |
| KEEP — QA evidence | Nine images remain: current desktop/mobile, drawer and Studio under `combined/`, plus the original Canva reference and four old screenshots still referenced by the locally modified/deleted Canva handoff. Those five are historical, not current acceptance. Inspected retained screenshots: synthetic names/codes and repository logo fixtures; no real portrait/account avatar or official student source file is needed or introduced. |
| KEEP — isolated dev | `scripts/dev-scholarships-local.mjs`, dev bridge, synthetic tests and ephemeral D1. QA startup now rejects NODE_ENV=production. Ignore rules cover QA state, private imports, local D1/cache, exported PNGs and local dev secrets. |
| UNRESOLVED / preserved | Existing dirty API notes, deleted Canva handoff, Admin/Studio/list changes, and untracked docs/ai-advisor-v2 are excluded from audit commits. Clean candidate validation uses a separate worktree with only intended changes; local-only behavior is not certified. |

## Preserved behavior and final UI policy

The approved table is unchanged: desktop STT, MSSV, Họ và tên, Mã lớp SV, Ngành học, approved Khóa, Xếp loại HB (legacy result fallback when rank is unapproved). Mobile uses the same table with combined name/code and no STT. No academic/training score, credit or program/type table columns are reintroduced. No new sticky student column is added.

Visible lookup controls: MSSV/name, class, scholarship rank, major, cohort, semester/year. Program/type is absent from the main filter UI. Existing URL program/type and legacy category/awardType conditions are forwarded to the backend and retained when other filters/collapse change; clear removes them. Filtering is SQL AND across the whole active snapshot, debounce 350ms, page reset, global totals and approved dependent facets. Hidden conditions are not silently discarded. Collapsed search, adjacent clear/collapse buttons, one mobile scrollable table, Inter/header/avatar and sidebar/icon rail/drawer remain.

Me requires verified session ownership. Studio keeps portrait upload/crop, templates, fresh server ownership recheck before PNG/share, and browser-local image processing. ConfettiOverlay/ScholarshipBadge have confirmed consumers and remain. Admin preview/apply/per-field approval/publish/unpublish/rollback/archive remain server-authorized.

## Privacy, security and production separation

- Public queries join only a published campaign with public approval and an applied, approved active snapshot. Preview/inactive rows and unapproved scores/major/class/cohort/program/rank cannot be accessed through recipients, own awards or facets. Bound SQL, exact query validation and bounded snapshot scans are preserved. Per-score gates and immutable triggers remain.
- Every Admin read/mutation verifies the server admin role; user/auditor and forged role headers cannot elevate access. JSON/body/origin/revision/CAS checks, audit and atomic rollback remain. No frontend MSSV claim can select a personal award. Source-file SHA is operator-supplied provenance, not independent proof of authenticity.
- Worker entrypoint is `cloudflare/worker/src/index.ts`; static assets are dist and `/api/*` runs the Worker first. QA server/CSV tools/dev bridge are not in the production Worker import graph. Regression tests check graph isolation and that a QA cookie grants no privilege: no-cookie yields 401; a cookie without AUTH_SERVICE yields 503, failing closed.
- Vite dev API plugin uses apply:serve; scholarship proxy permits only explicit HTTP loopback and has no production fallback. Other existing application's dev routes can still use its configured production backend; scholarship QA startup explicitly points both origins to loopback. No production config/authentication change is made.
- QA listens only on 127.0.0.1, uses in-memory D1 and outbound denial, and local synthetic identity responses. NODE_ENV=production is rejected before opening a listener. No mock route/identity is imported by the production handler. Browser QA is synthetic, not live Google/email/OTP certification.
- Scholarship handlers do not log names, codes, score cells or search terms. Build drops console/debugger in the browser. Applied data is retained after unpublish; subsequent reads use no-store. Data already downloaded cannot be revoked. Retention/deletion/correction and re-publication after revocation require an authorized operational policy; archive is terminal, not physical erasure.
- DB, AUTH_SERVICE and SCHOLARSHIP_SEARCH_RATE_LIMIT bindings are present in config. Scholarship requires no new secret. Live binding/secret existence and actual production data are not queried, changed or certified in this audit. No real data import, remote D1 command, production deployment, Auth Worker edit or branch-protection change.

## Needs review and release blockers

**RELEASE BLOCKER:** no official source file and no documented per-field university republication authorization. Do not ingest/publish real student data. Technical PASS is not legal clearance. Empty-data infrastructure remains CONDITIONAL on separate owner release approval, current-main integration and live binding/operational verification.

**NEEDS REVIEW:** Admin “Sửa thông tin” sets edit state but has no edit modal; `updateAdminCampaign` API is retained for compatibility. Admin listError and non-modal actionError are not rendered consistently, so service errors can resemble an empty list. Import/history views show only initial 20/30 rows without pagination UI; server APIs still support pagination. Some form labels lack associations; local Studio removes several accessibility labels. These were not deleted, redesigned or silently repaired because Admin workflow/local edits require review.

**NEEDS REVIEW:** local Admin edits remove committed cancellation/history guards; local list edits change the empty last-page guard. They are backed up and excluded. Review before including them in any release. Studio still needs explicit decoded-image dimension/magic-byte bounds and long name/campaign canvas text QA; existing MIME/10MiB checks and browser decode are present. No server image upload exists.

**NEEDS REVIEW:** rate limiting is approximate per Cloudflare location and applies to filtered/facet requests; it is not an anti-enumeration guarantee. Maximum source snapshot is 2000 rows / 1MiB JSON / 4MiB source. No production load test or live identity-provider test is claimed.

## Branch, migration and rollback audit

Fetched origin/main at 7fa10b9 and both PRs. At audit start backend was 10 commits behind / 14 ahead of main; frontend 10 behind / 33 ahead. `git merge-tree --write-tree --messages` found no conflicts for main/backend or backend/frontend without changing either checkout. No main merge/rebase was performed. Recent main changes affect AI documents and two AI migrations, not Scholarship schema; the computed merge retains rate-limit config and routes.

Main already has `0055_ai_document_index_segment_count.sql` and `0056_ai_text_document_revisions.sql`, sharing number prefixes with Scholarship migrations. Names differ. Local upgrade from all current main migrations to Scholarship 0055–0057 PASS with Wrangler 4.115.0; filename-level migration tracking applies all three. Migration history is not renamed/rewritten. A fresh combined-chain check and reverse-order check are recorded in the current test ledger. Coordinate future migration numbering before release.

Owner-reviewed rollout order: integrate/revalidate current main, review both Drafts and exact candidate SHA, verify backup/bindings, apply the reviewed additive migrations before the compatible Worker/frontend, and start empty. These are instructions for a separately approved release, not actions executed. Unpublish hides subsequent reads; re-import a corrected candidate, inspect, explicitly approve authorized fields, then publish. Rollback can target a previously approved/published snapshot only, so verify authorization is still valid. Do not drop tables/restore stale raw rows or automatically republish revoked data.

## Current validation ledger

All commands below were executed for this audit, not copied from earlier PR reports. Frontend/full/build validation ran in an isolated clean candidate worktree, excluding pre-existing local edits.

| Command | Actual final result |
| --- | --- |
| npm run typecheck | PASS, exit 0 |
| npm run cf:typecheck | PASS, exit 0; also run on backend branch |
| npm run test:scholarships | PASS, 32/32; backend branch and integrated candidate |
| npm run test:scholarships:frontend | PASS, 24/24 |
| npm test | PASS, 878/878, zero failures/skips |
| npm run build | PASS, exit 0; existing Browserslist/chunk-size warnings |
| npm run cf:check | PASS, exit 0; Wrangler dry-run only |

D1 validation: current-main-to-Scholarship upgrade PASS; fresh combined 58-migration chain PASS with Wrangler --local; reverse Scholarship-before-main-AI order PASS in ephemeral SQLite, zero foreign-key violations and zero campaigns. No remote migration ran. Production Worker import graph and dist scans contain no Scholarship QA server/identity/dev bridge; startup under NODE_ENV=production exits before listening. Initial new graph/QA-cookie assertions failed and were corrected (an existing non-Scholarship helper is allowed; missing Auth service correctly returns 503 rather than 401), then targeted and full suites passed.

Current browser QA used the clean candidate and explicit loopback backend: 1440px/390px, computed Inter, no page horizontal overflow, seven/five table columns, no type dropdown. Major Kế toán + cohort K24 + rank Giỏi gives 48 global results; collapsed MSSV search gives 1, no-match 0, clear 96; page 2 starts at row 21. Legacy /scholarships/list redirects with type/ref query intact and returns 24 source-matched rows without restoring the dropdown. Empty campaign and backend failure have distinct neutral/error states. Mobile drawer opens and closes; current screenshots were refreshed.

Synthetic student sees two own awards and cannot enter Admin; synthetic Admin can enter the approval screen, where republication confirmation is unchecked and Save disabled. Studio PNG export was exercised and its fresh /api/me/scholarships ownership request returned 200 before the success message. Portrait/crop and real downloaded PNG dimensions were not newly reverified in this cleanup; retained Studio image is historical workflow evidence, not a new claim. Server tests cover preview/apply/approve/publish/unpublish/rollback, hidden fields and authorization.

Backend audit commit: 1186087ce6614e4ce7d4f35dcc96a26c20de23bb. The frontend includes matching shared documentation/test changes without an automatic branch merge/rebase; recheck mergeability after both pushes. Logs and the original dirty patch are retained under ignored .cache/scholarship-release-audit/ in the primary workspace.

## Minimal evidence and safe local startup

Current synthetic evidence: [desktop](screenshots/hub-scholarship/combined/list-without-type-desktop.jpg), [mobile](screenshots/hub-scholarship/combined/list-without-type-mobile.jpg), [drawer](screenshots/hub-scholarship/combined/mobile-menu-open-390.jpg), [Studio](screenshots/hub-scholarship/combined/studio-portrait.jpg). Desktop/mobile and drawer were refreshed after the audit UI dropdown removal. Historical Canva screenshot contains design example rows only; it is not an importer source or production data.

Terminal 1: `$env:SCHOLARSHIP_QA_PORT='8794'; npm run dev:scholarships:local`. Terminal 2: set DEV_BACKEND_ORIGIN and DEV_SCHOLARSHIP_BACKEND_ORIGIN to `http://127.0.0.1:8794`, then `npm run dev -- --host 127.0.0.1 --port 3002 --strictPort`. State is ignored `.cache/scholarship-qa-state.json`; all records and identities are synthetic. No development server is required by the production Worker.

**DEPLOY READINESS = NOT READY for real data publication.** Empty-data code/infrastructure is CONDITIONAL, not authorized for deployment. `ANTIGRAVITY_READY = YES` refers only to v1.1 integration with synthetic fixtures; it does not override release blockers.
