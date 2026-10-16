# HUB Scholarship — Canva frontend handoff

2026-10-13. Branch: `feature/hub-scholarship-frontend`. Draft PR #94 remains stacked on backend Draft PR #91. API contract remains **v1.0.0**; no Worker, Auth Worker or migration changes.

## Reference and visual comparison

Official design: https://preview.canva.site/e607aef2-73a4-404f-b644-fd70ee530fb1/canva.hotrosinhvienhub.id.vn/giao-di-n-qu-n-l-h-c-b-ng

Compared live Canva and the owner's saved HTML codelet (`Giao diện quản lý học bổng_files/index.html`) directly against the React UI, after Canva's DM Sans font loaded. Canva's sample student records are reference artwork only and never enter the application or local seed script.

| Element | Reference values / intentional adjustment |
| --- | --- |
| Sidebar | White, 246 CSS px, 30/16 px padding, pale blue active link and blue inset line. Required navigation; Admin link only when authorized. |
| Content | 36 px top padding, horizontal `clamp(20px,4vw,62px)`, max width 1260 px. |
| Typography | Bundled DM Sans 400/700 and Latin extended coverage. Heading 30 px, body 15 px, table 14 px; native select 14 px Arial, matching the codelet. |
| Colors | Background `#f8fbff`, navy `#172338`, muted `#64748b`, blue `#2563eb`, borders `#e2e8f0`, header `#f1f6fd`. |
| Spacing | Heading bottom 24 px; 28 px to filters; filter padding 20 px, gaps 16 px; 20 px to table. Extra semester/year row is required functionality. |
| Inputs | Minimum 44 px height, 9 px radius, `#cbd5e1` border; container radius 13 px. |
| Table | Plain white/pale blue alternating rows, thin borders, 13/11 px cell padding; no badges/icons or inferred classifications. Merged accurate full name. |
| Responsive | Tablet sidebar 214 px; compact menu below 781 px. Mobile filters stack and recipients use native details, without shrinking the desktop table. |

Screenshots: [Canva](screenshots/hub-scholarship/canva-reference.jpg), [desktop](screenshots/hub-scholarship/desktop.jpg), [tablet](screenshots/hub-scholarship/tablet.jpg), [mobile](screenshots/hub-scholarship/mobile.jpg), [Admin](screenshots/hub-scholarship/admin.jpg).

Different screenshot device scaling is not a CSS design change. Required navigation, wording, semester picker and merged full name explain layout differences. No hero/KPI/gradient/confetti added to the list. Application screenshots use synthetic local data only.

## Functional integration

- Combined list/search at `/scholarships`; old `/scholarships/list` and `/scholarships/search` redirects retain queries. Existing rule page: `/handbook/scholarships`.
- Campaign picker fetches every page, including more than 50 campaigns. URL state retains unrelated parameters. Debounced search, cancellation and response guards prevent stale results. Pagination is bounded and corrected when results shrink.
- Actual campaign/summary/recipients/search APIs provide server search, exact award filters and global counts. Columns use individually approved `Campaign.scoreColumns`; names remain `fullName`, missing values an em dash, textual scores unchanged.
- `/api/me/scholarships` provides server-verified ownership; public results cannot select personal awards. Login return permits only same-origin scholarship routes, preserving the existing registration gate.
- Studio retains portrait selection, crop controls, four templates and Story/Feed PNG. Export/share fetch fresh verified awards and draw refreshed fields; removed publication/ownership denies export. Object URLs and pending requests are cleaned up. No server image upload introduced.
- Admin approval reads the selected candidate receipt checksum/mapping, including source-specific score keys. Approval requires a valid candidate/state/confirmation. Campaign changes clear old preview/approval; history requests cannot mix campaigns.
- Development scholarship proxy accepts HTTP loopback only, with no production fallback. Existing `/api/user/v1` routes are classified so development profile bootstrap reaches the configured backend.

### Required backend follow-up: global major/class filters

Contract v1.0.0 does **not** accept `major`/`className` filters on recipients/search. Canva controls are disabled with a clear explanation; there is no filtering of the current 20 rows.

Backend owner should implement optional exact `major`/`className` filters on both endpoints, combined with `q`/`awardType`, with matching `total` across the active approved snapshot. Add authorized bounded filter-option retrieval for the whole snapshot, with pagination if needed. Never expose unapproved fields. Specify null handling, query rejection and limits in a versioned contract before enabling the controls. Frontend does not change the Worker to invent support.

## Safe local development

Node 22+ and installed dependencies required. Terminal 1:

```powershell
$env:SCHOLARSHIP_QA_PORT='8794'
npm run dev:scholarships:local
```

Terminal 2:

```powershell
$env:DEV_BACKEND_ORIGIN='http://127.0.0.1:8794'
$env:DEV_SCHOLARSHIP_BACKEND_ORIGIN='http://127.0.0.1:8794'
npm run dev -- --host 127.0.0.1 --port 3000 --strictPort
```

Actual Public Worker + ephemeral Miniflare D1, scholarship migrations only, synthetic identity service. Two campaigns of 32 test records are created through preview/apply/explicit approval/publish. Outbound requests denied. Auth/profile responses are local fixtures, not live login verification. The incompatible old SQL seed is removed.

Ignored `.cache/scholarship-qa-state.json`:

```json
{"identity":"student","data":"published"}
```

Identity modes: `anonymous`, `student`, `admin`, `unverified`, `no-award`, `failure`; data modes: `published`, `empty`, `failure`. Reload after identity changes. Nothing enters the production bundle or remote/persistent D1. Other APIs intentionally return 503 in this isolated server. This is not a real login service.

## Actual validation ledger

- `npm run typecheck`, `npm run cf:typecheck`, `npm run build`: **PASS**. Existing Vite large-chunk/Browserslist notices remain.
- `npm test`: **871/871 PASS**, zero failures/skips: 25 scholarship, 436 advisor, 22 Word, 16 directory, 3 auth recovery, 6 event DRL, 337 unit, 25 authority, 1 isolated D1. Includes actual local D1 scholarship transitions; rerun rather than inherited PR claims.
- `npm run test:scholarships:frontend`: **17/17 PASS** (API/URL/approval/identity models and dev proxy).
- Focused auth UX/private frontend tests: **26/26 PASS**.
- Browser using actual local scholarship Worker/D1: list (32), page 2 (rows 21–32), record 32 search beyond page one, global award filter (21), semester change, no match, prepublication empty, backend 503/retry, verified/unverified/no-award/anonymous states, Admin-only navigation/denied student access, dynamic approval mapping, old-route redirect/query preservation.
- Desktop 1600 CSS px, tablet 820, mobile 390 captured. Tablet/mobile document width equals viewport width. Mobile menu and recipient details exercised.
- Feed export downloaded `HUB-Scholarship-000000000001-feed.png` (916529 bytes); signature/IHDR verify **1080×1350**. Story canvas verified **1080×1920**. Download-event observer timed out, but actual file and UI success were independently verified.

## Remaining QA and readiness

Portrait selection is blocked by the Chrome extension's disabled access to local file URLs. Upload-with-portrait and drag/zoom crop are **not** browser PASS. File validation, stale-image protection and URL cleanup reviewed in code; manual verification is required with extension file access enabled. Live Google/email/OTP login was not exercised; identity QA uses the documented local service fixture. Web Share was not invoked.

`ANTIGRAVITY_READY = NO` for complete frontend acceptance until portrait upload/crop QA is recorded. Implementation is available for review; major/class filters are an explicit backend follow-up permitted by the design task. Backend integration readiness remains as recorded in its own handoff. No production release approval.

No main merge, deploy, remote D1 migration, real student import or Auth Worker change. Pre-existing untracked `docs/ai-advisor-v2/` untouched.
