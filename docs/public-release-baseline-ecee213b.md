# Task 09/10 — Verified production baseline

Preparation main: `33d9d018d7d36d4f476aff66c56564b1ad553f2f`, independently confirmed merge of [Task 09 PR #137](https://github.com/tqhoangg08/HUB-PLANNER/pull/137).
**Baseline preparation only: this does not release Task 09.** Production serves Task 08 SHA `f55e2b3553358858b32cad72a31e1b4aa7a7c0a4`.

## Independent Cloudflare live observation

[Sanitized JSON evidence](public-release-baseline-ecee213b.json) records the point-in-time verification at **2026-10-23 06:33:45 UTC / 13:33:45 Asia/Saigon**, using the existing authorized Dashboard session.

- Correct repository account `6cd8bac6009a55f96bdf9df7c2057548`, Worker `hub-planner-public-dev-api`, environment **Production**.
- Dashboard: `ecee213b`, **100%**, **Ready**, source **Wrangler**.
- Latest deployment `6bfa01bd-e08f-433b-97c1-9a8c5a4837b4`, source `wrangler`, strategy `percentage`, created **2026-10-23 04:46:59.816222 UTC**.
- Exactly one serving version: `ecee213b-dbe8-4ce9-98e8-a8c9a13e184b`, **100%**, no split.
- Matching version **468**, source `wrangler`, created **2026-10-23 04:46:59.098403 UTC**.

The Dashboard UI and freshly navigated deployment/version metadata GET documents agree. Only allowlisted metadata was projected from rendered JSON. No screenshot, secrets, credentials, cookies, tokens or response headers extracted or recorded. No modifying requests or production SQL.

## Direct GitHub release provenance

[Run #39901349479](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39901349479), **Approved Public-only production release**: `workflow_dispatch`, `main`, attempt 1, exact SHA `f55e2b3553358858b32cad72a31e1b4aa7a7c0a4`, completed/success.

- Validate job `120243422770`: SUCCESS, **04:38:02–04:41:07 UTC**.
- Release-public job `120244291070`: SUCCESS, **04:46:09–04:47:09 UTC**.
- **04:46:50.8337323 UTC:** predeploy PASS on `79c4f615-cab1-49be-81b4-6622bfe415d1`.
- Checked-out SHA and APPROVED_SHA match the exact release SHA.
- **04:46:52.1657351 UTC:** solo Owner approval PASS.
- **04:46:57.8120329 UTC:** 55 assets uploaded, 114 already uploaded; 173 files read.
- **04:47:01.4306490 UTC:** Public Worker upload succeeded.
- **04:47:04.6983815 UTC:** Worker triggers deployed.
- **04:47:04.6993347 UTC:** Current Version ID equals the verified full UUID.
- **04:47:07.4593764 UTC:** postdeploy PASS on the new version.

All four required predeploy/approval/deploy/postdeploy steps completed successfully. Cloudflare creation timestamps fall inside the actual **04:46:52–04:47:04 UTC deploy step**, version before deployment. Ordered receipts match the correct steps, accounting for second-resolution GitHub step times and fractional log times. Receipts confirm Public V2 `canary` at **100%**, and document feature flags **false / false / 0**.

## Task 09 merge chronology

Release completed **2026-10-23 04:47:09 UTC**. PR #137 merged later, **06:25:10 UTC**. Git commit `33d9d018d7d36d4f476aff66c56564b1ad553f2f` was committed **06:25:09 UTC** with subject `Merge pull request #137 from tqhoangg08/codex/task09-school-announcements-modal` and exact parents:

1. Release/main parent `f55e2b3553358858b32cad72a31e1b4aa7a7c0a4`.
2. Feature HEAD `d35cd230431673028bf80a7b70f3dbfccdd663df`.

Actual Git objects and direct GitHub PR metadata agree. Historical approval receipts authorize the Task 08 release only, not a future Task 09 release.

## Guard equality and historical evidence

Exactly four files change: the guard UUID and two provenance comments, rollout regression, and this JSON/Markdown pair. Only guard lines **12, 13, 14** differ. Complete before/after source is identical after LF normalization and replacement of those two specific comments and the UUID declaration with fixed placeholders. Normalized SHA-256: `4f998d2de46c733e22eaca729acd7f503c05d99866bdcdd17cf92b99be1f6f3c`.

Historical count is derived from the actual preparation-main Git tree, not hardcoded. All **33 historical baseline/evidence Git blobs** are preserved, including [79c4f615 JSON](public-release-baseline-79c4f615.json) and its [report](public-release-baseline-79c4f615.md). Manifest SHA-256: `51810d7a58554a44066943e0bc256975047dedc2edcad95fc19c54f6d8fde8a7`. Regression compares every file through Git clean filters, preserving Windows CRLF compatibility.

Exact-main authorization, solo Owner approval, protected environment, V2 100%, document flags OFF, read-only metadata, bindings, schema/ledger/quota, postdeploy and fail-closed guards remain unchanged. SchoolAnnouncements, Task 07/08 UI, MobileHome, Overlay, Auth/API/database, configuration, workflows and dependencies are untouched.

## Validation and limits

Executed on Node v24.12.0, all exit code **0**:

- Four requested release/security suites: **295/295 PASS**, 0 failed, 0 skipped.
- Frontend typecheck: **PASS**.
- Cloudflare typecheck: **PASS**.
- Production build with PWA service worker generation: **PASS**; existing Vite chunk-size warning, no bundling changes.
- `git diff --check`: **PASS**; staged four-file diff checked again before commit.

Command-log SHA-256 values, exit codes and validation timestamp are in JSON. Local logs remain under .cache/task09-baseline-*.log and are not committed.

 Four targeted release/security suites cover acceptance of the verified version; rejection of previous/obsolete/unknown versions, partial/split traffic and wrong/stale postdeploy beforeVersion; receipts/timestamps/merge parents; guard-source equality and historical blob integrity.

Full offline suite belongs to final pushed HEAD GitHub PR CI, linked in the PR description. No Task 09 browser rerun or AI/database benchmark is performed locally.

This is point-in-time deployment/version provenance, not a fresh audit of health, quota, full live bindings, schema/ledger, environment protections or secrets. Unchanged release gates must recheck the required conditions and obtain Owner approval for the exact final main SHA. **No merge, deploy, release trigger, production permission/environment change or production write is performed by this task.**
