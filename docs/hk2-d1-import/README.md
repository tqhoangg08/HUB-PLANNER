# HK2 D1 bulk import — proposal only

Base: main `7ddfbaefb5f9aa66e591659019ec5e21209fef69` (PR #159 merged).
This PR adds an offline plan command and a local-D1-tested writer library. It does
not deploy a writer, expose an API, grant credentials, enable a remote CLI flag,
apply a migration, publish classes or change course/release authority.

## Frozen inputs and new dry-run

The writer reads the existing `data/hk2-2026-2027/generated/catalogue.json`,
manifest, original dry-run, sources and owner decisions without regenerating them.
It verifies every source/output hash, the builder/runtime-policy pins, and the
merged manifest before creating any plan. `planImport` from PR #159 still defines
eligibility and conflict semantics. No new normalization rules are introduced.

| Scope | Result |
| --- | ---: |
| Prepared source rows, unchanged | 2,360 |
| Official school codes, only semester `HK2_2026_2027` | 2,357 |
| Temporary `_262_` items excluded from `course_schedules` | 3 |
| Proposed missing INSERTs in the recorded production snapshot | 2,357 |
| Existing identical / blocked / conflicts | 0 / 0 / 0 |
| Maximum courses per atomic D1 batch / number of batches | 25 / 95 |

Manifest SHA-256:
`2fe8af0743805fcc64ba414e22817fb26f3b5ce2247b50677bc518122c36e212`.
Unchanged original full payload SHA-256:
`2d328a92c048d2869e49cf7abd078f1b9ee44afb4005e00cbdbf78d6a24f1797`.
A resumed/new plan also records its own remaining-additions payload hash;
the original full payload hash never changes.

`production-readonly.json` is an actual SELECT-only observation at its
`checked_at`, not an approval or a future fresh snapshot: HK1 2,103 published,
HK2 0, previous summer 2; max source position 4,639. All seven query results have
zero writes/changes and are served by the primary. Three existing duplicate HK1
code groups are reported and left intact. No unique natural-key index is added.
The database reports `version=production`; a Time Travel bookmark was read.
The updated snapshot includes a seventh SELECT covering the **entire**
`hk2-bulk-v1` receipt namespace (all actor scopes); it was empty at capture time.
**No export backup or real restore rehearsal has been verified in this PR.**

```powershell
# Needs a newly captured snapshot matching QUERIES, <=15 minutes old.
node scripts/hk2-d1-import.mjs dry-run --snapshot=.cache/hk2-bulk/fresh.json --out=.cache/hk2-bulk/plan.json
npm run test:hk2-import
```

The command accepts only `dry-run`, refuses unknown/apply/remote flags, writes a
new ignored `.cache/` plan with exclusive-create semantics, and cannot execute SQL.
The committed historical snapshot will expire; do not change its date or use it
for a real operation. For historical review, tests explicitly request historical
planning; the writer independently checks freshness before its first INSERT.
The saved report in `dry-run.json` is a historical audit, `can_apply=false`.

## Transaction, receipt and resume

`scripts/hk2-2026-2027/bulk-import.mjs` accepts a D1 binding for local testing.
`applyNextBatch` performs at most one batch. The caller persists the full plan
before starting, exports receipts after each successful step, and explicitly
invokes the next step. An exception stops the run; there is no blind retry loop.
There is no assumption that multiple D1 calls share a transaction.

1. Validate the frozen package and recompute the complete plan/hash. Verify a
   fresh SELECT snapshot, exact schema/columns/indexes/triggers/dependent tables,
   all target-semester rows (including retired), counts and duplicate codes.
2. Reconcile **every plan** in the append-only `course_mutation_receipts`
   namespace `hk2-bulk-v1`, during planning and before both INSERT and DELETE.
   Apply receipts must form a contiguous prefix; rollback receipts a reverse
   suffix with matching IDs/batch hashes. Validate identity, format, key, payload,
   snapshot/hash consistency, known unique official IDs and exact live batch
   contents. Imported rows without receipts also block. No foreign receipt is
   ignored because it has another plan ID or an invalid actor scope.
   Any unrolled batch reserves the semester for its original plan; a new plan
   cannot adopt these classes as identical. Even a fully applied plan retains
   ownership until rollback; a repeat uses the original plan's no-op/resume path.
   New v2 receipts include semester, contiguous event sequence and previous
   receipt hash, so gaps/reordering/deletion or a downgrade to v1 blocks.
   Full provenance remains in the manifest-pinned catalogue, linked by source_key.
3. Before each batch, compare **every column of every current HK2 row** with the
   snapshot plus exactly the receipt-owned rows. A changed lecturer, room,
   revision, retired row, extra code or missing record stops the run.
4. The first statement in the mutation batch inserts its receipt using a guarded
   `CASE WHEN ... ELSE NULL` into the existing NOT NULL `operation` column. Its
   SQL checks the entire HK2 state, schema, maximum source position and **all
   seven columns of the complete namespace ledger** again
   **inside the same transaction** as the INSERTs. Thus changes after the SELECT
   cannot slip between a JavaScript check and the actual write. Constraint/trigger
   errors roll back the receipt and all INSERTs in that batch.
5. Remaining statements are plain `INSERT INTO course_schedules`, one row each.
   There is no UPDATE, REPLACE, IGNORE or DELETE in the forward writer. Unrelated
   ID/source-key collisions fail the batch. Existing identical official rows
   outside active bulk ownership are omitted; conflicts are never overwritten. The existing facet
   INSERT trigger maintains HK2 facets without touching HK1 facets.
6. Each row gets a stable UUID accepted by existing APIs, deterministic
   manifest/source-row key, `source_kind=admin` (already allowed), revision 0,
   content hash, manifest writer provenance and `instructor_provenance=
   source_not_published`. All 28 course fields remain exact, with only boolean
   `false` stored as D1 integer 0. No outbox notifications are created.
7. On an uncertain response, query the receipt and exact live state using the
   **same saved plan**. If the batch committed, resume starts at the next batch;
   if it did not, the absent receipt plus unchanged state permits replay. An
   ambiguous/malformed/gapped ledger or changed row stops for investigation.
   Do not create a replacement plan to conceal partial progress.

Per-plan receipt export uses indexed lexical ranges, not a 64-byte SHA in LIKE;
validation instead reads the whole namespace. D1's LIKE/GLOB pattern limit is
50 bytes. SQL JSON arrays are nested in groups
of 20 to stay below the 32-function-argument limit. Each INSERT has 43 parameters
(below 100), SQL is below 100 KB, and the whole-state guard refuses a bound value
>=1.9 MB (D1 row/string limit 2 MB). The batch is 26 statements including receipt.
The 25-row batch is a conservative application choice, not a claimed D1 maximum.
The 30-second limit applies to the entire batch: any timeout needs receipt-based
reconciliation, never an assumption of failure. No REST batch atomicity is assumed.
See [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Receipt-scoped rollback

Rollback is a separate explicit action/approval and runs committed batches in
reverse order. It never deletes receipts or pre-existing/identical classes. Its
own append-only receipt and the exact ID-scoped deletes are one atomic batch.
The same whole-state guard catches changes even if another tool forgot to bump
revision/content hash. DELETE requires target semester, receipt ID, source key,
manifest writer provenance, revision 0 and content hash.

Within the rollback transaction, any reference from `user_schedules`,
`user_schedule_course_snapshots` or `user_course_requests.approved_course_id`
blocks the batch. This prevents ON DELETE SET NULL from mutating a user request
and prevents broken personal schedule references. Schema drift/new dependent
objects also blocks the run. If references/edits exist, stop and propose a new
owner-reviewed recovery; never delete user rows, force a cascade or change HK1.
Already rolled batches are recognized; forward execution of a rolled-back plan
is terminal. Reimport needs a new snapshot, plan and approval.

A completely rolled-back plan has no active ownership and no longer blocks a
new plan. Its apply/rollback receipts are **retained and still validated**;
historical IDs may be reused only by a new valid owner. A new plan's approved
snapshot must contain that terminal history. Before every write the foreign
ledger must match the snapshot exactly: missing/rewritten terminal receipts or
an old pre-rollback plan/approval are rejected. The SQL ledger guard closes the
race after this read, even when the competing receipt changes no course row.
Namespace size limits fail closed; the writer never discards old receipts to
fit a batch.

Saved six-query plans and v1 receipts from the earlier local implementation can
resume their original run after the fresh seven-query global check. New plans
cannot use six-query snapshots. A v1-to-v2 transition chains to the existing
receipt hash; a foreign active v1 plan still blocks, rather than being adopted.

Full-database Time Travel restore is **not** the normal rollback: it rewinds
unrelated user activity. It is an emergency operation needing separate owner
approval, downtime, a saved current bookmark and an assessment of lost writes.
[Time Travel documentation](https://developers.cloudflare.com/d1/reference/time-travel/)
states retention is 7 days Free / 30 days Paid; confirm the actual plan. It does
not currently provide cloning to another D1 database. Use an export restored to
an isolated database for the backup restore rehearsal.

## Compatible release and publication order

Merging PR #159 does not prove its frontend/Worker code is deployed. Before any
data INSERT, owner must identify an exact main SHA including #159, run exact-SHA
manual validation, and release frontend **and** Worker through the existing
`public-production` guard. Preserve branch protection, owner/run/SHA approvals,
wait timer, environment controls and course authority. Read back the deployed
version/asset receipt; test desktop/mobile HK2 selection, multiline rooms and
shifts, NULL lecturer, programme filters, exams and ICS. Cached old frontend
clients must be considered (PWA refresh/service-worker update); do not claim
all active clients instantly use the new parser.

The eight PE records keep portable owner-estimated S labels and original periods;
no precise clocks are generated. Existing tests run both components' real slot
helpers and the session/conflict/ICS pipeline. The new D1 test compares every
field of all imported classes to the merged catalogue and checks public API
programme filters and owner-estimated ICS warnings. Three temporary items remain
review artifacts, not selectable/personal/ICS entries in the official catalogue.

**Publication is not atomic across 95 batches.** The current schema has no
semester-wide visibility gate. Plain INSERTs use `published`, so any committed
batch would be visible immediately. Owner must approve an import/maintenance
window that prevents incomplete catalogue use, or separately review a read-gate
design. This PR does not add such a switch or pretend retired INSERTs can be
published later without UPDATE. Stop before writing if that plan is unresolved.

## Mandatory owner checklist before any production write

- [ ] Review/merge this PR separately; green CI is not release or data approval.
- [ ] Approve the exact compatible frontend/Worker release, then execute existing
  release guards and retain successful exact-SHA deployment/asset receipts. No
  change to guards/authority/secrets is included here.
- [ ] Approve publication of exactly 2,357 official HK2 classes and the retained
  source warnings/owner-estimated PE policy; exclude all 3 temporary items.
- [ ] Approve the partial-visibility/maintenance and old-client handling plan.
- [ ] Capture a fresh primary SELECT snapshot using `QUERIES`; persist its raw
  response/hash, non-HK2 course/facet hashes and private user-table baseline in
  restricted storage. Verify actual database/account/schema/counts/duplicates,
  source-position high water and no active catalogue writer races.
- [ ] Verify D1 production backend, actual Time Travel retention and fresh
  prewrite bookmark; create a full SQL export in restricted storage, record
  SHA-256/size/object version and restore it into an isolated environment.
  Compare counts/hashes there and record who verified recovery. Do not commit
  backup/user data. Local synthetic rollback is not a real backup restore proof.
- [ ] Create a fresh plan and review plan ID, full/remaining payload hashes,
  snapshot hash, source provenance and 95 bounded batches. Persist the complete
  plan outside ephemeral CI logs before execution.
- [ ] **Approve a production transport/integration separately.** This PR's
  executable CLI is dry-run only and the library explicitly rejects production
  targets. A reviewed operator transport must authenticate the existing owner,
  verify backup/release/approval evidence against trusted services, use the
  intended primary D1 binding with atomic `batch()`, preserve all checks, set
  deadlines, and durably export receipts. An arbitrary JSON approval object
  must never grant production rights. No new credentials/route are added here.
- [ ] Give the final explicit authorization for **that plan ID/database/payload**
  and the actual first production INSERT. This chat grants preparation only.
- [ ] After each batch, save receipt/readback. On failure stop, reconcile and
  explicitly approve resume; rollback requires separate action approval.
- [ ] After the final batch, require 2,357 exact official rows, no `_262_`, no
  duplicate keys, NULL lecturers, correct facets/programmes/exams and unchanged
  protected data hashes. Save final receipt/backup IDs. Only then end the
  approved maintenance window. Any unexpected change means stop.

The unresolved production transport, live release verification, real backup
restore evidence and publication window are explicit NO-GO conditions, not
features that can be bypassed with a CLI flag.
