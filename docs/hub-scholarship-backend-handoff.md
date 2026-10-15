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

Latest v1.1 implementation is 270d0c8, documented by 24cc7b3; see the API contract and filter-extension ledger. The pre-deploy audit remains NOT READY for real student data without explicit authorization. Current integrated validation is maintained in the frontend combined handoff; old counts below are historical.

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
