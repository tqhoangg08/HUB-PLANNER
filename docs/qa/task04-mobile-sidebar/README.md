# Task 04 — mobile browser sidebar

Base: `105a0812ee0bbf5505a8e7b7c58ec91455ef6d9e`. Local Windows, Node 24.12, Vite, installed Chrome and Playwright WebKit. This is automated browser acceptance, not physical iPhone acceptance.

## Reproduced before the change

`before-measurements.json` records the original component in Chromium (student, guest, admin, auditor) and WebKit (student, admin), at 375×667 in browser mode.

- Floating AI wins pointer hit testing above the drawer/backdrop in every measured role. Its layer is 100001; the original drawer roots are 100/101. The student screenshot shows the AI control covering the menu.
- Close targets are 32.5×32.5 CSS px. The student's close control has no accessible name.
- Escape leaves the drawer open. Openers have no expanded/controls relationship. WebKit keeps focus on body when opening; the background is not inert.
- Staff navigation remains mounted off screen while closed.

The baseline did **not** reproduce horizontal overflow, loss of the header at the initial viewport, or a background gesture scroll leak through Task 01's existing lock. Those are regression requirements, not newly claimed baseline failures. The old 100dvh panel rules and lack of VisualViewport attachment were viewport risks; physical Safari toolbar/notch behavior was not measured.

## Implementation and ownership

Only three product files change: `layouts/DesktopLayout.tsx`, `layouts/useMobileSidebarDialog.ts`, and `layouts/mobileSidebar.css`.

Student retains its portal. Mobile staff uses the same navigation markup in a portal; desktop remains inline, including collapsed mode. Staff identity/navigation/footer scroll together below the fixed header, so short viewports leave the last actions accessible. Close controls are explicitly 44×44 CSS px. Collapsed handbook links are inert.

The local dialog hook attaches the existing `attachOverlayViewport`, contains keyboard focus, restores the opener without scrolling, and makes lower body surfaces inert with exact prior inert-state restoration. Safari's link-skipping Tab policy is handled by explicitly cycling visible controls. The existing `useOverlayScrollLock` is the only scroll owner mechanism. No foundation code changes.

Sidebar priority is 100002: above floating AI/chat, below registered higher dialogs such as SweetAlert (1000000). AI remains mounted with its draft/history intact, under the backdrop and inert while the drawer owns focus. Higher overlay roots receive focus/Escape first. Closing or navigating away from the lower drawer does not release another overlay's scroll ownership. Route and desktop-breakpoint transitions close the mobile drawer.

Ticket controls and flow, role navigation/permissions, AI APIs/history, Task 01–03, backend, dependencies, Cloudflare configuration, workflows and baseline are unchanged.

## Acceptance coverage

| Fixture / viewport | Chromium mobile | WebKit mobile |
| --- | --- | --- |
| Student 375×667 | PASS | PASS |
| Student 390×844 | PASS | PASS |
| Student 430×932 | PASS | PASS |
| Student 360×640 | PASS | PASS |
| Guest 375×667 | PASS | PASS |
| Admin 375×667 | PASS | PASS |
| Auditor 390×844 | PASS | PASS |
| Nested overlay / existing AI draft / viewport offsets | PASS | PASS |
| Real SweetAlert focus/Escape and out-of-order cleanup | PASS | PASS |
| Desktop 1440×900 and standalone routing smoke | PASS | PASS |

Each mobile role case exercises default closed, one opening, backdrop geometry, 44px hit target, fixed header, menu end, background X/Y and anchor preservation, focus containment and wrap in both directions, Escape/backdrop/close, route changes, 240px viewport height, landscape 667×375, and transition to desktop. It checks runtime errors, React warnings, horizontal overflow and unexpected write requests. Role navigation group order, badges, admin-only exclusions and desktop collapse also retain the existing staff regression assertions.

Chromium uses native wheel and CDP touch scrolling; both engines use native keyboard scrolling. Mobile WebKit does not support Playwright mouse-wheel input, so its wheel and touch edge/backdrop guards are checked with cancelable DOM events. This does not establish physical touch momentum behavior. The viewport-offset test simulates VisualViewport height 280px, offsetTop 36px and 44px/34px safe-area-sized padding. It does not claim a native keyboard or Safari toolbar was opened.

The fixture renders real `ProtectedAppShell`, `DesktopLayout`, `AppAiAdvisorOverlay`, `useAppMode` and a real shared `Overlay`, under StrictMode. Role/session props are isolated fixtures. All fetch/XHR and external requests are fulfilled locally; no production writes or AI submissions occur. The AI concurrency case explicitly invokes the existing opener from the fixture, because an already open AI backdrop correctly prevents pointer access to a lower page control.

Final result: **20/20 PASS**, Chromium 10/10 and WebKit 10/10. Overlay unit 4/4, existing overlay browser 13/13, staff sidebar 3/3, both typechecks, build and diff check passed.

During test development, the fixture was corrected to compare fixed-body logical offsets plus background anchor position, await committed Router/viewport updates, and focus the newly mounted scroll region before keyboard scrolling. Fixture identity now persists across navigation, and the nested fixture establishes focus before Escape. SweetAlert release is awaited through its asynchronous `didDestroy` callback after container removal (observed 48–80ms). Background, focus, target size and end-of-menu assertions remain enforced.

## Evidence and reproduction

- `before-measurements.json`: pre-change measurements; `measurements.json`: final per-role geometry and scroll positions.
- `chromium-{student,admin}-before.png`: original open drawer.
- `{chromium,webkit}-{student,admin}-drawer.png`: fixed drawer after scrolling to the last action. Keyboard focus outlines are expected.
- `validation.txt`: actual final command outputs and exit status. CI/full-suite evidence is linked in the PR.

Screenshots were visually reviewed: header/close and last actions remain visible; no horizontal clipping; AI and Ticket sit behind the dark backdrop. Labels, badges and navy/white styling remain intact.

```powershell
$env:SIDEBAR_EVIDENCE_DIR='docs/qa/task04-mobile-sidebar'
node --test --test-reporter=tap tests/mobile-sidebar.browser.test.mjs
node --test tests/staff-sidebar-ui.browser.test.mjs
npm run test:overlay:browser
npm run typecheck
npm run cf:typecheck
npm run build
git diff --check
```

The full local suite and the 492-scenario inventory were not rerun. GitHub PR CI runs the standard full suite. Build retains the existing large-chunk advisory.

`REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`. Native Safari chrome, physical notch/keyboard and touch momentum remain outside emulation evidence. No manual phone acceptance is required for this agreed automated scope. No merge, deployment or production change was performed.
