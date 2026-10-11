# PR #88 — pre-production release gates (2026-10-11)

**Decision: NO-GO production; PR remains Draft.** This is a preparation and
read-only review, not permission to merge, deploy, migrate, upload, backfill,
reindex or change production flags. No Auth release is required or authorized.

Update (2026-10-11): GitHub environment now verified main-only / bypass OFF /
wait 5 minutes; old deployment workflow disabled. Main is protected by active
ruleset 24867954, but its bypass metadata was omitted in the unauthenticated GET.
The guard now requires independently enforced classic protection, readable with
Administration Read; its live configuration is NOT VERIFIED (unauthenticated 401).
Approved fixture-only 0054 rehearsal and restore passed, but full production-copy
rehearsal remains pending. The independent-reviewer requirement below is superseded
by [explicit solo-owner authorization](public-release-solo-owner.md); no production
approval is implied. Historical measurements/gates below retain their original scope.

## Evidence and review outcome

Baseline reviewed: `b90131c7573d4199ee1b18627099433d8d2fd20f` against main
`059f73364d257fdf15b8878b8160e7c94bfc5a75` (100 changed files). Risk review covers
authentication/authorization, document ingestion/identity, D1/R2, retrieval,
cache/concurrency, exact grounding, workflows and operational bounds. It is not
an independent legal verification of document authority/effectiveness.

| Gate | Evidence / current result |
|---|---|
| Prior real Word-first staging quality | Selected 30/30, nonselected 30/30, controls 9/9 at baseline; five unchanged DOCX, 73/73 indexed units. Not a new live run of the changes below. |
| Patched parser against real sources | Re-read exactly the five approved local DOCX after fflate patch: source SHA-256 and extracted Markdown/counts equal the prior private staging manifest for all five. Zero OCR/provider calls/index writes. This verifies extraction stability, not a new UI/provider acceptance run. |
| Latest read-only guard revision local validation | Release/security 119/119; Advisor 393/393; full npm suite 803/803 plus 2 auxiliary tests; frontend/Worker typecheck, frontend/staging builds, YAML parse and diff check PASS. Independent CI must pass on the pushed final SHA. Real read-only PAT execution remains NOT VERIFIED. |
| Production read-only health | Public `9bcf3e62-00db-4794-8020-4c4891929896` at 100%; homepage 200; anonymous Advisor 401; V2 canary 7%; completeness unset/OFF. No synthetic production questions. |
| Production catalog/schema | 10 active PDFs and 1 deleted record; none restored. 0054 columns present: 0/4. No production writes or backup export performed. |
| Isolated full backup/restore | Staging export 489,577 bytes; 25 table row digests match after restore, including WITHOUT ROWID tables. Private artifacts outside Git. |
| Remote 0054/Time Travel fixture rehearsal | Owner-approved existing unbound fixture: full private export/local restore/hash validation, remote 0054-only apply and Time Travel restore PASS; exact original schema/row digests restored. No DB created/deleted. Full production-copy rehearsal remains pending and is NOT replaced by this fixture. |
| Protected GitHub environment | READ-ONLY API 200 confirms main-only policy, bypass false and wait 5 minutes; no reviewers under explicit solo policy. Main protected=true, active ruleset 24867954; omitted bypass metadata is unknown. Mandatory classic protection and approval variables need authenticated read verification. No Administration Write required; no token/secret/protection was created. |
| Production DOCX cutover | NOT PERFORMED; needs separate Admin/source approval and reversible eligibility cutover rehearsal. |
| Gemini | Special-program plan missing receipt and timeouts remain separate unresolved risks; Cloudflare success does not prove Gemini indexing. |

### Changes justified by the review

1. Independent, server-only document rollout percentage, default 0%, separate
   from V2's 7%. Invalid configuration fails closed; client overrides ignored.
2. Final current-revision/index-readiness check for policy citations. A regression
   reproduced a public document revision changing after retrieval while old
   citations were still returned; now that response is refused. No fuzzy matching
   or weakening of exact support spans/authorization.
3. Defensive three-Search-call ceiling before a provider call. This is a guard,
   not evidence that the baseline exceeded three calls.
4. Public preflight accepts absent disabled flags, but rejects enabled/drifted
   flags and missing 0054. Workflow receives only Actions-read access needed for
   protected-environment inspection.
5. Rehearsal digest supports WITHOUT ROWID and canonical row ordering; no PII
   or provider error body printed. No OCR, prompt or source content changes.
6. Dependency audit found fflate 0.8.2's malformed ZIP64 infinite-loop advisory.
   A 2.5-second isolated regression **reproduced a hang in the streaming DOCX
   parser**, not only unzipSync. Minimal patch to 0.8.3 now rejects the same
   synthetic archive with a bounded extraction error. No Word content changed.
   Seven other production-dependency audit findings remain (6 high/1 moderate);
   they require owner security triage, not an unrelated bulk audit-fix here.

### Security, bounds and remaining operational limits

- Better Auth identity remains authoritative. Personal scores, schedules,
  catalog and general routing precede document policy; no client identity/role
  or document-ID privilege escalation. Public/undeleted/ready D1 rows and exact
  revision are checked before hydration and again before returning citations.
- DOCX extraction uses original OOXML, not OCR/AI rewriting; ZIP/XML expansion
  limits and unsupported constructs fail closed. Logical Word units are not
  asserted as physical pages. Uncertain identity/currentness stays NOT VERIFIED.
- Corpus selection uses bounded metadata pagination (128 rows/page, max 4,096,
  overflow abstains rather than silently truncating). Policy: at most 3 Search
  calls, 3 canonical R2 reads, 1 optional generation; no retry/second verifier.
  Hydration max 32,000 bytes/object, 8,000 characters; no R2 listing.
- Shared 30-second I/O/generation deadline; generator adapter 25 seconds. This
  is not a guaranteed whole-HTTP latency ceiling. In-flight binding work cannot
  be cancelled and may still be billed after a timeout.
- Cached citations are reauthorized/revision checked. Persistent production
  cache is **not wired**; do not budget assumed cache savings. Existing quota
  mode is preserved, but no live billing/quota feed enforces a daily USD cap.
- Policy provider failure/insufficient/invalid evidence abstains safely, with
  no automatic ungrounded Gemini fallback. Excluded users retain existing
  legacy behavior, including its known quality limitations.
- Index readiness requires receipts/status for every expected current unit,
  not a client flag or HTTP 200. Stale/pending/failed derived revisions cannot
  be used as verified policy citations. Legacy raw documents without a derived
  revision retain compatibility; a retrieved chunk is not proof that their
  entire file was indexed. Pilot eligibility must exclude unverified/superseded
  legacy sources during the approved cutover. Successful indexing does not
  establish legal effectiveness or resolve inconsistent source content.

## Owner checklist: protected Public-only release

The owner has disabled the old main push workflow, verified READ-ONLY as
`disabled_manually`. Its SOURCE on main still applies pending migrations and
deploys Auth plus Public. Do not enable it before a separately approved merge
lands the manual/Public-only replacement. Do not merge now or rely on skip-CI.
Verify the replacement source before any future release dispatch.

Owner setup, not performed by this task:

- Keep verified `public-production` main-only, bypass OFF, wait at least five
  minutes; configure protected main and the explicit solo-owner API checks in
  `public-release-solo-owner.md`. No second human reviewer is simulated.
- Keep deployment credentials in this environment, not repository-wide secrets.
  Confirm environment approval SHA and run ID separately after a future authorized
  dispatch; see the solo-owner sequence. Explicit release input defaults false.
- Use a dedicated expiring Cloudflare API token, only the intended account:
  Workers Scripts Edit for deploy/settings; D1 Read for schema preflight.
  Zone Read/Workers Routes Edit only for existing configured production zones.
  Validate any additional permissions needed to bind the existing R2/AI/queue/
  workflow resources without provisioning or modifying them; add only demonstrated
  requirements. Do not grant D1 Edit, R2 data Write, AI Search indexing/admin,
  account-wide admin or Global API Key to the release job.
- Use a separate, time-limited migration/import credential and separate approval.
  D1 query API accepts Read permission: preflight needs no data-write token.
- Workers Scripts Edit is account-level, not proof that credentials cannot
  deploy Auth. Exact Public config, protected review and workflow guards are
  essential; stronger script isolation needs owner-selected infrastructure.
- Validate token/resource scope in a credential-controlled dry run before release.
  This checklist is not proof that a minimum-scope token has already deployed.

Workflow: credential-free tests/build first, exact main/owner SHA checks, protected
approval, read-only live settings/schema check, then only
`wrangler deploy --config cloudflare/wrangler.jsonc --keep-vars`. Preflight compares
bindings, vars and observability; `--keep-vars` alone does not prove preservation.

## Backup, migration 0054 and rollback

1. Owner approves maintenance/backup window and private encrypted export location.
   Re-read production schema/migration ledger and active version/settings. Export
   full D1 outside Git; record hash and Time Travel bookmark. Keep original R2
   objects/revision manifests; any private backup requires separate approval.
2. Restore that export into a newly isolated DB; compare schema and **all** row
   digests, including deleted records and unrelated tables. This production-copy
   rehearsal is still pending; staging-copy success is not its substitute.
3. Rehearse only `0054_ai_document_search_ingestion_state.sql` in an isolated
   migration directory. Four additive columns; no data rewrite. Check legacy
   queries/defaults and ledger, then restore the isolated pre-migration bookmark
   and verify schema/row equality. Resolve the DB-capacity blocker with owner
   approval to remove an unused test DB or increase capacity, not production DBs.
4. Before approved production apply: 0/4 columns allows one ledger-controlled
   application; 4/4 requires verifying the existing ledger; partial 1–3 columns
   means STOP. Raw ALTER SQL is not idempotent. Never apply all pending migrations.
5. Application rollback first: policy master false or percent 0; restore approved
   previous Public version/settings at 100%, preserving V2 canary 7% and logs.
   Additive columns may remain; do not drop production columns to roll back code.
6. Whole-D1 Time Travel is a last-resort separately approved restoration: it affects
   all domains sharing the DB and loses later writes. Quiesce writes, agree the
   recovery point/data-loss window, then verify. It is not a selective OCR rollback.

## Approved five-DOCX cutover (plan only)

Admin separately attests the exact five staging source hashes, applicability and
program labels: DRL, student affairs, standard-program learning plan,
part-English/special/elite learning plan, tuition. Preserve originals, prior
revisions and the deleted record; do not infer legal authority from upload date.

Prepare fresh production IDs/revisions and private manifests from those approved
sources; no blind staging-ID copy or automatic re-upload. Keep new rows ineligible
while derived text/tables/hash and every expected index unit are verified. Compare
fees, dates, program-specific tables and citations against approved Word originals.

**Cutover blocker:** current generic document API does not provide a non-destructive
supersession transaction; its delete path removes source objects. Do not use delete
to hide old PDFs. A separately approved/rehearsed operator cutover must atomically
make superseded rows ineligible and new rows eligible, preserving all R2 originals
and revisions. Pre-stage correct index visibility/identity metadata, confirm runtime
D1 filtering excludes old chunks, and avoid an intermediate duplicate-public state
that legacy Gemini could select. Distinct program plans are not mutual replacements.
Rollback restores prior eligibility and hides new rows, without deleting files.

No upload/indexing/cutover is authorized here. If authoritative content is unclear,
retain uncertainty rather than editing Word text to force acceptance.

## Rollout, observability and budget proposal

Initial code release: master `false`, policy percent `0`, completeness `false`,
V2 mode `canary` / percent `7`. Independent cohort uses trusted identity SHA-256;
master `true` plus percent `1` is a proposed first pilot, then 5/10/etc only after
separate owner approvals. User cohort percentage is not a request-volume/spend cap.
Flag false or percent 0 is an immediate configuration kill switch; provider/index
data need not be purged. Every flag change is a separate approved operation.

Proposed pilot ceiling: 200 policy requests/day (maximum 600 Search, 600 R2 reads,
200 generations), $1/day incremental estimate budget, alerts at 70%/85%. These
are **operational proposals, not implemented hard daily spend enforcement**.
Before activation owner must accept manual monitoring/kill-switch coverage or
approve a real quota-feed solution. No cache savings assumed.

Safe telemetry: grounding/result class, fallback/abstention, timeout, latency,
Search/R2/Workers/Gemini call counts, cache hits, provider token usage when supplied.
No questions, answers, evidence, student identity, user hash, cookies or tokens.
`provider_reported_cost_usd` currently null means unknown, not zero. Correlate
safe traces; reconcile account billing/usage separately, including shared services.

Baseline measured 60 policy UI requests: 72 Search, 164 R2 reads, 2 Workers AI
calls, 0 Gemini; 2,964 input and 74 output tokens. Selected p95 4,336 ms,
nonselected p95 6,447 ms (max 11,473 ms). These are prior staging measurements,
not forecast production latency or provider-reported dollar costs.

Price-based estimates only: GLM-4.7-flash generation for those tokens about
$0.00020744; R2 Standard read portion about $0.00005904 before allowances/rounding.
AI Search billing is documented to start 2026-11-01; future vector/hybrid marginal
rate makes 72 calls about $0.054 before included usage. Worst-case 1,000 requests
at three such searches is $2.25 search-only, before allowances. This excludes
indexing/storage, D1, Worker CPU/logs and any legacy Gemini calls. Do not label these
as actual billed USD or a complete hard cost ceiling.

Suggested expansion gates: at least 100 real pilot executions and 24 hours,
telemetry completeness ≥99%, no privacy/auth/unsupported-answer/false-citation
incident; infrastructure/timeout and citation-rejection rates each ≤5%; grounded
success ≥90% of answerable eligible requests (source-insufficient abstentions
tracked separately); observed p95 ≤10 s. No manufactured traffic. Any safety
incident → policy OFF immediately; reliability/cost breach → stop expansion/OFF
pending owner review. These thresholds require owner acceptance before use.

## Approval sequence and remaining NO-GO conditions

1. Owner approval: workflow/environment/token controls; resolve isolated DB capacity
   and triage the remaining dependency audit findings.
2. Approved production-copy backup/rehearsal and exact 0054 application separately.
3. Approved Public-only code release with flags OFF; health/schema/routing checks.
4. Separate Admin approval of five sources and reversible no-duplicate cutover.
5. Exact pilot config approval, quota/monitoring coverage, focused live smoke.
6. Real observation, quality/cost review; explicit approval for each expansion.

Remain NO-GO until these gates are satisfied; passing CI does not authorize
production. Keep Gemini receipt/timeout and legal identity/effectiveness marked
unresolved. A final-SHA staging spot-check of new selection/revision guards is
still required before pilot; baseline 60-question success is not claimed anew.

## Primary references

- [GitHub environment protection](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
- [Environment API / Actions-read permission](https://docs.github.com/en/rest/deployments/environments#get-an-environment)
- [Cloudflare API permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [D1 query permissions](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
- [D1 export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/) and [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [AI Search pricing](https://developers.cloudflare.com/ai-search/platform/limits-pricing/), [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [fflate ZIP64 advisory](https://github.com/advisories/GHSA-px8p-9vwx-vf98) and [maintainer patch](https://github.com/101arrowz/fflate/releases/tag/v0.8.3)
