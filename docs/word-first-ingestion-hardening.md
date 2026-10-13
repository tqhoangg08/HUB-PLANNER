# Word-first ingestion hardening — local evidence, no release

## Scope and source identity

Base: `be7b6738138a190230273af90d585af38c18be6a`. All five sources were read
in-place from the owner-selected directory, not Downloads. No original document,
extracted private text, screenshot, credentials or provider receipt is committed.
No Cloudflare API, deployment, migration, indexing or production data operation
was performed.

| Source | SHA-256 | Old local result | New local result |
| --- | --- | --- | --- |
| TABP / special / elite plan 2026–2027 | `a4c353327662c1cf7e0b977edbb041cd286487755a6915b6cdf7d1909c9edfc9` | `DOCX_REVIEW_OR_UNSUPPORTED_STRUCTURE_REQUIRED` | 5 Word units, 18 tables, 112 rows |
| Undergraduate examination regulations | `f3f2921acee27965043216fdcdaf4424d2aded964e6a78ba30b963deb9a7b499` | `DOCX_TEXT_LIMIT` | 52 Word units, 3 tables, 15 rows; 138,835 derived bytes |
| Standard plan 2026–2027 | `308b63dfcc31b4ad3e52320e411a543aef440b600330c2d0c2b6afd06f092d32` | `DOCX_TABLE_MERGE_CONFLICT` | 6 Word units, 16 tables, 68 rows |
| Tuition decision 2026–2027 | `663bf102256fd14ba7fbb2f7200fca24181d4f2005650237ad6d009598aa13df` | `DOCX_REVIEW_OR_UNSUPPORTED_STRUCTURE_REQUIRED` | 11 Word units, 27 tables, 446 rows |
| Student handbook 2025–2026 PDF | `995e3361b7c0e37d76338d53defbb2db2cf74340eecf737a29a327666a899a83` | Client unconditionally rejects 79 > 40 | Real Chrome reader completes 79/79 contiguous physical pages |

Every nonblank `w:t` text node in each of the four original DOCX sources remains
present in the native derivative (exact NFC text, only whitespace/Markdown
escaping normalized for the coverage check). This is a text coverage invariant,
**not** a claim of visual/semantic AI acceptance. Original bytes/hashes remain
unchanged. Table/row counts above come from the actual parser, not fixtures.

The local TABP and standard-plan first errors differ from the owner's observed
production messages. Multiple blockers exist and the parser short-circuits on
the first. The production rejected-file hashes/uploaded parser version were not
read; therefore identical production source/version is **NOT VERIFIED**.

## Root causes and changes

1. `numPr` was categorically rejected. The parser now reads bounded
   `numbering.xml` and `styles.xml`: explicit Unicode bullets and single-level
   decimal labels, actual starts/overrides and style inheritance. Undefined,
   cyclic, complex numeric, picture/font-encoded or linked lists still reject.
   It does not guess list numbering. See [OOXML level overrides](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.leveloverride?view=openxml-3.0.1).
2. Vertical continuation cells containing *any* text were rejected. Only empty
   or exact NFC-equal repetitions of the origin cell are now accepted, at the
   same grid position/span. Different accents, dates, numbers or labels reject.
   Grid offsets/spans are validated before loops. See [OOXML vertical merge](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.verticalmerge?view=openxml-3.0.1).
3. `w:pict` conflated actual images with decorative VML horizontal rules. The
   actual plans/tuition document contain only tightly specified, text-free
   horizontal rules and no media. Only that narrow namespace/shape/attribute
   whitelist passes. Images, textbox content, drawings and other shapes remain
   explicit review errors. Non-PAGE header/footer content is not silently dropped.
4. The 40-unit check mislabeled a 52-unit, 139-kB Word document as a byte limit.
   DOCX units now share a 128-segment revision budget, with separate unit/text
   errors and a retained 6,000-character semantic unit limit. Tables split only
   between complete rows and retain original context/header. Pipeline v2 changes
   index/cache identity; v1 and v2 both retain Word-unit citation semantics.
5. PDF inspection used the OCR 40-page gate **before** quality assessment. A
   revision now permits up to 128 physical pages, retaining 1 MiB aggregate text
   and the 20-MB original-file cap. OCR runs sequentially with one canvas, an
   eight-OCR-page worker batch, initialization/page deadlines and cancellation.
   Inspection is tied to the exact source hash and contiguous physical pages.
6. Readiness read only 50 provider items. It now reads at most three pages of
   50 receipts, requiring every canonical page/unit key with matching revision,
   document ID, visibility and active status. Missing/pending/provider-error
   receipts cannot promote a revision. Gemini completion alone cannot promote a
   partially indexed derivative or downgrade concurrent AI Search completion.
   [AI Search items API](https://developers.cloudflare.com/ai-search/api/items/rest-api/)
   documents paginated item access; no source content is logged by the check.

## Resource/security envelope

- Per revision: 128 objects, 1 MiB total derived text. Sequential R2 put/head:
  at most 256 operations plus bounded failure cleanup; one source hash/revision.
- Readiness: at most 3 index-list calls / 150 receipts per check, no global scan.
- Query-time Search/topK, authorization/revision checks and 3 R2 reads remain
  unchanged. Hydration still rejects objects above 32 kB / text above 8k chars;
  raising the ordinal cap does not authorize a whole-document download.
- Deletion's existing canonical-current-revision cleanup covers the extended
  ordinal range. No new migration, binding, flag, permission or provider retry.
- Tracked revisions, macros, DTD/entities, ZIP traversal, inflate overruns,
  conflicting merges, nested tables and unreadable structures still fail closed.
- Original files are never rewritten; older derived revisions are not reindexed
  or silently upgraded by this patch.

## Actual handbook result and limits

Real Chrome local reader (fresh profile, application APIs/production blocked):
79/79 pages; OCR pages 1,3,4,15,22,33,37,47,57,59,60,64,79; 165,552 derived
bytes; 155,627 ms; 550 uncertain tokens explicitly marked. Original SHA matches;
derived SHA `92d3f04250cbbe0aa02fac6eca4842bfd47d3fbd649e94178a7f5f9c8ef57eff`.

**PASS: bounded preparation without lost pages. NOT VERIFIED: all-page OCR
accuracy, real Cloudflare indexing receipts, chatbot quality on these sources.**
No uncertain word/amount is repaired to force success. Admin must inspect the
uncertainty warning/original before relying on this handbook as an official
source. QR-code/link destinations and text in unsupported DOCX images are not
inferred. The existing isolated OCR-review module is still limited to 40 pages;
this task does not expand or release that separate admin-review feature.

## Reproduction and staged acceptance after owner approval

Local validation on the final product code: focused regression 92/92;
`npm test` 859/859 (zero failures, skips or cancellations); auxiliary security
tests 67/67; frontend/Cloudflare typechecks, frontend/staging builds and diff
check pass. Local R2/SQLite authority tests use isolated test storage.
An earlier full run hit a local Miniflare ECONNRESET; the affected file passed
13/13 independently and the final full run passed without waiving it.
The real Chrome preparation above is reader evidence, not a provider/indexing
or AI-answer acceptance test. Independent GitHub CI is recorded on the PR.

Local, sanitized audit:
`node --experimental-strip-types scripts/inspect-word-ingestion-local.mjs <explicit-directory>`

Local real-PDF browser preparation (no application APIs, no upload):
`node scripts/verify-document-reader-local.mjs <explicit-PDF-path>`

Tests use synthetic OOXML and 79-page descriptors, never internal source files.
They cover 52 units, 27 tables / 446 rows, duplicate merge text, valid/invalid
numbering, actual-image rejection, 79-page contiguous/hash contracts,
pagination/missing/failed receipts, CAS races and unchanged hydration quotas.

Next gate, **not performed**: owner approves isolated staging deployment and
uploads of these exact hashes. Verify all 5 source hashes, derived counts,
per-unit provider receipts (including unit 52 / page 79), revision-scoped runtime
retrieval and source-based citations before any production release. Stop on an
OCR quality mismatch; do not substitute or edit originals.
