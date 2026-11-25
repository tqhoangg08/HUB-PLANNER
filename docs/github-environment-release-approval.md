# Public production release: approve on GitHub, without the local GitHub CLI

This proposal changes the *approval interface*, not deployment authority. It does not dispatch or authorize a release.

## One-time setup (repository owner)

1. Review and merge the GitHub-review code PR after CI passes. The workflow is still manually triggered.
2. In **Settings → Environments → public-production**, keep the existing deployment branch policy restricted to **main**, minimum **5-minute wait timer**, and administrator bypass **disabled**.
3. Add **Required reviewers** with **exactly the personal repository owner account** (one User, no team or additional reviewers).
4. Disable **Prevent self-review** so the personal repository owner who dispatches the workflow can approve the same run. GitHub's UI may word this setting differently.
5. Keep classic `main` protection, the independent exact-main CI requirement, the existing `PUBLIC_RELEASE_GITHUB_READ_TOKEN` read-only environment secret, and Cloudflare release secrets. Do not create or send any token in the workflow input or chat.
6. Confirm the environment API reflects the owner reviewer, `prevent_self_review=false`, main-only branch policy, no bypass, and the wait timer **before attempting a release**. If any cannot be confirmed, stop.

**Important:** The connector in this session does not have permission to configure repository environments. The owner must make the one-time Settings change. The implementation checks these settings and fails closed.

## Every release (GitHub UI)

1. Make sure the desired changes are merged to `main`. Run **AI Advisor PR validation (no deployment)** manually on `main`, then verify the successful workflow run uses the current exact `main` SHA.
2. Open **Actions → Approved Public-only production release → Run workflow**.
3. Select `main`, check `approve_public_release`, and paste the **full 40-character main SHA** into `approved_sha`. Only the repository owner may dispatch.
4. Review the run summary, then use GitHub's **Review deployments → Approve and deploy** for the `public-production` environment. Wait timers and required reviewers are GitHub-enforced. No local `gh` installation, `release:prepare`, `release:approve`, or manual Environment variable edits are needed in the configured GitHub-review mode.
5. Confirm `validate`, `release-public`, live predeploy guard, deploy and postdeploy verification all PASS. Inspect the new Cloudflare Worker version and ensure one version serves 100% traffic; a successful upload alone is not final proof.

## Guard behavior and migration

- When `public-production` has exactly one required-reviewers rule, the guard demands a single owner reviewer, `prevent_self_review=false` **on the `required_reviewers` rule in `protection_rules` (not at the Environment top level)**, and a successful owner approval associated with the **current workflow run and this Environment**, as returned by the GitHub Actions deployment-approvals API. Environment variables cannot override a missing or invalid GitHub review.
- With no required-reviewers rule, the old `PUBLIC_RELEASE_APPROVAL_SHA` and `PUBLIC_RELEASE_APPROVAL_RUN_ID` environment-variable approval still applies. This avoids breaking existing releases while the owner has not enabled the new UI. The fallback remains gated by all the original protections; it is **not** an automatic approval.
- The runner still rejects changed SHA, non-owner dispatch, an attempted rerun, modified/missing main protection, missing exact-SHA independent CI, missing/invalid baseline, incorrect bindings/schema, unexpected Cloudflare traffic, or failed postflight.
- `release-public` deploys only the **Public Worker and frontend assets**. It does not deploy Auth, apply D1 migrations, upload documents, run backfills or change AI rollout configuration.
- The 5-minute timer is not an independent second reviewer. Both dispatch and review may be done by the same personal repository owner. Protect the owner account with MFA/passkeys.

## Safe acceptance

After CI passes, the owner should perform a settings-only read-back, a non-production unit-test check and review the full diff. The first live release must be dispatched explicitly by the owner; do not launch a real deployment merely to smoke-test the UI. No GitHub Environment or Cloudflare production settings are changed by this PR.

## 2026-10-28 release incident and correction

Release #121 failed at the Owner approval guard, not at Cloudflare. GitHub's read-only approvals endpoint recorded the Owner approval and the 5-minute bot timer. The guard erroneously looked for `environment.prevent_self_review`, whereas GitHub's [Get an environment response](https://docs.github.com/en/rest/deployments/environments#get-an-environment) places it on the `protection_rules[]` entry with `type: required_reviewers`. The correction requires the **rule-level** value to equal `false` and rejects missing/true rule values, preserving all other security gates. This is a code fix, not a reason to relax Environment settings or reuse failed workflow attempts.

## Reviewed transition to Public v477

The v477 evidence is stored separately in [public-release-baseline-04e1f162.json](public-release-baseline-04e1f162.json). Preserve prior baseline files and all HK2 import, publication and backup receipts. The v477 record contains an archived version and deployment confirmation, and owner-provided independently verified metadata. A fresh D1 schema or serving frontend manifest check and build artifact byte parity were not established for this transition.

The v477 maintenance candidate covers the exact diff from the pinned preparation main commit. CI exercises the Git and GitHub validation with fixtures. For independent owner review, run `node scripts/verify-public-baseline-transition.mjs describe <full-candidate-sha>`. Review the complete diff, including old/new blob IDs and file modes. To approve the exact candidate, the owner posts an unedited PR comment containing the following five lines with the actual values.

```text
HUB Public baseline transition v476 -> v477
pr=<pr-number>
base=<full-base-sha>
head=<full-candidate-sha>
diff_sha256=<complete-diff-digest>
```

With a read-only GitHub credential in `GH_TOKEN`, verify the approval separately using `node scripts/verify-public-baseline-transition.mjs verify <full-candidate-sha> <pr-number> <owner-comment-id>`. The verifier reads the comment and PR from GitHub and checks the exact base, head, complete diff digest, author and comment target. Draft CI, text in a commit and the v477 release receipt do not attest approval of a candidate commit. If main or the candidate changes, stop and review the new transition. Baseline approval does not grant deployment approval.

The publication freeze accepts one exact state-guard blob transition for v477. Future changes need their own reviewed baseline and diff. The existing Release Assistant baseline command does not implement this approval or the versioned evidence policy. Do not use it to prepare this transition.

## Rollback decision

A release uses the pinned predeploy UUID and the existing separate owner approval. Record a deployed baseline only when the exact approved SHA, deploy output UUID, successful postflight, single serving version at 100%, and deployment receipt agree. Preserve the rollback target and its provenance before release. Maintain the current Public-only target, approvals, schema and binding checks.

If check results are missing or traffic is unexpected, stop and reconcile deployment receipts. A Worker rollback requires separate owner approval and a known compatible version with the correct bindings and verified HK2 gate behavior. The v476 source lacks the v477 publication gate and must not be chosen merely because it was a previous predeploy pin. For any authorized rollback, recheck the effective version and catalogue behavior, preserve the rollback receipt, and review any resulting pin transition separately. A Worker rollback does not authorize a database restore, migration, import rollback or modification of the HK2 publication state.
