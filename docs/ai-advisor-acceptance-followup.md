# PR88 acceptance follow-up after 7c6521f

No OCR algorithm, PDF, production index, Auth Worker, canary percentage or unrelated feature changed. Keep PR Draft. The final eight-question UI run is performed **after creating this commit**; its exact commit SHA, measured per-case results and verdict are posted in the PR follow-up comment, not guessed here.

## Verified causes

Two real provider probes against the isolated app index reproduced `supported=true` with `INVALID_GROUNDING`. Mini-game retrieved pages4/2/5, not14; its74-character support span did not occur in sent evidence. Outside proof retrieved5/2/5; two spans matched, one99-character span did not. IDs were authorized and factual-number checks passed. Rejection was exact quote validation, not authorization denial.

The isolated index has14/14 completed Items, including14, with current revision. Its server-owned R2 page14 returns200 and contains both decisive notes. Expanded vector10 missed14; hybrid plus reranking recovered mini-game but dropped14 for outside proof. Hybrid lexical topic queries **without reranking** recovered14 in both. Readiness alone did not prove recall.

With recovered evidence, the unchanged generator produced an exact mini-game quote. Outside proof still failed: the generator changed an OCR word in its214-character quote (`thảm` to `thẩm`). NFC/whitespace equivalence cannot safely accept a word substitution. Validation remains strict.

## Repairs and guards

- Main Public Worker factory now supports `AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED="true"`. Missing/false/other values disable it. Repository default is **false**. Staging enables the same factory and R2 reader, not a separate hydration implementation. Flag does not select canary users or alter rollout mode/7%/legacy fallback.
- Conduct tables retain one vector10+rerank search. Mini-game/outside-proof use one hybrid10/no-rerank lexical topic search. Ordinary questions retain vector3. Threshold0.4 unchanged. Queries contain no expected verdict, point values or hardcoded page numbers.
- Extractive formatter selects an intact, decisive, unambiguous paragraph from retrieved authorized evidence and renders it unchanged with source/page citation and currentness limitation. No source means no answer. Missing conditions, truncated paragraphs, uncertainty markers and conflicting paragraphs do not qualify. No model paraphrase is treated as support. OCR text is explicitly presented as OCR with a direction to check the original PDF; no word repair is performed.
- At most10 raw results,3 authorized pages,3 R2 gets,32000 bytes/object,8000 characters/page, page1–40. R2 reads require already-retrieved identity, current public/not-deleted/completed D1 revision and exact canonical key. Oversized streams cancelled. No all-corpus R2 scan, client URL/key/filter or authorization expansion.
- Existing generator6000-character aggregate budget, model, temperature0,seed42, support validator and deadlines unchanged. No automatic V2 retry/second verifier.
- Quota SURVIVAL still short-circuits. Answer/retrieval keys distinguish flag policy and actual derived revision. Optional extractive answer caching120s; warm answer hit avoids search/AI/R2. No new production cache backend. Final D1 citation authorization still runs before response.
- Focused real UI probes before final OCR-transparency wording: mini-game4502ms; outside proof3818ms; both1 search/0 generator/3 R2 reads,1 citation at14,normal UI. These are not substituted for the final eight-case run.

## Separate Gemini controls

Direct REST against isolated test store/current app document ID; configured model`gemini-3.1-flash-lite`,2048 output cap/minimal thinking,30s deadline,no retry:

| Control | Duration | HTTP | Authorized sources | Grounded | Input/output tokens |
|---|---:|---:|---:|---|---:|
| Plain/no retrieval |12182ms|200|0|No|69/120|
| File Search mini-game |15904ms|200|1|Yes|69/115|
| File Search outside proof |7473ms|200|2|Yes|63/358|

These3 calls expose794 tokens total. Billing/internal search/rerank costs NOT MEASURED. No timeout reproduced in this batch; intermittent historical30013ms File Search timeout is **NOT proven fixed or root-caused**. REST controls do not reproduce every SDK/network condition. Regression proves failing Gemini cannot break an extractive V2 answer; nonselected canary still uses legacy and safely reports provider timeout without fabricating content.

## Catalog and0054

Read-only production confirms11 records,10 active PDFs,1 deleted record. Deleted record is not restored; intended eleventh PDF needs owner reconciliation. No production source/index changes.

Staging contains all four0054 columns. SQLite migration/readiness tests prove additive schema and independent Gemini/AI Search states; compatibility test covers pre0054 fallback. Production read-only schema has0/4 columns. **No production migration applied.** Future approved release requires0054 before derived revision/readiness use and a separately authorized side-by-side reprocess/index promotion. Upload code alone does not backfill old PDFs. Only one actual PDF has this staging E2E coverage.

Production snapshot: Public`9bcf3e62-00db-4794-8020-4c4891929896`@100%,canary7%,completeness flagunset/off,homepage200,anonymousAdvisor401. No production chat question, D1/R2 write,index sync, Public/Auth deployment or main merge/push.

## Final acceptance interpretation

Browser runner records exact Git HEAD and fresh conversation per question. Cases1/3/4 require all five source-derived maxima andpages2+3;5/6 require decisive actual content andpage14;7 safely denies unavailable personal score. Cases2/8 remain **NOT VERIFIED** for decision identity/legal currency without independent metadata. HTTP200/citation alone never becomes content PASS. Final measured results and full validation counts are posted to PR88 after this commit, without a source-code change.

Original PDF, Markdown, raw provider responses, credentials and screenshots stay excluded. Focused regressions cover retrieval/auth/size/read/cache/quota boundaries, source paragraphs, fake/missing/unknown quotes and Gemini failure isolation. No private corpus or original PDF is committed.

Rollback: flag default-off; future approved rollout can disable it while retaining7%canary/fallback. Staging can redeploy prior isolated build. Production needs no rollback here because unchanged.

Skills: Cloudflare/Workers best practices/Wrangler for isolated bounded bindings; PDF for original-page14 visual comparison. API references: [AI Search](https://developers.cloudflare.com/ai-search/api/search/rest-api/), [R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
