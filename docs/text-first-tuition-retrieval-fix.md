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
4. Rank condition-bearing evidence, deduplicate units, hydrate at most three
   already-retrieved R2 objects. Recheck D1 before every object, including
   completed/public/native status, and require R2 revision/scope metadata.
5. Quote one exact matching row with its actual nearby heading/header. Conflicts,
   uncertain words, negation, additional conditions or unproved program/cohort
   scope abstain. Never substitute another threshold or percentage.
6. Keep the existing numeric/support/source-ID and final D1 citation validation;
   recheck current revision before returning to the client. Logical segment
   ordinals never become physical Word page numbers.

Budgets: at most three Search calls, three R2 attempts, 8,000 evidence characters
per object, and one 30-second deadline shared by search and hydration. No whole
corpus/source-file scan. At most 3 + 5 + 5 raw chunks are considered; this is
condition expansion and source selection, not an assumption that larger topK
proves an answer. If the provider still misses the source, the path abstains.
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
- A new isolated ten-segment synthetic Text-first fixture is awaiting explicit
  owner approval. It must have complete exact-revision receipts before publication
  and must exercise the real binding/publication/citation path. Do not label
  retrieval/answer/citation acceptance PASS until that succeeds.
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

Draft review only. **NO-GO for production** until real Text-first staging source,
answer and citation acceptance passes, exact-head independent CI passes, and
the owner separately approves a Public-only release. This branch must not
merge/deploy production or change flags as part of testing. Existing production
flags remain unchanged. Telemetry permissions/secrets are out of scope.
