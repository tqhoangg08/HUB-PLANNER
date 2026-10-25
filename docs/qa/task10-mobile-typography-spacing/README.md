# Task 10 — mobile design QA

Base: `d92dc81c658891cbb0a60a93393dcc7ff41adae5`. All browser requests use isolated local fixtures, actual route components, React StrictMode, and Vite. Chromium mobile emulation and Playwright WebKit are automated browser evidence; **REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED**.

## Reproduced findings

Computed styles, geometry and paint exposed 8–11px copy, navigation labels of 10–11px, undersized actions, and low-contrast metadata. At 200% text, the browser header did not reserve its increased height, profile facts/search results could force overflow, and enlarged PWA navigation collided with a floating AI hit surface. Negative outer tab gutters also overflowed the PWA scroll container. These are measured layout issues, not changes to data or authorization.

The patch keeps the 14px document root, Inter Latin/Vietnamese font files and desktop utility sizes. It adds opt-in mobile roles and 4px spacing tokens. GPA/score/course-code sizes retain their original utility classes. Header and navigation ResizeObservers measure clearance; chat/provider/history behavior is unchanged. Shared Overlay, APIs, auth, routes, storage data, release guards and Cloudflare configuration are untouched.

## Evidence and methods

- `typography-inventory.json`: before/after computed text styles by real route/mode/role.
- `spacing-inventory.json`: actual card/page padding, gaps and boxes.
- `geometry-and-touch.json`: viewport, scroll, targets, shell clearance, overflow and clipping.
- `contrast.json`: resolved RGBA ancestor backgrounds and rendered-paint sampling for gradients/images; unknown paint is reported explicitly, never counted PASS.
- `source-integrity.json`: presentation-normalized AST hashes plus the two reviewed layout measurement effects.
- `validation.json` and logs: exact commands and executed results.
- Screenshots: pinned-main before, final after, browser/PWA, WebKit and enlarged-text examples.

The 320/360/375/390/430px phone, 768/1024/1440px tablet/desktop and 667px landscape matrix checks normal, 200% text and WCAG text-spacing overrides. Each route also runs 320px stress checks. Text resizing doubles computed legacy px text as well as rem roles; this is a text-resize simulation, not a claim about native browser zoom UI. Native pinch zoom remains enabled. Short-viewport form checks wait for the actual Overlay VisualViewport update before geometry/focus assertions.

Interaction tests cover announcement search, keyboard viewport, dismissal/focus/scroll; contribution input state over resize; PWA navigation and end-of-page clearance; AI prompt draft and Ticket form controls without submitting. Existing Task 01/07/08/09 and staff/contribution regressions supplement these checks. The Ticket creation form intentionally has no attachment field; attachments belong to the existing conversation view and API contracts are unchanged.

## Exceptions and limits

- Timetable grids, transcript/data tables and their numeric editors are intrinsically two-dimensional. They retain internal scrolling and their existing numeric/course-code sizing; no page-wide overflow is permitted. This is the applicable reflow exception, not an exception for ordinary copy.
- Inline legal/source links remain inline; disabled controls and decorative separators use their applicable WCAG exceptions. HUB's 44px target is an internal policy; WCAG AA's minimum target criterion has different thresholds/exceptions.
- Pixel paint samples measure the actual visible glyph locations after temporarily hiding text, then restore styles. Covered scroll content may be revealed and re-measured. Offscreen/group-opacity/native control cases remain explicitly unverified until resolved/reviewed; an unresolved record is not a contrast PASS.
- Automated accent/line-height and clipping checks do not certify every Vietnamese glyph or replace assistive-technology testing. Desktop preservation checks and functional regression do not establish site-wide WCAG certification.
- Native iOS picker chrome, Safari toolbar animation, physical keyboard, actual notch safe-area inset and physical iPhone input zoom cannot be proven by browser emulation. Simulated geometry retains the existing viewport/safe-area foundation.
- The pre-existing PWA week-selection behavior is outside typography; no schedule state logic was changed.
- Full offline suite is delegated to GitHub PR CI; no AI/database performance benchmark is run locally.

See [the design standard](../../design/mobile-typography-spacing-standard.md) for tokens, role selection and requirements for future UI changes.

## Final review notes

The deep contrast pass revealed content outside the initial viewport: the inactive month tab, event status/location pills, lost-and-found request actions and a Recharts semester label. Their local foregrounds were darkened. The semester caption uses 12px; numeric axis values keep their original size. Removing the chart's negative left margin keeps its tick labels inside the readable area. SVG paint is measured using its actual fill, with a screen-box fallback for empty SVG text ranges.

For the short announcement panel, larger labels require a full line above the native 44px date fields. Local container styles remove vertical padding only in that constrained state and allow controls to scroll; title, close and paging stay reachable. No Task 09 request/debounce/pagination logic changed.

The existing timetable fixture could observe the initial browser render before standalone selection. It now starts via the existing **localhost-only** `appPreview=1` entry and waits for the expected mode; all behavioral assertions remain. This is test setup, not an app-mode or authentication change.

At 200% text on 320px PWA, navigation labels wrap and the bar grows. Every full label and entry remains reachable, and final-content clearance is tested. The PWA's retained Ticket entry is placed on the opposite side from the default AI entry, with measured independent hit areas. Mobile browser still has its single AI floating entry.

## Reading the validation log

Results are staged: the complete new design matrix is followed by targeted reruns after final local fixes. Intermediate failures remain in the logs, with their replacement proof; no failed composite run is counted as an all-pass run. The final control-state checks include an actual hovered action, focused value/placeholder colours, visible borders and focus indicators. The announcement placeholder improved from 3.38:1; chart labels resolve at 7.58:1. Dense legal/source links and numeric editors are listed separately from the important 44px actions; this report is not a blanket target-size or WCAG certification for every possible application state.

| Representative view | Before | After |
| --- | --- | --- |
| Browser 375px | [Before](chromium-before-375-browser.png) | [After](chromium-after-375-browser.png) |
| PWA 375px | [Before](chromium-before-375-pwa.png) | [After](chromium-after-375-pwa.png) |
| PWA learning | [Before](chromium-before-learning-pwa.png) | [After](chromium-after-learning-pwa.png) |
| Large text | — | [320px / 200%](webkit-after-320-pwa-text200.png) |
| Short viewport | — | [Announcement keyboard](announcement-keyboard.png) |
| Form controls | — | [Contribution](contribution-form.png), [WebKit Ticket](webkit-ticket-form.png) |

At 390px, the browser page title measures 21→26px; PWA supporting home copy 13→14px with line height 17.875→21px; event metadata 11→12px with line height 16.5→18px. Desktop matching uses tag/text/class and duplicate occurrence, avoiding mismatching a GPA headline with the same value in a dense table: 239 matching text nodes per desktop width retain font size and line height.

The last screenshot review reproduced the closed AI launcher (z-index 100001) covering the announcement footer and contribution field (consumer overlay z-index 99999). [Intermediate reproduction](announcement-before-layer-fix.png) is **not** the pinned-main typography screenshot. The final scoped CSS hides only the closed launcher while a shared Overlay owns the screen, using a data attribute reflecting existing `isOpen`. It neither unmounts the advisor nor edits its conversation/provider/API logic or the Overlay foundation. Hit tests now prove that the visible modal buttons/inputs own their centres. Closing Ticket restores the launcher and preserves the existing AI prompt draft; final nested-ownership reruns also pass.

Inventory files use lossless dictionaries to keep evidence small: typography `item[2]` resolves through `textDictionary`, `item[7]` through `fontFamilies`; geometry target `classRef` resolves through `targetClassDictionary`. The encoded inventory was decoded and deep-compared before saving; its expanded SHA-256 is recorded. Contrast proofs keep readable text directly.

The final all-native-control audit found the shared GPA target editor inheriting 12px, despite the page's opted-in fields passing. That editor now uses the mobile 16px/44px input contract and an accessible name; its existing min/max, step, value and onChange formula are unchanged. Its contextual tip uses readable copy and a 44px close target. The forecast labels also wrapped instead of truncating: at 200%, “Hiện tại” had 94px content in 43px and “Trung bình một tín” 216px in 35px. Final Dashboard variants and the focus/Escape/value-preservation case passed on both engines. The input guard now checks every visible native text/number/date/select/textarea control, excluding binary/hidden/disabled controls, rather than relying only on role classes. The closed AI launcher yields while this specific tip is being read, without changing chat state.

[GPA tip at 320px](chromium-gpa-tip-320.png) · [WebKit GPA tip](webkit-gpa-tip-375.png)

The GPA tip is anchored inside the mobile visible area instead of below a low-on-page input. Its close action and full copy stay on screen at 320/375px, with internal scroll available in shorter viewports. Both engines assert the entire tip's bounds, input value preservation and Escape focus behavior. This positioning is local to the tip; desktop keeps its existing anchored popover.

## Follow-up: guest banner action alignment

The reported visual mismatch was reproduced against the committed PR: both button frames were equal, but the login link inherited `ui-meta` at 12px while its neighbour used `ui-action` at 14px. Its text centre was 11.09px above the button centre at 320px. Both actions now use the same action role and flex centering; mobile uses equal grid columns while desktop keeps its existing flex arrangement. No login/onboarding handler or route changed.

Chromium and WebKit tested 320/360/375/390/430/1440px, equal frames and font size, text centering within 2px, >=44px touch areas, overflow and actual /login navigation. See [measurements](banner-alignment.json), [before](chromium-banner-before-320.png), [Chromium after](chromium-banner-after-390.png) and [WebKit after](webkit-banner-after-390.png).

The later owner request to make this pair smaller is covered by [compact guest action evidence](guest-actions-compact/README.md): 32px painted surfaces, 13px labels and independent >=44px mobile hit areas. The initial alignment measurements above remain historical; both alignment and the original handlers are preserved.

## Follow-up: semester header and metric track

[Semester header evidence](semester-header/README.md) covers the five natural-width summary cells, independent horizontal scrolling, removal of the old delete row, native semester selection and confirmation before local draft/staff deletion. Calculations, original handlers after confirmation, permissions and PWA implementation remain unchanged.

The newer supplied mockups supersede that five-cell arrangement with [flat mobile four-column and desktop inline metrics](semester-flat-summary/README.md). The new report preserves prior evidence and verifies the changed presentation against the same business values and callbacks.

## Follow-up: contextual transcript toolbar

The mobile-browser transcript now shows one contextual primary action and an overflow menu; desktop retains direct import and print actions. Save errors and retry are separate from report. See [the focused report, measurements, before/after screenshots and validation](transcript-toolbar/README.md). This later UI change has its own unchanged-handler proof and affected-route regression evidence; the earlier whole-source AST comparison describes its earlier source snapshot.
Latest owner correction: [restore preview blur on actual content](dashboard-preview-blur/README.md), retaining [actual data, no lock/banner, direct login](dashboard-live-data/README.md). The decorative sample content in the [earlier overview report](dashboard-overview/README.md) remains removed; transcript/semester follow-ups stay intact.
