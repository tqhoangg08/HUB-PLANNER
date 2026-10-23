# Task 09/10 — School announcements lookup modal

Base: f55e2b3553358858b32cad72a31e1b4aa7a7c0a4. Isolated Vite fixture renders the actual SchoolAnnouncements component under React StrictMode, existing Inter/index.css and shared Overlay. No copied popup markup, auth bypass or production requests. All network reads are fixture GETs; writes are rejected.

## Verified route and release

Browser-mode /dashboard renders Dashboard and SchoolAnnouncements at phone and desktop widths. ProtectedAppRoutes selects the separate MobileHome all-news screen for standalone/PWA; that code is untouched. Release [39901349479](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39901349479) completed successfully on the exact base main, with validate/release-public SUCCESS and postdeploy version ecee213b-dbe8-4ce9-98e8-a8c9a13e184b. This task performs no live deployment or production write.

## Reproduced causes

1. Close target measured about 34px, phone paging about 28.5px; neither meets 44px. Always-expanded dates and a two-row paging footer spend space above/below the list.
2. On page 3, one keyword change causes offsets 20 and 0: the separate debounce calls a closure with the previous page while the page-reset effect fetches again. Both engines reproduce this request sequence.
3. Holding a slow response, finishing a newer search, then releasing the old response replaces newest results with old results in the unmodified base component. Both engines reproduce it.
4. Reducing only VisualViewport to 240px with offset 36 while retaining the layout viewport clips the original footer. Escape does not close the original popup.

## Local implementation

One applied request object owns page/search/dates. Search commits after 500ms together with page 1. Each request has cleanup, AbortController and an active flag so only the current open request may publish results, totals, errors or loading. Paging clamps to 1..totalPages; a no-op page update returns the same request object to prevent Enter/blur duplicates. API parameters and ten items per page remain unchanged.

Shared Overlay still owns portal, background lock, safe-area and VisualViewport. Only its redundant outer portal is removed here. Header/search/filter/list/footer use fixed flex regions and an independently scrolling list. Dates default collapsed below 640px, preserve values, show an active indication and offer clear. Close and paging controls are at least 44px. Phone/coarse-pointer inputs use 16px font locally. Escape, focus trapping and preventScroll return focus belong to this popup.

In a constrained measured panel, a local size container query keeps search sticky while dates scroll below it; header/footer padding contracts without reducing their 44px controls. The query follows actual Overlay panel size, including iOS keyboard changes that do not change height media queries. It avoids global Overlay changes.

## Evidence and reproduction

- *-before-*.png: original component read from the exact base Git object through a test-only Vite transform.
- *-after-*.png: current actual component, without source transforms.
- *-measurements.json: panel/header/filter/list/footer rectangles, complete visible cards, close/paging rectangles, document/internal scroll, API parameter sequence and runtime/write assertions. Counts refer to fully visible cards in the list, not the screenshot as a whole.
- validation.json and committed short logs record final executed results; full local logs stay in .cache.

Run node --test tests/school-announcements-modal.browser.test.mjs with ANNOUNCEMENTS_BROWSER=chromium or webkit, ANNOUNCEMENTS_EVIDENCE_DIR=docs/qa/task09-school-announcements-modal. Set ANNOUNCEMENTS_BASELINE=1 to reproduce the original defects. Browser executables use installed Chrome or Playwright WebKit; no dependencies added.

## Limits

REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED. Chromium mobile and WebKit automation do not certify physical iPhone toolbar/notch/keyboard or native picker chrome. Date value selection/focus/blur is browser-supported automation; keyboard/orientation and safe-area are controlled simulations. WebKit scroll uses keyboard PageDown because mobile WebKit wheel automation is unsupported; Chromium uses wheel and Task 01 regression covers native touch guards. An intentional local 503 tests the error state; its expected resource-load diagnostic is excluded from unexpected runtime errors.

No API/backend/crawler, widget cache TTL, link mapping, department names, MobileHome, Dashboard, timetable, Task 08 dropdown, Overlay foundation, Auth, Cloudflare config, release baseline, workflows, dependencies or production settings change. Full offline suite belongs to final-HEAD GitHub PR CI. No AI/database benchmarks are run locally.

## Executed validation

Chromium **12/12 PASS** and WebKit **12/12 PASS**, covering all nine viewports plus race/loading/pagination, document/internal roots, focus, Escape/backdrop, orientation, date values, simulated VisualViewport and safe-area. No unexpected runtime/React errors or writes.

Announcement API/model/crawler/authority and Overlay unit: **39/39 PASS**. Existing Task 01 browser regression: **13/13 PASS**. Task 08 Chromium browser/PWA smoke: **2/2 PASS**. Frontend typecheck, Cloudflare typecheck and build: **PASS**. Vite reports the existing >500kB chunk warning. Diff check and final-head CI are linked in the PR.

### Observed geometry (CSS px, Chromium)

| Width | Panel before → after | Filter before → after | List before → after | Full cards before → after |
|---|---|---|---|---|
| 360 | 542.8 → 624.0 | 98.3 → 61.0 | 286.4 → 444.7 | 2 → 3 |
| 375 | 559.6 → 651.0 | 97.2 → 61.0 | 305.9 → 471.7 | 2 → 4 |
| 390 | 710.0 → 828.0 | 97.5 → 61.0 | 455.7 → 648.7 | 3 → 5 |
| 430 | 786.0 → 900.0 | 97.7 → 61.0 | 531.0 → 722.0 | 4 → 6 |
| 1440 | 755.1 → 860.0 | 61.7 → 135.0 | 559.7 → 592.0 | 8 → 8 |

These are observed fixture rectangles, not a promised percentage gain. The original opening scale animation can produce fractional sample rectangles. Final close/paging targets are ≥44×44px. Full per-engine rectangles, scroll positions and request sequences are in the measurements and validation JSON.

[360px before](chromium-before-360.png) · [360px after](chromium-after-360.png) · [WebKit 390px before](webkit-before-390.png) · [WebKit 390px after](webkit-after-390.png) · [VisualViewport dates after](webkit-after-visual-keyboard-dates.png).

Helper/cache code and the widget fetch effect are byte-equivalent after LF normalization. Sixteen protected source/config/dependency files match their exact base Git blobs (see validation.json). The only production source changes are SchoolAnnouncements.jsx and its local stylesheet.

Committed logs: [Chromium](browser-chromium.txt), [WebKit](browser-webkit.txt), [original defect reproduction](before-reproduction.txt), [announcement regressions](targeted-announcements.txt), [Task 01 overlay](overlay-browser.txt), [Task 08 smoke](task08-smoke.txt).
