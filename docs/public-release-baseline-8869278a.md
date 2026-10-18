# Reviewed Public release baseline — 8869278a

Prepared on 2026-10-18 (Asia/Saigon), from main 1da6dc7a5425a59dd62c9f95681e49984de2e191. This source change prepares Owner review; it does not authorize a deployment or database write.

## Evidence and correction

Live Public Worker hub-planner-public-dev-api was reverified at 100% version 8869278a-e66b-4edb-84a0-5c653e64e2db, deployment 8e259d20-05f6-434b-aa4c-c5c0cebc36a7 created 2026-10-17 12:34:16 UTC. Bindings and script runtime are unchanged from the previously pinned 799042c2 version; the Public script ETag differs because the prior release changed code.

[Owner-approved release run 39032492435](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39032492435) on main a746e7f73e366e383b19cc1027442ff83c5034e7 logged preflight PASS at 799042c2, solo-owner approval PASS, Current Version ID 8869278a, and postflight PASS for 8869278a. Live metadata matches this receipt.

The predeploy pin and provenance now identify that exact reviewed serving version. Previous 799042c2 and other obsolete/unknown versions remain rejected, as do split/partial traffic, invalid previous-version context, missing schema objects, wrong bindings, document opt-ins and invalid owner approvals. The implementation of all release-state checks is otherwise byte-equivalent after newline normalization. Owner approval code, schema contracts, rollout flags, Worker config, environment settings and release credentials are unchanged.

## Checkout history required by the existing offline golden oracle

The scholarship optimization test executes baseline commit a746e7f73e366e383b19cc1027442ff83c5034e7. A depth-2 checkout after another baseline commit/merge does not guarantee that older object exists. Both validation checkouts now fetch full history, and the related release-safety assertion is updated. This only supplies repository history to the existing offline suite; workflow triggers, token permissions, protected environment, preflight/final owner guards and deployment/postflight steps are unchanged. No network fallback was added inside tests.

## Current schema evidence

The initial 2026-10-18 00:47 Asia/Saigon probe found both 0057/0059 migration ledger rows (Rows Read 4, Rows Written 0), but sqlite_schema remained quota-blocked. That investigation stopped without further schema SELECTs.

After the UTC day changed, the bounded probe succeeded again and the complete unchanged checkPublicReleaseState predeploy reader was run on 2026-10-18 08:31 Asia/Saigon, using the corrected baseline and existing OAuth. Its network wrapper allowed only fixed Public Worker metadata GETs and the reader's fixed metadata-only D1 queries; it performed no DML/DDL.

PUBLIC_SCHEMA_GATE=PASS; SCHOLARSHIP_SCHEMA_GATE=PASS; PUBLIC_PREDEPLOY_GATE=PASS for the observed snapshot. The exact Text-first schema/ledger and Scholarship contract all matched, including 25 scholarship tables/indexes/triggers, exact CHECK definitions, publication constraints, transaction guard and insert/update/delete snapshot immutability triggers. The full Scholarship ledger includes 0055_scholarships.sql, 0056_scholarship_snapshots.sql, 0057_scholarship_filters.sql and 0059_scholarship_personal_details.sql.

The probe plus complete guard consumed 701 Rows Read and 0 Rows Written; each successful query reported changed_db=false. No student records were queried. Serving traffic remained the same single 8869278a version at 100%, with unchanged bindings/runtime. This later complete verification supersedes the earlier quota-related NOT_VERIFIED result. Metadata must still be rechecked immediately before a separately approved release.

## Validation

Targeted release suite: 224 tests PASS, zero failures/skips.
Full suite: 1036 tests PASS, zero failures/skips. App/Worker typechecks and frontend build PASS. Worker dry-run (npm run cf:check, no upload/deploy) and final diff check PASS.

## Owner sequence and rollback

Review this baseline-only release-infrastructure change. After merge, main has a new SHA: run ai-advisor-pr-validation.yml with workflow_dispatch on that exact main SHA and require AI Advisor independent validation success. CI for 1da6dc7 is not approval for the later SHA.

Immediately before a separately approved release, rerun the fixed bounded schema/ledger reads and exact validators. Do not infer missing migrations from the quota error, apply migrations automatically, accept latest/any Worker version or bypass schema/owner checks. Recheck traffic and protections before separately approving a Public-only release and fresh SHA/run environment approval. Release readiness remains NO until this PR is reviewed/merged, independent CI passes on the exact new main SHA, and Owner gives fresh release approval. Current metadata PASS does not replace those conditions.

Rollback this source correction through a reviewed revert. Restoring the older pin makes the guard block a new deployment against serving 8869278a; it does not roll back the serving Worker or database. No data rewrite, migration reversal, secret/approval change or billing action is part of this PR.
