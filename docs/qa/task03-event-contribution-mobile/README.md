# Task 03 — Event contribution modal mobile UX

Automated local acceptance, 2026-10-21. Base main:
`1a61b4451c43a1a26fadc8174a9ec05014d19739` (matches the requested checkpoint).
Branch: `codex/task03-event-contribution-mobile`.

## Reproduced findings

- Close hit targets measured **30×30 CSS px** in MobileEvents and **34×34px** in
  EventsBoard, with no accessible label. Both now have a strict 44×44px minimum
  and a label. The mobile draft-clear action also has a label and 44px target.
- With `event_time` focused and viewport height reduced to 240px, Chromium left
  that control below the viewport (MobileEvents: y=339..377; EventsBoard at 375px:
  y=295.5..333.5). WebKit left the board input under its sticky header
  (input y=4.5..42.5, header bottom=77). Header disappearance itself was **not**
  reproduced. The form lacked a local focus-reveal step after viewport changes.
- Touch controls computed to **13px**. Physical Safari focus auto-zoom was
  **NOT_VERIFIED**; this is a small-text risk, not a reproduced zoom event.
- WebKit did not focus clicked opening buttons. As in Task 02, contribution
  triggers now explicitly focus themselves without scrolling before opening.

Before measurements are in [measurements.json](measurements.json). The 240px
height is a keyboard/toolbar approximation, not a real software keyboard.

## Scoped implementation

- Both ContributeEventModal panels use a non-shrinking header and an independent
  flex content scroller; EventsBoard's header no longer shares its scroll box.
  Preferred heights use `dvh`. Only these two redundant outer portals are removed.
- `useEventContributionDialog` manages their focus lifecycle, Tab containment,
  Escape and revealing focused controls inside the form scroller after focus or
  VisualViewport/window changes. It does not set viewport dimensions, lock body,
  or duplicate Task 01's shared Overlay behavior. Rerenders do not refocus the
  panel; cleanup cancels its frame/listeners and skips disconnected return targets.
- Native date/time inputs and selects retain Escape to cancel their pickers;
  leave the control to use Escape to close the contribution modal. Nested
  confirmation dialogs own their focus/keys and do not dismiss the form beneath.
- Controls get 16px text only for coarse-pointer/no-hover devices. Desktop
  controls and labels remain 13px; the existing 38px field heights and layout
  assertions remain unchanged. No CSS zoom, transforms to shrink text, new
  dependencies or replacement picker library.
- EventFilterControls only widens its primary-action callback's TypeScript type
  to accept the button event. Filter behavior and event management are unchanged.

## Automated acceptance

| Real page component | Emulated viewport | Chromium | WebKit |
| --- | --- | --- | --- |
| MobileEvents | 375×667 (iPhone SE size) | PASS | PASS |
| MobileEvents | 390×844 (iPhone 13 size) | PASS | PASS |
| MobileEvents | 360×640 (small mobile) | PASS | PASS |
| EventsBoard | 375×667 | PASS | PASS |
| EventsBoard | 1440×900 desktop | PASS | PASS |

All cases also resize to 240px height and landscape. They use actual components,
React StrictMode and isolated anonymous API fixtures on local Vite. All external
requests and fetch/XHR are intercepted. The existing prediction POST is fulfilled
locally with a null prediction; every other non-GET request is blocked. No provider,
production authentication or production writes are used.

Assertions cover default closed and explicit opening; header and close hit
testing; independent form scrolling; background geometry/deep scroll restoration;
all four native input types and date/time values after focus, click, Escape,
blur, rerender, resize and rotation; Minigame start/end labels; `close_on_full`
disabling only deadline fields; submit reachability; no horizontal overflow;
button/backdrop/Escape dismissal and route cleanup; trigger focus restoration;
no runtime errors or React/console warnings. WebKit mobile scroll input uses
PageDown because Playwright does not support wheel there.

Mobile cases wait for the existing 500ms autosave before closing, then check
draft title/link/all four date/time values after reopening. Nested clear-draft
confirmation is cancelled by Escape and Cancel without releasing the form's
lock or changing the draft, then confirmed to check the existing reset behavior.
No new persistence policy or timing change was made.

The unchanged catalog regression passes at 1440/620/390px, retaining its 13px
desktop/label, 38px field-height, alignment, recovery and data assertions. Four
related overlay tests pass: nested ownership, SweetAlert adapter, VisualViewport
resize/offset/auto-zoom simulation, and real filter/DRL ownership. Full tests are
delegated to the standard PR CI; no local full suite or performance benchmark.

## Business invariants and limits

[business-integrity.json](business-integrity.json) records matching before/after
hashes of each contribution component's state/draft logic, complete submit
function and form JSX (line endings normalized only). `protectedSubmit`, action
`event-contribution`, payload, validation, Turnstile, notification and moderation
calls, recognition/organizer/DRL pickers, native time fields and draft effects
are unchanged. No Auth, database, migrations, Cloudflare or release changes.

The local fixture has no Turnstile key, so submission remains disabled. A real
challenge and a successful remote submission were **not** exercised; their code
and gate are unchanged. Native calendar/time-wheel UI selection/cancellation,
physical Safari keyboard/toolbar/notch behavior and actual focus zoom remain
**NOT_VERIFIED on real devices**. Automated tests verify DOM types, native values,
click/focus/Escape safety and resizing; they do not claim native iPhone picker UI
acceptance. These limits require real-device evidence to claim physical Safari
acceptance, not changes to this automated result.

## Evidence and commands

- [Mobile before](mobile-before-webkit.png) / [mobile after](mobile-after-webkit.png).
- [EventsBoard before](board-before-webkit.png) / [EventsBoard after](board-after-webkit.png).
- [Measurements](measurements.json), [business integrity](business-integrity.json),
  [validation output](validation.txt).

Screenshots were visually inspected: the post-fix focused field is below the
header and inside the compact viewport, and close actions remain visible.
Device pixel ratios differ between fixtures; target sizes are measured in CSS px.
WebKit can report a 44px DOMRect as 43.999992px due to coordinate precision. The
test checks CSS minima strictly at 44px and allows only 0.0001px numeric noise in
the rectangle. No user-visible target requirement was reduced.

```powershell
node --test tests/event-contribution-mobile.browser.test.mjs
$env:CONTRIBUTION_BROWSER='webkit'
node --test tests/event-contribution-mobile.browser.test.mjs
Remove-Item Env:CONTRIBUTION_BROWSER
node --test tests/event-contribution-catalog.browser.test.mjs
node --test --test-name-pattern='nested overlays|visual viewport|real event filter|drawer adapter' tests/overlay-scroll-lock.browser.test.mjs
npm run typecheck
npm run cf:typecheck
npm run build
git diff --check
```

The new browser test accepts `CHROME_PATH`; WebKit requires an installed
Playwright browser. Typechecks/build passed on the final product source; the build
retains its existing large-chunk warning. `REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`.
No merge or deployment.
