# Task 08 — Timetable actions dropdown

Base main: 69672040488df01e8eada26a5e9ec628b51458c3. Branch: codex/task08-schedule-actions-dropdown.
Automated acceptance on local fixtures; REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED.

## Audit and reproduced baseline

Website /schedule and /schedule/:studentCode render ScheduleBoard. Below 768px in standalone mode, the student /learning?tab=schedule route uses MobileLearning -> MobileSchedule. Admin/Auditor remain on the management route branch. useAppMode also supports a local-only app preview; this fixture uses navigator.standalone, not that preview query.

The two surfaces had separate toolbar markup. On pinned main, the website's label promotion occupies the left side of a horizontally scrolling action row. At 375/390px, only one of four mounted actions fits fully in the visible row. The report button measures about 24.5px high. There was no document horizontal overflow in this baseline. PWA has a separate four-column grid with 54px-high actions.

The Task 07 release was checked read-only: [run 39757483460](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39757483460) completed successfully for this exact main SHA. This frontend task does not query or change the current production version/baseline.

## Small implementation

Only the two live toolbar blocks and their imports change in the existing components. ScheduleActionsDropdown is shared presentation: four existing callbacks and their original disabled conditions. The website promotion is removed; contextual labels, their modals and persistence remain unchanged. The hidden legacy MobileSchedule markup is retained.

The dropdown portals into body to escape toolbar clipping. Position follows scroll, resize and VisualViewport, includes safe-area padding, flips above when needed and bounds its own scroll area. Trigger and actions are at least 44px high. It has menu semantics, arrow/Home/End navigation, Tab/Shift+Tab exit, Escape, outside pointer dismissal and focus return. All-disabled menus remain keyboard operable. It uses no Overlay or new scroll-lock manager.

Existing modal/processing state is passed only to close the menu and return focus after the action finishes, including the PDF processing/preview chain. No forms, parser, export payload, protected mutation, API, storage, authorization, filter or label business rules are rewritten.

| Entry | Existing destination | Disabled condition retained |
|---|---|---|
| Thêm vào lịch | CalendarExportDialog | Guest or empty personal semester schedule |
| Báo lỗi môn | Report modal, retaining form reset | Guest |
| Yêu cầu thêm môn | Existing request modal | Guest |
| Nhập PDF | Existing guide -> file input -> parser -> preview | Guest or processing PDF |

No label, delete or staff mutation is added to this menu. Admin/Auditor management navigation and its existing Add affordance are unchanged; staff writes are not performed in browser tests. Backend read/write authorization regressions pass independently.

## Measurements and screenshots

| Surface | Mounted action buttons before -> after | Action-row height before -> after | New trigger |
|---|---:|---:|---:|
| Website 375/390/1440 | 4 -> 1 | 38.5 -> 58px | about 129.4 x 44px |
| PWA 375 | 4 -> 1 | 54 -> 44px | about 129.4 x 44px |

The website row grows only to fit the required 44px target plus existing padding; no additional toolbar row is introduced. Menu items meet 44px targets. Measurements include menu/trigger bounds, scroll roots, overflow, focus results, disabled states and action mapping.

- [Before 375](chromium-before-375.png), [after 375](chromium-after-375.png)
- [Before 390](chromium-before-390.png), [after 390](chromium-after-390.png)
- [Before desktop 1440](chromium-before-1440.png), [after desktop 1440](chromium-after-1440.png)
- [Before PWA](chromium-before-375-pwa.png), [after PWA](chromium-after-375-pwa.png)
- [WebKit 375](webkit-after-375.png), [WebKit PWA](webkit-after-375-pwa.png)
- [Before measurements](chromium-before-measurements.json), [Chromium after](chromium-after-measurements.json), [WebKit after](webkit-after-measurements.json)

Screenshots were inspected: the four actions fit the menu and are unobstructed. Dynamic browser assertions verify geometry and interactions; screenshots do not replace them. The harness explicitly scrolls a trigger into view before testing. Scroll is compared per open/close operation; intentional keyboard Tab navigation may scroll to a different control and is not mislabeled a menu jump.

## Executed validation

| Check | Actual result |
|---|---|
| Task08 Chromium, seven viewport matrix + roles/PWA/keyboard/PDF | 18/18 PASS |
| Chromium real guide file-chooser + parser/preview | 2/2 PASS |
| Task08 WebKit UI/roles/PWA and viewports | 16 successful cases from initial matrix |
| WebKit PDF cases after fixture correction | 2/2 PASS; all 18 scenarios covered |
| Task07 Chromium | 17/17 PASS |
| Task07 WebKit targeted 375, 1440, plan/PWA, advanced/PDF | 4/4 PASS |
| Calendar/model/authorization/overlay unit regressions | 62/62 PASS |
| PDF/import regression suite | 44/44 PASS |
| Existing overlay browser regressions | 13/13 PASS |
| Existing import-preview browser, four widths | 1/1 PASS |
| Frontend + Cloudflare typechecks | PASS |
| Build including PWA generation | PASS; Vite chunk-size warning |
| Full offline suite | GitHub PR CI on final pushed HEAD |

See [validation metadata](validation.json), [Chromium log](chromium-browser.log), [Chromium file chooser](chromium-pdf-chooser.log), [initial WebKit log](webkit-initial-with-fixture-failures.log), [final WebKit PDF log](webkit-pdf-final.log) and [other regressions/build](regressions-and-build.log). Log hashes distinguish local raw logs from normalized committed copies. Final CI evidence is linked in the PR description.

WebKit initially failed two PDF tests. One static worker fetch was treated as an API request by the fixture, returning JSON; static asset GETs now pass through. A fixed busy delay also raced with preview completion; the local File.arrayBuffer fixture now waits for explicit release after checking disabled behavior. The strict runtime/console assertions remain. The failed initial log is retained, and both PDF cases pass when rerun on unchanged application source. We do not claim a single clean final 18/18 WebKit invocation or rerun already successful scenarios to hide this history.

During implementation, regression tests also caught first-open focus occurring while the menu was hidden, and focus loss after dialog/PDF-chain close. These were corrected locally before final acceptance.

## Isolation, reproduction and limits

Both engines run real components in React StrictMode with the existing shell fixture. Vite uses envDir:false. Auth and APIs are isolated fixtures; unexpected writes are rejected. The Turnstile external UI is replaced only in the local test server. The real guide button, file-input ref, PDF.js/direct parser and eleven-row preview execute using a synthesized anonymized PDF. No provider or production authentication is bypassed. The existing preview regression deliberately performs one mocked PUT to verify persistence; it cannot reach production.

Run the browser suite with ACTIONS_BROWSER=chromium or webkit and ACTIONS_EVIDENCE_DIR set to a temporary output directory:
~~~powershell
node --test tests/schedule-actions-dropdown.browser.test.mjs
~~~
ACTIONS_BASELINE=1 pins both schedule components to the audited main SHA for before evidence. The WebKit PDF subset can be rerun with --test-name-pattern='PDF guide'.

There is an independently reproduced pre-existing PWA issue: opening its week selector renders one week-1 row inside the CSS-hidden legacy block and zero visible rows. This is recorded in pinned baseline measurements. Task08 leaves it unchanged; PWA smoke uses the existing next-week button, then accesses the real course-detail label action. The website week/month dropdown, plans A/B/C, and Task07 filter regressions pass. No Task09/10 work is included.

These are Chromium 155.0.8059.85 and Playwright WebKit 26.5 automation on Windows, not a physical iPhone. The 667x375 orientation and 390x240 keyboard-sized viewport are simulated. Native Safari keyboard/OS picker UI, production smoke and full end-user app routing are not certified by this component fixture.

No new dependencies, merge, deployment, production SQL, Cloudflare/environment change, workflow change or production-baseline update.
