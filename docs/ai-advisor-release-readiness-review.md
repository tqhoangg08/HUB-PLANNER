# PR #88 — release readiness review

Review date: 2026-10-10. Review baseline: `origin/main` at
`059f73364d257fdf15b8878b8160e7c94bfc5a75`; candidate reviewed:
`39b7a107ed2f93516bce4d8506a649d392151eb7`, plus the minimal readiness fixes below.
PR remains **Draft, unmerged**. Nothing in this runbook authorizes an operation.
Production deployment, migrations, backfill, index writes and flag changes require
separate owner approval. No OCR algorithm or generator prompt changed in this review.

## Decision

**NO-GO for production release now; NO-GO for enabling completeness.**

**Conditional GO for a future initial Public-only release with completeness OFF**
after independent CI passes, the owner approves the release/migration, the backup
and migration rehearsal gates pass, and the shared main deployment workflow is
prevented from deploying Auth. This is not an authorization to merge.

Reasons: the current main workflow deploys Auth automatically; only one real PDF
has full staging acceptance; multi-topic staging/backfill promotion is not yet
validated; provider timeout and operational measurement gaps remain. Two legal
questions remain NOT VERIFIED, not acceptance failures that can be fixed by guessing.

## Verified findings and minimal repairs

1. **0054 legacy eligibility regression (fixed).** The additive migration defaults
   existing rows to `ai_search_status='not_prepared'`. The old candidate-to-V2 mapping
   admitted only absent/completed status, disabling legacy V2 documents even with
   completeness OFF. `hasReadyAiSearchIdentity` now preserves eligibility for legacy
   rows without a derived revision, while blocking `derived_ready`, `failed`, and
   `not_prepared` with a revision. D1 public/completed/not-deleted authorization,
   support validation, quota and canary selection remain unchanged. An actual SQLite
   migration/request regression failed before the fix and passes afterward. The
   test uses synthetic provider fixtures, not a production-quality claim.
2. **Readiness race (fixed).** `refreshAiSearchDocument` awaited provider Items then
   unconditionally promoted the D1 row. A concurrent revision replacement could be
   marked complete from the previous revision's Items. Promotion now compares the
   revision, readiness state, visibility, page count and non-deleted lifecycle in one
   conditional UPDATE. SQLite regressions replace those values during the provider
   await; the pre-fix revision case failed, the guarded cases pass. No source text
   or index is changed by this repair.
3. **Unsafe automatic release architecture (not triggered).**
   `.github/workflows/deploy-cloudflare-production.yml` runs on main push/manual
   dispatch, applies *all pending* Public migrations, deploys Auth, then Public.
   It has no separate approval environment. Do not merge or invoke it for this
   release. The new PR validation workflow has no deployment steps or Cloudflare
   credentials and does not change that existing workflow.

## Whole-PR review coverage

The original diff has 57 files. Runtime/ingestion, shared OCR helpers, admin upload
and citation UI, isolated staging app/scripts, fixtures/tests, configuration and
reports were reviewed as separate groups. Original PDF/private artifacts are not
part of the diff. This is an agent review, not an independent human security signoff.

| Area / evidence files | Result and remaining risk |
| --- | --- |
| Authentication: `ai-advisor.ts`, `ai-documents.ts`, staging entry | Production still uses `requireBetterAuthSession`; client identity/role overrides are rejected; document management remains admin-only. No production Better Auth/role/route module changed. The synthetic staging Auth service is in a separate entry, not production config. |
| Permissions: candidate selection, citation resolver, completeness factory | D1 public/completed/not-deleted sources only. Provider IDs are post-authorized; live D1 authorization runs after cache/generation. No program/admin visibility expansion. Broad public provider search for >12 candidates does not authorize arbitrary results. |
| D1: 0054 + candidate mapping/readiness | Four additive columns, no DROP/data rewrite. Old schema read compatibility and old rows preserved in regressions; raw SQL is **not idempotent**. Two verified issues repaired above. Migration first is necessary for new upload/readiness SQL. |
| R2: `ai-document-ingestion.ts`, completeness factory | Original retained; versioned page objects and server-authoritative metadata; no client-selected storage URL/key. Hydration requires exact current canonical key; <=3 gets, <=32000 bytes/object, <=8000 chars/page, pages 1–40. No bulk R2 scan. |
| AI Search: retrieval/completeness/runtime | Catalog keyset paging (128/page, hard 4096 bound), no recency cap excluding older public sources. Baseline topK remains 3 (hard 5); opt-in table vector10/rerank, excerpt hybrid10/no-rerank, final <=3 authorized evidence pages. One completeness search, not unbounded multi-step retries. |
| Grounding: Workers AI, Gemini, table/excerpt helpers | Unknown/fabricated/missing support rejected. Exact source-dependent extracts, not canned verdicts. Source offsets are not treated as retrieved evidence. Legal currency is not inferred from upload date/version. General chat remains separate. |
| Cache: V2 runtime + existing cache module | Scope/revision/pipeline/policy distinguish keys; optional retrieval TTL21600s, extractive answer TTL120s. Live authorization still applies to hits. **No new production cache binding or verified production hit rate**; tests with injected caches do not establish cost savings in production. |
| Concurrency/lifecycle | New readiness CAS closes the proved race. There is no cross-request single-flight or atomic global quota reservation. Final citation authorization checks identity/visibility/deletion, not a transactional lock spanning R2/provider work. Never promote revisions or edit/delete a document concurrently with a backfill benchmark. Gemini operation refresh retains existing unconditional update behavior; concurrent refresh/delete needs a dedicated lifecycle test before an automated backfill runner is approved. |
| Cost/quota | SURVIVAL/zero-AI precedence unchanged; bounds are per request, not a global spending cap. Undefined injected quota usage defaults to NORMAL; do not claim a live budget governor is wired. Concurrent cold requests can each incur provider work. Promise-race timeout may not cancel provider billing. Legacy Gemini transient retries remain separate from V2's no-retry path. |
| Admin OCR/upload UI and shared helpers | Prior code handles individual native/scan pages, numeric uncertainty and column preservation; unchanged here. Server binds derivative hash to original and supported pipeline but cannot certify OCR semantic quality. <=40 pages /1MB text; a stored page can exceed runtime hydration limits and then only chunks are usable. Multi-topic visual acceptance is still required. |
| Staging/scripts | Private named isolated D1/R2/index and synthetic session. Provisioning/provider scripts are explicit operator actions, excluded from CI. Local state/raw replies/PDF/screenshots remain outside Git or ignored. Reprocess script is a **planner only**, not an approved production apply runner. |
| Unrelated modules/dependencies | No Auth Worker, Event DRL, Support, ranking, directory or extension changes in the diff. No dependency/lockfile change. Existing build chunk/Browserslist warnings are not silently treated as new blockers or fixed outside scope. |

## Independent CI and validation evidence

`.github/workflows/ai-advisor-pr-validation.yml` runs on pull_request (including
Draft synchronize), Ubuntu/Node22, `npm ci`, focused Advisor tests, both typechecks,
build, full suite, two additional release parser/snippet tests and diff-check.
Read-only contents permission, checkout credentials not persisted, no secrets,
Wrangler/remote calls/deploy steps. It must pass on the new PR head, not just the
previous commit. Its actual run/status and final local counts are posted in the PR
review comment; a configured workflow alone is not a CI PASS.

Local focused readiness/Advisor regressions: **210/210 PASS**. Both typechecks,
build and diff-check PASS. Additional release tests: **2/2 PASS**. Full local suite:
**598/598 PASS**, zero failed/cancelled/skipped; the known D1 baseline did not
reproduce. Independent CI is recorded after completion, without inventing a result.

Previous **real**, isolated staging acceptance on `39b7a10`: **6 PASS, 2 NOT VERIFIED**;
8 responses visible, no browser errors. This review did not rerun the real-provider
benchmark after its minimal readiness repairs; CI/local fixtures do not replace it.

| Real staging case | Verdict / sources | Latency ms | Search / generator / R2 |
| --- | --- | ---: | --- |
| DRL table/latest request | PASS 100 points, five groups 25/20/20/15/20, pages2+3; latest unverified | 4661 | 1 /0 /2 |
| Decision identity/date | NOT VERIFIED, safe abstention | 2988 | 1 /1 /0 |
| Misspelled DRL table | PASS, pages2+3 | 1862 | 1 /0 /2 |
| Five maxima | PASS including25, pages2+3 | 2134 | 1 /0 /3 |
| Online mini-game | PASS, decisive page14 evidence | 1989 | 1 /0 /3 |
| Outside-school proof | PASS, page14; OCR wording/caveat retained | 2117 | 1 /0 /3 |
| Personal DRL score | PASS safely unavailable, not GPA | 184 | 0 /0 /0 |
| Legal currentness | NOT VERIFIED, safe abstention | 3899 | 1 /1 /0 |

Median2125.5ms/max4661ms; 7search/2generator/13R2 reads. This tiny sample is not a
p95 production SLO. Billing/search embedding/rerank cost NOT MEASURED.
See [acceptance follow-up](ai-advisor-acceptance-followup.md) and
[completeness staging report](ai-advisor-retrieval-completeness-staging-report.md).

## Current production — read-only verification

Read-only inventory/Worker settings rechecked during this review:

- Public `9bcf3e62-00db-4794-8020-4c4891929896` at100%; V2canary7%; completeness unset/OFF.
- 11 document records: **10 active PDFs +1 deleted**. Deleted record is excluded,
  not restored; no assumption that an eleventh active PDF should exist.
- Production0054: **0/4 columns**; isolated staging:4/4 columns.
- Homepage200; anonymous Advisor401. No synthetic production chat sent.
- No production writes/deployment/backfill; no Auth deployment/main merge/push.

## 0054 apply/backup/rollback runbook — NOT executed on production

1. Approve exact SHA and maintenance window. Capture Public/Auth version, traffic,
   safe settings and D1 UUID internally; match `hub-planner-public-dev` explicitly.
   Capture schema, migration ledger, active/deleted counts and aggregate identity
   digest. No document content, user rows, tokens or emails in the report.
2. Verify all prerequisite migrations through0053 are applied. Compare ledger and
   schema: 0/4 new columns and no0054 ledger entry => eligible;4/4 +ledger => already
   applied, skip;partial schema/ledger disagreement => **STOP**, reconcile manually.
   Never blindly repeat ALTER statements or falsely mark a partial migration applied.
3. Capture a fresh Time Travel bookmark and verify retention/backend; record it in
   private operations storage. Also obtain an approved encrypted export outside Git
   for restore rehearsal. Export can block D1 requests; schedule it. If virtual
   tables prevent export, **do not drop them**; use a supported backup alternative
   and stop until restore evidence exists. No export/backup was created here.
4. Restore/import the approved backup into an isolated rehearsal DB, or use an
   approved sanitized schema/fixture for compatibility tests without claiming it is
   full restore proof. Apply0054 there and run old/new Worker queries, CRUD/index
   readiness, default-OFF legacy-V2 regression, and deleted/private exclusion.
5. Only after approval, `d1 migrations list` must show **0054 as the sole pending
   migration** under the intended config. Then `d1 migrations apply` may be used.
   If any other pending migration exists, STOP; do not run the main workflow or
   batch unrelated migrations. Arrange an independently reviewed,0054-only migration
   directory/config if necessary; keep its normal ledger filename and verify it.
6. Validate four exact columns/defaults/CHECK,0054 ledger, unchanged original hash
   digest/active/deleted counts; legacy documents still eligible with flagOFF.
   Do not set all rows completed or change existing revisions as migration work.
7. Rollback normally means previous Public version +feature flagOFF, **leave additive
   columns in place**. Do not DROP columns. Whole-D1 Time Travel restore is last
   resort, separately approved, because it discards unrelated ranking/profile/event
   writes since the bookmark. Quiesce writers and reconcile all affected modules.

Reviewed command forms (illustrative, approval still required):

```powershell
npx wrangler d1 time-travel info hub-planner-public-dev --config cloudflare/wrangler.jsonc
npx wrangler d1 migrations list hub-planner-public-dev --remote --config cloudflare/wrangler.jsonc
# ONLY once the sole-pending, backup, compatibility and approval gates pass:
npx wrangler d1 migrations apply hub-planner-public-dev --remote --config cloudflare/wrangler.jsonc
```

Cloudflare references: [migrations](https://developers.cloudflare.com/d1/reference/migrations/),
[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/),
[export limits](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
Time Travel retention depends on plan; verify it rather than assuming30days.

## Public-only initial release — NOT executed

1. Independent CI green on approved head; human review; owner approval;0054 above.
   No merge while the shared main auto-deploy workflow can deploy Auth. Agree a
   separate workflow suspension/approval change **before** any later main push.
2. Use a clean reviewed checkout of the approved SHA (no private PDFs/local plans).
   Build exact frontend assets. Snapshot current live settings and rollback Public
   version immediately before deploy, not only the older snapshot in this report.
3. Prepare Public config preserving **all** existing bindings/secrets names/routes,
   crons/queues/assets and safe persisted observability. Secrets stay in Worker,
   never in a config artifact. Explicitly set completeness`false`,V2`canary`,percent`7`.
   `--keep-vars` alone is not evidence that bindings/observability are identical.
4. Dry-run the Public config, inspect bundled entry/assets/bindings (not staging or
   Auth), and compare setting snapshot. Execute **only**:

   ```powershell
   npx wrangler deploy --config cloudflare/wrangler.jsonc --keep-vars
   ```

   No `deploy:auth`, no shared production workflow, no hidden migration/backfill.
   This command has not been executed in this task.
5. Read back version/100%traffic, completenessfalse/canary7, same Auth version,
   homepage200/anonymousAdvisor401, private-document denial and normal authorized
   UI with safe owner-approved smoke. Verify ranking/directory remain healthy
   read-only. A default-OFF release still changes intent/grounding/upload semantics;
   flagOFF is **not** a rollback of the entire PR. Use previous Public version for
   unrelated upload/grounding regressions.
6. Observe ordinary traffic; no synthetic load. No rollout increase or Gemini
   retirement implied. Production questions/provider calls require separate consent.

## Ten-active-PDF reprocess plan — NOT a production apply mechanism

Inventory manifest/dry-run planner uses only the10 active PDF identities/hashes,
visibility, original version and rollback revision, privately outside Git. Exclude
the deleted record. Never call ordinary upload to replace an existing document:
duplicate-hash rejection and its aggregate derivative path are not a safe backfill API.

Order: finish additional **isolated staging** PDFs (academic regulation, tuition,
another regulation) first; then owner-approved one-document production pilot;
observe; then process each remaining active document serially with independent
promotion approval. No all10 batch promotion, no original overwrite/index purge.

Per document checklist:

- [ ] Obtain authorized original read-only; verify SHA and immutable identity.
- [ ] Prepare new pipeline-versioned derivative outside Git; keep old derivative.
- [ ] Human compare actual rendered pages: Vietnamese, tables, fees/units/thresholds,
  dates, negation, page numbering; uncertain decision/effect values remain unknown.
- [ ] Write **new revision namespace** only in isolated staging; no provider upsert
  into an existing production key. Index every page and verify current metadata.
- [ ] Test known questions +negative/private/prompt-injection cases through normal
  staging UI on final code, at least one table/number/date per document. Verify
  semantic answer/citation completeness, not HTTP200. Include Gemini/nonselected
  paths with bounded controls. Record reads/calls/time and provider token billing.
- [ ] Require40-page/hydration bounds to fit, or mark that document BLOCKED; do not
  silently truncate required tables. Additional-topic staging is currently **NOT RUN**.
- [ ] For separately approved production pilot, new side-by-side page objects,
  all-page readiness, and a reviewed compare-and-swap promotion against expected
  old hash/version/revision/visibility/deleted=NULL. A production apply runner has
  **not been implemented/validated**; planner output is not permission to write.
- [ ] Record previous pointer privately. No concurrent edit/delete/refresh/promotion;
  drain in-flight requests before promotion and repeat authorization benchmarks.
  Retain old objects/index revision for rollback; caches must include new revision.
- [ ] Verify before/after original hash and10-active/1-deleted counts. Rollback only
  affected revision with a fresh CAS; do not restore deleted records or sweep R2.

## Monitoring and feature-enable/rollback gates

Current safe custom telemetry has canary dispatch/final trace correlation,
V2 result/source/fallback class, search/generator counts and stage durations.
It contains no question/answer/evidence/identity. Canary final routing is emitted
**before legacy fallback finishes**; it does not prove the fallback delivered a
normal response. Production R2 get observer is test-only; per-request production
R2 counts/token billing and final legacy outcome are **measurement gaps**, not PASS.

Before enabling completeness, approve a content-free instrumentation/dashboard
plan (or demonstrate equivalent account metrics) for:

| Metric | Definition / evidence required |
| --- | --- |
| Grounded answer rate | Validated V2 served /completed selected V2 attempts, separated from safe extractive answers and legacy. Do not infer factual correctness solely from class/citation count. |
| Abstention/errors | Separate no evidence/generator abstain/invalid citation/retrieval/provider timeout; safe abstention is not infrastructure failure. |
| Completeness | Correlated dispatch/final /selected attempts; classify infrastructure termination rather than treating missing logs as success. |
| Latency | End-to-end p50/p95/p99 plus retrieval/generator/fallback, cold/warm split. No fabricated p95 from8samples. |
| Privacy/safety | Unauthorized/private source, fabricated number/citation, accidental PII telemetry:zero tolerated. |
| R2/provider/cost | Actual get count/bytes, search bybackend/rerank, generator calls/tokens, Gemini attempts/timeouts, cache hits, daily aggregate billed cost vsapproved ceiling. |

Proposed **enable gate**, owner must approve thresholds: additional3topic staging
PDFs semantic/citation tests pass;6 conduct cases stay PASS;2legal cases remain
explicitly NOT VERIFIED unless authoritative evidence appears; final-SHA UI checks;
schema/backup/Public-only approval; measurement gaps closed. Keep V2canary7%.

After an approved flagON pilot, use >=24h and >=20 real selected executions before
any next decision. Proposed reliability thresholds: >=95%lifecycle completeness,
>=70%validated V2 served, <=10%retrieval/generator/timeout fallback, <=15%invalid
citations. Track abstention separately and topic mix; these rates alone cannot
prove answer completeness. Per completeness call<=1search/3gets/1generator,zero
V2retry/verifier. Legacy retries/cost reported separately; no assumed warm-cache savings.

Rollback immediately on private-source exposure/fabricated factual output/PII
telemetry/authorization regression. Also roll back flagON for sustained p95 >2x
the approved baseline or >10s (proposed, not measured SLO), bounds/cost cap breach,
or reliability threshold failures after minimum sample. First disable completeness
only; keepcanary7/Gemini. If default-OFF behavior/upload/schema compatibility is
broken, restore the prior Public version. Verify bindings/settings/Auth unchanged.
Never modify OCR to force legal identity/currentness PASS.

## Gemini risk remains separate

Previous real isolated REST controls: plain12182ms(no evidence), mini15904ms,
outside7473ms;3calls/794reportedtokens. No timeout in those3 does not disprove the
observed30013ms intermittent timeout. SDK/network equivalence and root cause remain
NOT VERIFIED. No provider/model/deadline/retry change made here.

Regressions prove failing Gemini does not affect a selected extractive V2 answer,
and nonselected legacy timeout returns a safe unavailable answer, not invented
policy. This protects correctness, **not** availability/latency. Additional-topic
legacy Gemini recall and user experience remain future staging gates before broad
release; completeness flag affects selected V2 only, not the93%legacy cohort.

## Staged decision checklist

1. **Now:** fix verified readiness regressions, independent PR CI, Draft review;
   no production change.
2. **Before initial OFF release:** CI green +human approval +backup restore rehearsal
   +0054-only gates +Public-only deployment control approved. No main autoAuthdeploy.
3. **Initial release:** approved Public only,flagfalse/canary7;read-only smoke/observe.
4. **Before reprocessing:** additional-topic staging +reviewed side-by-side CAS apply
   runner +per-document approval. Exclude deleted record,retain originals/oldrevision.
5. **Before flagON:** final-SHA semantic UI evidence +monitoring/cost gaps closed
   +explicit owner approval. No canary percentage increase implied.
6. **Any rollback:** disableflag orpriorPublic asabove;D1restore separatelyapproved;
   never deployAuth/retireGemini/purgeoriginals aspartofrollback.

Outstanding: independent CI result; backup/restore rehearsal and release approval;
additional-topic PDFs; safe backfill apply implementation; measurement gaps;
Gemini intermittent timeout; legal decision/currentness verification. No production
operation performed to close these gates in this review.
