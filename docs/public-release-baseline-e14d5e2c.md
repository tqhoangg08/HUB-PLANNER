# Task 10/10 — Public production baseline for the next release

Preparation main: `410137ab2e6eb7e94b1542846743a76b364c4f61`, the verified merge commit of [Task 10 PR #139](https://github.com/tqhoangg08/HUB-PLANNER/pull/139). **This baseline preparation does not release Task 10.**

## Independent live observation

The [sanitized evidence](public-release-baseline-e14d5e2c.json) records a read-only observation on 2026-10-26 using the Cloudflare Dashboard-hosted version and deployment metadata documents for account `6cd8bac6009a55f96bdf9df7c2057548`, Production Worker `hub-planner-public-dev-api`.

- Latest deployment `74ef39cc-1107-41c2-a005-7b452f476b58`, source `wrangler`, created 2026-10-23 08:24:22.772233 UTC.
- Its only serving version is `e14d5e2c-e381-46b3-a27d-2f41e9c21249` at **100%**, with no split.
- Version 469, source `wrangler`, created 2026-10-23 08:24:21.944567 UTC.

The Dashboard service view redirected to sign-in, so its separate **Ready** indicator was not verified. The version and deployment metadata documents agree with the prior successful postdeploy receipt. The unchanged release preflight must independently recheck live settings, bindings, schema, ledger and quota before any future deploy. No credentials, cookies, tokens, response headers, secrets or production SQL were read or recorded.

## Release provenance

[Successful Public-only run #39923225777](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39923225777) was dispatched by the repository owner on `main` for exact SHA `d92dc81c658891cbb0a60a93393dcc7ff41adae5` on 2026-10-23. Its validate and release-public jobs both succeeded. The release-public sequence passed predeploy on the previous `ecee213b` version, solo Owner approval, Public Worker/assets deploy, and postdeploy on `e14d5e2c`. The deployed version and Cloudflare creation timestamps fall within the successful deploy step. The rollout receipts show V2 canary at 100% and document flags `false / false / 0`.

Task 10 PR #139 was merged later on 2026-10-26 at 15:33:31 UTC. Merge commit `410137ab2e6eb7e94b1542846743a76b364c4f61` has parents `d92dc81c658891cbb0a60a93393dcc7ff41adae5` and `c7ebb96a4715301c47504886b25e2abcecd85e7b`. The old release therefore does not contain Task 10.

## Guard and history

Only the pinned version UUID and the two adjacent provenance comments change in `scripts/check-public-release-state.mjs`. After normalizing those three lines, the guard source SHA-256 remains `4f998d2de46c733e22eaca729acd7f503c05d99866bdcdd17cf92b99be1f6f3c`. The actual Git tree supplies the manifest of all 35 historical baseline blobs, preserved unchanged. Regression checks reject the previous/unknown version, partial/split traffic and stale postdeploy `beforeVersion`.

Exact-main authorization, solo Owner approval, protected environment, Public V2 100%, document flags OFF, read-only metadata, binding/schema/ledger/quota and postdeploy guards are unchanged. This patch does not alter Task 10 UI, Auth Worker, database, Cloudflare configuration or the production release workflow.

## Validation

Four targeted release/security suites: **295/295 PASS**. Frontend and Cloudflare typechecks, production build and diff check: **PASS**. The final pushed PR HEAD must also pass GitHub CI. A future production release still requires a separate exact-main SHA approval and the protected release workflow.
