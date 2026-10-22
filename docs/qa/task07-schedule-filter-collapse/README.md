# Task 07 — Collapsible timetable filters

Base: `e4740ecada34ad4569104ca4133b01fe586e38b4`. Local QA: 2026-10-22 (Asia/Saigon).

## Reproduced before the patch

Real `ScheduleBoard` under `ProtectedAppShell`, React StrictMode and isolated API fixtures, on Chromium and WebKit:

- At 375px the old “Thu gọn” closed accordion sections but retained the whole 347×520px filter card; the calendar remained below it.
- At 1440px the old action retained a 330px sidebar. Calendar width stayed 1036.5px.
- The pinned component replay also confirmed Escape left the old results panel open at both widths (`baseline-probes.json`).
- “Áp dụng bộ lọc” opened the results panel even though changing filters already updates the catalogue through the existing 400ms fetch debounce.

The original before-measurement JSON files were recorded before any application source edit. Optional `SCHEDULE_BASELINE=1` replays the pinned Git component through a Vite transform (read-only `git show`), allowing comparable screenshots without checking out or changing application source.

## Patch and preserved behavior

- A separate collapsed/expanded preference, default collapsed, stored as only `true`/`false` at `hub_timetable_filter_sidebar_expanded_v1`. Invalid values and denied access fall back safely. No filter or identity data is stored there.
- The existing active-filter bar moves above both columns so its trigger remains a stable anchor. It has a count, removable chips, reset, advanced filters, and an explicit “Xem danh sách lớp” entry.
- The entire sidebar uses `hidden` and releases its layout space. It stays mounted, retaining accordion state and the PDF file input/ref. Existing semester-inclusive count semantics are unchanged.
- The redundant Apply button is removed. The result list, course details, plan selection, pagination and advanced “Xem kết quả” remain available.
- Local focus/Escape/Tab handling belongs only to these two schedule panels. Shared Overlay, viewport adaptation and scroll-lock source are unchanged.
- Mobile sidebar text inputs/selects use 16px locally; desktop typography is unchanged. No Safari zoom/scale workaround.
- `MobileSchedule` remains unchanged. Browser-mode students use `ScheduleBoard`; standalone-mode smoke exercises the actual `MobileSchedule` with its existing separate controls.
- No fetch/cache/pagination/model, protected mutation, permission, API, PDF import, export or plan storage implementation changed.

## Chromium measurements

Sidebar width is expanded / collapsed. Calendar width compares expanded → collapsed. Mobile recovery is calendar top moving upward after collapse; calendar height is unchanged.

| Viewport | Sidebar width | Calendar width | Vertical recovery | Trigger height | Page overflow |
|---|---:|---:|---:|---:|---|
| 360×640 | 332 / 0 | 332 → 332 | 530.5 | 44px | None |
| 375×667 | 347 / 0 | 347 → 347 | 530.5 | 44px | None |
| 390×844 | 362 / 0 | 362 → 362 | 530.5 | 44px | None |
| 430×932 | 402 / 0 | 402 → 402 | 578.5 | 44px | None |
| 768×1024 | 726 / 0 | 726 → 726 | 537.5 | 44px | None |
| 1024×768 | 330 / 0 | 620.5 → 968 | 0 | 44px | None |
| 1440×900 | 330 / 0 | 1036.5 → 1384 | 0 | 44px | None |

Raw before/after JSON includes card/calendar bounding boxes, scroll roots/anchor, filter counts, persisted state and sanitized fixture request parameters. WebKit measurements are saved separately.

## Browser coverage

Final canonical result: **Chromium 17/17 PASS; WebKit 17/17 PASS**, each in one complete clean invocation on the final frozen application/harness, with exit code 0 and no skipped cases. See `browser-results.txt`.

Exploratory issues are retained separately in `exploratory-results.txt`: a test used the wrong existing plan label (“B” instead of “KH B”), a pagination assertion initially inspected state before the response, unsupported mobile WebKit input APIs required an explicit fallback, and Vite reloads/intermittent browser timeouts interrupted early runs. The runner now disables HMR/file watching and uses Playwright's normal 30s timeout. Both final engine runs were sequential and passed without retries. No data/layout/authorization assertion was removed to obtain PASS.

Seven requested sizes: 360×640, 375×667, 390×844, 430×932, 768×1024, 1024×768, 1440×900. Orientation is changed and restored in every viewport case.

Coverage includes hidden full card and recovered space; ≥44px compact trigger; retained accordion and filter values; live search; no implicit result modal; explicit results and page 2 request; independent results scroll; scroll/focus return; chip removal/reset; preference reload and route remount; invalid/blocked preference; Guest permissions and five Admin/Auditor tabs; week/month and plan B; course selection/details; standalone shell smoke; every sidebar field and advanced instructor input; PDF entry while collapsed. Console errors, React warnings and all unexpected writes fail tests.

Only local fixture origins serve source/assets. All fetch/XHR traffic is intercepted; mutation attempts fail closed. Plan selection uses existing local plan storage. No production data or writes are used.

### Automation limits

- `REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`. These are Playwright engines, not physical iPhones or installed PWA acceptance.
- Playwright mobile WebKit does not expose native mouse wheel/swipe automation. Its mobile cases dispatch synthetic touch-boundary events to assert the real scroll guard cancels them, try keyboard scrolling, and explicitly scroll the real results container with `scrollBy`. Chromium and non-mobile WebKit use browser wheel input. This does not claim native iOS gesture verification.
- Standalone smoke uses `navigator.standalone` in the isolated browser context; it checks app-mode routing/components, not OS installation.
- Preference storage denial is scoped to the new UI key; unrelated existing plan/cache/notice storage code is not changed.
- AI floating UI is retained in the fixture and source is unchanged. This task does not redesign its floating position or the existing horizontally scrolling schedule action row (Task 08).
- Build retains the existing >500kB chunk-size warning; build exits successfully. No performance benchmark was run.

## Screenshots

- 375px Chromium: [before](chromium-before-375.png), [collapsed](chromium-collapsed-375.png), [expanded](chromium-expanded-375.png).
- 1440px Chromium: [before](chromium-before-1440.png), [collapsed](chromium-collapsed-1440.png), [expanded](chromium-expanded-1440.png).
- 375px WebKit: [collapsed](webkit-collapsed-375.png), [expanded](webkit-expanded-375.png).

Screenshots were inspected: full card visibility switches correctly, compact triggers remain visible, calendar space is recovered, and primary filter controls are not clipped. The unchanged floating AI launcher can overlap part of chip text after the fixture's orientation changes; chip removal and primary filter actions remain reachable. AI positioning is outside Task 07.

## Reproduction

PowerShell, repository root, dependencies/browser runtimes already installed:

```powershell
$env:SCHEDULE_EVIDENCE_DIR='docs/qa/task07-schedule-filter-collapse'
$env:SCHEDULE_BROWSER='chromium'
node --test --test-reporter=tap tests/schedule-filter-collapse.browser.test.mjs
$env:SCHEDULE_BROWSER='webkit'
node --test --test-reporter=tap tests/schedule-filter-collapse.browser.test.mjs
```

Use `CHROME_PATH` for a non-default Chrome executable. `SCHEDULE_BASELINE=1` runs only the two pinned baseline probes; unset it for acceptance.

## Related browser harness repair

The existing PDF browser regression could not bundle `Overlay`'s CSS import with esbuild's `write:false`/no output path. Its CSS selection also picked the first asset (now the event-filter chunk) rather than the complete built styles. The test now bundles JavaScript with CSS imports empty and separately serves all built CSS assets. Existing data, authorization, 11-row payload and layout assertions remain unchanged; startup failures now capture a screenshot and collected runtime errors. The corrected regression passed all four widths. No import implementation changed.

## Validation

- Targeted model/admin/export/structured/scroll-lock/auth/protocol: 37/37 PASS.
- Schedule import/parser/session regressions: 44/44 PASS (one structured UI test overlaps the preceding command).
- Existing Overlay browser regressions: 13/13 PASS.
- Actual PDF import browser fixture, 1280/1024/768/390px: 1/1 PASS.
- Frontend and Cloudflare typechecks: PASS.
- Build: PASS.

See `validation.txt` for executed commands/results and `browser-results.txt` for browser TAP evidence. Full offline suite is delegated to the existing GitHub PR validation on final pushed HEAD; no deployment workflow is triggered.
