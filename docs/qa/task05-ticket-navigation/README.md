# Task 05 — Ticket navigation acceptance

Base: `379332840b540bc3a6e9eff7797f7f276409bb72`. Local acceptance: 2026-10-21.

## Reproduced before the change

At 375×667, Chromium and WebKit both rendered the AI and Ticket floating buttons together. Their measured rectangles intersected by **41×15 CSS px**. The only mobile sidebar Ticket link was inside the collapsed Handbook accordion and measured **33.5px high**. See [before measurements](before.json), [Chromium page](chromium-before-page.png), [WebKit page](webkit-before-page.png), [Chromium sidebar](chromium-before-sidebar.png) and [WebKit sidebar](webkit-before-sidebar.png).

## Change and scope

- `ProtectedAppShell` mounts the existing floating Ticket UI only for the standalone/mobile app layout. Browser layouts use their existing support routes; desktop retains Handbook → Hỗ trợ.
- The student browser drawer has one top-level **Yêu cầu hỗ trợ** NavLink with Lucide Ticket, an explicit 44px minimum height, prefix active matching and the existing close/navigation handlers. The old nested link is removed; Handbook is no longer highlighted for support routes on mobile.
- Measured new target height: **45.5px** at all four mobile widths. Scroll position `(0,700)` is preserved after dismissal, focus returns to the menu trigger, and the existing AI draft survives drawer use.
- Staff navigation still targets `/admin/support`. Guest requests receive the existing login guidance on HTTP 401. Server authorization is also covered by the unchanged D1 authority tests.
- No Ticket component, API, business rule, authentication, database, attachment contract, Overlay foundation, PWA bottom navigation, dependency, deployment workflow or production configuration was changed.
- `UNREAD_BADGE=NOT_AVAILABLE; HIDDEN_BY_DESIGN`. No new polling or synthetic counts.

After screenshots: [Chromium drawer](chromium-after-sidebar.png), [WebKit drawer](webkit-after-sidebar.png), [Chromium support list](chromium-after-list.png), [WebKit support list](webkit-after-list.png). Visual inspection confirms the Ticket entry, icon and close control are visible, the backdrop separates the page, and only AI remains floating on the browser support page. The existing horizontally scrollable status chips are unchanged; document overflow checks pass.

## Automated results

Windows, Node 24.12.0, Playwright Core 1.62.1, local Chrome 155.0.8059.85 and installed Playwright WebKit. Local Vite uses `configFile:false` and `envDir:false`; real ProtectedAppShell, ProtectedAppRoutes, layouts, AI UI and Ticket components run under React StrictMode. API replies are isolated fixtures. All external traffic and fetch/XHR are intercepted; only the test PDF upload reaches a loopback-only sink. Unknown support actions and unrelated write requests fail acceptance.

| Case | Chromium | WebKit |
| --- | --- | --- |
| 375×667: entry, icon, target, navigation, AI draft, focus/scroll, no overflow | PASS | PASS |
| 390×844: same | PASS | PASS |
| 430×932: same | PASS | PASS |
| 360×640: same | PASS | PASS |
| Create, detail, reply, attachment payloads and direct detail URL | PASS | PASS |
| Guest login guidance and rejected creation | PASS | PASS |
| Admin `/admin/support` navigation/list | PASS | PASS |
| Auditor `/admin/support` navigation/list | PASS | PASS |
| 1440×900 desktop navigation and simulated standalone/PWA Ticket UI | PASS | PASS |

**Final Ticket browser run: 18/18 PASS**, no runtime errors, React warnings or unexpected writes. Attachment assertions verify actual loopback PUT bytes (`%PDF-1.4`, 8 bytes), MIME type, create-message payload and attachment linkage. WebKit's intercepted Blob body is unavailable through `postDataBuffer()`, so the sink measures the real HTTP body instead. [Browser log](browser-tests.log), [geometry and scroll measurements](measurements.json).

Related regressions: 26 distinct existing browser tests pass (20 Task 04 sidebar, 3 staff sidebar, 3 staff Ticket UI). The first run had 24/26 pass: an Auditor reopen assertion failed and another fixture navigation timed out while the machine was under memory pressure. Both failures passed unchanged when rerun alone; no assertion or product fix was made for them. Preserve the actual [initial log](sidebar-initial.log) and [two-case recheck](sidebar-recheck.log). The sidebar suite includes menu internal scrolling, touch/wheel isolation, keyboard focus, nested overlays, SweetAlert ownership, short viewport, orientation, desktop and standalone checks.

| Validation | Result |
| --- | --- |
| Ticket authority/navigation/API regressions | 17/17 PASS — [log](ticket-contracts.log) |
| Shared overlay unit regressions | 4/4 PASS — [log](overlay-tests.log) |
| Frontend typecheck | PASS |
| Cloudflare typecheck | PASS |
| Frontend build | PASS; existing large-chunk warning remains |
| Diff whitespace check | PASS |
| Full local suite | Not run; delegated to PR CI as requested |

Typecheck/build excerpts: [validation log](validation.log). GitHub CI is reported on the PR for its final HEAD, separately from these local results.

Reproduce:

```powershell
$env:TICKET_EVIDENCE_DIR='docs/qa/task05-ticket-navigation'
node --test tests/ticket-navigation.browser.test.mjs
node --test tests/mobile-sidebar.browser.test.mjs tests/staff-sidebar-ui.browser.test.mjs tests/support-staff-role.browser.test.mjs
node --test --experimental-strip-types tests/admin-sidebar-navigation.test.ts tests/admin-support-export-browser-elimination.test.ts tests/cloudflare-support-d1-authority.test.ts
npm run test:overlay
npm run typecheck
npm run cf:typecheck
npm run build
git diff --check
```

`CHROME_PATH` can select a local Chromium executable; WebKit must already be installed. The screenshot/measurement directory is optional. Do not edit app or harness files during a browser run, because Vite HMR invalidates the fixture state.

## Limits and safety

`AUTOMATED_MOBILE_ACCEPTANCE=PASS`. `REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`. WebKit emulation is not a physical iPhone/Safari toolbar or native keyboard test. Standalone compatibility is simulated with the platform standalone flag, not a physical installed PWA. The existing Task 04 viewport/ownership behavior is retained and regression tested; it is not reimplemented here. No production API writes, SQL, merge or deployment were performed.
