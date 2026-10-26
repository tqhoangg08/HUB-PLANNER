# Text-only preview login entry

Owner follow-up to `f476cd69bbffcbe182f27708bbf45d14f773d9b1`: add back “Cần đăng nhập” with no lock/key icon, retaining actual data, preview blur and direct login navigation.

Five conditional links live in the ranking, forecast, trend, distribution and year-card headings. They are outside the blurred content and navigate to `/login`. The shared link stops click propagation so the ranking card cannot also open its modal. No icon/emoji/image is rendered. A compact amber surface sits inside a >=44px hit target. Narrow headers wrap instead of shrinking text or overlapping content. Signed-in users have no preview login labels.

Chromium 155 initial suite **8/8 PASS**. WebKit 26.5 initial suite **7/8 PASS**, with a click timeout at the fifth link after scrolling (no React/runtime error). An unchanged isolated rerun passed. The final pointer test explicitly centers each target and asserts `elementFromPoint` belongs to the link before a normal click: **1/1 PASS on each engine**. No force-click or assertion removal. Application source did not change; the other seven scenarios were retained. The combined suite was not rerun after that test-only refinement; initial and final logs are preserved separately.

Coverage: exact text, absence of icons, all five links at 320/375/390/430/1440px, minimum targets, no horizontal overflow, each link clicked and returned from login, no unintended ranking modal/scroll lock, retained computed blur/focus behavior, actual data/empty state, goal editing, ranking, setup/header login, Dashboard reflow/200% text/text-spacing and runtime/network assertions. Frontend/Cloudflare typecheck, build and diff check **PASS**; existing chunk-size warning remains. Full offline suite is verified by final-HEAD PR CI, linked in the PR.

Source proof: the entire Dashboard AST is identical after removing only the dedicated login-link import and five new conditional link nodes, with formatting whitespace normalized. Data/calculations/handlers, shared Overlay, backend/Auth permissions, PWA implementation, setup link, blur and progress remain unchanged. No sample data or login banner returns.

[Before](before-390.png) · [Mobile](mobile-390.png) · [Desktop](desktop-1440.png) · [WebKit](webkit-390.png) · [Measurements/source proof](validation.json).

[Final Chromium pointer test](chromium.log) · [Final WebKit pointer test](webkit.log) · [Initial Chromium suite](chromium-initial.log) · [Initial WebKit suite](webkit-initial.log) · [Frontend typecheck](typecheck.log) · [Cloudflare typecheck](cf-typecheck.log) · [Build](build.log).

[Unchanged isolated WebKit rerun](webkit-unchanged-rerun.log) records the intermediate successful reproduction attempt.

The earlier no-label report is historical for that detail; its actual-content/blur/no-banner behavior remains. Requested blur is not security or a claim of contrast compliance for obscured text. No production writes, merge or deployment. **REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED**.
