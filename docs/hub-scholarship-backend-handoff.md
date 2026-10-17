# Current extension — v1.2.0 (2026-10-17)

The current implementation is on codex/scholarship-private-rankings, based on main a4230c4. See [current API contract](hub-scholarship-api-contract.md) for typed eligibility conversion, independent own/public approval, trainingProgram filtering, private rankings and migration 0059. All earlier readiness/test counts below are historical. The real Excel/JSON were read and compared offline only; 1,059 × 17 cells match, no real snapshot was written. Source cache freshness and university authorization remain owner review items. No deployment, remote migration, R2/secret/Auth changes are authorized by this handoff.

Current verification (2026-10-17):

| Command / check | Result |
| --- | --- |
| npm run typecheck | PASS |
| npm run cf:typecheck | PASS |
| npm run test:scholarships (also in full suite) | 40/40 PASS |
| npm run test:scholarships:frontend (also in full suite) | 38/38 PASS |
| npm test | 1,032/1,032 PASS; zero failed/skipped/cancelled |
| npm run build | PASS; existing large-chunk warning remains |
| npm run cf:check | PASS, deploy --dry-run only |
| node --test tests/public-release-v2-rollout.test.mjs | 16/16 PASS; old/missing/drifted schema rejected |
| npm run test:scholarships:browser | 2/2 acceptance suites PASS; real Chrome at 360, 390, 768, 1280, 1440px |
| npm run cf:d1:migrate:local | PASS; 61 migrations, 0059 recorded once, zero public campaigns and zero FK violations |

Browser coverage includes a real list/API/SQLite round trip, 12 approved columns, source STT, Vietnamese AND filters, program facets, URL/page reset, loading, empty/error states, reset/collapse and mobile drawer. Me covers nine payload/auth states per size, independent expansion and refresh, VNĐ/percent, Top customization and key-only storage. Synthetic Admin browser cases at 390/1440px verify unchecked own permissions, separate confirmations and the exact approval payload. Authentication is synthetic/local; Google/email/OTP login was not tested live.

Regression tests also upgrade a pre-0059 applied immutable snapshot and a v1.0 preview, retaining old content/checksums; real Miniflare D1 round-trips typed rankings, numeric strings and nulls. No old migration was edited. package-lock.json, production configuration, baseline pin and Auth Worker remain unchanged. The primary dirty worktree's tracked diff SHA-256 is unchanged.

Minimal synthetic screenshots, inspected after browser capture:

- [List desktop](screenshots/hub-scholarship/v1.2-list-1440.png), [list mobile](screenshots/hub-scholarship/v1.2-list-390.png).
- [Me desktop](screenshots/hub-scholarship/v1.2-me-1440.png), [Me mobile](screenshots/hub-scholarship/v1.2-me-390.png).

Technical readiness: READY FOR OWNER REVIEW. Real-data ingestion/publication: BLOCKED pending documented public/own field authorization, review of the source formula caches and separate operational approval. Migration 0059 is local-only; the release gate deliberately blocks a database still on the old schema. Existing backup containment/operations requirements are not cleared by this work. No production action or PR merge was performed.

# HUB Scholarship backend handoff — v1.1.0

## ANTIGRAVITY_READY = YES

Backend branch: `feature/hub-scholarship-foundation`.
Backend implementation and regression-test SHA: `c78ab17c1115059b1c547e1e7ebad942901ede53`.
Implementation commit: `664b8158dbbde0ebc0b9d6996c2feb9e95464a49`; additional atomicity regression commit: `c78ab17`.
Current contract: **v1.1.0**, `docs/hub-scholarship-api-contract.md`.
The branch's subsequent documentation commit contains this handoff and contract; use latest branch HEAD when creating the frontend branch.
Draft PR: https://github.com/tqhoangg08/HUB-PLANNER/pull/91. Keep it Draft; no merge/deploy authorization.

Ready means frontend development can integrate against the implemented contract with empty campaigns or clearly synthetic local fixtures.
Production release is **NOT approved or verified**. The official source file and per-field republication authorization are still absent.

Initial v1.1 implementation is 270d0c8; final hardening regression is 251c0b4. Backend/main integration candidate cf9a9f0 includes origin/main 93eda00; package test-chain conflict was resolved by retaining both Scholarship and document-tag tests. No main branch or Auth Worker was changed by this work. Old counts below are historical.

Final release review (2026-10-15): Scholarship tests 34/34; frontend 32/32; integrated full suite 920/920, zero failures/skips; typecheck, Cloudflare typecheck, build and Wrangler dry-run PASS. Local main upgrade with a retained synthetic marker, fresh 59-migration chain and reverse Scholarship/AI ordering PASS. No migration file was renamed or edited. See the frontend combined handoff for current Admin/Studio browser evidence and exact candidate limits.

Technical status: READY FOR OWNER REVIEW. Empty-data deployment: CONDITIONAL on separate owner release approval and live binding/backup/operations verification. Real student-data publication: NOT READY; official source and documented per-field university republication authorization remain absent. No real import/publication, remote D1 migration, production deploy/write, secret change or PR merge occurred. This is technical validation, not legal clearance.

## Post-PR #100 integration — 2026-10-15

This section supersedes the earlier validation and dependency status above. Backend baseline `b0d30980e902cbb0cbef37a4d91d7c3cfa2657f5` integrates main `a1f8ec0e066e196652a172ecc63a4d8b3d16c775` in an isolated worktree. Both package.json conflict regions retain Scholarship, document-tag and dependency-security scripts. Dependencies, devDependencies and the entire lockfile match main after PR #100 exactly; no override or additional upgrade. Scholarship implementation/tests, API v1.1.0, migrations 0055–0057 and Auth Worker are unchanged.

Fresh local verification: npm ci PASS (938 packages); production npm audit PASS (zero vulnerabilities); npm ls PASS; typecheck and cf:typecheck PASS; Scholarship 34/34, dependency-security 5/5 and full npm test 925/925 PASS (zero failed/skipped/cancelled); build and Wrangler cf:check dry-run PASS. Existing real Chrome text-document acceptance also passes 1/1, including 1280px/390px. Local D1 fresh 59-migration chain, upgrade from main retaining an existing synthetic marker and reverse Scholarship/AI ordering PASS; no foreign-key violations, zero public campaigns in the fresh/upgrade verification databases. No migration history was modified.

Full npm audit still reports six development packages (3 high / 3 moderate): Miniflare, Sharp, nested undici, Wrangler, ExcelJS and uuid. These are the documented residuals in `dependency-security-remediation.md`; production audit zero does not certify the emulator or every separately hosted Node runtime. Use isolated loopback emulators and synthetic inputs. No real source or per-field university republication permission has been supplied: real student-data publication remains blocked. Empty-data deployment requires a separate owner decision and live operations review.

GitHub CI and mergeability must be checked against the resulting feature head in Draft PR #91; local PASS is not a claim that a not-yet-triggered CI run passed. Primary dirty changes and unrelated worktrees are excluded and preserved. This integration performs no PR/main merge, deployment, remote migration, production write, secret change or real-data import/publication.

## Implemented

- Public `GET /api/public/v1/scholarships/campaigns`, `/:slug/summary`, `/:slug/recipients`, `/:slug/search`:
  paginated complete published list, year/semester campaign filters, award filters, literal Vietnamese name substring, student-code prefix.
- `GET /api/me/scholarships`: Better Auth server session and verified school-email identity only; no browser claim;
  distinct unverified/no-award states, all matching awards/campaigns, individually approved score fields only.
- Admin `/api/admin/v1/scholarships/campaigns`: create/list; `/:slug`: inspect/draft edit;
  `/:slug/imports/preview`, `imports/apply`, `imports`, `imports/:batchId/rows`, `audit`, `approve`, `publish`, `unpublish`, `rollback`, `archive`.
  Admin role enforced on every read/mutation, auditor denied, same-origin JSON mutations, revision checks and transaction audit.
- Offline `scripts/prepare-scholarship-import.mjs`: bounded XLSX/CSV parsing and source SHA-256, explicit mapping,
  duplicate/error preview, private JSON preparation only. It cannot apply to D1 or access production.
- Additive 0056 snapshot migration: applied rows immutable, independent candidate/live batches, field/document approval receipts,
  atomic publish/rollback/unpublish. No arbitrary GPA/DRL scales in snapshot score data; legacy 0055 rows preserved but hidden until re-imported/reviewed.
- Search rate binding in Public Worker; all scholarship data uses no-store; scholarship code does not log search/cell PII.

Examples: empty campaigns `{campaigns:[],total:0,page:1,limit:20}`;
unverified self `{verified:false,awards:[]}`; verified without awards `{verified:true,awards:[]}`.
See the contract for exact recipient, source-specific score and Admin body/response fixtures.

## Historical v1.0 validation ledger (not a current release certification)

All commands ran locally, with synthetic test records only. No unrun check is recorded as PASS.

| Command/check | Result |
| --- | --- |
| Initial foundation scholarship test | FAILED before assertions: Node strip-types cannot parse TypeScript parameter properties; fixed in ScholarshipError |
| Initial `npm run typecheck` / `npm run cf:typecheck` | Both exit 0 |
| Final `npm run test:scholarships` | **25 passed, 0 failed, 0 skipped**, exit 0 |
| `npm test` (first broad run) | 868 passed, 0 failed, 0 skipped, exit 0 |
| `npm test` (second broad run, final backend code) | **870 passed, 0 failed, 0 skipped**, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| Final `npm run cf:typecheck` | PASS, exit 0 |
| `npm run cf:types:check` | PASS: generated types up to date, exit 0 |
| `npm run build` | PASS, exit 0; Vite/PWA assets built (existing large-chunk / stale Browserslist warnings) |
| Full Wrangler local migration chain through 0054 → 0055 → 0056 | PASS, exit 0, separate empty local state |
| Isolated Wrangler 0055 → 0056 migration + trigger/foreign-key verification | PASS, exit 0; all 3 immutable triggers present, no foreign-key violations, 0 campaigns |
| `git diff --check` | PASS |

After the second full run, one additional publish/rollback failure regression was added (test-only change) and the complete scholarship suite rerun:
25/25 PASS. The full-run total 870 includes its then-current 24 scholarship tests, not that later additional test.
Code did not change after the second full run. No browser frontend QA was claimed; scholarship UI remains Antigravity's task.

Scholarship tests cover private/unpublished/legacy visibility, per-score approval, duplicate names and Vietnamese accents,
literal `%`/`_`/backslash matching, pagination/unknown parameters/methods, forged self identity, unverified and expired sessions,
wrong roles, CSRF/JSON/body bounds, duplicate/conflicting/missing import data, checksums, corruption, idempotency,
multiple awards, immutable snapshots, no partial preview, CAS races, atomic publish/rollback/unpublish and audit failures,
database/auth failures, CSV/XLSX parser limits and ZIP corruption/bombs. Tests execute real SQLite SQL/constraints;
Miniflare executes the actual bundled Public Worker and real local D1, including transactional CAS failure.

Wrangler commands actually performed:

```powershell
node scripts/run-wrangler.mjs types cloudflare/worker-configuration.d.ts --config cloudflare/wrangler.jsonc
node scripts/run-wrangler.mjs d1 migrations apply hub-planner-public-dev --local --persist-to .cache/scholarship-local-d1 --config cloudflare/wrangler.jsonc
node scripts/run-wrangler.mjs d1 migrations apply scholarship-synthetic-local --local --persist-to .cache/scholarship-isolated-d1 --config .cache/scholarship-local.jsonc
```

The isolated ignored config copies only 0055/0056 and uses a synthetic database ID, no service binding or remote resources.
Test/build logs are local ignored `.cache/scholarship-*.log`. Generated Workers declarations were refreshed from existing config;
their previously stale AI literals now reflect already-existing settings. Runtime AI flags, Auth configuration/code, rankings and directory were not changed.

## Remaining limitations and integration requirements

1. No official XLSX/CSV supplied, no real records imported, no field policy assumed. School approval must identify each public field/score.
2. Offline parser trusts the authenticated operator to supply the official source checksum/document; Worker verifies parsed payload integrity,
   not original-file authenticity. Review the source file and mapping before approval.
3. Conservative bounds: 2000 rows per whole snapshot, 1 MiB JSON, 4 MiB original file. Larger official data needs an explicitly designed larger ingestion workflow;
   do not split into unrelated campaigns or silently drop rows. Numeric MSSV, formulas, merged/datetime/rich cells require reviewed clean exports.
4. Replacement of a live snapshot requires explicit unpublish before apply/approval; users see a no-public-campaign gap until publication.
   Historical approved published snapshots remain available for explicit Admin rollback. Archive is terminal.
5. Name substring scans are bounded by snapshot, not globally indexed fuzzy search. Rate limiting is approximate/per Cloudflare location.
   Production traffic/load performance is unmeasured.
6. Portrait processing stays entirely in browser memory; frontend must get personal awards from `/api/me/scholarships`, never from search/query identity.
   Re-fetch before celebrating. Respect optional/null/string score values and missing campaigns.
7. No production verification, remote D1 schema mutation, merge, deployment or CI release dispatch. A separately reviewed release is required later.

The pre-existing untracked `docs/ai-advisor-v2/` directory was retained and excluded from these commits.
