# EventsBoard page layout refinement

Scope: the existing `EventsBoard` page on the regular website. `MobileEvents` for standalone/PWA and event filter data semantics are unchanged. The [reported desktop screenshot](before-desktop.png) shows a full-width search row, page actions mixed into filters, an empty 44px chip row, and a tall CTV banner.

The page now puts the existing guide and contribution actions beside its title on desktop, caps the search field at 320px, and aligns search/filter/date/sort/refresh in one 36px row. Refresh has a visible label; the guide retains its accessible name. The existing note text is presented without a typed asterisk or italics. The CTV callout keeps its wording and registration handler while using a compact single line with a secondary action. An empty active-filter row is hidden only in this page layout; applied chips remain available.

This records the initial layout change. The later [toolbar refinement](../events-board-toolbar-refine/README.md) updates the notice copy and lets search fill the remaining desktop width.

| Chromium geometry | 390px | 1024px | 1440px |
| --- | ---: | ---: | ---: |
| Search width | 358px | 320px | 320px |
| Toolbar height | 96px | 36px | 36px |
| CTV banner height | 60px | 42px | 42px |
| Horizontal page overflow | no | no | no |

[Chromium desktop](chromium-1440.png) · [WebKit desktop](webkit-1440.png) · [Chromium phone browser](chromium-390.png) · [WebKit phone browser](webkit-390.png). Full [Chromium](chromium-geometry.json) and [WebKit](webkit-geometry.json) geometry is adjacent. The fixture renders actual `EventsBoard` under React StrictMode, intercepts its API with isolated data, and rejects unexpected writes or runtime/console errors. The browser regression also opens and closes the existing DRL guide and contribution modal from the moved buttons, and confirms the mobile actions remain in their sheet.

Browser emulation is not a physical iPhone test. `REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED`. The images contain only fixture data and no production writes.

Local validation: page browser acceptance **1/1 PASS per engine** across the three listed widths; event filter model **5/5 PASS**; shared overlay unit **4/4 PASS**; frontend and Cloudflare typechecks and production build **PASS**. The local Windows `npm run test:event-drl` suite reports an unrelated exact-text migration assertion: the checked-out SQL has 102 CR characters while the generated seed uses LF, and the two strings are identical after CR removal. This patch changes neither migration nor seed. Exact-HEAD GitHub CI is the release-quality full-suite evidence. See [validation.json](validation.json).
