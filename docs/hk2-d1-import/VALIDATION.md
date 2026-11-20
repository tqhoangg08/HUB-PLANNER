# Validation evidence

## Namespace isolation follow-up

The review regression reproduced a missing rejection on `da9f5e9`: a fresh plan
could adopt 25 classes from another plan. The fix validates the full namespace
in the seventh snapshot query, at plan creation, before INSERT/DELETE and inside
the mutation transaction. Targeted tests cover plan A/B isolation, lost-ack resume,
complete rollback/new approval, corruption/gaps/orphan rows, ledger-only races,
deleted terminal history and saved six-query plans/v1 receipts. The four targeted
preflight/ledger tests PASS; the extended fresh-snapshot/history A/B case also PASS.

A plan with any unrolled receipts retains ownership even after all its batches
have applied: replay uses that original plan. A completely rolled-back plan has
no active ownership but its receipts remain validated history. New plans require
a new snapshot containing that history and their own approval. Foreign history
must still match the approved snapshot; receipt loss or reuse of a pre-rollback
approval blocks. New v2 receipts add semester and an event hash chain; existing
v1 receipts can transition on their original plan without a takeover bypass.

The exact-head full-suite/CI results and follow-up SHA are recorded in PR #160.
The frozen catalogue, manifest/full payload SHA, all 2,357 official classes,
three temporary items and HK1 are unchanged. The read-only snapshot/dry-run in
this folder were refreshed with the namespace query; no production write occurs.

## Earlier complete import/rollback baseline

Implementation commit: `6fffcb5a209009144e01802f8b7288ab6a0c5006`.
The local evidence and v1 receipt examples below are retained historical evidence.

- `npm run test:hk2-import`: **21/21 PASS**, run as the first stage of full
  `npm test` on Windows Node 24. The full Miniflare D1 rehearsal took 482.96 s.
- New writer preflight and the complete local D1 rehearsal both PASS. The test
  uses the actual current production schema (including real facet triggers),
  2,103 synthetic HK1 classes with a duplicate key group, a nonempty synthetic
  personal schedule, and all 2,357 official classes from the merged catalogue.
- Every official course field matches the original artifact; lecturers are NULL;
  no temporary item is inserted; programme API filters and owner-estimated PE
  ICS warnings are checked. Existing tests execute both desktop/mobile slot
  helpers, legacy/multiline cases and all source/calendar/exam checks.
- Batch 2 is interrupted by a real SQL constraint failure midway. Its courses
  and receipt roll back together; the prior 25 classes remain. A competing
  natural key inserted after the read is caught by the in-transaction guard.
- Another batch commits then deliberately loses its acknowledgment. Explicit
  resume discovers the receipt and never duplicates the committed classes.
- All 95 apply receipts reconcile; repeated execution is a no-op. A fresh plan
  proposes 0 additions / 2,357 identical classes.
- Rollback is blocked by a personal schedule reference and by an external room
  change without a revision bump. After removing only those synthetic test
  disturbances, 95 reverse batches remove exactly the imported 2,357 classes;
  all 190 receipts remain. A rolled-back plan cannot be applied again.
- HK1 rows/facets and the synthetic user tables have the same before/after hash:
  `aee66608a6813e2b1ff5a2561ccfb784c3df974edd9485c908137e8db2099be2`.
- [Local evidence](local-evidence.json) records the plan and full receipt digest.
  [Receipt examples](receipt-examples.json) include the first/last apply and
  first/last rollback receipts. The complete 190-row synthetic ledger is saved
  locally in ignored `.cache/hk2-bulk/local-receipts.json`, not a production
  receipt or real user backup.
- Frontend `npm run typecheck`, Worker `npm run cf:typecheck`, `npm run build`
  and `git diff --check` PASS. Build reports the existing large-chunk warning.
- Offline CLI rejects apply/remote/rollback attempts. Fresh production snapshot
  dry-run completed while within its 15-minute age bound: 2,357 additions, zero
  conflicts/blocked, 3 temporary exclusions. The committed report is historical;
  no timestamp is changed to evade freshness checks.

The full local suite continues beyond the import tests; final full-suite and
exact-head CI results are recorded in the PR's verification section/Checks.
An existing Windows Node 24 offline Wrangler timeout was reported on #159;
do not change release guards or test timeouts to hide an environment failure.

No byte under `data/hk2-2026-2027`, no catalogue builder/runtime policy, UI,
Worker/authority/schema, secret or release workflow changes in this PR.
All actual production queries are SELECT/PRAGMA metadata reads with zero writes.
No deploy, publication, migration, merge or production data write was performed.
Real export/restore verification, compatible deployed-version verification and
the owner-approved production execution transport remain outstanding NO-GO
conditions, as specified in [the runbook](README.md).
