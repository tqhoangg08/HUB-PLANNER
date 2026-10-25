# Dashboard overview follow-up

The owner's desktop/mobile HTML and images are layout references. Existing Inter imports, the 14px root, typography roles, gray-300 card borders, transcript, real calculations and permission/state handlers are retained. Before source: `c92b6e9b00b7d23e0aef18a51edfb3e17f58f4e9`.

- Remove the four small white login boxes and the additional large trend-chart lock panel. Locked ranking/forecast/trend/distribution/year cards instead show separate examples with `blur(2px)`/opacity `.5` and a small static lock label at the heading. Examples are decorative, aria-hidden, with an accessible illustration notice; they contain no inputs, buttons, links or stored study data. They are not actual personalized results.
- Mobile browser: remove the blue banner, retain a compact setup entry, and expose login directly in the existing header. Desktop retains a single common banner. The existing install/menu actions remain available, including when all three controls are present.
- Keep two-column KPI cards on phones, stack distribution/year cards full-width, and remove the year card's internal vertical scroller. Preserve GPA10 and all real yearly data/formatting, detail entry, chart tooltips and ranking interactions for unlocked users.
- Credit progress uses the existing earned/required values. The visual/ARIA percentage is bounded to 0–100%; raw credits/target remain unchanged. No artificial nonzero progress is shown for zero credits.
- Assessment uses its actual analysis text without quotation marks. The no-debt state is a noninteractive pill beside the title; the existing failed-course button still opens its dialog. Decorative KPI/assessment icons are removed. No global typography/CSS migration.

## Measured result

Chromium, guest and student fixtures, 390px viewport:

| Geometry | Before | After |
| --- | ---: | ---: |
| Distribution width | 173px | 358px |
| Year summary width | 173px | 358px |
| Assessment height | 112.64px | 73.5px |
| Small white login boxes | 4 | 0 |

The assessment is shorter without shrinking readable text; it is not claimed to be exactly half-height. Desktop retains side-by-side distribution/year cards, and the main trend area remains wider. Native input sizes, modal controls and existing transcript layout stay intact.

## Acceptance

Actual `ProtectedAppShell`/`ProtectedAppRoutes`/Dashboard components in React StrictMode, local Vite, isolated API/identity fixtures. The fixture supplies a terminal public `/login` page because production authentication lives outside `ProtectedAppRoutes`; production Auth is untouched. An onboarded guest case verifies that live target input/ranking remain available under the existing rules.

Chromium 155 **10/10 PASS**; WebKit 26.5 **10/10 PASS**. Geometry at 320/360/375/390/430/1024/1440px, actual desktop contexts, preserved Inter/theme borders, no page overflow, mobile login/optional install/menu >=44px, onboarding/login navigation, no interactive teaser controls, onboarded guest ranking modal, existing semester/native ĐRL/delete confirmation, student/guest Dashboard and PWA reflow/200% text/text-spacing, desktop banner geometry and runtime/network checks. Study-data/admin-student model regressions **19/19 PASS**. Frontend/Cloudflare typecheck, build and diff check **PASS**; existing chunk-size build warning remains. Exact final-HEAD full-suite CI is reported in the PR.

The Dashboard and layout controller ASTs are identical to the before commit; the entire `SemesterTable` AST is identical. Source hashes/proofs and geometry are in [validation.json](validation.json). [Chromium log](chromium.log), [WebKit log](webkit.log), [models](model.log), [frontend typecheck](typecheck.log), [Cloudflare typecheck](cf-typecheck.log), [build](build.log).

During development the first regression assumed an RGB serialization for the theme's gray token; it now resolves the rendered theme probe instead. Subsequent failures exposed an exact-label locator mismatch and the protected-only fixture's `/login` redirect. These fixture issues were corrected without relaxing layout/runtime assertions. The final logs above are the acceptance evidence.

## Images and limitations

[Before mobile](before-mobile-390.png) · [Before desktop](before-desktop-1440.png) · [Mobile viewport](mobile-viewport-390.png) · [Mobile 320](mobile-320.png) · [Mobile 390](mobile-390.png) · [Student 390](student-390.png) · [Desktop 1440](desktop-1440.png) · [WebKit 390](webkit-390.png).

Optional install + login + menu may wrap with branding at narrow widths or enlarged text; no control is removed or shrunk below its target. Illustration opacity/blur is deliberately excluded from meaningful-text contrast claims. Real content remains covered by the existing design assertions. School announcements scrolling/API, actual chart/data behavior, PWA implementation, shared Overlay, Auth, database, release guards and production stay unchanged. No merge/deployment. **REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED**.
