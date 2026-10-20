# Rankings Phase 3 evidence

Application change: `cloudflare/worker/src/rankings.ts` only. Main base and
production source checksums are in `baseline-provenance.json`.

- `production-query-insights.json`: sanitized subset of the prior Dashboard
  investigation, not a fresh query. It preserves the original observation time,
  UTC filter, source artifact checksum, SQL templates and counts: 1,299,272 reads
  / 124 executions for the three school/class/major aggregates. The module total
  includes other Rankings metadata (1,299,535 reads).
- `current-quota-access.json`: Browser Use inventory was rejected by **Work
  settings**. `recordedAt` is evidence-file creation time; fresh quota, errors and
  hourly trend are NOT_VERIFIED. The last successful 03:09 UTC Usage snapshot is
  explicitly historical and UI-rounded. No authentication or permission changes.
- `benchmark.json`: final synthetic local D1/Miniflare results, actual SQL/binds,
  query plans and per-SQL reads. Four dataset counts: 1k, 10k, 10,478 and 50k.
  The baseline is compiled from the real production commit, not rewritten SQL.
  Request costs cover Public D1 inside `forecastOwnImportedRanking`; external
  Auth Worker D1 and HTTP middleware are outside the meter.
- `validation.json`: final commands, test counts, exit status, runtime versions,
  scope checks and log hashes. Logs remain local; no credentials or full request
  bodies are published. Initial generated-types mismatch and successful local
  regeneration are recorded rather than concealed.
- `local-line-ending-diagnostic.json`: the initial full-suite DRL failure was a
  Windows CRLF checkout versus LF generator comparison in unmodified files.
  Canonical Git content matched; restoring local LF produced no migration diff.
  The focused DRL group and full-suite rerun are reported separately.
- `SHA256SUMS.txt`: canonical committed Git-blob hashes, excluding itself. Text
  blobs use LF. Windows checkout conversion may change working-file hashes;
  verify using the bytes from `git show HEAD:<path>`.

Experiment-only indexes and `experiment_rank_prefix` exist only in disposable
local Miniflare fixtures. The prototype's low request reads exclude a new
production import/revision implementation; build reads/writes are recorded
separately. No remote SQL, schema change, migration, deploy or Auth change.

No cache/single-flight benefit is assumed for the selected implementation: cold
and warm both perform fresh reads, and concurrent costs scale with requests.
Golden tests cover scopes, exact ties, floating boundaries, NULLs, Unicode,
incomplete/no-match cases and semester/binding isolation. Race tests cover
readiness, count, checksum and import timestamp changes. Route tests preserve
per-request Auth verification and denial before D1, with private no-store output.

The local N+1 aggregate reads differ from historical production Insights N; do
not normalize, scale, or represent local savings as observed production effect.
Actual post-release effectiveness and account-wide quota safety remain unverified.
