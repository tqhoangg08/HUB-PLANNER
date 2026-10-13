# HUB Scholarship — API Contract v0.1 / Frontend Handoff

Branch: `feature/hub-scholarship-foundation`. Source of truth: `cloudflare/worker/src/scholarships.ts` + migration `0055_scholarships.sql`.

## Release status
- Foundation only. NO production deploy or remote D1 migration.
- No official award file imported. There must be NO demo student records in production.
- This version includes public reads and own-awards read ONLY. Admin import/approval endpoints are not implemented yet. Public endpoints return only campaigns explicitly marked published + approved.
- All score fields are based on the school's approved public dataset, not a computed forecast or historical ranking benchmark.

## API

### `GET /api/public/v1/scholarships/campaigns`
Response: `{ campaigns: [{ slug, title, schoolYear, semester, sourceTitle, sourceUrl, publishedAt }] }`
Unauthenticated. Empty array is a valid "coming soon" state.

### `GET /api/public/v1/scholarships/:slug/summary`
Response: `{ campaign, totalRecipients, totalStudents, awards: [{awardType,count}] }`.
404 if unpublished/invalid campaign.

### `GET /api/public/v1/scholarships/:slug/recipients?page=1&limit=20&awardType=...`
Response: `{ campaign, recipients, total, page, limit }`.
Recipients: `{id, fullName, studentCode, className, major, awardType, gpa, trainingScore, selectionScore}`. Score fields are null when not approved for public display. Maximum limit 50. List ordering follows original source row order.

### `GET /api/public/v1/scholarships/:slug/search?q=...&page=1&limit=20&awardType=...`
Same response as recipients. Min query length 2, max 80. Student ID search uses prefix. Name search uses `full_name_search`, expected to be pre-normalized lowercase Vietnamese with diacritics removed and đ → d by admin import. Initial matching is **prefix**, not arbitrary substring/fuzzy; frontend should accurately describe this.

### `GET /api/me/scholarships`
Authenticated same-origin session required. Response `{verified: boolean, awards: [{id,fullName,awardType,gpa,trainingScore,selectionScore,campaignSlug,campaignTitle,schoolYear,semester}]}`. `verified=false` means current session has no verified student-code match — not "no scholarship". The identity is resolved server-side via Better Auth and school's verified student email; browser cannot submit a student code to claim an award. `verified=true` with empty awards is "no matching published awards".

## Design and UX — Antigravity ownership
Implement React 19 + Tailwind 4 UI in a separate frontend branch after reading actual routing + shells. Pages:
1. `/scholarships`: navy/gold landing, published campaigns or "coming soon".
2. `/scholarships/list`: full paginated responsive list, semester/campaign selection, sortable only by supported API ordering until backend allows other sorts.
3. `/scholarships/search`: non-login search by name/student code; show source and publication status; multiple matches.
4. `/scholarships/me`: login-gated, verified own-award status; no third-party claim.
5. `/scholarships/celebrate`: only render verified award selected from `/api/me/scholarships`; no client-provided student-code override. User uploads portrait locally to browser, crop/zoom, export 9:16 and 4:5 PNG with verified student + award information. Do not upload/store image on backend in MVP. Disable celebration for non-verified and empty award set.

Frontend may ship mock fixtures for local development but must clearly label as mock and never show fictitious awards on production. Preserve existing navigation, mobile shell, and auth flows. Avoid direct edits to D1, Worker, migration and Auth Worker. Interface should work with empty campaigns, expired session, missing scores and network failure. No public "celebrate this person" button that authenticates by mere search result.

## Codex follow-up ownership
- Admin-only import preview/apply, validation, SHA-256 checksum, row-count and duplicate checks, audit, approval/publish/unpublish and rollback. Explicitly confirm the school allows republishing each field including scores.
- Authorization: ONLY admin can publish; auditor read-only by explicit capability if needed. Concurrency and transaction safety for publication.
- Add comprehensive Worker tests (mock D1 and Auth): unpublished never exposed; public-score approval gates; query validation; no cross-user claims; unverified email; pagination; duplicate awards per student; database unavailable; unauthorized methods.
- Potential future safeguards: query rate limits, quality measurements, no PII in logs, privacy review.
- Integrate frontend through PR after contract agreed; typecheck/build/full test in local CI. Do not deploy automatically via coupled Auth+Public workflow. Never represent this branch as production-ready until tests and admin pipeline are complete.

## Data source mapping
`scholarship_campaigns` stores source and publication controls; `scholarship_recipients` stores original source_row_number, recipient code, published scores, award type; `scholarship_import_batches` preserves import metadata; `scholarship_publication_audit` records actions. No import is provided or auto-populated; the authoritative source is the forthcoming official publication and a reviewed import, NOT `semester_exact_rankings.scholarship_status`.
