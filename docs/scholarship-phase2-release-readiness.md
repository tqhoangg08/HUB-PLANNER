# Scholarship Phase 2 — Public-only release preparation

Main fetched and verified: `4e6c13cdc24a22a1c30dfc484abd953549b682a4`
(merge of PR #117). Preparation branch starts at that exact SHA.

## Live evidence and baseline

The existing Chrome session successfully opened the correct Cloudflare account
and Public Worker `hub-planner-public-dev-api`. Active deployment serves exactly
one version at **100%**:

`77374643-bb94-420a-ab4c-fd456fca516d`

Dashboard-issued metadata and the screenshot are retained under
`docs/evidence/public-release-baseline-77374643/`. Deployment/version timestamps
match successful Owner release [39129116442](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39129116442),
SHA `cc7c822…`; approval/upload/postflight receipts match the same UUID.
That historical release predates Scholarship Phase 2 and does not deploy PR #117.

Successful live observation: `2026-10-19T07:18:06Z` (14:18:06 Vietnam time).
The final recheck was blocked before execution with **"Local browser use is
disabled in Work settings"**. This is a tool permission restriction, not evidence
of an expired Cloudflare login. No bypass or permission change was attempted.
Owner must restore permitted Browser Use and recheck live state before release.

Main still pins `e17bfe9f-5aa8-45e8-88fe-9fc63c26b2a3`, so it would reject the
observed serving version with `UNREVIEWED_PREDEPLOY_VERSION`. This proposal updates
only that reviewed constant/comment, the regression assertion and evidence.
The prior pin is added explicitly to the rejected-version cases. All approval,
exact-SHA CI, traffic, binding, observability, schema, limiter and provenance
guard logic is preserved. No workflow/config, Auth or migration changes.

Current schemas/bindings were not reverified or queried. Updating the pin is not
a claim that the complete live-state gate passes today; the protected workflow
must execute the unchanged checks immediately before any eventual deployment.

## CI status and Owner steps

At preparation, main `4e6c13c…` has **zero check runs** and no matching run in the
latest 30 Actions runs. PR #117 CI
[39194778767](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39194778767)
passed on `c92d75e…`, which is not an exact-main validation receipt.
Do not reuse the older main CI receipt for `cc7c822…` either.

1. Review this baseline PR and its read-only evidence. Wait for its required PR
   CI to pass, then merge through protected main as Owner. This task does not merge.
2. Fetch the resulting **final main SHA**. On GitHub Actions run
   **AI Advisor PR validation (no deployment)** (`ai-advisor-pr-validation.yml`)
   manually with branch `main`. Confirm event `workflow_dispatch`, exact
   `head_sha == final main SHA`, and a successful **AI Advisor independent
   validation** check from GitHub Actions. PR CI does not replace this receipt.
3. Recheck the live Worker/version and keep main stable. If traffic/version or
   settings drift, stop for reviewed evidence instead of weakening a guard.
4. Dispatch **Approved Public-only production release**
   (`deploy-cloudflare-production.yml`) on `main` with
   `approve_public_release=true`, `approved_sha=<full final main SHA>`.
5. Record the separate Owner confirmation for that newly created run using the
   existing `public-production` environment variables
   `PUBLIC_RELEASE_APPROVAL_SHA` and `PUBLIC_RELEASE_APPROVAL_RUN_ID`. Both must
   match that SHA/run, be updated after dispatch and meet the existing freshness
   checks. Preserve the protected environment/wait timer and final guard.
   If using the local release assistant, use only already-authorized credentials
   and its separate `RELEASE <sha>` / `APPROVE <run-id> <sha>` confirmations;
   unavailable/expired credentials must block, not trigger OAuth refresh.
6. Owner inspects release job and mandatory serving-version postflight; a
   successful upload alone is insufficient. Do not run migrations or deploy Auth.

No workflow dispatch, environment-variable update, merge or production deployment
is performed by this preparation. Final-main CI cannot be certified before the
baseline merge produces that SHA. Deployment readiness remains **NO** until the
Owner completes these gates. Phase 2 production effectiveness remains unverified
until post-release D1/traffic measurements are available.
