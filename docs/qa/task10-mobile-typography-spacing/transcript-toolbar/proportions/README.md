# Transcript proportions

This follow-up preserves the responsive toolbar, contextual primary action, overflow menu, draft/save/import/report/print behavior and separate retry alert. It changes local presentation only.

| Element | Mobile browser <768px | Desktop >=768px |
| --- | --- | --- |
| Transcript heading | 18px, 600 | 20px, 600 |
| Semester selector | 16px, 600 | 17px, 600 |
| Toolbar label | 14px, 600 | 14px, 600 |
| Toolbar height / overflow square | >=44px / 44×44px | >=40px / 40×40px |
| Icon / action gap | 16px / 8px | 16px / 8px |

Computed baseline at `a35a420455c48afebfe4a31d58148e29bb0438eb`: the heading was 16px/700 on mobile and 20px/700 on desktop; labels were already 14px/600; icons were 18px; desktop and mobile controls were 44px. The semester selector was 16px/700 on mobile and 15.75px/700 on desktop. The new desktop 17px semester role follows the requested 17–18px range, with a lower weight and clear separation from the main 20px heading. Screenshot pixel scaling is not used to infer CSS font sizes.

The implementation uses existing rem-based role tokens, scoped CSS, and an extra class on the actual semester selector. Mobile native fields retain their 16px input role. No fixed text height or zoom prevention was added. At narrow widths an empty-state heading can wrap while the two actions stay on the same row; readable text and the 44px contract take priority over clipping.

Chromium 155 and WebKit 26.5 each passed **6/6 tests**: responsive populated toolbar; proportions in empty-semester and editing states; draft/save failure/retry/cancel; existing import confirmation/callback; actual student Dashboard and guest Dashboard with 320px reflow, 200% text and text-spacing overrides. Geometry covers 320/360/375/390/430/768/1440px; empty/edit states cover 320/375/390/430/1440px. Assertions check computed sizes, weights, icon boxes, 8px action gaps, per-breakpoint target dimensions, action counts, no page overflow, menu keyboard/Escape/focus behavior, and no runtime warnings/errors or unexpected fixture writes.

Frontend typecheck, Cloudflare typecheck, build and diff check passed. Build retains the existing large-chunk warning. The existing model/PDF/Overlay tests from the preceding commit are historical evidence; this presentation-only follow-up relies on the final PR CI for the full suite.

| View | Evidence |
| --- | --- |
| Prior mobile proportions | [390px before](before-390.png) |
| Empty transcript | [390px](empty-390.png), [desktop](empty-1440.png) |
| Editing | [390px](save-390.png), [desktop](save-1440.png), [WebKit 375px](webkit-save-375.png) |

[Measurements and source proof](validation.json) · [Chromium log](chromium.log) · [WebKit log](webkit.log) · [Typecheck](typecheck.log) · [Cloudflare typecheck](cf-typecheck.log) · [Build](build.log).

Actual Dashboard AST equality after removing presentation-only `className` attributes is checked against the previous commit. The toolbar interaction component is byte-identical. PWA, APIs, save callbacks, PDF output, business data, auth, permissions, Overlay and production are unchanged. Browser emulation is not physical iPhone acceptance: `REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`. No merge or deployment.
