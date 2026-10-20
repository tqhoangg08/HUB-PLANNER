# PR #116 — automated mobile overlay acceptance and main synchronization

Date: 2026-10-19. All required local checks and both automated mobile browser matrices completed successfully. GitHub validation is tracked on the exact published PR head in PR #116.

## Git synchronization

- Fetched main: `a330d5d9e86fc02083f494bdf833288d79f21f3c`.
- Published PR head at the start: `d1017fbecf8a0f25b5a6bdb7ed41a5899b8d3b01`.
- Existing local acceptance work was preserved in `6e83d8b`.
- Branch: `codex/mobile-safari-overlay-scroll-lock`.
- Work is isolated in the chat's managed `mobile-overlay-pr116` worktree; the primary checkout and unrelated D1 incident evidence are untouched.
- The ordinary merge of `origin/main` conflicted only in `package.json`: both branches added scripts at the end of the scripts object. Resolution retains all three overlay scripts and main's `test:scholarships:performance`, including main's updated scholarship test chain. Main's backend performance and release-baseline changes are retained without edits.

## Task 01 defects found and corrected

1. **Layout CSS reached portal headers.** Mobile browser rules styled every `header` with a white background. Modal headers with white text became unreadable. Page header/footer background rules are scoped to `#root`, preserving the component's own portal presentation.
2. **Absolute descendants created phantom backdrop scrolling.** The screen-reader table heads in the DRL guide could escape their static panel's clipping box and enlarge the overlay's scroll range. Static panels receive a relative containing block; existing positioned panels retain their positioning. Original inline position, priority, overflow and maximum height are restored on cleanup.
3. **Focus restoration could move the background.** Returning focus to the event-filter trigger, DRL opener or scholarship menu button now uses `preventScroll`, retaining keyboard focus without overriding the restored scroll position.
4. **WebKit viewport resize could retain an obsolete panel cap.** In the reproduced case, the wrapper shrank to 544px while the panel remained 844px high and the input moved to y=-238. The wrapper and panel now use the same `VisualViewport.height` measurement, subtracting padding and borders, rather than re-reading a potentially stale `clientHeight` during resize. The regression explicitly simulates that stale metric.
5. **SweetAlert's Safari fix overwrote the shared body offset.** Its `GestureEvent` detection enables a vendor fix which writes `body.top=0` and later clears it even with scrollbar padding disabled. At a saved offset of 1479px, the background rect moved from -1479 to 0 while another modal remained open. A lock-lifetime MutationObserver preserves only manager-owned body properties and priorities before paint; it disconnects before the final snapshot restoration. Other inline styles remain editable. The regression explicitly enables the vendor's Safari detection, checks the body rect during and after alert dismissal, repeats the cycle and verifies the observer is gone after final cleanup.
6. **The student drawer fell under page-root CSS.** Mobile-browser `#root > div` rules changed the drawer from fixed to relative, placing its close button at y=4291 in the reproduced iPhone layout. The existing drawer is now portaled to body, outside page-root rules and layout containment, retaining its controls, menu structure, z-index and shared hook. Acceptance checks the real close button's hit target on all four widths and nested modal ownership.

No popup business rules, auth/permissions, event-filter semantics, ticket design or other UX task were changed.

## What the automated browser runs exercise

The existing Node test runner and Playwright Core drive Vite on loopback. The acceptance app renders **the actual production component trees** under real layouts. It does not copy popup markup or mock the scroll-lock implementation. A test-only Vite transform exposes private modal components and state setters so otherwise inaccessible data branches can be opened deterministically. Each result identifies whether opening used the fixture launcher or a state control. Closing uses existing controls; mandatory password/schema gates use owner unmount cleanup.

All session and API responses are isolated fixtures. Same-origin API/public-data requests are fulfilled locally; external requests are intercepted. Browser contexts are fresh, service workers are blocked, and the fixture server does not load production environment files. No production login, database write or message is performed. The support flow opens its actual create-ticket form, enters title/message, and verifies button reachability without submitting a production ticket.

Each of the 82 inventoried overlay roots is tested at 375, 390, 412 and 360 CSS pixels in Chromium and at 375 and 390 in WebKit. Assertions cover deep initial scroll, locked background, independent interior scroll when content overflows, edge chaining, close/control hit testing, restored scroll and inline priorities, horizontal overflow, phantom scroll range, text persistence through rotation/reduced viewport, browser-supported date/time fields, and runtime/React errors.

Additional foundation runs exercise out-of-order nested closes, unexpected unmounts, route cleanup, StrictMode, document/internal scroll roots, existing student/staff/scholarship drawers, and drawer + modal + SweetAlert ownership. Chromium uses native CDP touch sequences as well as wheel. Playwright does not implement wheel in mobile WebKit, so that engine uses native keyboard PageDown for scroll assertions; click, input and viewport operations remain native browser automation.

## Validation results

| Check | Executed result |
| --- | --- |
| `npm run test:overlay` | PASS 4/4 |
| `npm run test:overlay:browser` | PASS 13/13 |
| Related calendar guide / DRL / event detail / staff sidebar browser tests | PASS 17/17 |
| Chromium production popup matrix | PASS 328/328: 82 each at 375, 390, 412 and 360px |
| Chromium touch / nested / route / internal-root and real drawer foundation | PASS 16/16 |
| WebKit production popup matrix | PASS 164/164: 82 each at 375 and 390px |
| WebKit keyboard / nested / route / internal-root and real drawer foundation | PASS 8/8 |
| `npm run typecheck` | PASS |
| `npm run cf:typecheck` | PASS |
| `npm test` | PASS 1280/1280 across 17 Node invocations; no skips or cancellations |
| `npm run build` | PASS, including local PWA asset generation |
| `git diff --check` | PASS |
| `REAL_DEVICE_ACCEPTANCE` | NOT VERIFIED |

The committed [evidence index](qa/overlay-116/README.md) contains the complete per-device/group matrix, full-resolution samples, contact sheets and executed command logs. [Individual results and screenshot hashes](qa/overlay-116/acceptance.json) retain each scene's geometry, input/date/time checks, reachable controls, isolated requests and warnings. Raw before/during/after, landscape and compact screenshots remain at the recorded local `.cache` paths. Source hashes normalize CRLF to LF so they can be checked against Git blobs on any platform.

[Related browser log](qa/overlay-116/related-browser.log), [pre-fix SweetAlert body movement](qa/overlay-116/pre-fix-sweetalert.json) and [pre-fix drawer geometry](qa/overlay-116/pre-fix-student-drawer.json) provide additional review evidence. Visual inspection covered the required modal families, compact form states and the corrected drawer; automated geometry and hit-target assertions run for every scene. No clipped close control, severe horizontal overflow or unexpected runtime/React error remained in the final runs.

The internal-only foundation checks body geometry while SweetAlert is open, rather than treating an unowned `body.top=0px` as movement. Document locking still checks the exact owned offset; both paths verify the original inline state after dismissal. Test-only readiness waits, isolated automatic prompts, installed font bytes and bounded WebKit host lifetimes keep the component fixtures deterministic without altering production behavior.

Reproduce:

```powershell
npm run test:overlay
npm run test:overlay:browser
$env:ACCEPTANCE_OUTPUT='.cache/chromium-acceptance-verified'
npm run test:overlay:mobile
$env:ACCEPTANCE_ENGINE='webkit'
$env:ACCEPTANCE_OUTPUT='.cache/webkit-acceptance-final'
npm run test:overlay:mobile
Remove-Item Env:ACCEPTANCE_ENGINE
npm run typecheck
npm run cf:typecheck
npm test
npm run build
git diff --check
node tests/report-mobile-overlay-acceptance.mjs
```

Set `CHROME_PATH` if Chrome is installed elsewhere. Install the matching local engine with `npx playwright-core install webkit` if needed. The Windows checkout's existing SQL golden comparison requires LF bytes equal to the committed `0058_seed_drl_catalog_2026.sql` blob during `npm test`; checkout formatting is restored afterward. Neither SQL content nor its assertion is changed.

## Scope of the acceptance claim

`AUTOMATED_MOBILE_ACCEPTANCE` covers the executed local fixture/browser matrix. `REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`: Windows WebKit is not an iPhone. Safari's physical address bar, real software keyboard, notch safe-area values, OS date/time picker UI, installed PWA and real-device rubber banding are not claimed as tested. Reduced viewport, VisualViewport offsets/scale, browser date/time input values and standalone/internal-container emulation provide automated regression coverage within those limits. No phone check is requested as part of this task.

The existing Recharts initial/hidden-container measurement warning is retained separately in JSON evidence. It is a chart-library diagnostic, not a React warning, and is outside Task 01. Unexpected console errors, React warnings and runtime errors fail acceptance.

Visual follow-ups outside Task 01: the schema-warning modal's long migration filename wraps poorly in WebKit, and long subject names make ranking-table rows tall on narrow screens. These existing copy/typography issues do not create document overflow or hide modal dismissal controls. They are recorded for later UX work; no schema, auth or typography changes were made here.

## Safety

No PR merge, deployment, Wrangler deploy, remote migration, production/environment/secret change, OAuth scope request or force push. The PR diff against synchronized main leaves Auth Worker, database/migrations and release workflows unchanged. Local fixture databases used by the repository's test suite are isolated.
