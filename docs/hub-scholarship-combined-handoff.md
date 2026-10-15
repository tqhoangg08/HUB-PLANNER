# HUB Scholarship — final release hardening

Review date: 2026-10-15. Contract **v1.1.0**, no schema/endpoint changes. Draft [PR #91](https://github.com/tqhoangg08/HUB-PLANNER/pull/91) targets main; Draft [PR #94](https://github.com/tqhoangg08/HUB-PLANNER/pull/94) targets the backend branch. This is an owner-review handoff, not deployment authorization.

## Changes and file inventory

- `AdminScholarships.tsx`: current-value draft edit/create forms, validation, busy/disabled/error states and original expectedRevision. A 409 locks resubmission until the operator reloads and reviews. Validated/approved/published/archived campaigns stay uneditable; server authorization/state/CAS guards are unchanged.
- `ScholarshipAdminControls.tsx`, `useScholarshipAdminPage.ts`, `scholarshipAdminModel.ts`: accessible modal/retry/pager controls and independent backend pagination for campaigns, imports, immutable batch details and audit. Twenty rows/page, real totals, page clamping, cancellation and scope reset. API failure is an error, not empty data. Candidate/history/file reads retain cancellation/campaign guards.
- `scholarshipApi.ts`: 20-second request/body timeout, caller cancellation, Vietnamese session/permission/conflict/service errors; credentials/status/Retry-After preserved. Timed-out mutations may have committed: refresh state before retrying. No automatic retries, privilege expansion or approval.
- `CelebrationStudio.tsx`, `scholarshipPortrait.ts`: actual PNG/JPEG/WebP signature/header dimensions before decode and decoded dimensions after decode; 10 MiB, 4096px/edge, 12 million pixels, 10-second decode timeout. Reject animated PNG/WebP, disguised, malformed and oversized input. Cancel on replacement/session/unmount; revoke URLs and release image/canvas resources; prevent concurrent export and reverify ownership before PNG/share. No image server upload.
- `scholarshipCelebrationModel.ts`: bounded word-aware name/campaign wrapping with complete source text. Long names use at most three lines; heading/provenance at most two. Short-name card design, masks and zoom remain.
- `devApiBridge.ts`: fix local Admin PATCH 403 by translating only matching local browser origins to a loopback Scholarship upstream. Foreign/missing origins and Sec-Fetch-Site remain unchanged. Production Scholarship upstream gets no translation; dev plugin remains serve-only. Auth Worker was not edited.
- `dev-scholarships-local.mjs`: opt-in extended history/draft and long-text fixtures plus controlled Admin errors. Loopback-only, ephemeral D1, outbound denial; NODE_ENV=production still fails before listening. No dev identity/server import in production Worker graph.
- New `scholarship-hardening.test.ts`; updated frontend/dev-bridge and D1 runtime regression tests. No added dependency. Contract/backend handoff and this existing report refreshed. Earlier c0e5513 cleanup removed ScoreBadges, obsolete UI-refinement handoff and 41 intermediate images/exports; nine reference/QA images remain. Admin/Studio evidence refreshed; private PNG exports are not committed.

## Preserved policy and behavior

Approved Canva public table unchanged: seven desktop columns (STT, MSSV, exact full name, approved class/major/cohort, rank/legacy result); five on mobile with combined name/code. One scrollable mobile table. No card replacement, retired score/credit/program columns, program/type dropdown or new sticky column.

Search, class, rank, major, cohort, semester/year, backend SQL AND, 350ms debounce, URL state, global totals, page reset, approved facets, clear/collapse/live search, Inter/header/login/avatar/sidebar/icon rail/drawer, Me and rules remain. Historical type/award API/source/URL compatibility remains; no GPA/code/class inference. Import/preview/apply/per-field approval/explicit republication confirmation/publish/unpublish/rollback/archive and verified ownership stay server-side. No schema history edit/reset/drop, remote migration, production write/deploy, secret/branch-protection change or PR merge.

## Actual validation

Executed in the current-main integration candidate, excluding primary workspace dirty edits. Final Studio changes were followed by another targeted/full/build/dry-run pass; older PR counts are not reused.

| Command | Final result |
| --- | --- |
| npm run typecheck | PASS, exit 0 |
| npm run cf:typecheck | PASS, exit 0 |
| npm run test:scholarships | 34/34 PASS |
| npm run test:scholarships:frontend | 32/32 PASS |
| npm test | 920/920 PASS, zero failure/skip |
| npm run build | PASS; existing chunk/Browserslist notices |
| npm run cf:check | PASS; Wrangler 4.115.0 dry-run only |

Tests cover draft edits, stale revisions, invalid text, non-Admin/protected states through real transitions; pages beyond page 1; errors, request/body timeout/cancellation without retry; modal/pager rendering; image format/animation/size/dimension/decode/resource limits and complete long Vietnamese text. Graph/QA-cookie fail-closed tests remain. Initial compile/regression failures and an invalid test-fixture transition were corrected and rerun, not counted as PASS.

Browser at **360/390/768/1280/1440px**: Inter, no page horizontal overflow, unchanged public columns. Maximum-length Studio text and edit modal fit all widths. Current values/empty-title error/409 locked-save/reload/valid PATCH revision update verified. Published campaign has no edit button. Page 2 checked for 26 campaigns, 25 imports, 29 audit events and 96 batch rows (starts at student 21). Simulated 503 shows retry/error without false empty. Session/permission/timeout paths also have regression coverage.

Synthetic student cannot enter Admin; anonymous Me shows login. An open Studio refuses export after fresh ownership no longer matches. Real file upload, oversized-image rejection, circle/arch masks and zoom exercised. Story/Feed downloads inspected at **1080x1920 / 1080x1350**, including 160-character name and 240-character campaign. Network trace confirms fresh /api/me/scholarships 200 before eligible exports. No real portrait/student file used. Live Google/email/OTP and native OS share are not certified.

Evidence: [Admin form](screenshots/hub-scholarship/admin.jpg), [Studio long-text fixture](screenshots/hub-scholarship/combined/studio-portrait.jpg), [public desktop](screenshots/hub-scholarship/combined/list-without-type-desktop.jpg), [mobile](screenshots/hub-scholarship/combined/list-without-type-mobile.jpg), [drawer](screenshots/hub-scholarship/combined/mobile-menu-open-390.jpg). Original Canva reference is historical design evidence, not an importer source.

## Main integration, migrations and local work

Fetched main **93eda001ed12271b3f10853ede207a5cb264fc82**. Separate candidate merged main/backend then the stacked frontend; package.json conflict resolved by retaining Scholarship AND main document-tag tests. Backend/main candidate **cf9a9f046d68544f461d0c7968ed42abddfc4bd5** was fast-forwarded on the backend feature branch only. Backend documentation head **b0d30980e902cbb0cbef37a4d91d7c3cfa2657f5** is included by frontend PR HEAD. Main itself unchanged; no rebase/force-push/PR merge. Integrated routing/D1/Auth/rate-limit bindings and API compatibility PASS; Scholarship needs no new secret.

Distinct AI/Scholarship filenames share 0055/0056/0057 prefixes. Wrangler --local fresh **59-migration** chain PASS; current-main DB upgrade PASS with an existing synthetic marker retained. Reverse Scholarship-before-AI order in ephemeral SQLite PASS, zero FK violations/campaigns. No migration rename/edit. Coordinate future filenames.

Primary D:/Projects/HUB-PLANNER stays on c0e5513 because of pre-existing Admin/Studio/list/API edits, deleted Canva handoff and untracked docs/ai-advisor-v2. Tracked dirty patch is byte-identical before/after. Those edits are excluded from validation; reconcile separately before release. Review attached integration worktree/PR HEAD. Logs/fixtures/exports remain ignored/private.

## Readiness, remaining decisions and blockers

**Technical: READY FOR OWNER REVIEW** for scoped Scholarship changes/integrated candidate. Server Admin/ownership/publication gates, approved-only snapshots/facets, bound SQL, privacy-safe errors/logging and explicit approval remain. Production DB contents/live binding/secret existence, identity provider, native share and production load were not inspected/certified.

**Dependency release gate:** actual npm audit --omit=dev reports 7 affected packages (6 high, 1 moderate): axios, brace-expansion, dompurify, form-data, react-router, react-router-dom, undici. This additional check is FAIL; the seven required functional/build commands above are PASS. GitHub separately reports 88 default-branch alerts including development dependencies. Shared dependency remediation/exploitability assessment remains application-wide work and must be resolved by the owner release/security process before deployment; no dependency version was silently changed or certified by this scoped hardening.

**Empty-data deployment: CONDITIONAL**, requiring separate owner release approval, reviewed SHA, backup, live bindings/operations and dependency/release review. Apply reviewed additive migrations before compatible Worker/frontend only during that approved rollout. Build/dry-run PASS is not authorization.

**Real data publication: NOT READY — RELEASE BLOCKER.** Official source and documented university permission per republished field are absent. No real import/publication. Technical validation is not legal clearance. Retention/deletion/correction/withdrawal require an authorized operational policy. Unpublish hides subsequent no-store reads; delivered data cannot be revoked, immutable snapshots remain retained, archive is not erasure. Correct via reviewed new snapshot and explicit approval; rollback only to approved/published snapshots whose authorization remains valid. Never automatically republish revoked data.

`ANTIGRAVITY_READY = YES` means v1.1 integration/synthetic acceptance only. Both PRs remain Draft; no deployment authorization.
