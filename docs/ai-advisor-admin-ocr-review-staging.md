# Admin OCR proofreading — PR88 staging only

## Decision

**AWAITING_ADMIN_REVIEW / NO-GO production.** No further OCR variants or prompt tuning. The known Article3 spelling/missing-text defect is not declared fixed. The latest measured semantic batch remains **9 PASS / 1 FAIL / 2 NOT VERIFIED** on the previous commit; this feature does not manufacture a new 12-case acceptance result.

The original PDF must be read by a human Admin. Neither this implementation nor a successful unit test constitutes approval of the real regulation.

## Isolated implementation

- `staging/advisor/OcrReviewPage.tsx`: physical-page PDF.js rendering alongside editable draft text; previous/next/page picker/zoom; immutable base OCR shown separately; save, explicit approval, index readiness and separately locked promotion.
- `components/AdminAIDocuments.tsx`: optional review callback used only by staging. Production has no callback and no new review route.
- `cloudflare/worker/src/staging/advisor-ocr-review.ts`: existing Better Auth identity; **Admin only**, including reads. Auditor/user/anonymous rejected. POST requires matching Origin and bounded JSON; unknown approval/actor/confidence/source-kind fields rejected.
- `staging/advisor/migrations/0001_ocr_review.sql`: private drafts and append-only full before/after history. Not in production migration directory. SQL triggers record authenticated actor/time/hash/revision and prevent approved-snapshot/history edits/deletion.
- `scripts/setup-advisor-app-staging.mjs --prepare-review`: explicit isolated database name and non-production UUID checks, applies only this schema. No all-pending migration command.
- `scripts/browser-advisor-ocr-review-staging.mjs`: real staging browser smoke; saves an unchanged OCR draft only, never approves/indexes/promotes. `--manual-review` opens a fresh local browser signed into the existing isolated staging Admin test account, then leaves all review actions to the human and does not capture their edits.

No original PDF, corpus text, credentials, browser state or local plan is committed.

## State and integrity contract

1. Create a draft from the server-selected completed current revision, binding the original SHA-256, base revision/version and every physical page. Original R2 bytes and current D1 pointer remain unchanged.
2. Save uses sequence/hash compare-and-swap. Exact NFC/line-ending normalization only, no spelling repairs. All pages remain present; empty/missing/reordered pages rejected. Full before/after history retained server-side, never telemetry.
3. Human explicitly checks the acknowledgment and clicks **Phê duyệt nội dung đã đối chiếu**. Server verifies Admin session, original source bytes/hash, unchanged base pages/revision/version, current draft hash/sequence. `approved=true` is not accepted. The approved snapshot is immutable; approval allocates a **new** derived revision but never switches the serving pointer.
4. Explicit staging indexing uploads **every page** from the approved snapshot. Unchanged pages retain exact Markdown bytes; changed pages get `extraction: admin_reviewed`, review/source/base provenance and original physical page number. The D1 source-kind enum stays `ocr` for schema compatibility, while the extraction pipeline/review record and per-page metadata explicitly identify human corrections. Automatic OCR is not relabeled as reviewed.
5. Actual provider `completed` status, exact canonical page keys and metadata are required for **all** pages. Upload accepted/running is not ready. Provider failure records `index_failed`; old runtime continues. Explicit retry reuses only this immutable revision's verified keys. A Worker interrupted while `indexing` is a manual operational recovery condition, not automatically retried.
6. Promotion is a **different** action and requires `STAGING_OCR_PROMOTION_ENABLED=true` after separate owner approval. Default/config remains **false**. Reverify original, base page hashes, approved page hashes and full provider readiness; atomic D1 compare-and-swap switches only this staging document. Original and previous derived R2/index objects remain for rollback. No production promotion route exists.

The review API caps 40 pages, 100KB/page draft input, 1MB draft JSON and 1.1MB request body. Corrected Markdown must fit the existing runtime's 8,000-character/32,000-byte per-page hydration limits. Runtime retrieval still max3 R2 page reads; review/index actions have separate bounded Admin-only work. No generator/search calls occur merely to view/save/approve; indexing incurs provider embedding charges, not measured until human-approved indexing occurs.

## Human handoff

Staging: https://hub-advisor-pr88-app-staging.tqhoangg2.workers.dev

No production account/password should be used here. The existing staging test identity is separate from production. Its authenticated account ID is recorded privately in audit; this is **not** an attestation of a production Admin identity or legal authenticity of the document.

If the browser has no staging session, from `D:\Projects\HUB-PLANNER` run:

```powershell
node --experimental-strip-types scripts/browser-advisor-ocr-review-staging.mjs --manual-review
```

This reads ignored local staging credentials without printing them and opens only the isolated test app. It does not approve anything and does not use production cookies.

1. Open **Hiệu đính OCR** for *Quy định thực hiện quy tắc ứng xử của người học*; choose physical **page3**. Review the original at readable zoom.
2. Create a separate draft or open the saved unapproved draft. Correct only text actually legible in the PDF, including accents/list markers/missing phrases; keep unreadable information explicitly unresolved, never guess decision number/effectiveness.
3. Save the draft, inspect all changed pages, then explicitly approve the saved content **only if personally satisfied**. Do not give the agent permission to impersonate this review.
4. Click **Lập chỉ mục toàn bộ trang staging**, then **Kiểm tra trạng thái thật**. Wait until every real page is completed. Never infer readiness from HTTP200 alone.
5. Stop before promotion and request a separate owner approval. Only after that approval and safe promotion should the agent rerun all12 UI questions, each a fresh chat, against the unchanged four-document corpus.

Citation acceptance must use original physical page3 and corrected-source provenance, not fabricated locators. Decision identity/current legal effect remain NOT VERIFIED absent authoritative source.

## Validation and remaining gates

Regression tests use synthetic fixtures, real SQLite constraints/triggers and simulated provider states; they are **not** real-regulation content acceptance. Real browser smoke checks the existing PDF/OCR on staging, responsive layout, draft persistence, anonymous protection and client approval rejection; never real approval or promotion.

Independent PR CI runs targeted/full tests, both typechecks, production and isolated staging builds and diff check, with no deployment credentials or deployment jobs.

Pending: actual human proofreading/approval, new revision provider completion, separately approved staging promotion, corrected citations and 12-case semantic rerun, latency/token/cost measurements. Gemini timeout remains a separate unresolved risk. Production remains untouched, canary7% and completenessOFF; PR remains Draft/unmerged.
