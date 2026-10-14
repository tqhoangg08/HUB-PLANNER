# Compact scholarship UI and combined filters

2026-10-14. Backend Draft PR #91 (`feature/hub-scholarship-foundation`), frontend Draft PR #94 (`feature/hub-scholarship-frontend`). Backend commit: `56e80042b9259c33b60e01aea376cc4ec38c6fd3`. API Contract **v1.1.0**.

## Implemented integration

Top header approximately 52 CSS px: Trở về, existing `/logoapp.png` HUB Planner logo, brand, Better Auth avatar/name or Đăng nhập. Session display metadata comes from the official Better Auth response; role still comes from the verified identity bridge. No Auth Worker changes. Desktop sidebar is 216px, text only, with visible bottom Thu gọn and Mở sidebar after closing; content expands. Inter remains inherited from global styles. Title 22px, table 12px; white/pale blue Canva table header/striping/borders retained, with internal horizontal scroll when the authorized columns need it.

Filter row 1 uses 40/30/30 proportions: search, independent scholarship program/type, independent scholarship rank. Row 2: major, class, cohort and clear. Semester/year remains beside the page heading. Mobile stacks controls and provides expandable recipient details.

Every filter is sent to recipients/search as SQL AND conditions. Search debounce remains 350ms. Changing any condition resets page; URL parameters retain active conditions and unrelated sharing parameters. Clear resets q, all five new filters, legacy category/awardType and page while preserving selected campaign and page-size preference. Changing campaign clears prior conditions. Counts are backend totals; recipient rows are fetched only by page.

Actual dropdown catalogs come from approved active-snapshot facets. Adapter paginates metadata (up to 2000 distinct options per field) without fetching all recipients. Each facet applies other filters; class options depend on program/rank/major/cohort. Pending/unsupported/error controls are disabled and explain their state, rather than pretending to filter. Selected values remain visible when a conjunction becomes empty. Incompatible/malformed/incomplete facet results fail explicitly, with no guessed production catalog.

New source fields and Admin approval choices are separate `scholarshipType`, `scholarshipRank`, `cohort`. Public table/details show them only under source approval; legacy awardType remains a legacy result label and is never used to derive the type/rank. Existing Me, celebration ownership, portrait/PNG and Admin workflows are retained.

## Actual validation

- Backend scholarship/importer/Miniflare tests: **31/31 PASS**. AND combinations, global pagination, Vietnamese search, private/null data, dependent facets/options pagination, abuse validation, rate limits, index query plan, migration compatibility and CSV/XLSX source mappings.
- Frontend/dev bridge tests: **22/22 PASS**. Adds combined query forwarding/reset, metadata pagination/failure and Better Auth avatar/name without role elevation.
- Focused auth UX/private frontend tests: **26/26 PASS**.
- Full `npm test`: **877/877 PASS**, zero failures/skips. Counts: 31 scholarship, 436 advisor, 22 Word, 16 directory, 3 recovery, 6 event DRL, 337 unit, 25 authority, 1 isolated D1.
- Frontend and Cloudflare typecheck, build: **PASS**. Existing large-chunk/Browserslist notices remain.
- Wrangler 4.115.0 isolated worktree migration **local only**: PASS through migration 0057.

Browser QA used the actual scholarship Worker + ephemeral D1 with two synthetic 96-row campaigns, no outbound calls. Identity/avatar responses are local fixtures, not a live Google/email login certification.

- Kế toán + K24 + Khuyến khích học tập + Giỏi returned **24** backend results, two pages. Class facet narrowed to TEST-A1; adding that class reset page 2 to page 1 without losing other conditions.
- Clear restored all source options and removed URL conditions. MSSV 000000000096 (beyond the initial page) returned exactly one result. No-match returned total 0 in the table area. Slow-network typing showed the loading skeleton. Old category links remain legacy awardType conditions; no alias into either new field.
- Anonymous public list works, Đăng nhập appears, Admin navigation is absent. Synthetic authenticated header uses the official-session name/image fields. Sidebar close/reopen and mobile menu exercised.
- True CSS viewport widths **1440, 1280, 390, 360** verified in computed browser state. In-app browser sizing required compensation for its 0.8 pixel scaling; reported dimensions are `innerWidth`, not guessed screenshot dimensions. No horizontal document overflow. Both type/rank controls have identical desktop Y coordinates; mobile stacks them. Header about 52px, desktop sidebar about 216px, global Inter verified.
- Compared screenshots with the previously captured chosen Canva reference: table background, header, alternating rows and thin borders are retained. Required header/navigation/filter rows and additional explicitly approved source fields account for layout differences.

Screenshots: [1440 desktop](screenshots/hub-scholarship/combined/desktop-1440.jpg), [1280 desktop](screenshots/hub-scholarship/combined/desktop-1280.jpg), [390 mobile](screenshots/hub-scholarship/combined/mobile-390.jpg), [360 mobile](screenshots/hub-scholarship/combined/mobile-360.jpg).

## Local startup and remaining acceptance

Terminal 1: `$env:SCHOLARSHIP_QA_PORT='8794'; npm run dev:scholarships:local`.

Terminal 2: set both `DEV_BACKEND_ORIGIN` and `DEV_SCHOLARSHIP_BACKEND_ORIGIN` to `http://127.0.0.1:8794`, then `npm run dev -- --host 127.0.0.1 --port 3002 --strictPort`. Keep the local backend running while using localhost. Scholarship proxy has no production fallback. All sample records are explicitly local/synthetic; no real student file has been imported.

Combined filtering v1.1 integration is ready. Overall `ANTIGRAVITY_READY = NO` for complete scholarship frontend acceptance until the previously outstanding portrait upload/crop QA is recorded. Live Google/email/OTP login and Web Share were not newly exercised. This task leaves those implementations intact and does not certify a production release.

No main merge, deployment, remote D1 migration or Auth Worker modification. Backend branch was merged only into the stacked frontend branch. Pre-existing tracked edits were backed up/stashed, reapplied and kept outside the new frontend feature commit; untracked `docs/ai-advisor-v2/` remains untouched.
