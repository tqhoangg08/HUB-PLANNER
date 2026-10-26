# Browser timetable toolbar follow-up

Base main: d92dc81c658891cbb0a60a93393dcc7ff41adae5. Immediate presentation baseline: 77f94e24290332eddbd27246aa8b07d3d9a9defd.

## Reproduction and resulting layout

The actual ScheduleBoard rendered filters before its title. At 390px the title was at y=884px; at 1440px it was y=293.625px in the isolated fixture. Opening the mobile inline sidebar displaced the calendar. A fixed-width mode switch could overlap its labels, A/B/C widened the controls, and Actions occupied a separate row. Expanded filters duplicated collapse/reset controls.

The title/mode are first; PDF and the existing Actions menu share the header. The calendar has one unified toolbar. Desktop keeps its collapsible sidebar and preference; phones/tablets below 1024px use the existing Overlay as a bottom sheet. Main mobile actions/navigation use two control rows, followed by a compact independently scrolling chip strip. Narrow headers may wrap to preserve readable labels. No action is hidden to meet a row count.

A/B/C use a native dropdown with full plan names, course/credit counts and the existing selected-semester state. Course results have their separate entry. All original filters, chips/removal/reset, advanced fields, week/month, period selector, calendar navigation and PDF callbacks remain. Filtering stays live, as before: Apply closes the sheet without opening results or introducing draft semantics. Native select/date/time Escape handling is retained.

The mobile sheet uses shared scroll lock/visual viewport adaptation. Only its content scrolls; header/close and the action row remain accessible. Backdrop mousedown prevents the browser's default focus change after restoration. The root explicitly spans the viewport. A local div action row avoids a pre-existing global mobile footer display override; no global CSS is modified.

## Evidence and checks

See validation.json, the engine measurement files, source-proof.json and logs. Before/after captures use the real ProtectedAppShell and ScheduleBoard in React StrictMode with isolated API fixtures. The harness deliberately adds 100px before the page and trailing content to exercise scroll restoration; these are not production whitespace. No provider writes are allowed. The two-dimensional calendar keeps its own horizontal scrolling; the page and toolbar do not overflow.

Screenshots: [before phone](before-390.png), [before desktop](before-1440.png), [after phone](after-390.png), [after desktop](after-1440.png), [plan](plan-390.png), [WebKit sheet](webkit-sheet-390.png).

Source proof: all 221 pre-existing top-level state/handler/calculation initializers are identical. The extracted basic field map and ScheduleActionsDropdown JSX/props are AST-identical. MobileSchedule, model/cache, action-menu implementation and Overlay/lock source blobs are unchanged. The focus effect explicitly adds ownership of this sheet; responsive state, dropdown setters, labels and layout are presentation interactions.

## Failed attempts and corrections

Initial compatibility failures referenced the removed inline-only opening/closing path, concatenated hidden/visible captions, the old A/B/C buttons, and a global count of all ARIA groups. Tests now use the actual accessible entry, transient mobile sheet lifecycle, native plan select and the unchanged eleven editable PDF course groups. Values, pagination, parser counts and authorization assertions remain.

Browser QA also found real implementation defects: backdrop close could lose focus, the first sheet root lacked horizontal anchoring, and the native plan target was 42px inside a 44px bordered label. These were corrected and explicit focus, full-width and >=44px assertions added. Screenshot review exposed the global footer cascade; the action row is now locally scoped. Immediate keyboard-resize measurements now wait for actual layout settlement before asserting the same visible-viewport bounds. No force-click or relaxed layout/target threshold is used.

## Limits

REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED. Chromium 155/WebKit 26.5 automation is not physical iPhone Safari evidence. OS native-picker chrome, physical safe-area and real keyboard/toolbar animation are outside this proof. The existing unrelated PWA week-selector issue is unchanged. This follow-up does not claim a new site-wide accessibility certification or repeat the earlier full Task 10 audit. No merge, deployment, release trigger, production configuration or database change.

Final local validation: Chromium and WebKit each pass the nine-viewport matrix, including 320px, landscape and 390×240 resize. Targeted models/UI/import/lock: 38/38. Chromium compatibility: 12/12; WebKit compatibility: 1/1; WebKit action regression: 3/3. Chromium action regression: 11/12 initially, with its single PDF ARIA-count failure corrected and the isolated PDF path rerun 1/1 PASS. Frontend and Cloudflare typechecks, build and diff check PASS. The existing Vite chunk-size warning remains. Exact final-HEAD full-suite CI is linked in the PR.
