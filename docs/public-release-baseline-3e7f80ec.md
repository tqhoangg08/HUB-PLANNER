# Reviewed Public baseline for Rankings Phase 3 — 3e7f80ec

The predeploy pin is refreshed to `3e7f80ec-e268-4869-976a-6e26c38244b0`.
This prepares a baseline PR; it does not approve or perform a release.
Machine-readable evidence is in [public-release-baseline-3e7f80ec.json](public-release-baseline-3e7f80ec.json)
and [the evidence directory](evidence/public-release-baseline-3e7f80ec/README.md).

## Independently verified release provenance

- [Production release #39402488104](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39402488104):
  SUCCESS, `workflow_dispatch`, branch `main`, attempt 1,
  SHA `c015275aaad5d4e46993950ad3d2f3d4a59d2b8b`.
- Release job `118561614898`: 2026-10-20 **09:49:20–09:50:31 UTC**
  (**16:49:20–16:50:31 Asia/Ho_Chi_Minh**). Actor and triggering actor match
  the repository's personal owner. Owner/protection/exact-SHA guard succeeded.
- Preflight PASS at **09:50:05.2537563 UTC**, before-version
  `cf44c795-ddf0-4f56-b55c-6100029d6d3e`.
- Wrangler emitted the full new UUID at **09:50:25.8729767 UTC =
  16:50:25.8729767 Vietnam**. This is the log receipt time, not an independently
  obtained Cloudflare `created_on` timestamp.
- Postflight PASS at **09:50:28.5191006 UTC**, version
  `3e7f80ec-e268-4869-976a-6e26c38244b0`. The unchanged postflight code requires
  exactly one serving version at 100%, verifies that version's resources and
  rejects drift. This proves the recorded release-time check, not continuous
  serving state afterward.
- The release SHA is an ancestor of preparation main
  `29a45995bad29b54bb5d0eff1f4f5890a42f851e`.
  [Independent main CI #39405698063](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39405698063)
  independently confirms SUCCESS on exactly that SHA; it cannot approve a later
  baseline merge SHA.

## Live Dashboard observation and its limits

Authorized Chrome Browser Use initially accessed the existing Cloudflare session
and the correct account/Public Worker on October 20. Overview and Deployments
displayed one active version prefix **`3e7f80ec`**, **100% traffic**, **Ready**,
source **Wrangler**, and deployment age **4 hours ago**. The sanitized visible
text is preserved in `dashboard-observation.json`. The observation occurred before
2026-10-20 14:17:26 UTC; the tool did not supply that initial UI read's exact
collection timestamp.

The initial Copy/read was empty, and later DOM/input/screenshot/tab-recovery
attempts timed out. A **new tab in the same authorized Chrome** recovered access.
The browser connector's documented CDP capability observed Dashboard Refresh and
read only the already-loaded Worker deployments/versions **GET response bodies**.
No separate API fetch, credential access, header extraction or SQL was used.

At **2026-10-20 14:26:33.282 UTC = 21:26:33.282 Vietnam**, the independently
captured, allowlisted [Dashboard metadata](evidence/public-release-baseline-3e7f80ec/dashboard-metadata.json)
confirmed:

- Deployment `6ce53f5f-ffea-44b7-9937-98851c03aa93`, source `wrangler`,
  created **09:50:17.050028 UTC = 16:50:17.050028 Vietnam**.
- Exactly one version, full UUID `3e7f80ec-e268-4869-976a-6e26c38244b0`,
  **100%** in that same deployment response.
- Matching version metadata, number **460**, source `wrangler`, created
  **09:50:16.082485 UTC = 16:50:16.082485 Vietnam**. Both creation times lie
  inside the successful release job and agree with the subsequent GitHub UUID
  receipt. Only the `workers/triggered_by` annotation key was present; no live
  commit SHA annotation is claimed.

The user also described an Owner screenshot showing that UUID/100%/Ready. That
image was not attached or independently inspected in this task; the new browser
metadata verification above is independent of that description. No new screenshot
was saved, and the initial failed attempts remain documented in the evidence.

No cookies, access tokens or passwords were extracted. No OAuth refresh,
permission bypass, production URL probe, SQL or alternative credential access
was used. Current complete binding/variable/schema/ledger state was not rechecked;
the protected release preflight must still check it and fail closed on drift.

## Protection and Owner handoff

Only the strict approved UUID and evidence comments change in the state guard.
The tests accept the new baseline and reject the old `cf44c795…`, older/unknown
versions, non-numeric/non-100 percentages and split traffic. Postdeploy still
requires the exact before-version and a different new 100% serving version.
Owner approval, exact-main CI, protected environment, Public-only targeting,
bindings, schema, publication, observability and rollout checks remain unchanged.
There is no workflow, Auth Worker, D1 schema/migration, limiter, billing, secret
or permission change. Historical evidence is retained without edits:
[cf44c795 baseline](public-release-baseline-cf44c795.json) and its older chain.

After reviewing and merging this PR, the Owner must run **independent CI again
on the resulting exact main merge SHA**. CI on `29a45995…` or on this PR head is
not a substitute. Only after that new CI succeeds may the Owner use the existing
protected Public-only production release workflow for Rankings Phase 3, approve
that exact main SHA and review the mandatory preflight/postflight. This task
does not merge, dispatch or deploy.

## Validation

- Full `npm test`: **1,284/1,284 PASS**, no failures or skips, including Rankings
  1k/10k/10,478/50k local D1 comparisons and revision/readiness races.
- Focused release/security regressions: **229/229 PASS**.
- Frontend typecheck, Cloudflare typecheck, build and `git diff --check`: PASS.
- Whole state-guard source matches preparation main after excluding only the
  approved UUID pin and its two evidence comments. No release workflow,
  protected scope or historical baseline content changed.

Commands, exit codes, runtime versions and local log hashes are retained in
`evidence/public-release-baseline-3e7f80ec/validation.json`. Local LF checkout
normalization/generated declarations produced no migration/config content diff.
