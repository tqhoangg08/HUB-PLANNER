# Timetable toolbar: mobile two-row refinement

Scope: the browser `ScheduleBoard` toolbar only. The PWA `MobileSchedule`, course filtering, calendar handlers, authentication guards, and shared Overlay are unchanged.

## Reproduced

At 390 CSS px, the prior browser toolbar took **150 px** and wrapped into three rows. `Tổng quát` split across two lines, the single semester filter had a separate redundant `Xóa` control, and the chip sat below the navigation. [Before, Chromium 390 px](before-chromium-390.png).

## Result

- A fixed two-row grid places filter controls and the active semester chip above calendar navigation. The calendar starts directly at the toolbar bottom (measured gap **0 px**).
- The semester chip is one removable button with a 44 px mobile hit target and a compact 24 px painted surface. `Xóa tất cả bộ lọc` stays available when multiple chips exist; a lone chip is removed using its own button. The filter sheet retains `Đặt lại`.
- `Tổng quát` stays on one line. At 200% text size, the navigation row scrolls internally so its controls remain readable without horizontal page overflow.
- At 320–389 px, `Lọc` and `Lớp` abbreviate the visible labels while their accessible names remain unchanged. At 320–375 px, the plan picker displays `PA A/B/C`; its accessible label and option names still use `Phương án A/B/C` with course and credit counts.
- The filter sheet close button cannot shrink below 44 px in landscape.
- The 390 px toolbar measures **93 px** in both Chromium and WebKit, a reduction of **57 px** from the reproduced 150 px baseline.

Screenshots: [Chromium 390 px](after-chromium-390.png), [Chromium plan at 360 px](after-plan-chromium-360.png), [WebKit 390 px](after-webkit-390.png). Measurements: [Chromium](chromium-measurements.json), [WebKit](webkit-measurements.json).

The fixture renders the real `ProtectedAppShell` and `ScheduleBoard` in React StrictMode with isolated GET responses; it blocks unexpected writes. Its intentional blank spacer above the timetable tests scrolling and is not part of the production layout.

## Validation

See [validation.json](validation.json) and the adjacent browser/typecheck/build logs. Chromium and WebKit passed the nine-viewport toolbar regression (320–1440 px), mobile two-row interaction at 320/360/375/390/430 px, density/44 px hit targets, 200% text and spacing, and week/month navigation. Related filter collapse and Actions menu regressions passed in Chromium. Frontend typecheck, Cloudflare typecheck, build, and diff check passed. The existing build chunk-size warning remains.

These are browser simulations. A physical iPhone Safari session was not used: `REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`.
