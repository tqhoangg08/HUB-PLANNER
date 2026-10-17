# Scholarship D1 Rows Read — Phase 1

## Scope and baseline

Branch: codex/scholarship-d1-phase1, isolated managed worktree based on
origin/main a746e7f73e366e383b19cc1027442ff83c5034e7.
The original working tree and its uncommitted scholarship changes were not
overwritten. Implementation and validation use local synthetic data only.
The Owner separately authorized final review, feature-branch commit/push and a
pull request. No production release, migration, billing change or production
database operation is authorized or performed by this change.

Input: REPORT-D1-QUOTA-INCIDENT-2026-10-17.md. The incident identified repeated
scholarship facet counts/distinct scans as a leading observed workload.
The changes below concern public scholarship reads only.

## Changes

| File | Purpose |
| --- | --- |
| cloudflare/worker/src/scholarships.ts | Combine count/page SQL per facet; reuse verified aggregates; fence publication changes; guard every public scholarship read with the existing rate limiter |
| cloudflare/worker/src/scholarship-facet-cache.ts | Bounded, short-lived, per-database aggregate cache |
| features/scholarships/ScholarshipList.tsx | Coalesce committed changes; avoid restarting unchanged requests for draft keystrokes; respect Retry-After across public reads |
| tests/scholarship-facets-optimization.test.ts | Actual-main golden oracle, Miniflare cost benchmark, cache/security/transition/rate-limit regressions |
| tests/scholarship-list.browser.test.ts | Browser request-count and cooldown regressions in the existing five-viewport test |
| package.json | Include the optimization regression in the standard scholarship/full suite |
| docs/benchmarks/scholarship-d1-phase1.json | Machine-readable local measurements |
| docs/scholarship-d1-phase1.md | Design, evidence, limitations and rollback |

No new index or schema migration is needed. Better Auth, Admin/Auditor role
logic, private scholarship handlers, Student Directory and unrelated features
are unchanged.

## Query design

Previously, every supported facet executed one COUNT of its DISTINCT set plus
another DISTINCT query for the requested page. Six facets, campaign lookup and
recipient count made fourteen SQL executions per HTTP request.

The new query uses a query-local MATERIALIZED CTE for the DISTINCT set. Scalar
subqueries derive the exact global count and the ordered page from that set.
JSON aggregation returns only the bounded page (maximum 200 options). An empty
or out-of-range page still returns its exact global count. SQLite performs
temporary query work; no persistent materialized table or write query is added.
Actual D1 meta.rows_written is zero in the measured reads.

Successful response shape/version, accepted request parameters, BINARY option
ordering, source recipient ordering, limits/offsets, totals, Unicode search,
wildcard escaping and self-excluding AND facets are unchanged. No client hints,
facet omission parameters or trusted cached counts were added to the API.

The existing client may still request another facet page, but a facet already
complete for that verified scope returns its total and empty next page without
running either COUNT or DISTINCT. A cached page can also be reused.

## Cache safety and lifetime

The cache contains only recipient totals and individually approved public
facet options. It contains no recipient records, names, session claims, private
rankings or private scores. Request query/filter strings participate in an
in-memory cache key; keys are not logged, persisted or returned to clients.

The authorization/publication decision is NEVER cached:

1. Each HTTP request queries the original selectCampaign gate in D1:
   published status, public_data_approved=1, active applied batch belonging to
   the campaign, non-null approved fields and approval document.
2. Cache scope includes D1 binding identity, campaign, active batch, revision,
   exact approved-field and mapping policy, source checksum, approval document,
   normalized search and all filters.
3. Every response, including warm hits, queries the publication gate again.
   If publication was revoked it fails with 404. A changed policy/batch/revision
   racing the computation fails with 409 instead of returning a mixed response.
4. Cached values are stored only after the final gate succeeds.

Field-policy changes invalidate the key even without a revision bump.
Publish/unpublish, batch replacement and rollback are checked against D1;
TTL is an eviction mechanism, not a revocation mechanism.

The linearization point is the final successful policy read. A later unpublish
cannot retract an already authorized response in flight; this is ordinary
read ordering, not permission to serve a revoked cache entry on a later request.

Cache TTL is 30 seconds, not extended by repeated updates. Each D1 binding has
at most 32 entries and 1,000,000 serialized key/value characters (approximately
2 MB of UTF-16 text, plus runtime object overhead). Entries are independent
copies. Expiry/eviction/new isolates only lose a performance benefit.
HTTP responses remain no-store; no CDN, browser result cache, KV, R2 or D1
aggregate storage was added.

## Frontend and amplification guard

- Keep the existing 350 ms search-to-URL debounce.
- Coalesce committed filter/page changes for 100 ms before dispatch.
- Draft input changes no longer tear down/restart an unchanged committed read.
  Existing stale-result keys and request cancellation remain in place.
- Recipient pagination does not reload facets.
- Any public scholarship 429 establishes a shared component cooldown from
  Retry-After. Further filter changes/manual retries make no public request
  during that period; retry buttons are disabled. There is no automatic
  retry loop after the cooldown.
- The existing scholarship rate limiter now runs before SQL for all public
  scholarship reads, including campaigns, summaries and unfiltered recipients.
  Its binding/configuration, limit and key prefix are unchanged.
- Private scholarship/auth/other endpoints do not call this guard. Private
  authentication is still authoritative server-side.

## Reproducible benchmark

Command:

    node --test --experimental-strip-types tests/scholarship-facets-optimization.test.ts

Runtime: Node 24.12.0, Miniflare 4.20260722.1, compatibility date 2026-07-29.
Synthetic D1 only, no remote bindings, no real student data.

The test bundles and executes the actual baseline handler from the pinned Git
commit, not a simplified reference query. Both versions read identical migrated
D1 fixtures. A wrapper captures each result's SQL execution, meta.rows_read and
meta.rows_written, including publication lookups. Fixture/admin setup writes
are excluded; all measured request writes are reported explicitly.

Main fixture: 1,060 rows, six supported facets, 250 class labels, mixed NULL and
empty values, Vietnamese names and private ranking columns never returned.
Continuation uses facetLimit=200/page=2. The high-cardinality fixture has 1,060
distinct class labels; other dimensions retain their synthetic distribution.

| Scenario | SQL before | SQL after | Rows Read before | Rows Read after | Writes before/after |
| --- | ---: | ---: | ---: | ---: | --- |
| Cold first page | 14 | 9 | 13,418 | 8,151 | 0 / 0 |
| Continuation page 2 | 14 | 3 | 13,633 | 1,815 | 0 / 0 |
| Repeated first page, warm | 14 | 2 | 13,418 | 4 | 0 / 0 |
| Cold, 1,060 class labels | 14 | 9 | 12,773 | 10,581 | 0 / 0 |

Cold SQL count is generally 3 + supported facet count: initial gate, recipient
count, one query per facet, final gate. A warm complete response needs both
gates. Continuation cost depends on which pages are already present and which
facets are complete. No percentage reduction in production is promised.

## Regression coverage

- All 64 combinations of six filters compared deeply with actual main.
- Vietnamese/NFD/NFC/case-insensitive search, numeric prefix, literal wildcard
  escaping and no-match cases; recipient search and page totals/order.
- Facet page sizes, page 2, far out-of-range pages and changing page limits.
- No private rankings/names/student identifiers in facet payloads.
- Unpublish, missing approval document, field revocation without revision bump,
  revision races, real Admin approve/publish/unpublish, replacement batch and
  rollback; compare restored results with main.
- Different databases with identical campaign/batch identifiers, different
  campaigns in the same database, and a warm-hit concurrent unpublish.
- Cache TTL, entry/size eviction and caller mutation isolation.
- All public scholarship routes reject a denied rate limit before SQL;
  private scholarship endpoint still uses its existing authentication boundary.
- Browser at 360/390/768/1280/1440 pixels: original contract/filters/pagination/
  errors plus request counts for reverted draft input, pagination and cooldown.

## Validation results

| Check | Result |
| --- | --- |
| npm test (full suite) | PASS, exit 0; 1036 reported tests, zero failures |
| npm run test:scholarships:frontend | PASS, 38 tests |
| Browser + frontend adapter regressions | PASS, 26 tests, five viewport sizes |
| npm run typecheck | PASS |
| npm run cf:typecheck | PASS |
| npm run cf:check (Worker bundle --dry-run) | PASS, no upload/deploy |
| npm run build | PASS |
| git diff --check | PASS |
| Production verification | NOT_PERFORMED |

The initial shared node_modules was incomplete (missing @alloc/quick-lru and
@better-auth/core). It was replaced only in this worktree by an independent
npm ci --ignore-scripts installation from the unchanged lockfile.

A full-suite DRL generated-SQL assertion initially failed because Windows
checkout had CRLF while the generator produced LF. The fixture was verified
identical to its HEAD blob after newline normalization and restored to those
exact Git blob bytes. It has no Git diff or content change. The isolated DRL
test then passed. No unrelated test assertion or feature was changed.

## Remaining risks

- Cache correctness relies on applied snapshots remaining immutable under the existing Admin state machine/triggers. Out-of-band data repairs must use a new batch or advance revision; deployed schema parity still requires Owner verification before rollout.
- Cache benefit depends on isolate/binding reuse and TTL/eviction. Simultaneous
  cold requests are not coalesced; the existing limiter remains the outer guard.
- MATERIALIZED query-local DISTINCT does temporary work. Cost depends on data
  cardinality/filter distribution; not every possible distribution has been
  benchmarked. Production traffic/burn-rate benefits remain NOT_VERIFIED.
- Two publication reads add a small fixed cost and possible 409 during concurrent
  publication changes; this intentionally fails closed.
- A shared-IP public limiter can constrain legitimate users behind one NAT.
  No authenticated/private API is charged to this public budget.
- AbortController cannot cancel SQL already executing at the server.
- Existing API facet-page bounds and client maximum facet enumeration remain
  unchanged. This phase does not redesign extreme-cardinality enumeration.
- Browser caching of previously displayed content is not newly introduced;
  HTTP no-store remains unchanged.

## Final publication review

The final review on 2026-10-18 (Asia/Saigon) fetched origin/main and confirmed
the same a746e7f73e366e383b19cc1027442ff83c5034e7 baseline, with no conflict.
All eight Phase 1 files were reviewed; no additional source change was needed.
All validation commands above were rerun successfully during this review:
1036 full-suite tests, 44 scholarship tests inside the full suite, 38 separately
rerun frontend tests, and 26 browser/adapter tests. Both typechecks, frontend
build, Worker bundle --dry-run and diff-check passed. The benchmark JSON exactly
matched the earlier measurements. Final-review log hashes are in the JSON;
local logs remain ignored under .cache/phase1/final-review/.
Source fingerprints match the benchmark artifact. Publication approval gates,
self-excluding filter SQL, bounded cache isolation, private API separation and
the existing rate-limiter binding/key were checked explicitly.

Workflow safety was checked against the fetched main source and live GitHub
workflow inventory. deploy-cloudflare-production.yml only accepts manual
workflow_dispatch, and its validation job additionally requires main plus
approve_public_release=true. It has no push or pull_request trigger. The PR
validation workflow has read-only GitHub permissions and no Cloudflare
credentials, deploy step or remote migration. Other workflows have only
schedule/manual triggers; no installed Git hook runs on push. These workflow
files are unchanged by this PR. No workflow dispatch is part of publication.

The golden test needs Git object a746e7f73e366e383b19cc1027442ff83c5034e7.
A shallow checkout must include that baseline; the current PR merge checkout
includes it as its main parent. Future CI checkouts after main advances must
retain/fetch this test baseline, without using a network fallback in the test.

## Rollback and Owner review

Revert the Phase 1 scholarship source/frontend changes and remove the helper
from their imports; revert accompanying tests/script registration as part of
the eventual change. There is no D1 migration, persistent aggregate or data
rewrite to reverse, and no cache purge is required outside Worker isolate
memory. Do not change publication data or role permissions for rollback.

This worktree is for local review. Owner review must cover the publication
fence, policy cache key, rate-limit scope and benchmark evidence before a PR is
released. No production verification or rollout approval is implied.

PR readiness: YES for source review, with the risks above. Publication to the
feature branch and a PR is separately authorized; merge and release remain
pending Owner approval.
