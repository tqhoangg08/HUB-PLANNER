# Independent document-provider policy (PR #88, not released)

Keep the PR Draft and production NO-GO until owner approval. No production
deployment, migration, backfill, reindex or Auth Worker change is authorized by
this document. The five original Word files and active revisions are reused.

## Selection and rollout

`AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED` is a server-only string flag.
Only literal `"true"` enables the policy; missing/false/invalid values disable
it. Repo default is `"false"`. Do not accept body/query/header overrides.

| Request | Policy OFF | Policy ON |
|---|---|---|
| Personal scores/GPA/schedule/course catalog/general | Existing routing | Same existing routing |
| Official-document questions | Existing V2 rollout / Gemini path | Shared Cloudflare completeness path for every bucket |
| Insufficient/invalid/private/stale evidence | Existing safe paths | Safe abstention; no ungrounded provider fallback |
| Cloudflare provider failure | Existing safe paths | Meaningful provider-unavailable response, no fabricated claims |

Personal DRL unavailability and structured zero-AI paths run before this policy.
Turning the flag on does not change `AI_ADVISOR_V2_MODE`, its percentage, or the
deployment completeness flag. It creates a request-local completeness scope
for document questions. Policy requests do not count as selected V2 canary
executions; safe completion telemetry labels `document_provider_policy`.

## Bounds and safety

- Reuse existing authorized D1 catalog, exact metadata/revision post-filter,
  final citation authorization recheck and exact support-span validation.
- At most3 searches,3 R2 reads and1 optional Workers AI generation, no retries
  or second verifier. R2 hydration only for current canonical authorized keys,
  max32000bytes/object and8000characters; no directory/corpus scan.
- Request-local shared30-second I/O/generation budget, plus existing25-second
  generator adapter deadline. In-flight binding calls cannot be cancelled, but
  no subsequent operation starts after expiration.
- Existing quota decision is reused; SURVIVAL/no-generation permission does
  not start retrieval/generation. No new quota bypass or persistent cache.
- Cache scope remains public and revision/config-aware. Completeness and
  incomplete retrieval use separate namespaces; current D1 authorization is
  rechecked before returning cached citations.
- No automatic Gemini/general generation after policy failure. This preserves
  the one-generation bound and avoids the known incomplete legacy response.
  Abstention is the safe fallback. Policy OFF preserves existing legacy paths.
- Technical Word envelopes are display-only transformations; original evidence
  and source bytes stay intact. No fuzzy quotes or invented Word pages.

## Staging verification / immediate rollback

Use only the existing isolated `hub-advisor-pr88-word-staging` resources. Static
Admin-only experiment profiles test the same synthetic authenticated identity
above/below its actual stable rollout bucket threshold, without changing that
identity or persisted flags. This is an isolated routing equivalent, not proof
of two production student accounts at7%. The request scope does not mutate the
active source revisions or index.

```powershell
node scripts/verify-advisor-cloudflare-policy.mjs --profile policy-selected --expected-source <full-SHA>
node scripts/verify-advisor-cloudflare-policy.mjs --profile policy-unselected --expected-source <full-SHA>
node scripts/verify-advisor-cloudflare-policy.mjs --profile controls --expected-source <full-SHA>
```

Each main profile runs the same20 usability and10 acceptance questions through
the real rendered UI, fresh conversation each. Private captures stay ignored.
Fact/source checks are screening only; complete source-specific content/citation
review is required before declaring PASS. Controls cover completeness OFF,
Gemini fault isolation, controlled Cloudflare/Workers faults and non-document
queries. No real provider outage is induced.

Rollback is the literal server policy flag `"false"` (or remove it), leaving
canary7% and deployment completeness OFF unchanged. Do not purge/reprocess
source data to roll back provider policy. Initial release and later flag
activation both require separate owner approval and a Public-only procedure.

## Capacity and unresolved provider gates

When enabled globally,100% of eligible document requests use Cloudflare rather
than only7% selected V2 traffic: potential selected-doc volume factor100/7,
not a dollar-price estimate. Measure actual search/R2/generation counts, cache
hits, abstention, timeout and latency against real eligible-document volume.
Removing legacy Gemini calls can offset some costs; it does not make additional
AI Search or R2 reads free. Provider billing/indexing cost is not inferred from
token counts. No live quota billing integration was added in this task.

Gemini special-plan missing receipt and intermittent provider timeout remain
separate issues. Do not mark a receipt-less document completed or upload an
original source again without approval. Successful Cloudflare answers do not
prove Gemini has indexed it or that legal identity/currentness is established.
