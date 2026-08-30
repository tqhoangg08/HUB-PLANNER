# Stage 3C2-B1 schedule-write safety foundation

This candidate changes no production authority. `SCHEDULE_WRITE_MODE=legacy`
preserves the existing Supabase-first mutation path and Supabase-to-D1 schedule
sync. The modes are deliberately fail-closed:

- `legacy`: existing mutations and mirror repair remain enabled.
- `frozen`: all four personal-schedule mutations return a generic `503` before
  authentication or database access; destructive schedule sync is blocked.
- `d1`: reserved for a later complete implementation and currently behaves like
  `frozen`.
- missing value: backward-compatible `legacy`; any other value: fail closed.

## Migration candidate

`0014_add_user_schedule_write_safety.sql` is additive and has not been applied.
It adds a nullable `updated_at` column to existing rows, a per-user/semester
revision table, and idempotency receipts unique by `(user_id, idempotency_key)`.
No backfill is performed: existing `updated_at` values remain `NULL`, and
revision rows are created only by the future cutover implementation. Old Worker
versions ignore all additions. The migration is one-way but backward compatible;
rolling back application code does not require dropping these objects.

A final custom-course schema is deferred. The committed model and production
runtime `custom_data` shape are not sufficient to justify a durable relational
design until the read-only live-schema and data reconciliation passes.

## Reconciliation gate

`scripts/compare-production-user-schedules.mjs` uses a named PostgreSQL service
and refuses services whose current role has table write privileges. PostgreSQL
queries run in explicit read-only transactions. D1/Auth D1 access is constrained
to guarded `SELECT` statements through Wrangler `--remote --json`. Results are
normalized locally and only aggregates/hashes are printed or cached.

The tool also inventories live Supabase columns, constraints, and indexes for
`public.user_schedules` and `public.course_schedules`. A failed or malformed
schema/data check is a reconciliation failure, never a silent coercion.

No cutover should proceed until this tool reports `RECONCILIATION_STATUS=PASS`,
the migration candidate is reviewed/applied in a separately authorized step,
and a production freeze window has been explicitly approved.
