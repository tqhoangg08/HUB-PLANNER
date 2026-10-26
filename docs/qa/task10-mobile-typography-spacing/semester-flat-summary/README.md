# Flat semester summary from the owner's reference

The supplied desktop/mobile images and HTML are presentation references. The implementation changes actual `SemesterTable` markup and scoped CSS only; its calculation/controller body and Dashboard controller AST are unchanged from `0f1f62bcef5a509c0dce9dcd45dd7013a2cfcbdd`.

On wide desktop, the native semester selector and full caption are on the left, with borderless credits, combined visual GPA4/GPA10, ĐRL, status and delete on the right. Light vertical rules replace individual boxes. The ĐRL native input has a subtle background and no frame around its metric. On mobile/tablet the four metrics form an equal-column flat strip with label above value, without horizontal scrolling. Mobile ĐRL remains a real >=16px number input with >=44px hit area and a dashed editing underline. Readable labels/values and full native controls take priority over copying the mock's smaller fonts/targets exactly.

Mobile uses the display caption `Học kỳ 1 (2026-2027)` while the native selector keeps the existing full `Học kỳ 1 Năm học 2026-2027` value and options. The chevron remains the existing picker. Classification and scholarship status move together into the heading pill; their actual computed labels, emoji and conditionals are preserved. Empty fixtures therefore show the existing `Không đạt`, not a hardcoded mock value. Ranking entry/portal, toolbar, table, empty messages and business/API logic stay intact.

Chromium 155 and WebKit 26.5 each passed **4/4 tests**: actual empty/populated header geometry across 320/360/375/390/430/768/1024/1440px; native semester/ĐRL/delete-confirm behavior; actual student and guest Dashboard normal/320px/200% text/text-spacing checks. Tests assert four same-row mobile cells, no individual top/bottom frames or cell background, no summary/page overflow, header state/delete above the strip, desktop title/metrics/delete center alignment and unchanged displayed credit/GPA fixture values. The interaction case verifies native values, ĐRL `100` through portrait/landscape resize, cancel/accept deletion, edit discard/restoration, runtime logs and no unexpected fixture writes.

The 1440px empty/populated cases use separate desktop browser contexts (`maxTouchPoints=0`), rather than relying on a resized phone context. An interrupted parallel rerun did not finish (including a WebKit target crash); the final sequential runs and logs below are the acceptance evidence.

Study-data/admin-student regressions: **19/19 PASS**. Frontend/Cloudflare typecheck, build and diff check PASS, with the existing build chunk-size warning. Exact final-HEAD full-suite CI is reported in the PR. Source proof compares controller/calculation ASTs and native input/select/delete callback attributes. No Auth, permission, API/database, PWA implementation, Overlay, PDF, release guard or production change. No merge/deploy. Physical iPhone acceptance: **NOT_VERIFIED**.

[Measurements and source proof](validation.json) · [Chromium](chromium.log) · [WebKit](webkit.log) · [Models](model.log) · [Typecheck](typecheck.log) · [Cloudflare typecheck](cf-typecheck.log) · [Build](build.log).

| View | Evidence |
| --- | --- |
| Prior five-cell layout | [Before](before-390.png) |
| Mobile empty | [390px](mobile-390.png), [320px](mobile-320.png), [WebKit](webkit-390.png) |
| Mobile populated | [390px](populated-390.png) |
| Desktop inline | [1440px](desktop-1440.png) |
