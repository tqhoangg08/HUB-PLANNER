# Text-first tuition-condition retrieval repair

## Verified fault and scope

The live diagnosis (read-only, before this branch) verified that the published
tuition revision was eligible, with every receipt completed. Vector top-three
returned unrelated fee fragments rather than the requested payment-condition
row. This is a recall defect, not proof of a publication/authentication failure.
The historical request's exact generator/citation rejection remains unverified:
the Observability query was denied with HTTP 403 / code 10000. That denial is a
telemetry permission result, not an Advisor abstention reason.

The PR #95 repair changes only the selected V2 official-document path for a narrow,
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

## Verification and maintenance

- Unit fixture: original vector results 7/7/3, later retrieved segment 10; exact
  row and table citation recovered, amounts obtained from the row, zero model
  calls. Security cases cover drafts/private/stale/noncanonical results,
  conflicting rates, absent answer, malformed source words, quota, bounds and
  revision drift. Fixture amounts/ordinals are not runtime constants.
- Historical staging checks safely abstained on a corrupted DOCX source; the
  separate synthetic fixture's index batch timed out before all units were sent.
  Neither is an E2E PASS. The owner stopped fixture recovery and authorized the
  production repair without further staging fixtures. No cleanup/retry of those
  resources is authorized by this document.
- Real production read-only diagnostic (2026-10-14), using patched product code
  locally with the actual published source and real Search/R2: **PASS**. All ten
  receipts, the exact condition row, current revision and authorized citation
  were verified. Three vector Search calls, one R2 read, zero generator calls,
  14,817 ms. This is not authenticated deployed/UI chatbot acceptance.
- Dollar cost is **NOT MEASURED**; request counts are actual. No provider token
  usage exists for the deterministic path because no generator was invoked.

Focused local regressions (no remote credentials or writes):

```powershell
node --test --experimental-strip-types tests/ai-advisor-tuition-condition.test.ts tests/ai-text-documents.test.ts
```

The one-off staging provider harness was retired: its fixed resource/single-DOCX
assumptions no longer represent Text-first production. Regression tests, fixtures
and the shared staging setup remain available. Any new live provider test needs
its own verified resource scope and approval.

## Release status

PR #95 merged at `41b7745a5ee075079cef96c6d1fdd6221169d71f`; its code was
verified serving at 100% traffic. The release workflow nevertheless remains
FAILED after route/Queue update errors. See the dated
[production snapshot and release gates](text-first-production-release.md).
No new deployment, provider test, fixture recovery or data/index change is part
of the academic-format/documentation cleanup. Existing exact-SHA CI, separate
owner release approvals and Public-only guards remain mandatory.
