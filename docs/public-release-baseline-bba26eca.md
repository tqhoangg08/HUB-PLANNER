# Task 07/10 — Production baseline preparation

Preparation main: `6f9e5a2c82c1353e6a1eca1a13f2d5a8ad21748f`, confirmed merge of [Task 07 PR #133](https://github.com/tqhoangg08/HUB-PLANNER/pull/133).
**This is baseline preparation only. Task 07 has not been released to production.**
Production still serves Task 06 release SHA `e4740ecada34ad4569104ca4133b01fe586e38b4`.

## Independent live verification

[Sanitized JSON evidence](public-release-baseline-bba26eca.json) records a point-in-time observation at **2026-10-22 09:10:05 UTC / 16:10:05 Asia/Saigon**, using an existing authorized Cloudflare Dashboard session in the in-app browser.

- Repository account `6cd8bac6009a55f96bdf9df7c2057548`, Worker `hub-planner-public-dev-api`, environment **Production**.
- Dashboard shows `bba26eca`, **100%**, **Ready**, source **Wrangler**.
- Latest deployment `46192f2f-2bc4-4381-ae16-5fd979e8c2f9` contains exactly one version: `bba26eca-7811-4f1a-802e-f6bc7c6f7421`, percentage **100**. No traffic split. Source `wrangler`, strategy `percentage`, created **2026-10-21 15:42:50.716277 UTC**.
- Matching version **#466**, source `wrangler`, created **2026-10-21 15:42:49.547999 UTC**.

The Dashboard UI and independently rendered deployment/version GET documents agree. JSON retains their URLs and only allowlisted metadata. No screenshot, cookies, credentials, tokens, response headers or secrets were extracted. No production SQL or modifying API was used.

## Release provenance

[Release run 39626657658](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39626657658), **Approved Public-only production release**, completed successfully: `workflow_dispatch`, `main`, attempt 1, exact SHA `e4740ecada34ad4569104ca4133b01fe586e38b4`.

- Validate job `119313560780`: SUCCESS, **2026-10-21 15:32:48–15:36:48 UTC**.
- Release-public job `119315575288`: SUCCESS, **15:41:51–15:43:01 UTC**.
- **15:42:39.2473956 UTC:** predeploy PASS on previous baseline `f5abb252-a042-45e7-9f4e-96bdb550dd8e`.
- Checked-out SHA and APPROVED_SHA equal the exact release SHA.
- **15:42:40.9406151 UTC:** solo Owner approval PASS.
- **15:42:48.4784839 UTC:** 55 assets uploaded, 112 already present; 171 files read.
- **15:42:52.2650626 UTC:** Worker upload succeeded.
- **15:42:55.2882644 UTC:** Worker triggers deployed successfully.
- **15:42:55.2889282 UTC:** Current Version ID is the candidate UUID.
- **15:42:58.8417986 UTC:** postdeploy PASS on the candidate UUID.

Log receipts show V2 mode `canary`, percentage **100**, retrieval/document flags **false / false / 0**. All four required preflight, approval, deploy and postdeploy steps passed. Version and deployment timestamps fall inside the actual **15:42:40–15:42:55 UTC deploy step**; version creation precedes deployment. Timestamped receipts are ordered and contained in their required steps (GitHub step timestamps have second precision, while log receipts include fractions).

## Task 07 merge provenance

Production release completed **2026-10-21 15:43:02 UTC**. PR #133 merged later, **2026-10-22 08:55:13 UTC**. Actual Git merge commit `6f9e5a2c82c1353e6a1eca1a13f2d5a8ad21748f` was committed at **08:55:12 UTC**, with subject `Merge pull request #133 from tqhoangg08/codex/task07-schedule-filter-collapse` and these exact parents:

1. Release/main parent `e4740ecada34ad4569104ca4133b01fe586e38b4`.
2. Feature HEAD `f61824c76370dd820ca66fd1c6b0d3ec05f6abcc`.

Git objects and GitHub PR metadata agree. Historical release receipts do not approve or execute a Task 07 release.

## Minimal scope and guard equivalence

Only four files change: the release-state guard's pin and two provenance comments, its rollout regression test, and this JSON/Markdown pair. The pin advances from `f5abb252-a042-45e7-9f4e-96bdb550dd8e` to `bba26eca-7811-4f1a-802e-f6bc7c6f7421`.

The guard differs at **lines 12, 13 and 14 only**. After normalizing LF and replacing those two comments and the pin with the fixed placeholders defined in the regression, the complete before/after source is identical. SHA-256: `4f998d2de46c733e22eaca729acd7f503c05d99866bdcdd17cf92b99be1f6f3c`. The normalization is explicit in JSON and the test; this is a whole-source equivalence proof, not a stripped executable subset.

All **29 historical baseline/evidence Git blobs** are preserved, including [f5abb252 JSON](public-release-baseline-f5abb252.json), its [report](public-release-baseline-f5abb252.md), and earlier evidence directories. The manifest is derived from the actual preparation-main tree, and every working-tree file is compared through Git clean filters to avoid CRLF false positives. Manifest SHA-256: `8ab0a216b8ef2500d8e22ade412e1040feaf34315b854da8adce712dbee5b80b`.

Owner, exact-main SHA, protected environment, Public V2 100%, document flags OFF, bindings, schema/ledger, quota, read-only metadata, postdeploy and fail-closed guards remain unchanged. No timetable, MobileSchedule, event filter, Ticket, Auth, database, Cloudflare config, dependency, workflow, permission, secret or environment setting changes.

## Validation and limitations

Executed on Node **v24.12.0**, all exit code **0**:

- Four targeted release/security suites: **295 tests passed, 0 failed, 0 skipped**.
- `npm run typecheck`: **PASS**.
- `npm run cf:typecheck`: **PASS**.
- `npm run build`: **PASS**, including PWA service-worker generation. Vite reports a chunk-size warning above 500 kB; no bundling configuration changes belong to this patch.
- `git diff --check`: **PASS**; staged four-file diff checked again before commit.

Actual local command-log SHA-256 values, command names, exit codes and validation timestamp are retained in the JSON evidence. Local logs remain under `.cache/task07-baseline-*.log` and are not committed. Guard-equivalence and all historical blob comparisons run as part of the passing regressions.

Full offline suite belongs to final-HEAD GitHub PR CI, linked in the PR description. No Task 07 mobile browser matrix, AI benchmark or database benchmark is rerun locally.

This is point-in-time deployment/version provenance, not a fresh health, quota, full binding, schema/ledger or secrets audit. Future release gates must recheck those conditions and obtain Owner approval for the exact final main SHA. **No merge, deployment or production change is performed by this baseline preparation.**
