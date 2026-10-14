# Scholarship UI refinement — 2026-10-14

Refines the existing Canva table/layout on `feature/hub-scholarship-frontend`; Draft PR #94 remains stacked on backend PR #91. API v1.0.0 unchanged. No Worker/Auth Worker changes, remote migrations, real student import, merge or deployment.

## Design and actual browser measurements

Removed DM Sans imports/dependency and all scholarship font-family declarations. Typography comes from HUB Planner global Inter. Opened the live `/admin/ai-documents` page read-only and compared computed styles: Inter; heading 21px/800, body/control 12px, controls about 38.5px at its global scale. Scholarship follows the requested 22–24px/600 title and 12–14px data/form text instead of copying that page's heavier title weight.

| Scholarship element | Computed style / spacing |
| --- | --- |
| Main heading | Inter, 24px/600 desktop, 22px mobile |
| Sidebar | 224px, white, 1px border; title 18px/500 |
| Navigation | 13px/500, 40px height, 8px/12px padding; no icons |
| Labels / controls | 12px/500 labels; 13px/400 controls, 40px height |
| Table | 13px; header 500, cells 400; rows approximately 44px |
| Content / surfaces | 28px/32px desktop padding; 24px header gap, 16px filters-to-table gap; card padding 16px, radius 6–8px |

Removed the uppercase title eyebrow. Semester selector sits next to the header; mobile stacks it above the filters. Major/class filters are temporarily hidden because v1.0.0 does not support global filtering; the remaining search/award controls are functional backend queries. No long help text or fake page-local filters. Names stay merged, score columns remain individually approved and dynamic. Canva table header/striping/borders retained; numbers align right; overflow stays inside the table container.

Shared shell/spacing/fonts apply to Me, Studio and Admin. Reduced heavy font weights and tiny auxiliary text; removed heading icons and large loading/empty illustrations. Studio tools use neutral surfaces; the actual celebration canvas/templates and portrait/export logic remain intact.

## Browser QA

Chrome, actual scholarship Worker handlers + ephemeral Miniflare D1 and synthetic local identity. No outbound production calls from the QA backend.

- Computed Inter verified on title, navigation, labels, controls, table, Me, Studio and Admin. Sidebar/header icons: none.
- Captured desktop **1440**, **1280**, tablet **768**, mobile **390**. Document scroll width equals viewport at all four widths. At 1280 the full approved table needs internal horizontal scrolling; text remains 13px. At 768/390, compact text menu and recipient details replace the desktop table.
- Mobile menu expands in document flow; expanded details contain every authorized class/major/score value.
- Keyboard Tab from search reaches award filter; focus outline computed as HUB blue `#0052cc`, 2px. Contrast checks: body/white 15.74:1, muted/page 4.59:1, muted/white 4.76:1, active link 6.27:1, table header 9.54:1.
- Slow-network browser check showed compact table skeleton. Empty and no-match remain direct table-region statuses, with no decorative illustrations.
- Existing localhost `:3000` returned HTTP 502 (`Dev backend unavailable`): no Worker was listening on the default scholarship origin `127.0.0.1:8787`. This is a connection failure, not prepublication. Other existing dev processes were left untouched.
- Stopped the isolated QA Worker: Vite returned HTTP **502** with Vietnamese connection text. Browser's existing auth bootstrap correctly showed its separate Vietnamese unavailable state. With identity service running and scholarship data returning **503**, the list displayed its own connection alert plus `Thử lại`, not an empty-publication message. Restoring backend data and retrying returned 32 actual synthetic records. Semester control distinguishes loading, load failure and empty publication.

Screenshots: [1440 desktop](screenshots/hub-scholarship/refinement/desktop-1440.jpg), [1280 desktop](screenshots/hub-scholarship/refinement/desktop-1280.jpg), [768 tablet](screenshots/hub-scholarship/refinement/tablet-768.jpg), [390 mobile](screenshots/hub-scholarship/refinement/mobile-390.jpg), [mobile menu](screenshots/hub-scholarship/refinement/mobile-menu-390.jpg), [details](screenshots/hub-scholarship/refinement/mobile-details-390.jpg), [loading](screenshots/hub-scholarship/refinement/loading.jpg), [backend error](screenshots/hub-scholarship/refinement/backend-error.jpg), [Me](screenshots/hub-scholarship/refinement/me-1440.jpg), [Studio](screenshots/hub-scholarship/refinement/studio-1440.jpg), [Admin](screenshots/hub-scholarship/refinement/admin-1440.jpg).

## Validation

- `npm run test:scholarships:frontend`: **18/18 PASS**; new regression exercises 502/503 handling through campaign and recipient clients, preserving error status and hiding technical English.
- `npm run test:scholarships`: **25/25 PASS**, including actual local D1 transactions.
- `npm run typecheck`: **PASS** after correcting an intermediate JSX edit error.
- `npm run build`: **PASS**. Existing large-chunk/Browserslist notices remain.
- Full unrelated project suite was not rerun for this refinement; earlier results are not claimed as new validation.

Portrait upload/crop and live Google/email/OTP authentication are not newly certified by typography QA. The earlier portrait file-access limitation still requires manual verification. Better Auth ownership checks and fresh award verification before export/share are preserved. Overall complete-acceptance `ANTIGRAVITY_READY = NO` until that QA is recorded.

## Reproduce isolated development

Terminal 1:

```powershell
$env:SCHOLARSHIP_QA_PORT='8794'
npm run dev:scholarships:local
```

Terminal 2:

```powershell
$env:DEV_BACKEND_ORIGIN='http://127.0.0.1:8794'
$env:DEV_SCHOLARSHIP_BACKEND_ORIGIN='http://127.0.0.1:8794'
npm run dev -- --host 127.0.0.1 --port 3002 --strictPort
```

Keep the backend running while using localhost. Scholarship routes never fall back to production. This setup intentionally uses synthetic auth/profile responses and empty/in-memory local D1 rather than credentials or remote data.

Pre-existing working-tree edits (API notes/handoff deletion and scholarship logic/accessibility changes) are preserved outside this refinement commit. Existing untracked `docs/ai-advisor-v2/` is untouched.
