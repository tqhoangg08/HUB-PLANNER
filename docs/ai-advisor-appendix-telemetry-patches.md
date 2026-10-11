# PR #88: bounded appendix citation and staging telemetry repairs

Base: `1190fd67975502fad5c0926cbdb6b9a9981cbd69`. Production remains **NO-GO**; PR remains Draft. These repairs do not authorize a staging deployment or another provider/UI acceptance run.

## Patch 1: proof-scoped appendix citations

Root cause: `resolveConductExcerptAnswer` returned a supported paragraph and source IDs, but no `sourceExcerpts`. Citation construction therefore inspected the whole hydrated Word unit, including Article 17 preceding the appendix. Correct answer content could receive the wrong legal locator.

The resolver now carries the original supporting paragraph plus literal, preceding structural headings to citation construction. An appendix resets article/clause scope; a following article resets appendix/note scope. Appendix and note locators are recognized only from explicit source headings, never from the question. Missing headings yield a broad document citation. Conflicting, incomplete or structurally mixed decisive paragraphs remain fail-closed. Source authorization, revision checks and exact grounding are unchanged.

Files: `cloudflare/worker/src/ai-advisor-policy-excerpts.ts`, `cloudflare/worker/src/gemini-file-search.ts` (shared locator extraction only; no Gemini provider changes), `tests/ai-advisor-completeness.test.ts`.

Focused completeness/Word/Gemini regressions: **72/72 PASS**. Includes Article 17 plus appendix in one unit, both affected questions, valid article/clause/table locators, missing/conflicting evidence and stale/unauthorized hydration. Local inspection of the previously accepted native Word extraction also yields Appendix/Notes/Table 3 without Article 17 for both supporting paragraphs. This is **not** a new live UI/provider acceptance result.

## Patch 2: measured staging generator construction

Root cause: staging constructed and injected a generator that closed over the staging AI binding before `measuredChat` installed its request-scoped measured wrapper. The staging adapter saw real provider attempts/usage, but `releaseMetrics` did not.

Staging now injects a validation-failure observer only. `measuredChat` constructs the default generator from the measured binding and passes that observer into the existing adapter. Each real attempt is counted once and only safe, provider-reported usage is added. Failure/timeout without usage remains null, not invented zero usage. Observer failure cannot alter grounding or hide usage. An injected non-Workers provider is not misreported as Workers AI. Arbitrary external prebuilt custom generators are not claimed to be automatically instrumented by this repair.

Files: `cloudflare/worker/src/ai-advisor.ts`, `cloudflare/worker/src/staging/advisor-app.ts`, `tests/ai-advisor-quality.test.ts`, this report.

Focused quality/Workers/Word regressions: **79/79 PASS**. Covers supported/abstaining success, validation rejection, provider fault, timeout, observer exceptions, injected/default paths and no generator. No prompt, identity, raw provider error or secret is added to telemetry. Production's default generator already uses the measured binding; its model, prompt, sampling, deadlines, retries, routing and flags are unchanged.

## Local validation

- `npm test`: **831/831 PASS**, zero failures; the allowed D1 503 baseline did not occur.
- Additional CI roster/schedule scripts: **2/2 PASS**.
- `npm run typecheck`, `npm run cf:typecheck`: PASS.
- `npm run build`: PASS.
- `npx vite build --config staging/advisor/vite.config.mjs`: PASS.
- `git diff --check`: PASS.

These are offline/local tests, not evidence that deployed staging has changed. Independent non-deploy CI must additionally pass on the pushed final head; its run URL/result is recorded in the handoff. Existing missing-image and large-chunk build warnings remain outside this patch.

No deployment, document upload/reindex/edit, migration, production access, main merge or production flag change was performed. Local AI-plan files and private source/test artifacts are excluded from the commits.

## Proposed staging re-test: awaiting separate owner approval

Deploy only the final reviewed SHA to the isolated Word-first staging after checking all D1/R2/AI Search bindings and snapshotting the current configuration/version. Preserve the same five DOCX hashes/revisions and confirm 73/73 real indexing units before and after; no ingestion/reindex. Keep a rollback to the previously accepted version.

Propose **12 turns maximum**, with a new conversation for each:

1. Mini game and outside-school proof in selected/nonselected routing: 4 turns. Verify correct content, exact support and Appendix/Notes/Table locators, never Article 17.
2. Existing accepted article, clause, tuition-table-row and five-group DRL questions: 4 turns. Verify retained correct citation scopes and no content regression.
3. Existing insufficient-source question using one real generator in each routing bucket: 2 turns. Compare safe adapter attempt/usage with `releaseMetrics` exactly once; preserve abstention.
4. Existing staging-only Cloudflare/Workers provider-fault controls: 2 turns. Check safe failure and counters; never intentionally break a live provider. Actual timeout handling is already locally tested and is not claimed live-verified.

Retain the existing per-request caps (at most 3 searches, 3 hydration reads and 1 generator; no automatic retry). This proposes ceilings, not measured use or USD cost. Stop on widespread failure, unexpected usage/binding drift or any production impact. Compare content and UI citations, not HTTP success alone. Report measured latency, search/read/call totals and usage separately; USD cost remains unavailable unless the provider supplies it.

**Remaining gate:** real staging UI/provider verification of these two patches is NOT VERIFIED until separately approved and executed. Do not treat local tests or CI as the replacement for that gate.
