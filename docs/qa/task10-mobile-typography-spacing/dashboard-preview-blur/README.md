# Restore blur on actual preview content

Later owner follow-up: [add text-only “Cần đăng nhập” links](../dashboard-login-label/README.md), without icons. Actual content and blur below remain unchanged; this report's no-label state is historical.

Owner correction: restore the preview blur while retaining the actual data/features restored in `e68a32c2e4cbf3c616523625e4067f4fba208cb7`. No sample data, lock label or login banner is restored. `Thiết lập ngay →` still links directly to `/login`.

Only five existing content containers receive a conditional styling attribute: ranking, target forecast, trend chart, grade distribution and year summary. Guest without a completed profile uses `blur(2px)` and opacity `.5`. Headings, card borders and the GPA/credit summaries stay clear. Signed-in users and onboarded guests stay clear. The actual goal field/help becomes clear while focused and returns to preview styling on blur; pointer/keyboard behavior, DOM data and callbacks are unchanged.

Chromium 155 **9/9 PASS**, WebKit 26.5 **9/9 PASS**: computed blur/opacity in preview and clear states, empty/populated data, focus/edit/blur of the real target input, no sample/lock/banner, direct login, ranking modal, header/install controls, mobile/desktop geometry, Dashboard/PWA reflow/200% text/text-spacing, runtime and isolated network assertions. Frontend/Cloudflare typecheck, build and diff check **PASS**; existing build chunk-size warning remains. Exact final-HEAD full-suite CI is linked in the PR.

The entire Dashboard source AST is identical after stripping only the five new styling attributes. Calculations, permissions, data loading, chart/input implementation, navigation and transcript remain unchanged. This blur is requested visual presentation, not an access-control measure or a claim of WCAG contrast compliance for obscured text. Existing tests/contrast thresholds are not weakened. Focused controls retain clear content.

[Before](before-390.png) · [Mobile](mobile-390.png) · [Desktop](desktop-1440.png) · [WebKit](webkit-390.png) · [Measurements/source proof](validation.json).

[Chromium log](chromium.log) · [WebKit log](webkit.log) · [Frontend typecheck](typecheck.log) · [Cloudflare typecheck](cf-typecheck.log) · [Build](build.log).

The prior live-data report is historical only for its removal of blur; its real-data/no-banner/direct-login behavior is retained. No Auth/API/database/PWA implementation/Overlay/release/production change. No merge or deployment. **REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED**.
