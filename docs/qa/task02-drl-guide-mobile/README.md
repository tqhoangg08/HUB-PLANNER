# Task 02 — DRL guide mobile UX

Local automated acceptance on 2026-10-20. Base: `29a45995bad29b54bb5d0eff1f4f5890a42f851e`.
The requested checkpoint `c015275aaad5d4e46993950ad3d2f3d4a59d2b8b` is its ancestor;
main subsequently merged PR #120 (rankings D1 phase 3). Those additions did not
change the scoped DRL modal files. Work is on `codex/task02-drl-guide-mobile`.

## Findings and changes

- Reproduced in Chromium and WebKit: the close button was only **30 CSS px** tall.
  It now has an explicit 44px minimum height and 64px minimum width. This site's
  root font is 14px, so a rem-based `h-11` would not produce a 44px target.
- Reproduced in both engines: a parent rerender changed its inline `onClose`
  callback, reran the focus effect, and moved focus from the appendix summary to
  the dialog root. Focus now follows the open/close lifecycle; Escape uses a ref
  to the latest callback. Initial focus and focus restoration prevent scrolling;
  restoration skips disconnected elements during route unmount.
- Reproduced in WebKit: clicking the guide trigger did not focus that button,
  so the modal captured `body` as its return target. The guide button now focuses
  itself with `preventScroll` before invoking the existing open callback. This
  is the only behavioral change in `EventFilterControls`; filters are unchanged.
- The header is explicitly non-shrinking and the content is a separate shrinking
  flex scroller. The redundant outer portal was removed: shared `Overlay`
  already portals to `body`. Its scroll ownership, safe-area and VisualViewport
  implementation are reused unchanged.

`UNEXPECTED_OPEN_ROOT_CAUSE=NOT_REPRODUCED`. Both event pages initialize guide
state to false; the true setters are explicit guide actions. Tests exercise
initial mount, real keyword/sort filters, filter drawer, parent rerender and
route remount without opening the guide. No speculative state/event fix was made.
Header disappearance and horizontal clipping were also not reproduced in the
tested viewports. Their visibility and containment are now guarded by regression.

## Acceptance coverage

| Viewport | Page | Chromium | WebKit |
| --- | --- | --- | --- |
| 375 × 667, iPhone SE size | MobileEvents | PASS | PASS |
| 390 × 844, iPhone 13 size | MobileEvents | PASS | PASS |
| 360 × 640, small Android size | MobileEvents | PASS | PASS |
| 1440 × 900, desktop | EventsBoard | PASS | PASS |

These use real components/handlers in React StrictMode with local Vite and
anonymous empty API fixtures. All fetch/XHR and external requests are fulfilled
locally. No production authentication or data writes are involved. WebKit at
360px is a layout check, not a claim to emulate an Android browser engine.

Each case checks: default closed; no accidental opening after filters/rerender/
navigation; one dialog per guide click; header/close hit testing and 44px target;
independent content scrolling; last special case readable; preserved focus and
scroll after rerender; Tab/Shift+Tab containment; backdrop/button/Escape dismissal;
trigger focus and deep page scroll restoration; route-unmount lock cleanup;
240px height, landscape and 412px width; simulated notch padding; no horizontal
overflow; no runtime errors or console warnings. Chromium uses wheel input;
WebKit mobile uses PageDown because Playwright does not support wheel there.

All **5 sections / 64 rendered rows**, notes and special cases have the same
rendered-content SHA-256 before and after:
`094c51d315b7f44787e91bdb34fbe84870821eed75389664610c8c05e3b7df50`.
The policy source blob remains `2cfe5d7eb2c7ece9bfd7ade1e559251b516bfcfc`.

## Validation and reproduction

```powershell
node --test tests/drl-guide-mobile.browser.test.mjs tests/drl-policy.browser.test.mjs tests/overlay-scroll-lock.browser.test.mjs
$env:DRL_BROWSER='webkit'
node --test tests/drl-guide-mobile.browser.test.mjs
Remove-Item Env:DRL_BROWSER
npm run test:overlay
npm run test:event-drl
npm run typecheck
npm run cf:typecheck
npm run build
git diff --check
```

Chromium launch defaults to installed Chrome on Windows; `CHROME_PATH` can
override it in the new regression. WebKit requires an installed Playwright browser.
The desktop fixture was additionally checked with the mobile-browser CSS class
absent. See [validation.txt](validation.txt) and [measurements.json](measurements.json).
Full `npm test` is delegated to the PR's standard GitHub validation workflow.

An initial existing DRL migration assertion failed solely because Windows
`core.autocrlf=true` checked out generated SQL as CRLF while its generator emits
LF. With local LF bytes, that exact failed test passed; SQL was restored to its
original checkout bytes and is absent from this change. An existing SweetAlert
overlay case initially failed its cleanup timing assertion during parallel
browser runs; its isolated rerun and the final complete 19-test Chromium run
passed without changing that test or the shared foundation.

## Screenshots and limits

- [Before, portrait](before-webkit.png): unchanged base, 30px close target.
- [After, near the end of the appendix](after-webkit.png): non-shrinking header,
  44px close target, expanded special cases and keyboard focus visible.
- [After, 240px viewport height](compact-webkit.png): header and close remain
  visible, with the long content independently scrollable below them.

Screenshots were visually inspected for overlap, clipping and close-button access.
Their device pixel ratios differ; touch target comparisons use the CSS-pixel
measurements rather than image dimensions.

`AUTOMATED_MOBILE_ACCEPTANCE=PASS`.
`REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`.
Viewport resizing and simulated padding approximate toolbar/keyboard/notch
constraints; they do not exercise a physical iPhone, native keyboard or Safari
toolbar. No backend, policy data, shared overlay foundation, Auth, database,
release workflow or Cloudflare configuration was changed. No merge or deployment.
