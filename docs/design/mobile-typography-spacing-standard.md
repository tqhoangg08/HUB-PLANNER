# HUB Planner mobile typography and spacing

Applies to browser and standalone UI, including staff views on phones. The 14px
document root, Inter Latin/Vietnamese files, desktop density, business values and
PDF output are separate compatibility boundaries. Tokens live in
`styles/mobile-design.css`; components opt in using semantic classes.

## Type roles

| Role / class | Token | Default CSS px | Line height |
| --- | --- | ---: | ---: |
| Page heading / `ui-page-title` | `--ui-font-page` | 26 | 1.3 |
| Section / `ui-section-title` | `--ui-font-section` | 18 | 1.4 |
| Card heading / `ui-card-title` | `--ui-font-card` | 16 | 1.4 |
| Reading content / `ui-body` | `--ui-font-body` | 16 | 1.5 |
| Supporting copy / `ui-secondary` | `--ui-font-secondary` | 14 | 1.5 |
| Action / `ui-action`, `ui-action-label` | `--ui-font-action` | 14 | 1.4 |
| Short metadata / `ui-meta` | `--ui-font-meta` | 12 | 1.5 |
| Editable field / `ui-input` | `--ui-font-input` | 16 | 1.5 |

Type tokens use rem, relative to the existing root. Prefer 400 body, 500 metadata,
600 controls/labels and 700 headings. A heading's role follows its visual purpose,
not only its HTML level. Keep correct document heading order independently.
Do not apply metadata to paragraphs that carry primary instructions. Do not
resize GPA, course identifiers or scientific values as a substitute for hierarchy.
Meaningful Vietnamese text needs enough line height for accents.

## Space and touch

`--ui-space-1/2/3/4/6/8` = 4/8/12/16/24/32px. Use `ui-card-space` for 16px
card padding, `ui-page-gutter` for 16px page gutters, `ui-section-inset` for
aligned cards, `ui-section-gap` for 24px section separation. Small related items
use 8px, control rows 12px, large content divisions 32px. A 12px gutter needs
documented narrow-screen measurements. Do not use negative margins to hide reflow.

Important independent mobile actions use `ui-action`: at least 44×44 CSS px,
with growth in em for larger text. Prefer 8px separation when feasible. Icon
artwork may be smaller. Inline prose links use `ui-inline-link`, not an artificial
44px inline box. Give icon-only controls accessible names. Keep visible keyboard
focus and test hit testing, not just bounding boxes.

### Transcript hierarchy

The browser transcript is a scoped density variant: its section heading is
18px/600 on mobile and 20px/600 on desktop; semester selectors are 16px/600
and 17px/600 respectively. The owner's compact toolbar variant uses 13px/500
labels and 14px icons inside a 32px-high painted surface. The real buttons keep
>=44px mobile hit areas and >=36px desktop hit areas, with 8px between actions;
the overflow surface is 32px square. Menu labels retain the 14px action role.
This scoped density exception applies only to the toolbar's short labels,
not body copy or other controls. Text can grow and wrap rather than clipping.
This does not change other headings,
global input sizes, PWA components or document/PDF styling.

44px is **HUB Planner's product contract**, informed by
[Apple's 44-point guidance](https://developer.apple.com/design/tips/).
[Android recommends 48dp](https://support.google.com/accessibility/android/answer/7101858?hl=en),
which is a native unit, not a claim that dp equals CSS px.
[WCAG 2.2 AA target size](https://www.w3.org/TR/WCAG22/#target-size-minimum)
uses 24 CSS px with defined exceptions; 44px is not its AA minimum.

## Colour and responsive behavior

Follow [WCAG 2.2](https://www.w3.org/TR/WCAG22/): normal text 4.5:1; large
text 3:1; essential non-text boundaries/states 3:1 where SC 1.4.11 applies.
Inactive controls have the applicable WCAG exception, not a blanket requirement
to make all disabled labels low-contrast. Use resolved foreground and background,
including alpha. A gradient/image/backdrop must be sampled from rendered paint
or reviewed explicitly. An unknown background is NOT a contrast PASS.
Decorative separators are not meaningful text. Preserve meaning without relying
on colour alone. Test normal, selected and focus states.

Reflow at 320 CSS px; resize text to 200%; apply SC 1.4.12 overrides (line height
1.5, paragraph spacing 2em, letter spacing .12em, word spacing .16em). Do not
clip meaningful labels or hide page overflow to mask defects. Timetable grids and
data tables may use a named, keyboard-accessible internal two-dimensional scroller
under the SC 1.4.10 exception; ordinary prose cannot use that exception.

Use `ui-readable` where the whole label must be available. Truncation is only
appropriate when the same flow exposes the full text through an accessible
detail view. Do not fix card heights around text. Keep content reachable at the
end of internal scrollers. Bottom navigation must grow with labels and reserve
matching content clearance. Test the final footer, not only the first screen.

## Safari and overlays

Coarse-pointer form controls use a computed 16px minimum to reduce iPhone focus
zoom. Keep native date/number controls, pinch zoom and `text-size-adjust:100%`.
Never solve focus zoom with viewport maximum-scale, user-scalable=no, CSS scaling
or global text-size-adjust:none. Preserve shared Overlay/VisualViewport and
safe-area behavior. Test short viewport, landscape, focused fields, close/submit
access, internal scroll and background position restoration. Native picker chrome,
Safari toolbar animation and physical keyboard behavior require real-device
evidence before claiming physical iPhone acceptance.

## Examples and required QA for future UI

Good: `<p className="ui-body">Hướng dẫn đầy đủ…</p>` and
`<button className="ui-action" aria-label="Đóng">…</button>`.
Bad: primary instructions in `text-[9px] font-black`, fixed-height multiline cards,
or global `span`/`button` overrides with `!important`.

Role-scoped `!important` exists only to supersede old mobile skin selectors. New
features should use the role directly, remove the competing local size utility,
and avoid adding another specificity layer. Desktop/PDF styling stays separate.

Every UI PR must capture computed font/line height, touch geometry, spacing,
contrast, clipping and overflow from actual components with isolated API data.
Include browser/PWA, Chromium/WebKit, 320/360/375/390/430px, tablet/desktop and
landscape; text enlargement, text spacing and keyboard viewport; interaction and
focus regression; screenshots before/after and exact validation commands. Record
exceptions by element, reason, standard and evidence. Do not lower thresholds to
make tests pass. Automated checks are scoped evidence, not a site-wide WCAG
certification or a substitute for assistive-technology evaluation.

## Compatibility and numeric displays

Use `ui-numeric` for existing GPA/score displays and course identifiers. Keep their
original font utility and data formatting rather than assigning a reading-copy
role that can shrink the number. These displays still respond to user text
resizing. Existing compact course-code badges retain their original size under
the explicit compatibility contract; the full course detail remains available.

`ui-icon-control` is an explicitly named 44px icon-only hit area. It does not
scale artwork or suppress text zoom. A floating icon's fixed container must match
its visible box: a top and bottom constraint must not create an invisible pointer
surface. PWA navigation can grow with text; floating controls must remain above
its measured edge after viewport/text resizing. Keep conversation state and API
behavior separate from these geometry constraints.

Cards and page gutters migrate to the pixel spacing tokens. Existing nested
Tailwind gaps remain relative to the preserved 14px root where needed for legacy
control/icon alignment and desktop compatibility; record their computed values
instead of declaring every legacy utility a token. New UI should use named space
tokens. Profile facts use auto-fit tracks with a rem minimum, allowing fewer
columns when text grows; horizontal tab strips keep their own scroller without
negative outer gutters. Mobile shell headers wrap through the browser's 767px
breakpoint, including landscape; desktop density starts outside this scope.

Named form surfaces also standardize placeholder colour/opacity and visible field
borders. Measure the actual placeholder pseudo-element and composite its alpha
against the rendered field canvas; a label is not a reason to skip placeholder
contrast. Focus rings use a blue outline with an opaque white halo on named
actions, keeping the indicator visible on both navy and pale surfaces. Check
normal, hover, selected, focus and applicable disabled states using computed
styles and rendered paint. Unknown colour/background composition stays unverified.
