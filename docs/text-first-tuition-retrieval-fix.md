# Text-first tuition-condition retrieval repair

## Verified fault and scope

The live diagnosis (read-only, before this branch) verified that the published
tuition revision was eligible, with every receipt completed. Vector top-three
returned unrelated fee fragments rather than the requested payment-condition
row. This is a recall defect, not proof of a publication/authentication failure.
The historical request's exact generator/citation rejection remains unverified:
the Observability query was denied with HTTP 403 / code 10000. That denial is a
telemetry permission result, not an Advisor abstention reason.

This branch changes only the selected V2 official-document path for a narrow,
unambiguous native tuition payment-threshold question. It changes no rollout
configuration, migration, credentials, index, documents, personal-data routing,
or Auth code. It works with document policy and completeness OFF.

## Bounded repair

1. Derive the requested number of terms/years and exact comparison from input.
2. Search the original question, a condition-focused query, and a policy-heading
   query. All are vector requests; hybrid need not be enabled.
3. Retain only active/public/current-revision results with exact canonical keys.
4. DOCX: rank condition-bearing evidence, deduplicate units and hydrate at most
   three retrieved objects. Text-first: read one canonical immutable original,
   bounded to 1 MiB, through R2 binding after D1 publication/current-revision
   authorization. Verify original bytes/size/SHA-256 and R2 hash metadata,
   reconstruct lossless segments and the derived hash/effective index revision,
   then recheck D1. Find all exact condition rows across this verified source;
   vector misses or provider faults cannot hide a valid Text-first row.
5. Quote one exact matching row with its actual nearby heading/header. Conflicts,
   uncertain words, negation, additional conditions or unproved program/cohort
   scope abstain. Never substitute another threshold or percentage.
6. Keep the existing numeric/support/source-ID and final D1 citation validation;
   recheck current revision before returning to the client. Logical segment
   ordinals never become physical Word page numbers.

Budgets: at most three Search calls, three shared R2 attempts and one 30-second
deadline. Text-first reads only ONE authorized published original (at most 1 MiB,
128 lossless segments); evidence is at most three matching segments, each under
8,000 characters. More matches fail closed rather than silently truncating
ambiguity. No bucket/corpus scan. DOCX retains bounded vector hydration.
Competing native tuition sources have no inferred legal precedence: abstain.
Answer/retrieval cache namespaces are versioned separately from the old path.

## Evidence so far

- Unit fixture: original vector results 7/7/3, later retrieved segment 10; exact
  row and table citation recovered, amounts obtained from the row, zero model
  calls. Security cases cover drafts/private/stale/noncanonical results,
  conflicting rates, absent answer, malformed source words, quota, bounds and
  revision drift. Fixture amounts/ordinals are not runtime constants.
- Real staging resources verified isolated: `hub-advisor-pr88-word-staging`
  Worker/R2/AI Search and its separate D1. Existing tuition DOCX is public and
  completed with 12/12 receipts.
- Real Search/R2 + local product-runtime acceptance: **FAIL safe abstention**.
  First run: 11,639 ms, three Search calls, three R2 reads, zero Workers AI or
  Gemini calls. Provider returned unit 11 for the relevant policy. Subsequent
  structural diagnosis found its Word source actually says `3 cÿ trở lên`, not
  a confidently readable number of terms. The patch does not silently repair
  that text. Later warm diagnosis: 6,352 ms, same bounded usage.
- This is not a live UI acceptance or a reproduction using the production
  Text-first source. No staging deployment or document mutation has occurred.
- Owner approved one isolated ten-segment synthetic Text-first fixture. On
  2026-10-14 the live staging serving-version bindings, D1, R2 and AI Search
  isolation were reverified. Exactly one draft was created with ten segments;
  its source hash, public target scope and new root identity were verified.
  The first normal index batch timed out at the HTTP client after 25 seconds.
  Read-only post-check: server state `working`, cursor 0, eight receipts
  (2 completed, 6 running), two segments not yet submitted. The source remains
  unpublished, `indexing_status=processing`, `ai_search_status=derived_ready`.
  No retry/reset, second fixture, publication or staging deployment followed.
  This does **not** establish a stuck provider or its root cause. Stop and
  diagnose the interrupted batch before separately approving recovery of this
  same fixture; do not blindly replay it or manually advance the cursor.
  That staging acceptance remains **BLOCKED**, not PASS. The owner subsequently
  stopped fixture recovery and removed staging E2E as a gate for this repair.
- Dollar cost is **NOT MEASURED**; request counts are actual. No provider token
  usage exists for the deterministic path because no generator was invoked.

## Reproduce without writes

`node --experimental-strip-types scripts/verify-tuition-retrieval-staging.mjs`
uses the existing default Wrangler OAuth profile without copying/logging it.
It fails closed on resource drift, reads only document metadata/receipts/R2,
performs bounded vector searches, and prints content-free outcomes/usage.
It does not upload, reindex, publish, deploy, create chat history or target
production. The REST acceptance adapter validates D1, canonical keys and exact
receipts; actual Worker R2 metadata handling is separately security-tested and
still requires a deployed staging-binding acceptance before release.

## Release status

Owner approved direct Public-only release of this fix without more staging
fixtures. Real production read-only diagnostic on 2026-10-14, running patched
product code locally against the actual production document/index/R2: **PASS**.
10/10 receipts, correct literal discount row, source unit 10, current revision
and authorized document citation verified. Three vector Search calls, one R2
original read, zero generator calls, 14,817 ms. This is NOT a deployed/UI PASS.
Serving version before release: `14833c0d-1624-4c54-8715-3ba6d262bb87` (100%).
V2 remains canary/100; completeness and Cloudflare-first remain OFF/0.
Focused regressions: 16/16, including actual SQLite publication-to-Advisor,
vector omission, provider failure, original tampering, revocation, shared R2
budget and conflicting/absent conditions. Exact-head independent CI and the
existing separate owner exact-main/run approvals remain mandatory before deploy.
No migrations, data/index changes, staging recovery or Auth deployment.
