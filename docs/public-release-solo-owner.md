# Public-only release: SOLO OWNER approval

Status: implementation for PR #88, **production NO-GO; PR remains Draft**.
This document supersedes the independent-reviewer requirement in earlier PR
readiness reports. It does not approve a merge, deployment, migration or cutover.

## What this does, and does not, protect

This is an explicit **solo-owner authorization**, not two-person review. The same
human approves the code, dispatches the job and records a separate release
confirmation. A wait timer is a delay, not a reviewer. Someone controlling the
owner account can change protections, approval variables and code; this does not
defend against a compromised owner account or provide independent human review.
Use MFA/passkeys and protect the owner's GitHub session separately.

No `approval_mode`, `skip_guard`, `requireOwner=false`, CLI bypass, client flag or
workflow input can disable the final guard. The policy is committed code for
`tqhoangg08/HUB-PLANNER`, not an actor name supplied by the dispatcher.

## Mandatory layers

1. Manual `workflow_dispatch` on `refs/heads/main`, explicit release input default
   false, exact 40-character SHA equals checkout, workflow-run SHA and **live main**.
2. GitHub API verifies the repository's personal owner ID against both the actor
   and triggering actor. Only the first attempt of a new run is accepted. An
   organization owner or changed repository/workflow cannot silently reuse this policy.
3. API verifies `public-production`: no administrator bypass; integer wait timer
   at least five minutes; custom deployment policies contain exactly one branch,
   `main`, no tag/wildcard/extra branch. Final guard also requires five minutes to
   have elapsed since dispatch. GitHub enforces the release job's environment wait.
4. API verifies **mandatory classic main protection**, including Admin enforcement, no force pushes or
   deletion, PR-only changes and a strict required status check from the GitHub
   Actions App: `AI Advisor independent validation` (App ID 15368).
   Solo PRs may require **zero human approvals**; no pretend reviewer is added.
5. The separately recorded environment variables `PUBLIC_RELEASE_APPROVAL_SHA`
   and `PUBLIC_RELEASE_APPROVAL_RUN_ID` must exactly match this run. Each must
   have an API `updated_at` after the run was created, not in the future, and no
   older than 24 hours. There is no repository/org variable fallback. Replays,
   inherited inputs or stale approvals fail. Values are read, not written by CI.
6. API verifies a completed successful check on this exact main SHA, the Actions
   publisher, and its linked successful **manual validation workflow on main**.
   A same-named check from another workflow, old SHA, failure or partial response
   is not sufficient. No source changes may occur between validation and release.
   A newer failed/in-progress check cannot reuse an older successful receipt.
7. A second live head/environment read occurs at the end of metadata collection.
   The final guard is immediately before the Public-only deploy step. Do not merge
   other main changes during release; this is not an atomic GitHub-to-Cloudflare
   transaction and a small residual check-to-deploy race remains.

All metadata calls are GET, bounded, with deadlines and redirects disallowed.
HTTP 401/403/404/429/5xx, unavailable/malformed/incomplete metadata or missing
protection fails closed. Provider response bodies and credentials are not printed.

The credential-free validate job runs only partial dispatch/environment preflight
and tests. Its PASS is explicitly **NOT release approval**. The protected
release-public job always runs the complete guard without the preflight argument.
It does not deploy Auth, apply migrations, backfill, upload documents or index them.
Existing live-state checks still reject missing 0054 or canary/observability drift.

## Verified GitHub state on 2026-10-11 (READ ONLY)

- Environment API 200: `public-production`, bypass false, wait timer 5.
- Deployment policy API 200: exactly `main`, type branch.
- No required reviewers. This is expected for the chosen solo model.
- Main API 200: `protected=true`; effective rules API 200: deletion,
  non-fast-forward, pull-request and required-status-check rules from **24867954**.
- Ruleset 24867954 API 200: **active**, but `bypass_actors` is omitted in this
  unauthenticated read. Its bypass list is **NOT VERIFIED**, never inferred empty.
- Classic protection and environment-variable APIs returned 401 without an
  existing authenticated read credential; they are NOT VERIFIED, not inferred.
- Old production workflow is `disabled_manually`; independent PR CI active.
- PR #88 remains Draft. No GitHub protection/variable/secret was changed here.

The available live evidence cannot satisfy the new release guard: classic
protection needs an authenticated Administration-read response. HTTP 401 does NOT
prove classic protection is absent. No real fine-grained read-only PAT was
available for an authenticated end-to-end guard run; API compatibility below is
documentation-backed and fixture-tested, not a live token/release PASS.

## Owner actions required on GitHub — do not deploy yet

### 1. Protect main

Required: **classic branch protection**, branch name `main`:

- Require a pull request before merging; leave human approval count at zero.
- Require status checks and require branch to be up to date.
- Require `AI Advisor independent validation`, publisher GitHub Actions.
  The new check becomes selectable after this PR's updated independent CI runs.
- Enable "Do not allow bypassing the above settings" (API `enforce_admins=true`).
- Leave force pushes and branch deletions disabled.

Keep ruleset 24867954 active as an additional protection; do not delete or weaken
it. A ruleset alone is **not an accepted release authority**. GitHub documents
that GET ruleset hides `bypass_actors` unless the caller has write access to the
ruleset. Thus a read-only PAT cannot guarantee the old ruleset-only guard passes,
even when the owner has configured an empty list. Missing metadata is unknown,
not `[]`; do not grant Administration Write to work around this.

Classic protection and rulesets are cumulative. Bypassing an additional ruleset
does not bypass the independently enforced classic protection. The guard always
GETs `/branches/main/protection`, validates it before reading approval variables,
and re-reads it immediately before final approval; it no longer depends on
`/rulesets` or effective-rules metadata. Rulesets cannot rescue absent or invalid
classic protection. Their bypass lists are not certified by this guard.

This policy supports only a personal repository (`owner.type=User`). Classic named
PR bypass lists are organization-only, so omission of that optional classic field
is documented non-applicability, not the ruleset's write-only redaction behavior.
If an unexpected classic allowance object is returned, all users/teams/apps arrays
must be explicitly present and empty; nonempty/incomplete/null objects block.

### 2. Arrange read-only GitHub metadata access

No token or secret has been created by this task. The ordinary workflow
GITHUB_TOKEN cannot be assumed to read Administration/Environment-variable data.
If an existing suitable credential is available, owner must arrange it as the
**environment secret** `PUBLIC_RELEASE_GITHUB_READ_TOKEN` in `public-production`.
Otherwise arranging a credential is a separate owner action, not permission for
this agent to create one.

Scope to this repository only. The complete endpoint permission set is:

| Permission | Level | GET endpoints used by the guard |
|---|---|---|
| Administration | Read | `/branches/main/protection`, including enforce_admins, strict checks, force/deletion flags |
| Environments | Read | The two `/environments/public-production/variables/...` owner confirmations |
| Actions | Read | Workflow run provenance, environment protection rules, deployment branch policies |
| Checks | Read | Exact-SHA check runs and GitHub Actions publisher |
| Contents | Read | `/branches/main` and its live SHA |
| Metadata | Read (automatic) | Repository identity/owner |

These are read permissions only: **no Administration Write**, Contents Write,
Actions Write, Secrets permission or workflow-dispatch privilege is required.
GitHub allows the public repository/run/check/branch/environment endpoints above
without authentication. Consequently the strictly indispensable extra grants for
this currently public repository are Administration Read + Environments Read
(Metadata is automatic); Actions/Checks/Contents Read form the explicit complete
set and avoid dependence on public-resource access. If repository visibility
changes, use the full set. This is not a claim that a particular PAT was tested.
The PAT principal must already have access to read the repository's environment
variables (the owner qualifies). A token's permissions cannot create that access.

No Cloudflare secret is needed for the GitHub guard. Use expiration/rotation; never paste a token in a comment,
workflow input, local report or frontend. If permissions are inadequate, fix the
owner-controlled configuration; do not grant a broad write token as a shortcut.

### 3. Keep the environment protections and old workflow disabled

Keep main-only custom branch policy, five-minute-or-longer wait and bypass OFF.
Do **not** enable the old auto-deploy source on current main. Only after a separate
approved merge confirms the replacement manual/Public-only source has landed may
the owner consider re-enabling that workflow. Enabling it is not authorized here.

### 4. Future approval sequence, only after other production gates are approved

1. Merge only with separate approval; record the resulting exact main SHA.
2. Manually run **AI Advisor PR validation (no deployment)** on main and wait for
   success on that SHA. Its new workflow_dispatch trigger validates only, with no
   credentials, migration, Cloudflare access or deployment.
3. Owner manually dispatches the Public-only release on main with the exact SHA
   and explicit approval. This is a future action, NOT requested now.
4. After obtaining that new run ID, independently update both environment variables:
   `PUBLIC_RELEASE_APPROVAL_SHA=<exact main SHA>` and
   `PUBLIC_RELEASE_APPROVAL_RUN_ID=<new run ID>` in `public-production`.
   Both timestamps must be later than dispatch. Do this while validation/wait is
   running; values are read live by the final guard. Never supply these as inputs.
5. If validation/release fails or main changes, diagnose first. A new authorized
   dispatch plus fresh confirmations is required; rerun buttons do not reuse approval.
6. Clear the confirmation variables after completion, as an owner action. The guard
   is read-only and does not erase them or change GitHub configuration.

Existing Cloudflare release secrets remain environment-scoped and separately
approved. This change does not create or validate those credentials, or relax
the migration/schema/configuration preflight.

## Remaining production gates

The approved two-row 0054 fixture rehearsal passed and restored exactly. It is not
a production-copy backup/restore rehearsal. Full production-copy rehearsal,
separate production migration approval, approved five-DOCX cutover/index readiness,
Public-only flags-OFF release approval, monitored/budgeted limited rollout and
Gemini/legal-currentness risks remain in the release checklist.

No new provider-quality acceptance is claimed from these release-guard tests.
Production remains canary 7% / completeness OFF because this task changes no
production state, not because a production configuration write was performed.

## Validation evidence for this change

- Focused release/security regressions for read-only compatibility: 119/119 PASS.
- Full npm suite: 803/803 PASS (248.8 seconds); Advisor subset 393/393;
  auxiliary tests 2/2. This does not exercise a real PAT or release workflow.
- Frontend/Worker typecheck, frontend/staging build, YAML parse, diff check PASS.
- Real read-only GitHub API: active main ruleset with omitted bypass metadata;
  classic protection HTTP 401 without a credential => NOT VERIFIED / blocked.
- Valid classic/approval combinations and ruleset non-substitution were tested with offline fixtures;
  they are NOT a live successful release proof. No production workflow ran.
- Independent GitHub CI result must be verified on the pushed commit, not inferred
  from the preceding commit's successful run. The final response links that run.

## Primary references

- [GitHub environment API](https://docs.github.com/en/rest/deployments/environments#get-an-environment)
- [Classic protection API / Administration-read](https://docs.github.com/en/rest/branches/branch-protection#get-branch-protection)
- [Ruleset API / write-only bypass metadata](https://docs.github.com/en/rest/repos/rules#get-a-repository-ruleset)
- [Classic/ruleset cumulative enforcement](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets#about-rulesets-and-protected-branches)
- [Classic bypass lists are organization-only](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-pull-request-reviews-before-merging)
- [Effective branch rules](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch)
- [Environment variables API / Environments-read](https://docs.github.com/en/rest/actions/variables#get-an-environment-variable)
- [Branches / Contents-read](https://docs.github.com/en/rest/branches/branches#get-a-branch)
- [Workflow runs / Actions-read](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run)
- [Check runs / Checks-read](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference)
