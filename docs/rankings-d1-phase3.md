# D1 Phase 3 — Imported Rankings

Prepared from main `dc21aeda40db7f05ee96a860363afe4cf5647f74`.
Endpoint: `POST /api/user/v1/rankings/benchmark`, Public Worker only.

## Evidence and root cause

The October 20 investigation (`REPORT-D1-POST-PHASE2-2026-10-20.md` and its
evidence in the original workspace) recorded 6,296,161 account reads on October
19 UTC and a post-Phase-2 login quota error. Rankings consumed 1,299,535 Query
Insights reads in the post-deploy window; three exact aggregate fingerprints
accounted for 1,299,272 reads / 124 executions = 10,478 reads/execution.
The selected sanitized fingerprints and their original collection window/time
are retained in `evidence/rankings-phase3/production-query-insights.json`.

The benchmark loads **actual production source** using `git show` at release SHA
`a330d5d9e86fc02083f494bdf833288d79f21f3c`. Rankings source and migration 0050 are
unchanged between that release and the branch's main base. It does not reconstruct
the baseline from the proposed implementation or use production data.

Migration 0050 indexes `(semester, student_code)` and `(semester, rank)`. Local
D1 `EXPLAIN QUERY PLAN` reports `SEARCH ... USING INDEX
semester_exact_rankings_order_idx (semester=?)` for **all three** school, class
and major aggregates. This is an index scan of the semester, not evidence that
every semester in the database is scanned. Class/major are residual predicates;
the index cannot narrow those labels or cover GPA/DRL/credits. Each aggregate
still walks the semester and fetches score columns to compute COUNT/SUM.
Returning one row does not make that read cheap.

This establishes the plan against the repository schema locally. An independent
inventory of ad-hoc production indexes/plans is **NOT_VERIFIED**; no production
schema query or EXPLAIN was issued.

Local D1 with a second synthetic semester reports N+1 reads per aggregate rather
than production Insights' 10,478. Preserve the measured metadata: different
runtime/datasets/metrics are not reconciled by an invented scaling factor.

## Selected change

Compute the three scopes' totals and strict outranking counts in **one SQL
aggregate** over the semester. Keep the original GPA OR/equality comparator,
SQL NULL handling and numeric affinity. No rounded legacy score key, official
STT, student code, rank-based approximation or per-user cache is used.

Read profile scopes from the authenticated user's existing private join on
every operation. Preserve trim/BINARY matching, missing scope NULL fields,
nonmatching scope zero totals/null ranks, best tie rank, `found:false` on
incomplete inputs, and school count consistency. Re-read the ready dataset after
aggregation and fail with the existing inconsistency 503 if its count,
`source_sha256`, or `imported_at` changed or readiness disappeared. Reimports
are required by existing import code to mark `importing` before replacing rows.

The route's per-request Better Auth Service check and `private, no-store`
response are unchanged. Verified student/staff access is still decided by the
existing Auth Service `/internal/auth/session` contract; a 403 never reaches
ranking D1. There is no shared private state, cache key, eviction or stale-result
fallback to leak identities across sessions, revisions, semesters or bindings.

## Local measurements

`npm run test:rankings:performance` uses project Miniflare 4.20260722.1/D1 and
Wrangler 4.115.0, compatibility date 2026-07-29. Fixtures are synthetic: repeating
tuples, NULL components/labels, 40 class labels, eight majors, Unicode and a
separate semester. They reproduce the query/schema shape, not production's full
distribution. Each fixture compares the complete returned API object to pinned
production for near-equal floats, ties, NULL/zero/incomplete inputs, no-match,
empty/absent profiles and scope/semester isolation.

**Costs below are Public D1 operations inside the benchmark handler after route
authentication. Auth Worker D1 and other HTTP middleware costs are not included.**
SQL/request is five baseline vs four optimized when both profile scopes exist;
three scans become one plus a cheap revision recheck. No writes occur on the
request path. Cold and warm costs match because this change does not cache.

| Synthetic rows | Production code reads/request | Phase 3 reads/request | Reduction | Index-only candidate | Precompute prototype request |
|---:|---:|---:|---:|---:|---:|
| 1,000 | 3,006 | 1,005 | 66.57% | 1,155 | 10 |
| 10,000 | 30,006 | 10,005 | 66.66% | 11,493 | 10 |
| 10,478 | 31,440 | 10,483 | 66.66% | 12,042 | 10 |
| 50,000 | 150,006 | 50,005 | 66.66% | 57,439 | 11 |

Eight concurrent same-user/input operations at 10k: **240,048 → 80,040 reads**,
40 → 32 SQL. At 50k: **1,200,048 → 400,040 reads**. Each response is checked
against baseline; no coalescing or assumed cache hits are credited. Different
users/inputs are also measured. The final benchmark artifact additionally records
the 10,478-row synthetic fixture and school-only/one-scope/incomplete-input costs.
For school-only requests, the existing one scan remains and the revision recheck
adds one SQL/read: the 66% claim applies to requests with all three scopes.

At 10,478 rows, school-only is 10,482 → 10,483 reads (3 → 4 SQL), while either
school+class or school+major is 20,961 → 10,483 reads (4 → 4 SQL). Incomplete input
remains 1 read / 1 SQL. Eight concurrent complete same-input operations are
251,520 → 83,864 reads; the eight-operation different-user mix is
209,602 → 83,862. These are measured sums, with no cache/coalescing discount.

### Why not indexes or precompute in this runtime PR?

Three experiment-only composite indexes cover the original queries and narrow
class/major, but the school COUNT still scans its semester. For these fixtures,
the single-pass no-schema change reads fewer rows than index-only and avoids a
schema dependency and import index writes.

Cumulative buckets have the lowest prototype request reads, but are not safe to
ship as an unexplained table dependency. Prototype build costs at 50k are
**963,853 reads / 189,021 writes**, exceeding the [100k free daily writes](https://developers.cloudflare.com/d1/platform/pricing/)
before other usage. The prototype has no production revision switching/import
integration. Its request cost uses baseline readiness, not the added final
revision recheck. The separate [precompute proposal](rankings-precompute-proposal.md)
sets requirements for atomic revision readiness, exact nullable tuples, write
budget and rollback before an Owner-reviewed migration PR. No migration is
required or included for the selected implementation.

## Frontend request audit

The remaining Rankings paths were inspected as well. `listRankingSemesters`
reads dataset/legacy semester metadata, not individual imported students.
`forecastBenchmarkRankings` rejects ready imported semesters and otherwise uses
legacy scope/bucket lookups with LIMIT 1; its rounded legacy score key must not
replace the imported comparator. `readOwnRanking` rejects ready imported
semesters before the owner-and-semester legacy lookup in
`readOwnBenchmarkRanking`. These paths and their existing regression tests stay
unchanged. The three historical high-read fingerprints match the imported
benchmark aggregates, rather than these metadata/legacy queries.

Import code in `scripts/semester-exact-rankings.mjs` sets `importing` with the
source checksum/import timestamp before replacing rows. The operator script
validates count, distinct student codes, ranks, totals, scopes and source samples
before setting `ready` for that checksum. This inspection did not execute the
import script. The new end-of-request revision check builds on that existing
lifecycle; it does not introduce an importer or change readiness rules.

`useForecastRank.fetchSemesterRanks` loads imported semester previews when the
rank menu is prepared; selecting an imported semester calls `fetchRank` again.
Opening `useSemesterLookback` can request the same semester/tuple independently.
The client has a bounded abort timeout and no retry loop or interval polling in
these modules, but no shared request coalescing between these entry points.
Repeated/concurrent requests are possible by source analysis; production duplicate
rate, bot activity and the fraction of quota due to duplicates are **NOT_VERIFIED**.
Frontend/auth/session caching changes are intentionally outside this PR.

## Current quota check and safety

At the Phase 3 check, Browser Use returned **`Local browser use is disabled in
Work settings`**, with no available browser. Fresh day-20 usage, headroom,
post-reset quota/login errors and hourly trend are **NOT_VERIFIED**. See the
timestamped `current-quota-access.json`. The last earlier successful observation
is **2026-10-20 03:09:09 UTC = 10:09:09 Vietnam**, 129.69k/5M reads (rounded),
477 writes, ~4,870,310 reads remaining. It is not current-day-end data or a
guarantee that quota errors have not recurred since then.

No OAuth refresh, token creation, permission bypass, production SQL/EXPLAIN,
production test traffic, remote migration, Auth Worker/config, release guard,
billing or rate-limit changes. No merge or deployment. The runtime still reads
O(N) per complete request and other hot modules remain: this PR does **not**
claim the account-wide incident is resolved. Production effect needs post-release
Rows Read/SQL/request measurements under comparable traffic and without quota
censoring.

## Validation and artifacts

Final `npm test`: **1,284/1,284 PASS**, no failures or skips, including the final
four-dataset Rankings matrix and readiness/revision/count races. The matrix
compares 144 full API golden objects plus the measured per-scope/concurrent
workloads and prefix-prototype comparisons. Additional unit diagnostic run:
346/346 PASS; CI metadata/text/roster/snippet checks: 78/78 PASS.
Frontend typecheck, Worker
typecheck, frontend build and Worker dry-run PASS. The local generated declaration
needed regeneration; `cf:types:check` then passed with no canonical Git content
change or production config change.

The initial full run stopped at an unmodified DRL seed test because the Windows
checkout used CRLF while its generator emits LF. Canonical main content equals
the generator. Restoring local LF changed no Git migration blob; focused DRL
13/13 and the entire subsequent suite passed. The diagnostic is retained in the
evidence, rather than changing or weakening that unrelated test.

Full-suite final validation, benchmark artifact, command counts and hashes are
recorded in `evidence/rankings-phase3/validation.json` and `benchmark.json`.
Query plans retain the actual SQL, bind values (synthetic only) and per-SQL reads.

References: [D1 index behavior](https://developers.cloudflare.com/d1/best-practices/use-indexes/),
[D1 result metadata](https://developers.cloudflare.com/d1/worker-api/return-object/).
