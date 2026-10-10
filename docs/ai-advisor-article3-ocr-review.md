# PR88 Article3 optical investigation — NO-GO

Starting SHA: `3290a6309293d5d352693f3f54dbeeaf24754420`.
Draft/unmerged. Production completeness stays OFF and V2 canary7% unchanged.
Only the existing isolated PR88 D1/R2/AI Search is used. No production/Public/Auth
deployment, production migration/reindex/backfill or source PDF change.

## Visual source comparison

Physical page3 of the six-page learner-conduct regulation was inspected as an
image, not inferred from its hidden text layer. Its attached regulation Article3
has four numbered paragraphs. The issuing decision's separate Article3 is not
the same provision. The original file hash is retained locally; no PDF, transcript,
OCR output, screenshot, raw answer or private state is committed.

Observed indexed errors within the requested Article3:

| Original visual token | Indexed OCR | Effect |
| --- | --- | --- |
| `1.` | `I.` | Wrong list marker |
| `bản thân` | first occurrence `ban thân` | Missing Vietnamese accent |
| `khiêm tốn` | `khiêm tôn` | Wrong word/diacritic |
| `2.` | `[không đọc rõ]` | Ordinal suppressed |
| `định hướng;` | `định hướng:` | Wrong punctuation |
| `phấn đấu` | `phần đấu` | Wrong diacritic |
| `lối sống` | `[không đọc rõ] song` | Missing substantive text/accents |
| `tiết kiệm` | `tiệt kiệm` | Wrong diacritic |

All four paragraphs survive as blocks, but the presence of a heading, citation,
HTTP200, or most words does not establish complete/correct content.

## Proven pipeline causes and limits

`utils/aiDocumentOcr.ts` correctly rejects the full-page scan's old hidden OCR
layer and renders it for optical recognition. It does not blindly accept120chars.
It renders at scale3 with a3200px dimension cap. The actual source raster on page3
is1659x2350; scale3 render is about1792x2538. Resampling changes fine diacritics.
`utils/aiDocumentPageRecognition.ts` uses whole-page automatic segmentation for
non-table pages; headings, stamp/noise and body share that pass. Ruled-table cell
recognition is not applicable to this Article3 prose page.

`serializeOcrLines` preserves words but masks numeric tokens below85confidence
and other tokens below45. This explains lost list numbers/words where recognition
confidence is low. The threshold is not lowered: recognizing an uncertain digit
as a guessed list ordinal would be unsafe. Crucially, high-confidence optical
errors also exist: changing thresholds cannot fix `khiêm tôn` safely.

Twelve bounded local optical variants were tested: original/default vie+eng at
scale3 and300/72 with PSM3/6; official Vietnamese best LSTM at both resolutions/
PSM3/6; a padded Article3 region rotated1degree; threshold160; native raster
region; native-region per-line PSM7 reread. No LLM, dictionary replacement,
accent restoration, fuzzy quote matching or hardcoded regulation answer was used.
These are experiments, **not a new selected production OCR algorithm**.

Against a visually checked local transcription of Article3 (145 exact word/
punctuation tokens), best/native-region variants still have13 token edits;
default scale3 has16; best whole-page scale3 has22; threshold160 has40. These
distances include unreadability markers and punctuation; they are not provider
confidence or statistical corpus-wide accuracy. The region confidence is94 yet
substantive Vietnamese words are still wrong. Thus every variant FAILS exact
Article3 content acceptance. No unverified reading is promoted as authoritative.

Reference for the experimental choices: [Tesseract image quality/segmentation](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html).

## Staging trial, separate from the active revision

The local review preparer reads only named staging D1/R2, binds the original
PDF hash, preserves the exact Markdown serialization of the other five pages,
and replaces page3 only in an outside-Git experimental artifact. The existing
admin-authenticated reprocess rehearsal allocates six NEW page keys/index items.
It verifies the original hash and old page digests and never changes the D1
runtime pointer. Queued/running items are NOT marked completed by the harness.
The read-only verifier checks actual provider readiness and diagnostic retrieval
with the new revision filter. It does not make that trial runtime-authorized.

The trial is a best-model whole-page comparison, not the winning recognizer:
none passed. The live staging UI retains its old revision because the trial is
unreviewed and fails content quality. Do not claim the UI answered from the trial.
Final readiness/retrieval,12-question UI metrics and independent CI are recorded
in the PR conversation after execution on the final committed SHA.

## Minimal code changes

- Local optical diagnostic: page/region/resolution/segmentation/threshold/native
  image experiments with bounded page/file sizes; raw results outside Git.
- Exact OCR comparison/review-draft helpers: no accent folding or automatic
  correction; `pending_admin_review`, approval=false,promotionAllowed=false.
- Isolated trial preparer and read-only revision verifier; no production writes.
- Fixed acceptance-harness weakness: additional-topic fact checks now preserve
  diacritics. Only quoted Markdown line wrapping/whitespace is normalized.
  Previously accent folding could conceal `tôn` versus `tốn`; quotation prefixes
  across line wraps could also cause a false missing-phrase result.
- Focused tests for those boundaries. No runtime validator, prompt, source
  paragraph, OCR default, auth, cache, quota or retrieval budget is changed.

## Controlled Admin proofreading proposal (NOT yet implemented/approved)

1. Admin opens original immutable PDF page beside current OCR/trial. Show raw
   uncertain tokens/list markers, not machine-restored Vietnamese text.
2. Admin transcribes ONLY visually readable content into a separate draft bound
   to original SHA256, physical page, base revision and before/after hashes.
   Unreadable handwritten decision/date remains explicitly unverified.
3. Authenticated backend captures actual admin identity/audit timestamp and an
   explicit visual-review approval. Client-supplied `approved=true` is not proof.
   No autoapproval from OCR confidence, matching two passes, or a model's opinion.
4. Store reviewed pages in a new derived revision; never overwrite source PDF
   or old revision. Index all pages, verify authorization/visibility and real
   provider readiness, then run the question suite against that revision.
5. Explicitly approved CAS promotion must bind old revision/version/source hash;
   concurrent edit/delete/visibility change stops it. Keep old objects for rollback.

Current helpers create review proposals only, not a deployed proofreading UI,
approval endpoint or production promotion authority. Implementing that workflow
needs owner approval for scope and a real Admin content review. The local visual
reference is a verification oracle, **not an approved replacement source**.

## Acceptance decision

Article3 remains **FAIL / BLOCKED on trustworthy OCR or approved proofreading**.
Decision number/legal effect remain two **NOT VERIFIED** cases. Do not force10/10
by correcting source words in the answer, relaxing support/citation validation,
or changing the test's expected legal facts. Keep NO-GO production.
Gemini intermittent timeout remains a separate unresolved risk; none of these
local optical experiments proves it repaired. Currency cost cannot be inferred
from OCR confidence or UI latency. Final measured calls/tokens go in the PR report.
