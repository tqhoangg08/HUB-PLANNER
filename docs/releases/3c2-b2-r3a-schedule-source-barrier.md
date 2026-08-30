# Stage 3C2-B2-R3A schedule source barrier

This candidate is local-only. It has not been applied to Supabase or deployed
to Cloudflare, Supabase Edge Functions, or Vercel.

## Authority and mode matrix

Personal schedule authority is being migrated to D1. The course catalog has
not been migrated: Supabase `public.course_schedules` remains authoritative,
and Cloudflare `syncCourseSchedules()` maintains its D1 read/validation mirror.

| Source mode | Supabase `user_schedules` | Supabase `course_schedules` | D1 user sync/repair | D1 course sync |
|---|---|---|---|---|
| `legacy` | writable | writable | allowed | allowed |
| `frozen` | blocked | blocked | blocked | blocked |
| `d1` | permanently blocked | safe catalog evolution allowed | blocked | allowed |
| unknown/missing control | blocked by trigger | blocked by trigger | blocked | blocked |

In `d1`, course inserts and harmless metadata updates remain allowed. Course
deletes, ID changes, `semester`/`is_user_added` classification changes, and
`TRUNCATE` are blocked. Supabase cannot see schedules created only in D1, so
an apparently unreferenced source course is not proof that deletion or
reclassification is safe. Those operations require a future D1-aware deletion
workflow. This preserves all schedule references while still allowing new
courses and normal catalog metadata evolution to reach D1.

## No client-held leases

The earlier browser-held persistent lease design was removed. It had no safe
bounded expiry: expiry during a multi-request import could allow a custom
course to commit before freeze and reject the later schedule replacement.

Import source preparation is now one authenticated, SECURITY INVOKER
PostgreSQL transaction through `replace_user_schedule_import_source`. It
creates any custom courses and replaces the caller-owned semester schedule
atomically. The client supplies no user ID. If any row fails, the transaction
leaves neither custom courses nor schedule changes.

Account deletion deletes `user_schedules` before any other destructive step.
Therefore an operation beginning after freeze fails before partial account
destruction; an operation whose schedule deletion commits before the freeze
table lock belongs to the completed pre-freeze state.

## Freeze TOCTOU proof

The owner transition locks both source tables in `ACCESS EXCLUSIVE` mode and
changes the singleton mode in the same transaction. PostgreSQL table locking
provides the drain:

- a source statement already running completes before the owner gets the lock;
- a source statement arriving after the owner waits behind the lock;
- after commit, the waiting statement's BEFORE trigger observes `frozen` and
  fails;
- the atomic import RPC cannot be split across the transition.

No client can hold, renew, forge, or abandon a freeze-blocking lease because
the migration creates no lease table or lease RPC.

## Owner-only state operations (not executed)

Inspect:

```sql
select mode, updated_at
from hub_private.schedule_source_control
where singleton = true;
```

Enter cutover freeze:

```sql
begin;
lock table public.user_schedules, public.course_schedules in access exclusive mode;
do $$
declare changed integer;
begin
  update hub_private.schedule_source_control
     set mode = 'frozen', updated_at = now()
   where singleton = true and mode = 'legacy';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'UNEXPECTED_SCHEDULE_SOURCE_CONTROL_STATE';
  end if;
end $$;
commit;
```

Emergency unfreeze before the first D1-authoritative schedule write: restore
the Cloudflare legacy Worker while the source remains frozen, then run:

```sql
begin;
lock table public.user_schedules, public.course_schedules in access exclusive mode;
do $$
declare changed integer;
begin
  update hub_private.schedule_source_control
     set mode = 'legacy', updated_at = now()
   where singleton = true and mode = 'frozen';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'UNEXPECTED_SCHEDULE_SOURCE_CONTROL_STATE';
  end if;
end $$;
commit;
```

Lock the Supabase schedule source permanently for D1 authority:

```sql
begin;
lock table public.user_schedules, public.course_schedules in access exclusive mode;
do $$
declare changed integer;
begin
  update hub_private.schedule_source_control
     set mode = 'd1', updated_at = now()
   where singleton = true and mode = 'frozen';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'UNEXPECTED_SCHEDULE_SOURCE_CONTROL_STATE';
  end if;
end $$;
commit;
```

Mode control is owner SQL only. No mode-changing RPC exists. `hub_private` is
not listed in the repository's Data API schemas and privileges are separately
revoked from public, anon, authenticated, and service-role roles.

## Correct two-sided release order

1. Re-run fresh read-only D1, migration, and Supabase preflight.
2. Apply this additive migration; its initial mode is `legacy`.
3. Deploy the reviewed frontend/Edge/Vercel guards while still `legacy`.
4. Set source mode `frozen` using the table-lock transaction above.
5. Prove direct authenticated and service-role writes are blocked.
6. While Supabase is stable, perform one final controlled Supabase-to-D1
   course sync, then promote the Cloudflare frozen Worker.
7. Prove all four schedule mutations are 503 and GET remains healthy.
8. Run exact schedule reconciliation and course-reference validation.
9. Require zero drift and identical schedule hashes.
10. Separately authorize source `frozen -> d1` and Cloudflare `frozen -> d1`.
11. In long-lived D1 mode, user schedule sync stays off while course sync
    resumes, keeping D1 course validation current.

Manual postgres-owner/superuser writes, trigger disabling, schema changes, and
direct schedule/course seed scripts are prohibited from the freeze transaction
until cutover or a reviewed pre-D1-write unfreeze completes.
