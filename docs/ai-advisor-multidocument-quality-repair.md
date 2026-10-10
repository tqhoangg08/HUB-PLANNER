# PR88: multi-document quality repair — NO-GO production

This follow-up starts at `b82a3f5c5057ebaa6547505a60731e3db873f6cd`.
Keep Draft, production completeness OFF, V2 canary7%. No production/Auth
deployment, migration, index/backfill or original-document modification.
Only the existing isolated `hub-advisor-pr88-app-staging` is used.

## Proven causes and implementation

1. Academic registration milestone queries matched `môn học` and incorrectly
   entered course-catalog context. Explicit policy/milestone classification now
   retrieves official documents. Course-code/catalog/personal timetable paths
   retain their existing classification. The actual page2 date16/11/2026 and
   internship duration12weeks were retrieved and rendered with page2 citations
   on the intermediate clean staging commit `c58b5d6`.
2. Long semantic tuition queries missed page4; short cohort recall recovered it.
   The physical fee table has units/program on page3 and Khóa39 values on page4.
   A topic-only relevance check dropped page4 because it lacks `học phí`; the
   final citation recheck repeated that rejection even after the runtime fix.
   Both boundaries now recognize a literal cohort/major/numeric continuation
   only with an authorized adjacent header in the same document. D1 is still
   rechecked after retrieval/generation/cache. The endpoint regression revokes
   visibility during hydration and proves the answer/citation are not exposed.
   The original PDF was visually compared:25.600.000/year and747.000/credit.
3. Normal DRL table recall in the four-document catalog returned only page2
   fragments. Explicit subject metadata scoping and bounded hybrid table recall
   recover pages2–3; the existing source-dependent table formatter derives100
   and all five maxima from that physical table. No expected numbers/pages are
   injected into retrieval. Missing/contradictory/unclear tables still abstain.
4. Article3 has two independent issues: relevant text was beyond the old1600
   character prefix; a real staging binding then returned
   `SUPPORT_QUOTE_NOT_FOUND` (not authorization denial or output truncation;
   finish reason `tool_calls`,1960input/259output tokens). The exact changed
   word of that binding response was not captured and is NOT VERIFIED.
   Independently inspected indexed OCR has `khiêm tôn`, missing list/word
   characters and `[không đọc rõ]`, unlike the original visual PDF. No fuzzy
   quote matching or source rewriting is permitted. The requested article can
   now be shown as an unchanged, bounded source excerpt with an explicit OCR
   uncertainty warning. This is NOT proof of fully correct article content;
   the strict original content benchmark must still fail if required text is
   not present. Do not equate a citation or HTTP200 with quality PASS.

## Bounds and regressions

- Flag opt-in, defaultOFF. Title scoping uses the authorized active catalog;
  no arbitrary most-recent/topN selection. If titles do not identify a topic,
  search the authorized set instead of guessing a document.
- One search normally; at most two searches for a scoped tuition row plus its
  unit/program header. Each <=10raw chunks, combined <=20, no provider retry.
- At most3retrieved authorized page identities/R2gets,8000chars/page,
 32000bytes/object; current public/nondeleted/completed D1 revision and
  canonical server key required. No corpus-wide R2 scan.
- Same model,temperature0,seed42,300output tokens,6000input characters,
 25second deadline. Exact support matching, numeric/citation guards,
  injection rejection and quota/cache precedence unchanged. Selected-source
  windows preserve original bytes. Answer-path cache version is bumped.
- Source-derived academic dates require the literal semester row; tuition
  requires cohort/major/program/unit/header context, adjacent pages and
  nonambiguous selected cells. Unreadable ordinal is not used as a fee fact.
- Regression coverage includes structured/personal routing, multi-document
  subject choice, private/stale filtering, two-search/three-read bounds,
  conflicting/cohort/program/adjacency rejection, source-dependent prices,
  strict changed-word support rejection, OCR uncertainty preservation and
  final D1 authorization revocation.

## Acceptance procedure and remaining gate

Run the original8 questions plus the4 additional-topic questions through the
normal staging UI on the final clean commit, fresh conversation per question.
Keep all4actual PDFs. Compare facts/pages against the originals; identity and
legal currency remain NOT VERIFIED absent an authoritative source. Record
actual search/generator/R2 counts, wall latency, timeout and provider token
usage. No automatic retries. Final measured results belong in the PR comment
after that run; this document does not predeclare final acceptance.

The Article3 OCR damage is a quality gate even when faithful quotation removes
INVALID_CITATIONS. It must not be masked with a spelling repair in the quote,
manually altered original, relaxed acceptance fixture or guessed legal facts.
Any targeted derivative reprocessing must be separately scoped and verified
on staging; no production data/index change is authorized here.

Production remains NO-GO. Initial release and eventual completeness activation
still need owner approval, migration0054 sequencing, independent CI and the
operational gates in `ai-advisor-release-readiness-review.md`. Rollback remains
flagOFF; current production was never changed by this follow-up. Gemini
intermittent timeout remains a separate unresolved provider risk, not fixed by
OCR/retrieval or by an extractive answer using zero generation calls.
