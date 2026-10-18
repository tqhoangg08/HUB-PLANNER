# Task 01 — Mobile Safari overlay scroll lock

## Git baseline and scope

- Fetched `origin/main`: `cc7c8222d7c039912bb6b882b0ea5372cb645c6e`.
- Original local `main`: `cd6c2df4b72ac7b38797805adae087f443346771`; working tree was clean. The feature branch starts from the fetched remote main without moving local main.
- Feature branch: `codex/mobile-safari-overlay-scroll-lock`.
- Open PRs inspected before implementation: #106 (PDF export), #92 (AI documents), #86 (premium). #86 also changes MobileProfile; this patch changes only its modal wrapper. AI Advisor and AdminAIDocuments are left untouched to respect scope and avoid overlapping AI work.
- Remote branch refs were fetched and inspected. The active PRs above are the current competing work; historical remote feature refs are not treated as active changes to main.

## Root cause confirmed in the repository

1. `ProtectedAppShell` selects a mobile browser shell with document scrolling. The browser CSS explicitly changes `.mobile-main` and `.desktop-page-scroll` to participate in document flow.
2. Other layouts use independent `.mobile-main`, `.desktop-page-scroll`, or `.admin-content-scroll` scrollers. Hiding only body overflow does not lock those elements.
3. Browser-mode CSS declares body `position: static !important` and `overflow-y: auto !important`, overriding the old inline `overflow = 'hidden'` assignments.
4. Announcements and subject rankings restore `unset`, losing earlier styles. Other dialogs snapshot overflow independently: an older dialog can restore it while a newer dialog is still open, or restore a stale `hidden` after the last close.
5. The old drawer lock applies `overflow: hidden !important` to every `main` descendant. That can also affect modal content and conflicts with independently managed locks.
6. Some fixed overlays remain inside transformed/animated route layouts, and most have no lock at all.

## Shared foundation

- `utils/overlayScrollLock.ts`: symbol ownership, idempotent release, a first-owner snapshot and final-owner restore. Snapshots preserve each changed inline property and its priority; unrelated styles are not overwritten. Document X/Y and registered internal scroll positions are restored instantly before smooth scroll is restored.
- `hooks/useOverlayScrollLock.ts`: layout-effect acquisition and cleanup for drawers and other existing containers, including React StrictMode cycles.
- `components/Overlay.tsx`: body portal with one native root, preserving caller children, handlers, focus code, roles and z-index. Server rendering returns the same content without accessing document.
- `utils/overlayViewport.ts` and `components/overlay.css`: dynamic viewport fallback, visual viewport resize/offset handling, safe-area padding, bounded panels and independent scroll areas. Existing preferred panel limits are retained and clamped only to the available viewport. Form state is not remounted on viewport changes.
- `utils/overlayAlert.ts`: SweetAlert dialogs use the same owner registry and viewport behavior. Its independent height/scrollbar adjustments are disabled. Toasts do not acquire a lock.

Only iOS/iPadOS with a scrollable document gets a fixed body with a negative saved offset. Internal-only scrolling and other browsers use overflow locking. Important inline properties are needed to override the existing browser-mode important rules and are restored with their original priority.

One shared touch/wheel guard checks whether a scrollable ancestor inside the highest-z-index active overlay can consume the movement. Interior scrolling is allowed; backdrop gestures and attempts to scroll past both edges are cancelled. Multi-touch and Ctrl-wheel zoom remain native. The guard does not cancel touchstart, input clicks or picker taps. Keyboard scroll keys outside the active overlay cannot move the background. Existing modal Escape/Tab/focus handlers are preserved.

Scroll roots are explicitly marked with `data-overlay-scroll-root` in both layouts. Overlay content is portaled outside those roots; the lock also excludes roots containing overlay content. Existing layout drawers share the hook and remain in their established DOM structure. DesktopLayout releases its drawer on route changes and when its mobile breakpoint is left.

## Migrated overlays

Each ordinary migration changes only the root div to `Overlay` and its import. Business logic and form controls remain in place.

| Area | Components |
| --- | --- |
| Required dialogs | SchoolAnnouncements, DrlScoreGuide, EventFilterControls, SubjectRankingModal, UserGuideModal, FloatingSupportTab |
| Schedules | MobileSchedule (8), ScheduleBoard (11), CalendarExportDialog, CalendarImportGuideDialog, ScheduleImportGuideModal, ScheduleImportPreviewModal |
| Events | EventsBoard (4), MobileEvents (4), AdminEventBannerUpload, AdminEventCandidates, AdminEventEditorPage |
| Dashboard and learning | Dashboard (6), MobileDashboard (5), MobileLearning (3), ImportGuideModal, TranscriptImportPreviewModal, SemesterLookbackModal |
| Other student dialogs | LostFoundBoard (3), MobileLostFound (3), Handbook, MobileHandbook, MobileProfile notification settings, ActivityLogModal |
| Notices and account dialogs | DataIncidentNoticeModal, SupportNoticeModal, PushNotificationPrompt, PwaInstallInstructionsModal, PasswordSetupModal, PasswordSetupSchemaWarning, AccountPasswordOtpModal, AccountSettingsModal, DeleteAccountModal |
| Admin and scholarships | AdminStudentExcelExportModal, AdminStudentManagement (2), AdminInternalAccounts (2), ScholarshipAdminControls; existing DesktopLayout and ScholarshipShell drawers use the shared hook |

Audited fixed elements that are not modal overlays (toasts, AI bubble, notification popover, schedule toolbar dropdowns, page transitions, confetti, navigation) retain their existing behavior. MobileHome's all-news view is a page view rather than a modal. AI panels/documents were not migrated in this task. No ticket redesign, AI behavior, typography system, event-filter semantics, schedule actions, DRL rules, login or permission changes are included.

## Automated evidence and limits

Commands to reproduce:

```sh
npm ci --ignore-scripts
npm run test:overlay
npm run test:overlay:browser
node --test --test-concurrency=1 tests/drl-policy.browser.test.mjs tests/calendar-guide-ui.browser.test.mjs tests/staff-sidebar-ui.browser.test.mjs tests/event-detail-ui.browser.test.mjs
npm run typecheck
npm run cf:typecheck
npm test
npm run build
git diff --check
```

The browser suite uses the repository's Node test runner, Vite and playwright-core, with installed Chrome (override `CHROME_PATH` elsewhere). It is local browser automation, not real Safari. The Node overlay regression is included in `npm test` and existing PR CI. Browser tests run separately because the current CI workflow does not provide this suite's system Chrome path. No workflow changes are required.

| Required scenario | Evidence |
| --- | --- |
| Open → background locked; interior scroll; close → unlock | Browser wheel/scroll tests for document/internal roots |
| Deep position retained | Position assertions before/after close on both roots |
| Two owners; close in either order; final restore | Node owner test and nested browser cycles |
| Unexpected unmount and route navigation | Browser fixture unmount and React Router route replacement |
| Inline styles/priorities preserved | Node snapshots and browser computed/inline assertions |
| Keyboard-sized viewport and form state | Simulated visualViewport resize/offset, input data and last-action visibility |
| Drawer + modal + alert | Shared hook drawer and real SweetAlert integration fixture |
| StrictMode | All harness scenarios run inside StrictMode; repeated open/close cycles |
| Desktop and internal/PWA paths | Chromium desktop and standalone-class/internal-root emulation |
| Native keyboard, picker, Safari toolbar, rubber banding | Requires the real-device acceptance below; emulation cannot prove these |

Execution results are recorded in the PR and final task report. A full-suite failure exposed the initial portal's missing server-render fallback; the implementation was corrected without weakening the existing scholarship rendering test. Initial browser startup timeouts were harness setup failures, not passing browser results. Related browser fixtures now use isolated Vite configs, explicit fixture/CSS warmup and caches under node_modules: a cache outside node_modules caused Babel to reprocess the optimized React bundle, and first-request Tailwind compilation exceeded page navigation timeouts. Assertions and existing timeout values remain unchanged. The calendar lifecycle fixture now triggers external unmount programmatically because an actual pointer click on its background button is correctly blocked by the modal.

The input auto-zoom regression also caught an early implementation that changed panel geometry on blur before the close click completed. The final viewport adapter follows VisualViewport geometry directly, including scale-adjusted CSS pixels, without focus-driven layout changes. The regression keeps a non-unit viewport scale while filling text/date fields and checks that closing releases the lock.

On this Windows checkout, the existing DRL golden SQL test also failed because autocrlf changed LF to CRLF. The local file was normalized to exactly the committed Git blob to run the test, without changing SQL content or the assertion. No migration change belongs to this patch.

Viewport references: [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) describes keyboard resizing and viewport offsets; [WebKit Safari 16 features](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/) describes overscroll boundaries. These API references do not substitute for real-device testing.

## Real Safari iPhone acceptance — NOT VERIFIED

Local execution on 2026-10-18:

| Check | Result |
| --- | --- |
| Overlay Node regressions | PASS, 4/4 |
| Overlay browser regressions | PASS, 11/11 |
| Related calendar / DRL / event detail / staff sidebar browser tests | PASS, 17/17 |
| Full `npm test` | PASS, 1274/1274 across 16 Node test invocations; no failures, skips or cancellations |
| Frontend and Cloudflare typechecks | PASS |
| Frontend/PWA asset build | PASS; assets generated locally, no deployment |
| Working and staged diff whitespace checks | PASS |
| Actual iPhone Safari / native keyboard and pickers / installed PWA | NOT VERIFIED |

Local command logs are retained in `.cache/overlay-validation/` (ignored build/test evidence). GitHub CI status is recorded in the PR/task report for the exact feature commit.

Use Safari directly, not an installed Home Screen app. Serve this branch locally with test data on a network accessible by the iPhone. Do not deploy or make production data changes for this checklist. Record device, iOS/Safari version, orientation and result for every row. Repeat on a notched/Dynamic Island iPhone where available.

1. Scroll several screens down on events, announcements, schedules and handbook. Open each migrated modal family; drag the backdrop in both directions. Background content and its horizontal position must stay fixed.
2. Scroll a long modal from top to bottom and back. Pull past both edges. The modal must scroll; the page behind it must remain stationary. The first and last actions must remain reachable.
3. Close using the existing close button, backdrop where supported, and Escape with a hardware keyboard where supported. Background must become scrollable and return to the exact prior content position.
4. Repeat with Safari's URL toolbar expanded and collapsed. Rotate portrait/landscape while open. Check notch and home-indicator spacing, no clipped close button, and no horizontal shift.
5. Open the event-filter drawer and another dialog; close one while the other remains. Repeat with the mobile navigation drawer and a dialog, and with a nested confirmation. Only the final close may unlock the page.
6. Focus text inputs near the bottom of a long dialog. Open/dismiss the real keyboard repeatedly, type a draft, scroll to the last action, and rotate. Inputs/actions must remain reachable and the draft must survive.
7. Open native date/time controls. Select, cancel, dismiss and reopen them. Verify modal scrolling and close controls still work and that focus/keyboard changes never unlock the page early.
8. Navigate away while a route-owned popup/drawer is open, then use browser Back/Forward. Ensure no residual body position/overflow lock remains and the new route can scroll.
9. Rapidly open/close dialogs, open two overlays and close the lower one first, and repeat after returning from backgrounding Safari. Check background position and remaining ownership.
10. Repeat a smaller regression set in Chrome Android, Safari desktop, desktop Chrome and the existing installed PWA. Actual PWA behavior remains NOT VERIFIED until tested on the installed app; standalone CSS emulation alone is insufficient.

No production smoke test, deployment, merge, Auth Worker change, operational D1 migration or production/staging database mutation is part of this task.

## Follow-up observations outside this task

- Existing AI Advisor/document overlays still use their own presentation and need a separate scoped adoption if requested.
- Existing per-dialog focus/Escape behavior is preserved; the shared foundation is not a replacement focus-trap stack. A full accessibility stack for simultaneously open dialogs is separate work.
- The current browser scripts assume an installed system Chrome. Device-specific Safari acceptance remains a review/release gate, regardless of automated test success.
