# Stage 3C2-B2 atomicity gate

The original Stage 3C2-B2 gate was blocked on schema 0014. D1 `batch()` is transactional, but a
conditional SQLite `UPDATE ... WHERE revision = ?` that matches no row is a
successful statement with zero changes. It does not abort later statements in
the batch. Schema 0014 therefore cannot guarantee that stale optimistic writes
leave schedule, revision, and receipt state entirely unchanged.

Migration candidate `0015_add_user_schedule_transaction_assertions.sql` adds a
nullable `last_operation_id` marker to each revision row plus a single empty
assertion table. A future mutation batch writes a fresh server-generated marker
only when its revision CAS succeeds, then inserts a server-computed `passed`
value after its conditional mutation/CAS statements. Checking both the expected
new revision and the marker distinguishes this transaction from a prior winner.
Only `passed=1` satisfies the table constraint. A stale or otherwise invalid
postcondition computes `0`, intentionally raises a constraint error, and causes
the transactional D1 batch to roll back. The marker is deleted in the same
successful batch, so the table remains empty.

The migration is additive and performs no schedule data mutation. Migration
0015 has since been separately applied and audited in Production. Production
remains `SCHEDULE_WRITE_MODE=legacy`.

## Local B2 implementation candidate

D1 mode now implements only owner-scoped course add/delete. It requires a
strong numeric `If-Match` value (`"N"`), a bounded `Idempotency-Key`, and a
validated semester (`PUT` JSON body or `DELETE` query concurrency scope).
Identity comes only from the Better Auth service-binding session. Receipt
replay is checked before CAS, and each new mutation uses the six-step batch
below with an exact server-generated operation marker. Add-existing and
delete-absent are deterministic no-ops: they create a receipt without
advancing revision. PATCH and replace remain unavailable in D1 mode.

This candidate is local only. Production mode, cron behavior, and frontend
callers have not been changed or deployed.

## Implemented local batch protocol

Before a new mutation, read the `(user_id, idempotency_key)` receipt from the
primary. A matching request hash replays its bounded stored response without a
revision check. A different hash returns `409`. If no receipt exists, one D1
batch must execute:

1. `INSERT OR IGNORE` the `(user_id, semester)` revision row at revision zero.
2. CAS-update only the expected revision, writing a fresh server-generated
   `crypto.randomUUID()` operation marker. State changes advance to
   `revision + 1`; semantic no-ops keep the same revision.
3. Perform the owner-scoped schedule mutation only for a real state change.
4. Insert an assertion whose computed `passed` value requires both the expected
   resulting revision and that exact fresh operation marker (plus the intended
   schedule postcondition).
5. Insert the bounded idempotency receipt.
6. Delete the assertion row using the same server-held operation marker.

Any statement failure rolls back the batch. A receipt uniqueness race therefore
also rolls back the losing mutation; the handler may then re-read the receipt
and replay it only when its hash matches. The operation marker is never accepted
from a request and is neither identity nor authentication material.

Semantic add/delete no-ops do not advance revision. Existing-course add can
assert the current revision and existing owner/course state. An already-absent
delete has no server-derived semester, so the D1 DELETE contract carries a
validated `?semester=...` concurrency scope alongside the strong numeric
`If-Match`; if the row exists, its server-side semester must match. This is a
runtime contract requirement, not part of migration 0015.
