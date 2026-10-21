# Task 06 — Event filter stability

Base: `0d915a4ac65f3a205b3c9020534719eb3101d773`. Local Windows / Node 24.12.0 / Playwright Core 1.62.1. Chromium uses installed Chrome; WebKit uses Playwright's bundled engine. All browser fixtures use real React components under StrictMode, isolated fake identities/events, and intercepted API requests. No production writes or provider calls.

## Reproduced before the fix

See [before measurements](before.json), [real-page tab measurements](before-tabs.json), and the before screenshots below.

- The toolbar used three rows at narrow/tablet widths, and one at 1440px. Main controls measured 38.5px high. Wrapped chips increased the stable result anchor's offset even when result content did not change.
- Editing the sheet keyword applied it after 400ms before Apply; cancelling retained that unwanted keyword. The toolbar and sheet shared the same debounce buffer.
- With the real DRL guide over the filter sheet, Escape closed both dialogs. The sheet's document listener did not defer to the higher overlay.
- The desktop date shortcut returned focus to the generic filter trigger. Ancestor `scrollIntoView` and delayed focus were present, but a background jump from that shortcut was **not reproduced** in the baseline probe; its before/during/after scroll and anchor measurements were equal.
- In both EventsBoard and MobileEvents, applying category II while tab I was active left tab I highlighted. Removing the category chip then silently restored tab I's restriction.
- Viewport QA also exposed a generic mobile-browser `footer { display: block !important }` rule stacking the sheet footer buttons, and the AI launcher's higher stacking order covering part of the footer. These are handled only by filter-scoped CSS.

13px mobile input text was measured. Real Safari focus zoom was **not reproduced on hardware**; 16px text is a narrowly scoped mitigation for filter inputs, preserving desktop sizes.

## Change and scope

The search occupies row one; filters, sorting and actions occupy row two. Narrow widths group Refresh, DRL guide, contribution/add and granted extraActions in “Thao tác sự kiện”, using the same existing sheet and Overlay. No action or filter type is removed. Applied chips retain a 44px strip and scroll horizontally; individual removal and clear-all remain available.

Sheet keyword belongs to the draft. Apply commits it; Cancel leaves applied values alone; sheet Reset changes the draft until Apply. Toolbar search retains its 400ms debounce and merges with current filters despite parent rerenders. Date/sort shortcuts scroll only the sheet content, with immediate lifecycle-managed focus and return to their actual trigger. The local focus/Escape handler defers to a higher overlay. Desktop action nodes remain mounted while hidden at narrow widths, preserving modal return targets after a viewport round trip; existing DRL/contribution focus regressions caught and verified this implementation issue.

Only the two page callbacks synchronize the categorical tab with applied categories, preserving the participated tab and MobileEvents' existing page reset. Filter model functions, requests, caching, permissions, API contracts, admin management, Overlay foundation, Ticket, DRL content, contribution forms and Cloudflare/release configuration are unchanged. Existing DRL/contribution tests only adapt their entry path to the grouped actions; their original content, data, layout, focus and draft assertions remain.

The floating AI launcher/hint becomes invisible and cannot receive pointer events while this sheet is present. CSS preserves mounted advisor/chat state; closing the sheet restores the existing launcher.

## Acceptance and measurements

Targeted execution: **75/75 tests PASS** (5 filter model + 4 overlay unit + 28 filter browser tests + 8 DRL + 10 contribution + 3 catalog + 13 overlay browser + 4 admin UI). Filter browser execution is 13 acceptance tests plus one scroll-measurement test per engine. Lifecycle measurements run separately without rerunning the acceptance matrix. Required sizes: 360×640, 375×667, 390×844, 430×932, 768×1024 and 1440×900 in both engines. The 375px case also exercises height 240px and landscape. Real-page cases cover Guest, Student, Admin, Auditor, desktop and standalone/PWA.

The suite checks two-row geometry, 44px controls, stable result anchor, keyword focus/debounce, all five categories, every registration status and sort, region/type, presets/custom/alternate dates, invalid range rejection, chips/removal, Apply/Cancel/Reset, tab synchronization, PWA pagination, Refresh request, AI/guide actions, Tab/Shift+Tab/Escape/backdrop, nested ownership, internal scrolling, X/Y restoration, footer hit tests, focused input visibility and console/runtime/unexpected write failures.

## Recorded geometry and scroll

Both engines measured the same toolbar/chip geometry below. The after toolbar is 96px (44px + 8px gap + 44px); the complete controls region stays 148px including its reserved chip strip. Active chips no longer increase its height. The main acceptance asserts that the unchanged result anchor moves less than 1px when chips appear.

| Viewport | Before rows / toolbar px | Before wrapped chips px | After rows / toolbar px | After controls px |
|---|---:|---:|---:|---:|
| 360×640 | 3 / 133 | 133 | 2 / 96 | 148 |
| 375×667 | 3 / 133 | 98 | 2 / 96 | 148 |
| 390×844 | 3 / 133 | 98 | 2 / 96 | 148 |
| 430×932 | 3 / 133 | 98 | 2 / 96 | 148 |
| 768×1024 | 3 / 133 | 63 | 2 / 96 | 148 |
| 1440×900 | 1 / 38.5 | 28 | 2 / 96 | 148 |

- [Chromium geometry and applied values](chromium-measurements.json), [WebKit geometry and applied values](webkit-measurements.json).
- [Chromium raw/logical scroll lifecycle](chromium-scroll-lifecycle.json), [WebKit raw/logical scroll lifecycle](webkit-scroll-lifecycle.json): all six sizes record actual before/during/after raw scroll, logical background coordinates, internal roots, anchor and applied/cancelled values. Logical X/Y and anchor are identical before/during/after; raw scroll may become zero while the shared iOS body-fixed lock is active, then restores exactly. The 375px record also saves applied/reset values.
- Keyboard-height acceptance checks header/footer rectangles, close target 44×44, input fully inside the scroller, 15 hit-test points per footer button, and no visible AI launcher. Images were visually reviewed: no clipped input, hidden close button or covered primary action.

During exploratory execution, one WebKit open wait timed out without a repeatable source cause. A separate nested Escape check initially ran before the DRL guide's passive focus lifecycle; the test now waits for focus inside that actual dialog before sending Escape. The final complete 13-test run passes on each engine. No failing assertion or product behavior was removed to obtain PASS.

## Reproduce

Run each browser process sequentially (Windows Chrome default; set `CHROME_PATH` elsewhere):

```powershell
node --test --experimental-strip-types tests/event-filter-model.test.ts tests/overlay-scroll-lock.test.ts
$env:FILTER_EVIDENCE_DIR='docs/qa/task06-event-filter-stability'
$env:FILTER_BROWSER='chromium'
node --test tests/event-filter-stability.browser.test.mjs
$env:FILTER_BROWSER='webkit'
node --test tests/event-filter-stability.browser.test.mjs
# Existing related regression entry points:
$env:DRL_BROWSER='chromium' # repeat with webkit
node --test tests/drl-guide-mobile.browser.test.mjs
$env:CONTRIBUTION_BROWSER='chromium' # repeat with webkit
node --test tests/event-contribution-mobile.browser.test.mjs
node --test tests/event-contribution-catalog.browser.test.mjs
npm run test:overlay:browser
node --test tests/admin-event-management-ui.browser.test.mjs
npm run typecheck
npm run cf:typecheck
npm run build
git diff --check
```

Frontend typecheck, Cloudflare typecheck, build and diff-check **PASS**. Build emits a >500 kB chunk warning; no bundle optimization is included in this task. [Targeted logs and validation summary](validation.txt). Full local suite was intentionally delegated to GitHub PR CI; its run is linked in the PR description for the final pushed SHA.

## Screenshots

| Engine | Before toolbar | Before wrapped chips | After toolbar | Keyboard-height approximation |
|---|---|---|---|---|
| Chromium | [before](chromium-before-toolbar.png) | [chips](chromium-before-chips.png) | [after](chromium-after-toolbar.png) | [240px](chromium-after-keyboard.png) |
| WebKit | [before](webkit-before-toolbar.png) | [chips](webkit-before-chips.png) | [after](webkit-after-toolbar.png) | [240px](webkit-after-keyboard.png) |

Screenshots are local synthetic fixtures, without real user data. The focused-input and footer images are visually reviewed in addition to geometry/hit assertions.

## Limits

`REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`. WebKit automation is not physical iPhone Safari. Height/landscape changes approximate toolbar/keyboard constraints; native keyboard animation, hardware safe-area values and OS date-picker chrome are not emulated. Native date input values and invalid ranges are tested without replacing the native controls. Legitimate changes to result-list height are not classified as a toolbar jump.

No full local suite or unrelated mobile inventory/benchmark is run. GitHub PR validation is responsible for the full suite on the pushed HEAD. No merge, deployment, database operation or production baseline change is performed.
