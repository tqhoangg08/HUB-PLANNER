# Task 04/10 — Production baseline preparation

Preparation main: `cd44cd66e82b35519761922c1f810f3122f213f2`, the confirmed
merge of [Task 04 PR #126](https://github.com/tqhoangg08/HUB-PLANNER/pull/126).
This baseline update does not release Task 04.

## Independent live verification

The [JSON evidence](public-release-baseline-cd1d81be.json) contains only
allowlisted Dashboard metadata, release provenance, receipts and local validation.
Verification was recorded at **2026-10-21 07:29:25.150 UTC / 14:29:25.150 Vietnam**
using the existing authorized Chrome session:

- Account `6cd8bac6009a55f96bdf9df7c2057548`, Public Worker
  `hub-planner-public-dev-api`, environment **Production**.
- The Dashboard active deployment shows `cd1d81be`, **100%**, and status `Ready`.
  Its latest deployment metadata confirms exactly one serving version:
  `cd1d81be-966f-4518-8729-0b1c3e5484ce`, percentage **100**, with no split.
- Deployment `7b985267-051d-468b-9f97-0be3b334e002`, source `wrangler`, strategy
  `percentage`, created **2026-10-21 04:58:15.514378 UTC / 11:58:15.514378 Vietnam**.
- Matching version **#463**, source `wrangler`, created
  **2026-10-21 04:58:14.944444 UTC / 11:58:14.944444 Vietnam**.

The account/Worker UI and rendered metadata GET documents agree. Navigation was
read-only; no cookies, credentials, tokens or response headers were extracted or
recorded. No production SQL, secret access, configuration writes or deployment.
The evidence URLs and sanitized fields are in the JSON; no screenshot is stored.

## Release provenance

[Release run 39546015838](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39546015838)
completed successfully on `main`, event `workflow_dispatch`, attempt 1, exact SHA
`105a0812ee0bbf5505a8e7b7c58ec91455ef6d9e`. This release SHA is an ancestor of
preparation main and predates the Task 04 merge.

The validation job `119044248636` succeeded. Public release job `119045449807`
succeeded during **04:57:26–04:58:23 UTC / 11:57:26–11:58:23 Vietnam** on
2026-10-21. Both version and deployment timestamps are within that job window.
Read-only GitHub metadata, the rendered run summary and sanitized log receipts
agree:

- Checked-out SHA and `APPROVED_SHA` both equal `105a0812…`.
- **04:58:06.7563560 UTC:** predeploy PASS on previous version
  `66bc5fd9-55f4-4983-9048-0a271550ef9f`.
- **04:58:08.2083003 UTC:** owner approval, live protections and exact-SHA CI
  guard reports `PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS`.
- **04:58:19.2796850 UTC:** deployed Current Version ID is `cd1d81be…`.
- **04:58:21.7582895 UTC:** postdeploy PASS on `cd1d81be…`.

The preflight, owner-approval, deploy and postdeploy steps all completed with
`success`. These are receipts from the already completed historical release,
not approval or execution of a new release.

## Minimal update and validation

Exactly four files change: the predeploy pin/provenance comments, its regression
test, and this new JSON/Markdown evidence pair. Historical baselines, including
[66bc5fd9](public-release-baseline-66bc5fd9.json), remain byte-for-byte unchanged.
All state-script source except its UUID and two evidence comments is identical
to preparation main.

Regression accepts the verified UUID and rejects the old baseline, unknown UUIDs,
partial/split traffic and stale/wrong postdeploy `beforeVersion`. Evidence checks
also require the correct release SHA, successful validation/release jobs, all
four release-gate steps, matching timestamp window, owner/predeploy receipts and
the postdeploy receipt. Existing security, binding/schema, owner approval,
exact-SHA and postdeploy guards remain intact.

Targeted release/security regressions: **294/294 PASS**. Frontend/Cloudflare
typechecks, build and diff checks: **PASS**. Results are recorded in the JSON
with exit codes and log hashes.
Full-suite validation belongs to GitHub PR CI. No local full suite, mobile
browser matrix, AI benchmark or database benchmark is run.

This is point-in-time version/provenance evidence. Current D1 quota, complete
schema/ledger and binding inventory are outside this baseline-only verification;
the unchanged protected release preflight must check them and reject later drift.
Future release still requires exact-main CI and separate owner approval. No
feature, Overlay, Ticket, AI, Auth, backend, dependency, workflow, protection or
Cloudflare configuration changes. No merge or deployment by this task.
