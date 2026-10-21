# Task 06/10 — Production baseline preparation

Preparation main: `8e37d69e4aac21c93fe4174cae76d528129bb8a3`, the confirmed merge of
[Task 06 PR #130](https://github.com/tqhoangg08/HUB-PLANNER/pull/130).
**This is baseline preparation, not the Task 06 production release.** Production
still serves the successful Task 05 release SHA
`0d915a4ac65f3a205b3c9020534719eb3101d773`.

## Independent read-only live verification

[Sanitized JSON evidence](public-release-baseline-f5abb252.json) records the
observation at **2026-10-21 14:48:59 UTC / 21:48:59 Vietnam**, through the existing
authorized Chrome Cloudflare Dashboard session:

- Repository release account `6cd8bac6009a55f96bdf9df7c2057548`, Worker
  `hub-planner-public-dev-api`, environment **Production**.
- Dashboard version prefix `f5abb252`, **100%**, **Ready**, source **Wrangler**.
- Latest deployment `fc127a9d-dfe5-4397-9fd6-50ce53ca3edc` contains exactly one
  serving version, `f5abb252-a042-45e7-9f4e-96bdb550dd8e`, percentage **100**;
  no split. Source `wrangler`, strategy `percentage`, created
  **2026-10-21 10:17:48.686577 UTC**.
- Matching version **#465**, source `wrangler`, created
  **2026-10-21 10:17:48.060144 UTC**.

The Dashboard UI agrees with the rendered metadata GET documents. Their URLs
are retained in JSON; only allowlisted deployment/version metadata was recorded.
No screenshot, cookies, credentials, tokens, response headers or secrets were
extracted. No production SQL, deployment or configuration operation was run.

## Release provenance and receipts

[Production run 39582294253](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39582294253)
completed successfully: `workflow_dispatch`, `main`, attempt 1, exact SHA
`0d915a4ac65f3a205b3c9020534719eb3101d773`. GitHub run/job metadata and the
allowlisted timestamped log receipts agree:

- Validation job `119162567272`: success, **10:07:55–10:12:01 UTC**.
- Public release job `119164301637`: success, **10:17:05–10:17:58 UTC**.
- **10:17:40.5742937 UTC:** predeploy PASS on previous baseline
  `58c94fc8-5bfe-41e3-97f5-d0c39bc8be65`.
- Checked-out SHA and `APPROVED_SHA` both equal `0d915a4…`.
- **10:17:42.0259716 UTC:** `PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS`.
- **10:17:47.2943566 UTC:** 53 new/modified frontend asset files uploaded;
  113 assets already uploaded (170 files read).
- **10:17:50.1349420 UTC:** Worker upload succeeded;
  **10:17:53.3681368 UTC:** trigger deployment succeeded.
- **10:17:53.3685868 UTC:** Current Version ID `f5abb252…`.
- **10:17:56.0523227 UTC:** postdeploy PASS on `f5abb252…`.

All four required preflight/approval/deploy/postdeploy steps succeeded. The
version and deployment creation timestamps are inside the successful deploy
step's **10:17:42–10:17:53 UTC** window, with version creation preceding deployment.
The release completed at **10:17:59 UTC**; Task 06 merged later, at
**14:43:26 UTC**. PR metadata and the actual Git merge agree on both parents:

1. Release/main parent `0d915a4ac65f3a205b3c9020534719eb3101d773`.
2. Task 06 feature HEAD `1549de912004c4f3c14cbccda55f7646f6d54104`.

These historical receipts neither approve nor execute a new release.

## Scope, guard equivalence and validation

Exactly four files change: the predeploy UUID plus its two provenance comments,
the rollout regression test, and this JSON/Markdown evidence pair. The guard
comparison against preparation main confirms that only **lines 12, 13 and 14**
changed. After replacing the pin and the two provenance comments with fixed
placeholders, the before/after source is identical; SHA-256:
`5dd85725c90b43581cdd449886bd7e86149a60dc661eca31e76984885975c39c`.

All **27 historical baseline/evidence Git blobs** remain unchanged, including
[58c94fc8 JSON](public-release-baseline-58c94fc8.json), its
[report](public-release-baseline-58c94fc8.md), and the older evidence directories.
The complete path/blob manifest and its hash are retained in JSON; comparison
uses repository clean filters to handle Windows checkout line endings.

Targeted release/security regressions: **294/294 PASS**. Frontend typecheck,
Cloudflare typecheck, build and diff-check: **PASS**. JSON records actual command
exit codes and log SHA-256 hashes. Build retains the existing large-chunk warning.
Tests accept precisely the verified baseline, reject previous/obsolete/unknown
versions, partial/split traffic and stale/wrong postdeploy `beforeVersion`, and
verify release jobs/steps/receipts/timestamps/version metadata/SHA and real merge
parents. Existing owner, exact-main, protected-environment, V2 100%, binding,
schema/ledger, quota, read-only and fail-closed protections are unchanged.

Full suite belongs to final-HEAD PR CI, linked in the PR description. No Task 06
browser matrix, local full suite, AI benchmark or database benchmark is rerun.

This is point-in-time provenance evidence, not a fresh health, quota, full
binding, schema/ledger or secrets audit. Unchanged release gates must check those
conditions again before a separately approved future release. A future Task 06
release still requires exact-main validation and owner approval. This task does
not modify UI/business logic, Auth, database, dependencies, Cloudflare settings,
workflows or protections, and performs no merge or deployment.
