# Task 02/10 — Public release baseline preparation

Preparation main: `fdc4ce8c3af54cc58e528916ef230f6b09286020`, the merged
[Task 02 PR #122](https://github.com/tqhoangg08/HUB-PLANNER/pull/122).
No DRL Guide, Events, shared overlay or other feature code changes.

## Independent evidence

The [JSON evidence](public-release-baseline-93e9bad7.json) retains sanitized
live metadata, GitHub run/jobs/receipts and local validation results.

Authorized Chrome inspection at **2026-10-20 15:42:46.907 UTC = 22:42:46.907
Asia/Ho_Chi_Minh** independently confirmed:

- Worker `hub-planner-public-dev-api`, version
  `93e9bad7-39f3-4635-bb97-c6d71ccc4524`, the **only** serving version at **100%**.
- Deployment `495306c1-ed82-441f-9997-88fafb082b74`, source `wrangler`, created
  **15:20:39.202089 UTC / 22:20:39.202089 Vietnam**.
- Matching version #461, source `wrangler`, created
  **15:20:38.474627 UTC / 22:20:38.474627 Vietnam**. UI displayed Ready/100%.

Verification used the existing authorized browser session. Initial CDP response
body retrieval was unavailable; ordinary browser navigation to the exact metadata
GET URLs already observed in Dashboard displayed JSON successfully. No token,
cookie, header extraction, OAuth refresh, permission bypass, production SQL or
production health/load-test traffic. Only allowlisted metadata was retained;
no email addresses, credentials or full environment/binding payloads are saved.

[Release #39445974440](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39445974440)
independently verifies SUCCESS, `workflow_dispatch`, branch `main`, SHA
`acbada706e365b0593882eb783f808805ef1a2e5`. Release job `118710045252` ran
**15:19:40–15:20:50 UTC / 22:19:40–22:20:50 Vietnam**. Both resource creation
timestamps fall inside that job. Checkout SHA and subsequent receipts agree:

- Predeploy PASS: `3e7f80ec-e268-4869-976a-6e26c38244b0`, 15:20:21.1564761 UTC.
- Owner/protection/exact-SHA guard PASS: 15:20:22.8083730 UTC.
- Wrangler UUID receipt: `93e9bad7…`, 15:20:45.6621434 UTC.
- Postdeploy PASS: `93e9bad7…`, 15:20:48.8064102 UTC.

The release SHA is an ancestor of preparation main. This is point-in-time
version/provenance verification; current D1 quota, production health and complete
schema/ledger/binding state were not probed. Normal protected preflight must
still verify those release requirements and fail closed on drift.

## Minimal pin refresh and validation

The state script changes only the approved UUID pin and two evidence comments.
All other guard source is equivalent to main. Regression tests accept the new
baseline and reject `3e7f80ec…`, older/unknown versions, outdated postdeploy
before-version, split/partial/non-number traffic. Existing postdeploy, schema,
bindings, Owner approval, exact-SHA, security and rollout protections remain.
All historical baseline documents/evidence remain unchanged.

Only targeted release tests, frontend/Cloudflare typechecks, build and diff-check
are run locally, once on final source. Results/log hashes are in the JSON.
Targeted release/security tests: **229/229 PASS**; both typechecks, build and
diff-check: **PASS**.
No local full suite, benchmark, repository-wide audit or Task 01/02 mobile matrix
was run. Existing dependencies were reused after confirming lockfile/config
unchanged. GitHub PR CI is responsible for the full suite on the pushed head.

## Owner handoff

Review and merge the baseline PR. Then run exact-main **validation-only** on the
new merge SHA, verify release guards, D1 quota and production health, and use the
existing protected **Public-only** release workflow only when all requirements
are satisfied. PR-head CI does not replace exact-main validation after merge.
This preparation does not merge, dispatch production, change approval variables,
deploy, migrate or modify any production data/configuration.
