# Atomic HK2 catalogue publication — review package

This PR prepares a server publication boundary. It performs **no production
migration, import, deployment or publication**. The production counts (2,103 HK1,
zero HK2) and Worker v476 are owner-supplied context, not a fresh production audit.

## State and immutable inputs

`HK2_2026_2027` is CLOSED if migration 0062, its singleton row, its linked receipt
or verified metadata is missing. Other semesters and user-created courses retain
their existing behavior. `catalogue_visibility='published'` on an imported row is
necessary but is **not sufficient** to publish HK2.

Migration `0062_hk2_catalogue_publication.sql` adds two tables and a CLOSED row.
It neither alters catalogue/user tables nor creates catalogue views/triggers.
This intentionally preserves #160's catalogue schema fingerprint. The publication
module calls #160's original package loader, snapshot validator and plan builder;
the writer, CLI, manifest, payload, source files and owner decisions are unchanged.

Pinned manifest SHA-256:
`2fe8af0743805fcc64ba414e22817fb26f3b5ce2247b50677bc518122c36e212`.
Pinned payload SHA-256:
`2d328a92c048d2869e49cf7abd078f1b9ee44afb4005e00cbdbf78d6a24f1797`.
There remain 2,360 source rows, 2,357 official classes and three temporary subjects.
The temporary `_262_` subjects never enter the official D1 table. All instructors
remain NULL; eight PE classes retain their owner-estimated S markers and original
periods. Existing rendering, conservative conflict detection and ICS rules remain
unchanged and are exercised by the original component regression tests.

## Read and consumer inventory

`publicCatalogueDb()` is a server-only D1 binding wrapper used at the following
entry points. It applies the predicate to every static catalogue SELECT/JOIN,
including facets and mutation assertions. Gate state is evaluated in the SQL
statement, not cached as a JavaScript OPEN boolean. Missing schema is CLOSED.
This wrapper is for reviewed application SQL, not arbitrary administrator SQL.

| Consumer | CLOSED behavior / authority |
| --- | --- |
| `/courses`, `/api/courses`, detail, search, suggestions, pagination, counts | Official HK2 omitted; detail returns 404. All programme filters use the same boundary. |
| Filter options / materialized facets | HK2 facet rows excluded, including unscoped requests. |
| Add course / semester replace / official matches in PDF import | Cannot select hidden official IDs. Transaction assertions recheck availability to close the pre-read/write race. Private imported snapshots remain private. |
| Personal schedule GET / conflict checks / ICS | No new hidden official class can be selected. Newly selected public HK2 classes receive an owner-scoped historical snapshot in the existing snapshot table, in the same transaction. Existing personal schedules and user custom data are retained. Conflict and ICS logic consumes the selected/private schedule, not a raw catalogue query. |
| AI Advisor catalogue retrieval | Uses the same D1 boundary. |
| AI Advisor personal schedule retrieval | Uses gated catalogue or the authenticated user's existing historical/private snapshot, preserving NULL values. |
| D1 instructor scraper candidate/read/update | Gated selection plus an in-statement gated ID check before instructor UPDATE. Current automated scrape remains HK1-specific. |
| Legacy course sync / reconcile into D1 | Cannot insert/overwrite/reconcile official HK2 through the old mirror path. #160 remains the only planned HK2 writer. |
| Legacy Node / Supabase course list, detail, matching, facets | Permanently CLOSED for official HK2: these stores have no trusted D1 publication signal. No legacy fallback publishes HK2 after opening D1. |
| Legacy Supabase instructor scraper | Already explicitly HK1-only. No D1 import transport exists there. |
| Legacy schedule reminders | Consume existing personal schedules in Supabase; no D1 HK2 catalogue feed. Do not mirror unpublished HK2 to Supabase. |
| Staff schedules / course authority / authenticated data administration | Existing staff/admin authorization remains required. Privileged raw inspection and receipt auditing remain possible. No new administrative permission is granted. |
| Operator snapshots, reconciliation and old seed scripts | Privileged/offline only; not public read paths. Destructive seed remains forbidden. No production transport is added. |

## Cache and PWA boundary

Unscoped lists, any HK2-scoped request and all course details bypass edge cache
**before** `cache.match`; responses are `no-store` and never stored. Explicit
non-HK2 lists keep their existing cache policy. Client requests also use `no-store`
for sensitive scopes. Desktop memory caches and the shared desktop/mobile page
cache refuse HK2/unscoped entries; the persistent page-cache namespace is versioned.
The existing service worker caches only navigations, not catalogue JSON.

A cached old JavaScript bundle cannot bypass server gating or select a hidden ID.
Previously downloaded content cannot be remotely erased. Because HK2 has never
been published, the ordered rollout below prevents such data being downloaded in
the first place. Before import, verify CDN rules do not override `no-store`, purge
old course JSON at all deployed origins if any independent proxy caches it, and
test an existing installed PWA as well as a fresh session. Do not import while
v476 or another ungated Worker can serve any traffic. After publication, any later
reclosure hides new catalogue reads/selections; already-owned schedules remain.

## Verification, owner authentication and the atomic transition

`scripts/hk2-2026-2027/publication.mjs` is an operator library, not a Worker route,
CLI apply command, remote D1 adapter, release hook or bulk writer. Its functions
are exercised only against local Miniflare in this PR. A future reviewed operator
integration must supply a primary/session D1 binding; do not use an eventually
consistent replica as the approval snapshot.

1. `verifyHk2Publication(db, {plan, backup, release})` loads the exact frozen
   artifacts, recreates the original approved import plan, captures a fresh raw
   snapshot, requires all 2,357 complete official rows with exact metadata and
   provenance, and validates exactly 95 contiguous apply receipts. Foreign ledger
   history must match the original validated snapshot. Missing, rolled-back,
   changed, malformed or extra receipts block publication. The complete 43-column
   matrix is compared, not just class codes/counts. Backup/restore hashes and
   protected-data restore checks must agree and precede approval.
2. Generate the two exact comment texts with `backupRestoreAttestationText()` and
   `publicationApprovalText()`. The latter binds the verification digest, database,
   backup proof, release SHA and a maximum 15-minute expiry. The owner must review
   actual exported backup/isolated restore evidence and author **two separate,
   unedited** comments in this repository. The comments are not created by this PR.
3. `authorizeHk2Publication()` authenticates the supplied owner's existing GitHub
   read credential via `/user`, checks repository/owner numeric identities, fetches
   both real comments from GitHub, and rejects JSON role/approval claims. It checks
   exact current main, the successful owner-dispatched guarded production release,
   successful guard/deploy steps and the released gate helper's Git blob hash.
   A validation-only release is insufficient. Using an existing Cloudflare read
   credential, fixed-host GETs must prove the expected Worker version serves 100%
   of traffic and was created during that guarded release job. No permission,
   secret or production transport is provisioned here. Worker v476 cannot satisfy
   this check. Provider errors fail closed; credentials must never enter receipts,
   JSON artifacts or logs.
4. Only the fresh in-process verification object and a one-use, at most 60-second
   opaque capability can reach `openHk2Publication()`. Serialized JSON cannot
   recreate either. A single native D1 batch atomically inserts the publication
   receipt and changes CLOSED/revision 0 to OPEN/revision 1. The receipt INSERT
   aborts with a constraint failure unless the **entire** current HK2 row matrix,
   import ledger and CLOSED gate still match verification. This is two statements
   in one transaction, independent of the 95 earlier import transactions.

The operation changes only the publication tables. A lost response is reconciled
against the deterministic `hk2-publication:<owner-comment-id>` receipt; a retry
requires fresh provider authentication and returns unchanged for that same verified
OPEN receipt. Do not reset/delete receipts, reuse another verification or silently
reopen a deliberately reclosed gate. Reclosure/republication requires a separately
reviewed emergency procedure; this PR intentionally exposes no toggle endpoint.

Backup JSON is evidence to inspect, not authentication and not proof that an actual
restore occurred: the separate authentic owner attestation is mandatory. A local
synthetic restore test does not count as production backup/restore evidence.
GitHub/Cloudflare authorization is external to D1: maintain an exclusive operational
window without release/approval changes between live verification and the short
atomic transition. External revocation and D1 cannot share a transaction. General
administrator database access is privileged; the gate does not protect against an
administrator manually forging database rows. No new write privilege is introduced.

## Ordered deployment / owner approval checklist

Every production action below is **future work requiring owner approval**. Merge,
deployment, migration, last import batch and successful tests never open the gate.

1. Review/approve this PR and its CI. Keep release guards and authority settings.
   Approve a separate compatible frontend + public Worker release at exact main
   using the existing guarded workflow. Do not deploy an Auth Worker unnecessarily.
2. Verify that the gate-capable public Worker serves all traffic and compatible
   frontend assets/PWA behavior are active. Test HK1 reads/personal schedules.
   With migration absent, HK2 must already be CLOSED. Do not roll back to v476
   once HK2 rows exist; the gate cannot constrain old ungated code.
3. Owner separately approves migration 0062. Capture backup/Time Travel bookmark,
   apply only the reviewed migration, verify default CLOSED and protect the two
   gate tables. Do not run general pending migrations blindly. No course/user
   schema or permissions need changing for this migration.
4. Before any bulk write, follow #160's fresh snapshot/schema/duplicate/ledger,
   backup/export and isolated restore checklist. Obtain **separate import approval**.
   Production bulk transport is still absent and must be reviewed separately;
   the existing CLI remains dry-run only. The original 95-batch writer and its
   resume/receipt-scoped rollback are unchanged.
5. During all 95 batches, keep gate CLOSED and confirm public list/detail/facets,
   selection, AI, existing PWA and warmed-cache reads disclose no official HK2.
   If a batch fails, use only #160's approved original-plan resume/rollback process.
   Never treat all 95 batches as one transaction. Never auto-open on completion.
6. After import, obtain fresh raw verification and inspect the full diff, 95 receipts,
   pinned hashes/provenance, NULL instructors, eight estimated S labels, three
   temporary exclusions, all programme filters, exam/essay semantics and unchanged
   HK1/user-data checksums. Retain export, isolated restore logs and Time Travel
   bookmark/retention evidence. Record compatible release SHA, workflow run ID,
   serving Worker UUID and frontend asset-manifest SHA-256 in release evidence.
7. Owner authenticates and separately attests backup/restore and **approves
   OPEN_HK2_2026_2027** for that exact verification digest and short expiry.
   Only then may a separately approved operator integration invoke the atomic
   operation. If verification/provider evidence changes, stop and obtain fresh
   verification/approval; never patch JSON to bypass it.
8. Save the verification, both owner comment URLs, authenticated provider evidence,
   publication receipt and postcondition. Verify 2,357 public official classes,
   programme filters, detail/selection, all eight estimated slots on desktop/mobile,
   ICS without invented clocks and unchanged HK1. Observe errors/cache behavior.
   On problems stop further work, retain receipts, and seek a separate rollback
   decision. Do not restore the entire user database or deploy ungated code.

## Validation

Commands: `npm run test:hk2-import`, `npm run test:hk2-publication:browser`,
`npm test`, `npm run typecheck`, `npm run cf:typecheck`, `npm run build`,
`git diff --check`. The browser test uses actual ScheduleBoard/MobileSchedule,
client fetch/cache code, the real service worker and a local Miniflare transport;
only external auth/provider boundaries are fixtures. CI runs browser acceptance
before the full suite. No layout, typography or spacing changes are included.

Local fixtures prove CLOSED under a partial 25-class import, OPEN only after all
95 receipts, forged owner rejection, missing backup/receipt rejection, catalogue
and ledger races aborting receipt+gate atomically, raw HK1 equality, owner snapshots
surviving reclosure, programme filters, scraper exclusion, Advisor and warm-cache
bypass. Existing #159/#160 regression tests still cover source integrity, estimated
slots in both real components, 2,357-class rollback/resume and cross-plan ledger
protection. See `VALIDATION.md` for exact outcomes and limitations.
