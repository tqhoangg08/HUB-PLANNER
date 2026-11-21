# Operator transport for the frozen HK2 import

This prepares an owner-operated import, not publication. No production INSERT,
migration, deploy or gate opening was performed in this PR. The existing
`scripts/hk2-d1-import.mjs` remains offline/dry-run only. There is no new Worker
route, HTTP write endpoint, workflow, permission or UI change.

The original #160 writer still builds all SQL, validates snapshots and the whole
`hk2-bulk-v1` namespace, detects foreign active plans, enforces exact row/schema/
source-position/ledger assertions, and reconciles committed receipts. Its only
extension is replacing the unconditional production error with an authenticated,
in-process one-batch authorization check. A golden regression compares every
other byte of that module with released main `8416837eb5ce648ce9c1c6237b4eed81802dbd03`.
The old baseline test retains its historical writer proof at that merged SHA;
its live release guards and other immutable surfaces remain checked unchanged.

## Native binding and transaction boundary

`getPlatformProxy()` from the locked Wrangler 4.115.0 opens its authenticated
remote D1 binding session with the fixed operator-only config. This uses the
provider's binding proxy; it does not deploy the Public Worker or expose an app
write handler. An existing authorized Wrangler session is required. No credentials
are created or permissions granted by this code. Never run `wrangler deploy`
against the operator config.

Each of the **95** transactions contains a read-only CLOSED/revision-0 assertion,
the original durable receipt/ledger guard, and at most **25** original INSERTs
(the last batch has seven classes). The gate check and all writes use ONE native
`D1Database.batch()`. There is no SQL interpolation, REST transaction assumption,
batch splitting or automatic mutation retry. Bound values retain NULL, newlines,
all 43 columns/provenance and the eight owner-estimated PE labels. The three
temporary `_262_` subjects never enter `course_schedules`.

The transport refuses DELETE/UPDATE/REPLACE and does not provide a production
rollback command. #160's receipt-scoped rollback library remains unchanged for
local tests; a production recovery action needs separate review/approval. A full
database rewind is not routine import rollback.

References: [native D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch),
[Wrangler proxy API](https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy),
[remote D1 binding support](https://developers.cloudflare.com/workers/local-development/bindings-per-env/),
[per-statement/batch limits](https://developers.cloudflare.com/d1/platform/limits/).

## Authentication and approval

Before each batch, provider GETs verify the authenticated GitHub owner ID
252552483, repository identity, exact current-main operator SHA and the existing
exact-SHA independent CI policy (`validateCI`, unchanged). The existing guarded
v477 release and 100% serving version, DB binding, D1 read/write authorities and
deployed gate source are checked independently. Source SHA of that deployed
Worker is `8416837eb5ce648ce9c1c6237b4eed81802dbd03`; a later operator-only merge is
not a claim that a newer frontend/Worker has been deployed.

An unedited owner GitHub comment must match the generated approval text exactly.
It binds the **apply-only** action, DB/semester, plan ID, original snapshot hash,
manifest/payload, 2,357 additions/95 batches, backup/restore report and export hash,
operator SHA, Worker version and expiration (at most one hour). It explicitly
attests the backup/restore evidence. JSON role claims or a D1 token alone grant
nothing. An in-memory capability expires within 60 seconds and is consumed once.
Comment/main/deployment are re-read before the native write. The gate is checked
atomically in D1, including missing or changed state. This is separate from, and
cannot authorize, publication.

The backup evidence is the sanitized full-table checksum comparison, not the SQL
dump itself. Retain the original private SQL and reference/restored hashes outside
Git. Owner must review backup age and adequacy when approving. Renew approval for
a long pause while retaining the original plan and evidence; no arbitrary backup
age limit prevents receipt reconciliation of an already-started plan.

## Ordered operator steps (NOT executed by this PR)

1. Owner reviews/merges this PR, checks out exact main without tracked edits, and
   runs the existing independent validation workflow on that exact main SHA.
   Do not dispatch a release or deploy anything for this operator-only change.
2. Restore existing authorized Wrangler access and supply the existing GitHub owner
   credential (`GH_TOKEN`/`GITHUB_TOKEN` or authenticated `gh`) and Cloudflare read
   credential (`CLOUDFLARE_API_TOKEN`) through the protected environment. The
   Wrangler remote-binding credential also needs its existing resource access.
   Never paste tokens in commands, comments, plans or reports; do not grant new
   permissions to make this run pass. The local Wrangler session was expired
   during the prior backup; this PR does not pretend it is authenticated now.
3. Review the prior private export/isolated restore proof and its age. Capture a
   fresh primary snapshot while the gate is CLOSED; no approval to INSERT is
   needed for this read-only data operation (Wrangler opens its provider session):

   ```powershell
   node scripts/hk2-production-import.mjs capture --out=.cache/hk2-run/snapshot.json
   node scripts/hk2-production-import.mjs prepare --snapshot=.cache/hk2-run/snapshot.json --backup=<sanitized-report-path> --out=.cache/hk2-run/plan.json
   node scripts/hk2-production-import.mjs approval-text --plan=.cache/hk2-run/plan.json --backup=<sanitized-report-path> --expires=<UTC-ISO-within-one-hour>
   ```

   Require exactly 2,357 additions, zero identical/conflicts/blocked, three separate
   temporary items and 95 batches. **STOP here.** Owner must post the exact generated
   text as a new unedited comment in this repository and explicitly approve the
   first production INSERT. This PR and the earlier backup/migration approvals
   grant no such permission. The first batch requires a snapshot at most 15 minutes
   old; if it expires before starting, prepare a fresh plan and approval.
4. Only after that separate approval, execute:

   ```powershell
   node scripts/hk2-production-import.mjs apply --plan=.cache/hk2-run/plan.json --backup=<sanitized-report-path> --approval-comment=<owner-comment-id> --expires=<exact-approved-UTC-ISO> --journal=.cache/hk2-run/journal.jsonl
   ```

   Keep the initial plan/snapshot immutable. The journal records attempts and ACKs,
   and saves original D1 receipts after each batch. D1 receipts, not journal counters,
   determine progress. Stop on any timeout/provider failure/conflict. Re-run the
   same command/plan after review and valid reauthorization to reconcile a lost ACK.
   A committed batch is recognized; it is never sent again. An edited/revoked or
   expired comment requires a new owner comment, retaining the original plan.
   Another plan cannot take over partial rows. Never create a replacement plan
   to avoid ledger errors or continue a rolled-back plan.
5. At completion retain 95 original apply receipts and the journal. Read-only audit
   must show 2,357 exact rows, instructors NULL, eight estimated PE labels, no
   temporary official classes, unchanged HK1/user data and gate CLOSED/revision 0.
   Do not open the gate. Publication remains a separate owner-approved operation.

## Validation and evidence

`tests/hk2-production-transport.test.mjs` runs the production authorization path
against synthetic provider boundaries and real isolated Miniflare D1. It exercises
all 2,357 classes/95 transactions, a failed atomic batch, lost ACK/resume, cross-plan
blocking, revocation and gate races, full HK1/personal-row equality, unchanged
instructors/PE markers and hidden public reads. A separate test uses the installed
Wrangler local proxy with `remoteBindings:false`, prepared NULL/newline values
and an atomic failure. No remote write or proxy session is used in these tests.

The live snapshot, full plan and backup report remain in ignored local storage.
`transport-readiness.json` contains sanitized counts/hashes only. Its plan is an
auditable preparation sample, **not a lease or INSERT approval**. A snapshot can
expire during PR review/CI; refresh immediately before the actual owner approval.
