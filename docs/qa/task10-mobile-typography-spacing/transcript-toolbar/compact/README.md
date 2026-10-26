# Smaller painted transcript controls

The owner requested a further reduction of the highlighted action group, without enlarging headings to compensate. Headings, semester titles, routes and business handlers are unchanged from `99e712d77fd8a490721fc25a36656f5a4ac02c20`.

The visible button surface is now **32px high**, including a **32×32px** overflow surface; short toolbar labels are **13px/500**, icons **14px**. Border and navy fill belong to a presentation span inside the actual button. The outer button is transparent and remains **>=44px on mobile**, **>=36px on desktop**. This makes the visible surface smaller while preserving a real hit area; there is no overlapping pseudo-element or separate click handler. The gap between actual controls remains 8px. Menu text and its targets are unchanged.

On mobile the previous painted area was 44px high; it is now 32px. Desktop painted height changes from 40px to 32px. The main and semester headings retain their previous sizes and weights. At 390px the empty-state heading and controls fit one row. Text still grows at 200%, and surfaces expand to fit enlarged labels instead of imposing a clipping height.

Chromium and WebKit each passed **6/6 tests** using the actual Dashboard/ProtectedAppRoutes and React StrictMode with isolated fixtures. Geometry distinguishes painted surface from button hit area, asserts 13px/500 text, 14px icons, 32px painted height, per-breakpoint hit targets and ownership of transparent padding. A real touchscreen tap at the overflow button's transparent corner opens the menu. Tests retain keyboard/Escape/focus, empty/populated/editing, PDF confirmation/callback, failed save/retry/cancel and Dashboard normal/320px/200%/text-spacing coverage. No runtime warnings/errors or unexpected fixture writes were recorded.

[Measurements/source proof](validation.json) · [Chromium](chromium.log) · [WebKit](webkit.log) · [Typecheck](typecheck.log) · [Cloudflare typecheck](cf-typecheck.log) · [Build](build.log).

| View | Evidence |
| --- | --- |
| Mobile before | [390px](before-390.png) |
| Mobile after | [Import](empty-390.png), [Save](save-390.png), [WebKit](webkit-empty-390.png) |
| Desktop after | [Import](empty-1440.png) |

Frontend/Cloudflare typecheck, build and diff check passed; the existing build chunk-size warning remains. Final-HEAD GitHub CI is reported in the PR. The toolbar AST is equal after removing only the new presentation spans and whitespace/location metadata. Dashboard is byte-identical to the prior commit. No Auth/API/database, PWA implementation, shared Overlay, PDF, permission or production changes. No merge or deploy. `REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`.
