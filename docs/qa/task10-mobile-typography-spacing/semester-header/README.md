# Semester heading and five summary cells

This report describes commit `0f1f62bcef5a509c0dce9dcd45dd7013a2cfcbdd`. The owner's newer desktop/mobile reference replaces the five-cell scroller with [the flat four-column/inline summary](../semester-flat-summary/README.md); historical screenshots and measurements here remain preserved.

The actual browser Dashboard previously placed credits, GPA4, GPA10, ĐRL, scholarship status and the delete button in one wrapping container. At 390px the empty-semester header measured **175.25px**; at 320px **158.25px**. The taller 390px case resulted from its particular wrapping pattern, rather than a fixed panel height.

Delete now sits in the heading beside the existing semester-picker chevron. That chevron is a native selector, not an accordion; its selection/change behavior is retained. The native select has an accessible name and a wrapping visible caption with the same 16px mobile / 17px desktop typography. This avoids clipping the semester name when the delete target takes space. Read-only/edit guards and classification remain intact.

The **five metrics** form one horizontally scrollable track, with natural content widths, 8px gaps and no wrap. Font sizes are preserved: mobile metadata remains 12px; the native ĐRL field remains >=16px and wide enough for `100` plus its browser affordance. Cards share a row height; they are not forced to equal widths. Only the metric track scrolls horizontally. Forecast/ranking entry stays outside that track and its existing portal/logic is unchanged. The header has content-sized height, 8px vertical padding and no separate delete row or artificial minimum panel height.

New measured empty-header heights: **115px at 390px**, **124.78px at 320px**, **53px at 1440px** (desktop before: 63px). The narrower heading wraps full text instead of reducing font size. Native select/delete/input touch minima are functional space, not a blank spacer row.

The original `useStudyActions` removal path already confirmed deletion. The local draft/staff branches in Dashboard bypassed that hook, so they now use the same native confirmation text before the existing mutation. Cancelling leaves the draft unchanged; accepting removes it from the draft; discarding edits restores original semester/score data. The existing fallback hook confirmation is retained without double prompts. No mutation payload, save ownership or permissions change.

Chromium 155 and WebKit 26.5 each passed **4/4 targeted tests**: compact geometry and independent metric scrolling; native selection/ĐRL/deletion confirmation; actual student Dashboard and guest Dashboard with 320px reflow, 200% text and text-spacing overrides. Geometry covers 320/360/375/390/430/768/1440px. The action case also resizes to landscape 667×375, preserves ĐRL `100`, verifies cancel/confirm and restores the original draft state. There are five same-row cells with unclipped internal content, unchanged fonts, no page horizontal overflow, no extra header row, a >=44px mobile delete target and no runtime warnings/errors or unexpected fixture writes.

The first WebKit run exposed Playwright's lack of mobile-WebKit wheel support. Final tests use real keyboard horizontal scrolling on the focusable native overflow container for both engines, asserting first/last-cell reachability and unchanged page X/Y. No assertions were removed to skip scrolling. Browser emulation does not prove physical touch inertia or native iPhone picker chrome: `REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`.

Study-data and admin-student regressions: **19/19 PASS**. Frontend/Cloudflare typecheck, build and diff check PASS; the existing build chunk-size warning remains. Final pushed-HEAD CI is linked in the PR. Source proof compares calculation/controller ASTs and preserved select/score callback attributes; the sole mutation-path change is the explicit confirmation guard. No PWA, Auth/API/database, shared Overlay, PDF, release or production changes. No merge/deployment.

[Measurements/source proof](validation.json) · [Chromium](chromium.log) · [WebKit](webkit.log) · [Model/authorization regressions](model.log) · [Typecheck](typecheck.log) · [Cloudflare typecheck](cf-typecheck.log) · [Build](build.log).

| View | Before | After |
| --- | --- | --- |
| 390px | [Before](before-390.png) | [After](after-390.png), [WebKit](webkit-after-390.png) |
| 320px | — | [After](after-320.png) |
| Desktop | — | [After](after-1440.png) |
