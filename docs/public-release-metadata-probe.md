# GitHub read-only PAT probe / CI bootstrap (not a release)

This minimal change starts from main `059f73364d257fdf15b8878b8160e7c94bfc5a75`,
not the AI Advisor branch. PR #88 remains Draft and production remains NO-GO.
Opening this PR is authorized; merging or dispatching it is NOT authorized.
Solo-owner review is not approval by an independent person. The required check's
existing name does not imply that a second reviewer inspected this change.

## Two separate trust boundaries

1. `ai-advisor-pr-validation.yml` supplies the **AI Advisor independent validation**
   check already required by main protection (GitHub Actions publisher 15368).
   It runs for PRs targeting main, without path filters, and optionally manually.
   It uses main's actual typecheck, cf:typecheck, build, npm test and auxiliary
   test scripts, plus the new offline probe tests. No AI product code is copied.
   Clean install on main failed with npm 10 and 11 because two optional transitive
   WASM dependency entries were missing from its lockfile. The minimal lock repair
   adds only @emnapi/core 1.11.3 and @emnapi/wasi-threads 1.2.3 with registry-verified
   integrity hashes; no package.json or existing locked version is changed.
   PR checkout is allowed ONLY here: contents-read token, no persisted credential,
   no environment, no secret references, no lifecycle install scripts, no cache or
   artifacts shared with the privileged probe, no deployment or remote migration.
2. `public-release-metadata-probe.yml` is manual-only, main-only and owner-only.
   It has NO checkout, dependency install, third-party action, PR script,
   `pull_request_target`, `workflow_run` trigger, artifact or arbitrary input.
   All executable probe code is embedded in the reviewed workflow on main.
   Runner/GitHub provenance, numeric actor identity, triggering actor, attempt 1,
   exact live main SHA, workflow identity and environment rules are verified
   before PAT requests, then mutable protections/head are checked again.

The probe uses the existing protected `public-production` environment. GitHub's
documented `environment.deployment: false` keeps environment secret access but
does not create a GitHub deployment object. There is no Cloudflare command or
credential reference. It also checks the live wait timer and elapsed run time;
missing/unsupported runtime metadata fails closed. Runtime behavior of this new
workflow is NOT VERIFIED until an explicitly approved owner dispatch after merge.

## Endpoint/credential allowlist

| Credential | Fixed GET endpoints |
|---|---|
| Short-lived GITHUB_TOKEN: Contents Read, Actions Read, Metadata automatic | Repository, main branch, current numeric run ID, this workflow, environment protection, main-only branch policies |
| Existing owner PAT: Administration Read, Environments Read, Metadata automatic | main/classic protection; public-production variables list; the two named approval variables only when listed |

No write permission is requested, no token fallback or redirect is allowed, and
no token/header/body/variable value is output or saved. Response parsing is bounded
to 2 MiB and variables to one complete page of at most 100. Network, HTTP (including
401/403/404), invalid JSON, incomplete metadata, wrong configuration or drift blocks.
This does not independently attest that the stored PAT has *no* extra permissions;
the owner must inspect its grants and expiry. Successful GETs prove read capability.

Classic protection must enforce admins, PR-only workflow, strict required CI from
Actions app 15368, no force push/deletion, and no applicable named PR bypass.
For this personal-owned repository, omitted organization-only classic bypass lists
are non-applicable. Hidden ruleset `bypass_actors` is NEVER treated as empty or used
as an alternative protection source. Additional rulesets remain untouched.

Missing `PUBLIC_RELEASE_APPROVAL_SHA` / `PUBLIC_RELEASE_APPROVAL_RUN_ID` is reported
separately from successful PAT variables-read capability and does not fail the
capability probe. If present, the named GET endpoints are also checked. No variable
value is accepted as approval here: **RELEASE_APPROVAL=BLOCKED_NOT_EVALUATED** always.
An API HTTP failure, unlike an absent variable in a valid complete list, blocks.

## Automation audit before opening this PR

Live API inspection on 2026-10-11:

- main protected; ruleset 24867954 Active, strict required named check/app 15368.
- environment main-only, wait 5 minutes, administrator bypass false.
- old `deploy-cloudflare-production.yml`: **disabled_manually**. Its source on main
  is still dangerous if re-enabled: push-main applies ALL pending Public migrations
  and deploys Auth and Public. This PR does not change or enable it.
- `backup-db.yml`: Active, scheduled/manual, not push/PR/merge-triggered. It reads
  Supabase and writes/deletes R2 backups on its independent daily schedule. Unchanged;
  its operations are not triggered by this PR or performed by this task.
- `hub-notification-crawler.yml`: Active but retired, manual-only informational job.
- independent validation workflow already registered from PR #88, Active, but its
  file is absent from main. This PR bootstraps it with main-compatible scripts.
- dynamic Dependabot updates Active; not a Cloudflare deployment workflow.
- tracked `git/hooks/*.sample` are not installed hooks. No configured core.hooksPath.

This audit covers visible repository workflows and tracked/configured local hooks,
not unobservable external Apps/webhooks. Recheck workflow states immediately before
any separately approved merge. Never enable the old production workflow as a shortcut.

## Owner sequence (separate approval at each boundary)

1. Review this minimal diff and successful exact-head CI on this PR. Do not weaken,
   bypass, or disable main protection if CI is absent/failing. Resolve the real CI
   issue first. This PR does not authorize merge of itself or PR #88.
2. Only with separate merge approval: recheck the old deployment workflow is still
   Disabled; merge this PR normally through existing protections. Do not use skip-ci
   or force push. The small bootstrap does not release AI Advisor code.
3. Inspect the resulting trusted main SHA and this metadata-only workflow. Keep the
   production workflow Disabled. Confirm the PAT is repo-scoped, unexpired, and
   read-only; never paste it into inputs, issues, reports or chat.
4. Only with separate dispatch approval: owner runs **Public release GitHub metadata
   probe (NO DEPLOYMENT)** on main, once. No workflow inputs or release confirmation
   variables need to be created solely for the probe. Wait for environment protections.
5. Inspect ONLY its PASS/BLOCKED and safe HTTP codes. Do not mark release approval
   or production readiness PASS based on this capability test. If it blocks, keep
   NO-GO and fix owner configuration under separate authorization, not with Write PAT.

PAT actual capability, authenticated classic configuration and the final release
approval guard remain NOT VERIFIED until those distinct tests occur. No production
workflow, merge, migration, document processing or Cloudflare change is part of this PR.

## Local validation before opening the PR

- Exact embedded probe: 65/65 offline security tests PASS.
- Existing main `npm test` with Node 22.23.3: 388/388 PASS; auxiliary tests 2/2 PASS.
- Clean dependency install, frontend/Worker typecheck, frontend build, workflow
  YAML/structure checks and staged diff check PASS.
- An initial Node 24 full run concurrent with frontend build failed one existing
  Miniflare schedule validation test. That exact test passed in isolation, then
  the full Node 22 run passed without exclusions/retries in the CI workflow.
  Reported as local runtime/concurrency sensitivity, not hidden as an allowed baseline.
- GitHub CI on this new PR must be observed separately after opening; local PASS
  does not certify CI. No manual workflow dispatch is authorized by this PR.
- No actual PAT or release approval was exercised by the offline tests.

References:

- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/deploy-to-environment
- https://docs.github.com/en/rest/branches/branch-protection#get-branch-protection
- https://docs.github.com/en/rest/actions/variables#list-environment-variables
- https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
