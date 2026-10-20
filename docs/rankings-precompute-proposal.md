# Imported Rankings: optional schema/precompute follow-up (not deployed)

This proposal is separate from the Phase 3 runtime change. No file is added to
`cloudflare/migrations`, no import process is changed, and no remote SQL is run.
The executable local prototype is `tests/fixtures/rankings-performance.ts`.

## Options and tradeoffs

1. **Existing schema, one aggregate:** compute school/class/major totals and
   outranking counts in one semester scan. No private result cache, invalidation
   system, schema rollout or new import prerequisite. Still O(N) per populated
   request. This is the immediate release candidate.
2. **Composite indexes alone:** `(semester,gpa,training_score,credits)`,
   `(semester,class_code,gpa,training_score,credits)`, and
   `(semester,major,gpa,training_score,credits)`. These narrow class/major scans
   and may cover the original aggregates, but `COUNT(*)` still visits every row
   of each selected scope. The school scope remains O(N); index upkeep adds
   import writes/storage. The benchmark runs unchanged production SQL against
   these experimental indexes. They are not installed by this PR.
3. **Exact cumulative tuple buckets:** one aggregate row per distinct
   `(semester, revision, scope, scope_value, GPA, DRL, credits)` with multiplicity,
   scope total and count strictly above the tuple. A predecessor/successor lookup
   can answer rank from an index instead of scanning the semester. This can
   reduce reads further, but needs a separately reviewed schema/import lifecycle.

## Required production design before a migration PR

- Use exact SQLite REAL/integer score components. Do not reuse the legacy
  rounded `score_key`, official STT, student code, or rounded/stringified GPA.
  Equal tuples share the best tie rank (`outranking + 1`).
- Preserve SQL NULL semantics: a larger GPA outranks even when its lower-order
  values are NULL; an equal GPA with NULL training cannot outrank a finite
  training input. Include nullable buckets and all rows in scope totals. The
  local prototype groups by raw tuples, computes descending cumulative counts,
  then finds the last tuple strictly greater than the input; it checks this
  against the original OR comparator, including near-equal floating values.
- Separate school `''`, class, and major namespaces; retain exact BINARY label
  equality. No normalized scope matching that changes current API results.
- Bind every row to a dataset revision (`source_sha256` AND import identity).
  Stage a new revision, validate counts and cumulative invariants, and atomically
  switch the ready pointer. Never serve a partially built revision, combine
  revisions, or set `ready` merely because a new table exists.
- Avoid storing student identities, raw recipient rows, or per-user answers in
  aggregates. Keep the existing per-request Auth Service verification and private
  profile lookup. Private responses retain `Cache-Control: private, no-store`.
- Bound scope-key cardinality and build memory; estimate and test **read/write**
  budget, storage, rollout duration, failed imports, cleanup and rollback. With
  50k mostly unique tuples across three scopes, aggregate rows alone can approach
  150k, before index writes: a naive rebuild can exceed the account's daily free
  [**100k rows-written** limit](https://developers.cloudflare.com/d1/platform/pricing/).
  A local read win does not authorize that rollout.
- Benchmark actual dataset distributions after removing PII; exercise all-null,
  sparse/high-cardinality/skewed scopes, zero matches, repeat imports, same source
  checksum/new import identity, readiness races, and semester isolation. Validate
  numeric affinity/collation and API byte-level output against pinned production.
- Prepare schema SQL, import/backfill tooling, verification, and rollback in a
  **separate** proposal/PR. Owner must approve the write budget and migration
  before any remote action. Release code must not reference absent schema.

## Local-only prototype boundaries

`experiment_rank_prefix` and `experiment_rank_*` are temporary Miniflare database
objects created exclusively by the benchmark. The prototype intentionally omits
production revision switching, staged imports and cleanup, so it is **not a
production migration**. The test records build reads/writes separately from
request reads and checks tuple answers against the pinned production function.
Any very low prototype request cost must be read together with those omissions.

## References

- [D1 indexes and query plans](https://developers.cloudflare.com/d1/best-practices/use-indexes/)
- [D1 per-query metadata](https://developers.cloudflare.com/d1/worker-api/return-object/)

These support checking local `EXPLAIN QUERY PLAN` and `meta.rows_read` rather
than assuming that returning one aggregate row means reading one row.
