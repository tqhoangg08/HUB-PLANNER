# Public release blockers — remediation and remaining NO-GO

Source baseline: `cd6c2df4b72ac7b38797805adae087f443346771`, fetched again on
2026-10-16. This change prepares a reviewed PR; it authorizes no merge, deployment,
migration, import, approval-variable update or Auth Worker change.

## Root causes and source fixes

| Finding | Cause | Remediation |
| --- | --- | --- |
| `LIVE_BINDING_DRIFT` before the upload that adds the binding | The same complete binding list was required before and after deployment. | Predeploy requires the audited old serving version `d102b7e6-0a37-448c-acce-5f8e795af13c` and its binding set, without `SCHOLARSHIP_SEARCH_RATE_LIMIT`. Postdeploy requires a different single version at 100% and the full configured set, including namespace `45871912`, limit 60/60 seconds. Every other resource, variable, observability setting and AI flag remains checked. Unknown transitions fail closed. |
| Scholarship handlers query absent schema | Preflight only covered Text-first, and migration numeric prefixes overlap. | Require all three complete Scholarship filenames exactly once and the complete reviewed SQLite schema contract before either phase. No DDL or ledger writes are performed by the reader. |
| Historical event edits reject inactive rules | Create and update both required `active=1`, even for a saved unchanged tuple. | Only an existing server-read event may retain its unchanged `(drl_rule_id, criteria, points)`. These fields are omitted from UPDATE, including when a full form resubmits them. New or changed selections still require an active event-suitable scored rule and exact official points/section. An unchanged tuple-only save is a no-op. |
| Old no-rule cache survives a policy change | Fingerprint included corpus version but no official rule catalogue version. | New algorithm namespace and SHA-256 digest of ordered active event-rule tuples (including source version, content, conditions, unit and points). Both rule and abstention entries become ineligible when this catalogue changes. Old rows remain untouched under old fingerprints. Corpus version remains separate historical provenance. |
| Completed candidates can expose/recover obsolete suggestions | Duplicate ingest used corpus and active-rule checks and could reset completed predictions. | Completed rows are never reset by duplicate ingest. Staff reads compare the fingerprint against the current candidate text, corpus and policy; stale responses carry `stale=true` and no actionable rule/points/confidence. The existing explicit staff retry refreshes one prediction. Review outcome and approved event are unchanged. |

The shared picker displays a saved rule missing from the active catalogue as a
disabled preservation option. It does not add that rule to new-event choices or
change the form on opening. Admin/Auditor capabilities, extension ingest
authentication/CORS, historical matching and explicit manual application remain.

## Scholarship schema gate

Required **full ledger names**, independently of the similarly numbered AI files:

1. `0055_scholarships.sql`
2. `0056_scholarship_snapshots.sql`
3. `0057_scholarship_filters.sql`

The [schema contract](../scripts/scholarship-release-schema.json) contains the
exact final DDL of 24 named objects. Tests construct the actual migrations in
memory and compare every object, rather than accepting the JSON as its own proof.
SQL whitespace outside literals is ignored; columns, types, defaults, nullability,
PK/UNIQUE/CHECK/FK clauses, index expressions/order and trigger bodies must match.
Missing, altered or additional `scholarship_*` objects fail closed. Autoindexes
are represented by their table's PRIMARY KEY/UNIQUE constraints.

| Table | Required structure / protection |
| --- | --- |
| `scholarship_campaigns` | Source metadata, status/publication/score approvals and publication CHECK; revision; candidate/active batch FKs. Public lookup index. |
| `scholarship_recipients` | Retained legacy rows; campaign FK RESTRICT; source-row uniqueness; identifier/GPA/training-score constraints. Four campaign lookup indexes. |
| `scholarship_import_batches` | Campaign FK, source hash/filename/counts/status/actor, mapping/payload/field approval/document/approver metadata. Unique campaign + source + payload index. |
| `scholarship_publication_audit` | Campaign FK, restricted action values, actor/source/timestamp. |
| `scholarship_snapshot_rows` | Batch FK RESTRICT; source-row uniqueness; numeric 12-character identifier; valid scores JSON; immutable source hash; type/rank/cohort columns. Eight lookup/filter indexes. |
| `scholarship_audit_events` | Campaign/batch FKs, restricted actions, actor/source/details/timestamp. |
| `scholarship_transaction_guard` | NOT NULL INTEGER `ok`, CHECK `ok=1`; transactional compare-and-swap protection. |

Three additional triggers reject insert/update/delete of applied snapshot rows:
`scholarship_snapshot_insert_immutable`, `scholarship_snapshot_update_immutable`,
`scholarship_snapshot_delete_immutable`. Total: 7 tables, 14 explicit indexes,
3 triggers. Full column and constraint definitions are in the linked contract and
the three immutable source migrations; no source migration is modified here.

## Separate migration, backup and recovery plan — NOT EXECUTED

The private preflight snapshot reported the three Scholarship files absent,
Text-first already applied, and DRL `0058_seed_drl_catalog_2026.sql` already applied.
Those are dated observations, not a fresh live acceptance of this PR.

Before requesting production migration approval:

1. Make a fresh private D1 export with timestamp, database identity, SHA-256 and
   current recovery bookmark. Store outside Git; restrict access. The older
   pre-0058 backup is not sufficient evidence for this upgrade. Establish the
   operational write freeze and recovery RPO/RTO with the owner.
2. Restore that current export to an isolated local/staging copy with no production
   resource bindings, Auth traffic, queues, AI jobs or real-data public routes.
   Record full statement count, `integrity_check`, `foreign_key_check`, exact
   ledger and baseline aggregate/hash receipts without printing student records.
3. Enumerate all pending migrations by full filename. Rehearse a ledger-aware
   runner restricted to the three reviewed Scholarship filenames in order; inspect
   its transaction/ledger behavior and stop on unexpected pending files. Do not
   use an unreviewed blanket `migrations apply`, prefix matching, manual ledger
   repair, file renaming or replay of AI 0055/0056/0057 or DRL 0058.
4. On the copy, run this schema gate, FK/integrity checks and synthetic runtime
   acceptance. Verify empty Scholarship data/zero published campaigns; compare
   all pre-existing tables and ledger entries, especially DRL rules, events,
   2,750-row corpus evidence, caches, candidates and review outcomes. Re-running
   the ledger-aware plan must apply nothing; the raw ALTER migrations themselves
   are not advertised as idempotent.
5. Rehearse restoring the fresh backup to another isolated copy and repeat the
   baseline hash/FK/ledger checks. Retain a restore receipt. A Time Travel bookmark
   alone is not a tested restoration or a retention guarantee.
6. Submit the exact runner, migration files, copy/restore receipts, target identity
   and write-freeze/recovery plan for **separate owner approval**. Only then may
   that narrowly approved production operation be considered. No real Scholarship
   data import, approval or publication is part of the schema operation.

Prefer leaving the additive empty schema in place if only the application release
is cancelled. A database recovery can discard subsequent writes: never restore
production or drop tables automatically. Any production restore needs a separate
decision, a fresh pre-restore backup and an explicitly accepted data-loss window.
Likewise, reverting the Public Worker/asset version requires separate approval;
first inspect actual serving traffic if an upload or postflight fails.

This PR introduces **no new migration**, does not edit any released migration and
does not require a DRL migration. No existing event/cache/candidate is rewritten
by installation. Old prediction rows stay available for audit; new requests use
new fingerprints and normal bounded cache insertion only.

## Remaining gates before production GO

- PR checks must pass on the final feature SHA; owner reviews and separately
  approves merge under existing main protection. No auto-merge is enabled here.
- After merge, run manual **AI Advisor PR validation (no deployment)** on the
  exact final `main` SHA. PR #101's receipt or matching source trees cannot
  substitute for a successful main/workflow_dispatch receipt.
- Fresh production-copy upgrade/restore rehearsal and separate approval/execution
  of the three Scholarship migrations, followed by read-only schema/ledger gates.
- Authenticated staging acceptance for historical event edits (Admin/Auditor),
  preserved candidate outcomes, policy-aware cache/abstention and extension ingest.
  Local synthetic tests are not production acceptance.
- Fresh read-only checks of actual serving version, settings/observability,
  routes, Queue consumer, resource bindings and unchanged AI flags; verify the
  protected release credentials can perform the existing required operations.
  If serving baseline changes, stop and review a new transition; do not widen it.
- Owner-token API verification of classic protection and protected environment,
  followed by a separate release decision. Only the human owner may dispatch a
  new Public-only release and record exact new SHA/run-ID approval after dispatch
  under [the solo-owner guard](public-release-solo-owner.md). No old approval or
  rerun is reusable. The release workflow remains unchanged.
- Real Scholarship import/publication remains blocked pending verified source and
  explicit per-field disclosure authorization. An empty-data feature release is
  a separate decision from publishing student data.

**Production status: NO-GO.** Offline green checks establish source regression
coverage, not migration execution, live-schema acceptance, owner authorization or
a deployment receipt. No production state is changed by this task.
