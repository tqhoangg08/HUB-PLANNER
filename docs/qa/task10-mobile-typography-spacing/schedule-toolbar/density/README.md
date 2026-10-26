# Compact timetable controls

Immediate base: 1a4eb2b1591f447f66ab7d61708b642c942fe586. Main remains d92dc81c658891cbb0a60a93393dcc7ff41adae5.

## Final presentation

The timetable mode control is now an underline tab strip with no outer frame. PDF/Actions have 32px painted surfaces and 13px/500 labels. Filter/navigation surfaces are 28px; the semester chip is a 24px pill with 11px desktop metadata (12px on phones). Previous/Today/Next share one thin outline; individual arrows, view tabs, clear and class-list actions have no separate frames. The filter count remains a small non-interactive badge.

Desktop targets match their compact controls (32px header, 28px toolbar, at least 24px chip removal). Phones/tablets and coarse pointers retain >=44px hit areas around the smaller painted surfaces. Typography remains relative to the unchanged 14px root; enlarged text may grow/wrap controls. Multi-line mobile plan captions retain enough surface height to display their counts. This is a local density contract, not a claim that WCAG requires 32px controls.

PDF/class-list authorization remains unchanged. Guests see small lock artwork and full-contrast labels instead of a faded button. Disabled attributes, loading/processing guards and all handlers are retained. No login bypass or new API operation is added.

## Evidence

Actual ScheduleBoard/ProtectedAppShell, React StrictMode and isolated API fixtures. [Before desktop](before-1440.png), [after desktop](after-1440.png), [before phone](before-390.png), [after phone](after-390.png). JSON files contain outer target/painted-surface/font/border/opacity measurements for Student/Guest. Browser logs retain real execution outcomes. The fixture's 100px pre-page spacer and trailing content deliberately exercise scroll restoration and are not production whitespace.

All 224 pre-existing top-level initializers are AST-identical. Global typography, PWA/MobileSchedule, Actions-menu implementation, model/cache, Overlay and scroll-lock blobs are unchanged. The navigation cluster selects the existing previous/next week/month function references; a browser regression verifies both directions. Apply, class results and PDF workflows are untouched.

## Validation notes and limits

A concurrent WebKit run timed out at the existing 240-second matrix limit while both engines and TypeScript/build ran. Its unfinished work overlapped subsequent cases, including an overflow assertion. Those results are retained as failures; isolated reruns, not a relaxed threshold, are required for acceptance. An early keyboard check also ran before the menu's animation-frame focus; it now waits for actual menu focus before the same Escape/focus-restoration assertions. Screenshot review caught selector-specificity retaining unnecessary frames; explicit no-frame checks now cover those controls.

The shared Actions trigger's hover/open fill is also scoped to its compact surface, so its transparent mobile hit padding does not become a 44px painted block. Global/shared/PWA styles remain unchanged. Enlarged text and text-spacing checks cover this timetable presentation, not a new site-wide accessibility audit.

REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED. Browser automation does not validate physical iPhone Safari toolbar/keyboard animation or native OS picker chrome. The intrinsic two-dimensional calendar remains internally scrollable. No merge, deployment, production/API/database/workflow/permission or baseline change. Exact final-HEAD full-suite CI is linked in the PR.

[Focused toolbar before](toolbar-before.png) · [Focused toolbar after](toolbar-after.png) · [WebKit phone](webkit-after-390.png) · [200% text](webkit-text200.png). Logs normalize trailing whitespace only. The initial WebKit overflow did not reproduce in isolated reruns; its exact cause was not independently isolated.

Final validation: both engines pass all nine viewport layouts (WebKit isolated), measured Student/Guest density, 200% text/text-spacing and menu/PWA regressions. Week/month previous/next handlers pass on both engines. Models/admin/export/import/lock regressions: 38/38. Frontend and Cloudflare typechecks, final build and diff check PASS. Existing Vite chunk-size warning remains; CI status belongs to the final pushed HEAD PR checks.

Chip removal and clear-all retain 44px-wide mobile/coarse hit areas; both engines explicitly verify them at 320/360/390/1440px for Student and Guest. Below 360px the existing native week/month fallback keeps its 16px input typography and 44px target; tests exercise this visible select and its month/week behavior instead of measuring hidden alternative buttons.

Measured desktop toolbar height: **64→42px**. Header targets/paint: **44→32px**. Toolbar targets/paint: **44→28px**. Current chip paint: **24px**. Control labels are consistently **13px**, weight 500 (selected mode 600); the old desktop rem-based labels were often 10.5px, so the change improves consistency rather than claiming every label got smaller.

On narrow screens a wrapped period caption is borderless so a 28px frame cannot cross its two lines of text. The caption remains within its >=44px interactive target. The final painted-control/target audit was rerun on both engines after this local paint-only refinement.

The nine-viewport scaffold geometry run preceded the last paint-only chip-target/period-border refinements. The final dedicated audit rechecked Student/Guest at 320/360/390/1440px on both engines after those refinements, including all visible chip/clear actions and the native fallback. No claim is made that the entire earlier matrix was rerun for each paint-only adjustment.
