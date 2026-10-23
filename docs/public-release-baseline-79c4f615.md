# Task 08/10 — Production baseline preparation

Preparation main: `030fd7680a1714daaa0dea819a361698279f35fb`, the verified merge of [Task 08 PR #135](https://github.com/tqhoangg08/HUB-PLANNER/pull/135).
**This prepares a baseline only; it does not release Task 08.** Production still serves Task 07 release SHA `69672040488df01e8eada26a5e9ec628b51458c3`.

## Independent live verification

[Sanitized JSON evidence](public-release-baseline-79c4f615.json) records the authorized Cloudflare Dashboard observation at **2026-10-23 03:28:57 UTC**. The account `6cd8bac6009a55f96bdf9df7c2057548`, Worker `hub-planner-public-dev-api`, and **Production** environment match repository configuration.

Dashboard shows **79c4f615**, **100%**, **Ready**, source **Wrangler**. Ordinary navigation to the read-only deployment/version metadata GET documents independently confirms:

- Latest deployment `beef7668-f3a9-4e18-a09e-695caf731c85`, created **2026-10-22 09:52:28.521439 UTC**, source `wrangler`, strategy `percentage`.
- Exactly one serving version: `79c4f615-cab1-49be-81b4-6622bfe415d1`, **100%**. No split.
- Version **467**, created **2026-10-22 09:52:27.799019 UTC**, source `wrangler`.

UI and rendered metadata GET documents agree. Only allowlisted fields were projected. No screenshot, credentials, cookies, tokens, secrets or response headers were extracted or saved. No production SQL or modifying request was performed.

## GitHub release and merge provenance

[Release run #39757483460](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39757483460), **Approved Public-only production release**, completed successfully: `workflow_dispatch`, `main`, attempt 1, exact SHA `69672040488df01e8eada26a5e9ec628b51458c3`.

- Validate job `119753072054`: SUCCESS, **2026-10-22 09:42:26–09:46:40 UTC**.
- Release-public job `119754902760`: SUCCESS, **09:51:43–09:52:37 UTC**.
- **09:52:18.4354095 UTC:** predeploy PASS on `bba26eca-7811-4f1a-802e-f6bc7c6f7421`.
- Checked-out SHA and APPROVED_SHA match the release SHA.
- **09:52:20.0822271 UTC:** solo Owner approval PASS.
- **09:52:26.7598540 UTC:** 55 assets uploaded, 113 already uploaded; 172 files read.
- **09:52:30.3084291 UTC:** Public Worker upload succeeded.
- **09:52:33.4337289 UTC:** Worker triggers deployed.
- **09:52:33.4341446 UTC:** Current Version ID matches the full candidate UUID.
- **09:52:36.2513777 UTC:** postdeploy PASS on the candidate UUID.

All four required steps passed. Both Cloudflare creation timestamps fall within the actual **09:52:20–09:52:33 UTC deploy step**, with version creation before deployment. Receipts are ordered and within their corresponding steps, accounting for GitHub's second-resolution timestamps and fractional log timestamps. Receipts confirm Public V2 `canary` at **100%** and document flags **false / false / 0**.

Release completed **2026-10-22 09:52:38 UTC**. PR #135 merged later, **2026-10-23 03:21:45 UTC**. Actual Git object `030fd7680a1714daaa0dea819a361698279f35fb`, committed at that same instant, has subject `Merge pull request #135 from tqhoangg08/codex/task08-schedule-actions-dropdown` and parents:

1. Release/main parent `69672040488df01e8eada26a5e9ec628b51458c3`.
2. Feature HEAD `45da497aa60743f3d7c4227c1050e5aab98d0190`.

Git objects and direct GitHub PR metadata agree. Historical Owner approval does not approve a future Task 08 release.

## Guard equivalence and historical integrity

Only four files change: the guard pin plus exactly two provenance comments, the rollout regression, and this JSON/Markdown pair. Pin advances from `bba26eca-7811-4f1a-802e-f6bc7c6f7421` to `79c4f615-cab1-49be-81b4-6622bfe415d1`.

Guard differences are **lines 12, 13, 14 only**. Normalize LF and replace the two specific provenance comments and UUID declaration with the fixed placeholders defined in the regression: the complete before/after source is identical. Normalized SHA-256: `4f998d2de46c733e22eaca729acd7f503c05d99866bdcdd17cf92b99be1f6f3c`.

The manifest is derived from the actual preparation-main Git tree, without a hardcoded count. All **31 historical baseline/evidence blobs** match through Git clean filters, including [bba26eca JSON](public-release-baseline-bba26eca.json) and its [report](public-release-baseline-bba26eca.md). The JSON records every path/blob identity and a manifest SHA-256; the regression checks them against the actual Git tree and working files.

Exact-main SHA, Owner approval, protected environment, V2 100%, document flags OFF, bindings, schema/ledger, quota, read-only metadata, postdeploy and fail-closed guards remain intact. No UI, Auth, API, database, configuration, dependency, workflow, permission, secret or environment changes.

## Validation and limitations

Executed on Node v24.12.0, all exit code 0:

- Four targeted release/security suites: **295/295 PASS**, 0 failed, 0 skipped.
- Frontend typecheck: **PASS**.
- Cloudflare typecheck: **PASS**.
- Production build including PWA service worker: **PASS**. Existing Vite chunk-size warning remains; no bundling changes.
- `git diff --check`: **PASS**; staged four-file diff checked again before commit.

Command log SHA-256 values and exit codes are recorded in JSON. Logs remain under .cache/task08-baseline-*.log and are not committed. Full offline suite belongs to final pushed HEAD GitHub PR CI, linked in the PR description. No mobile browser matrix, AI benchmark or database benchmark is rerun locally.

This is point-in-time deployment/version provenance, not a fresh quota, health, full binding, schema/ledger or secrets audit. The unchanged release gates must recheck those conditions and obtain separate Owner approval for the exact final main SHA. **No merge, deployment or production change is performed by this preparation.**
