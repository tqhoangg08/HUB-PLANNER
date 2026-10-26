# Dashboard uses actual study data

Later owner correction: [preview blur is restored on actual content](../dashboard-preview-blur/README.md). No sample data, lock labels or login banner returns; direct login remains. The rest of this report is historical evidence for the real-data restoration.

Owner correction after `5472c6ad8f5609bc3137b8c2fad696c39756f456`: keep the responsive overview layout, but use the application's existing real charts/features; remove decorative sample data, blur, lock labels and the entire login banner. `Thiết lập ngay →` must navigate directly to `/login`.

## Implementation

- Delete `DashboardPreview` and `DashboardLockLabel`, including their example values and CSS. Keep the existing credit-progress function unchanged in the accurately named `DashboardCreditProgress.tsx`.
- Ranking uses `highestSubject`, forecast uses the existing `TargetGpaTipInput`/`requiredAnalysis`, trend uses the existing `LineChart`/`trendData`, distribution uses the existing `PieChart`/`pieData`, and yearly summary uses `yearlyStats`. Empty data uses the existing empty states, not fabricated courses or charts.
- Render those actual components for guests as well as signed-in users. Ranking/year-detail entry points and the local goal input are available; Auth/backend permissions and APIs are unchanged. Rename the old UI lock boolean to `needsProfileSetup` because it now only selects profile-status text and the login entry.
- Remove the banner sentence, `Cập nhật thông tin` and `Đăng nhập ngay`. Keep the existing header login. Replace the profile-setup button with a React Router link to `/login`; it no longer calls onboarding.
- Keep responsive card layout, Inter, current font sizes/theme borders, progress bar, compact assessment, stacked phone summaries and the transcript unchanged.

## Validation

Chromium 155 **8/8 PASS** and WebKit 26.5 **8/8 PASS**, using actual components in React StrictMode with isolated synthetic data/API fixtures:

1. Student/guest geometry at 320/360/375/390/430/1024/1440px, including actual desktop contexts; no previews, lock labels, banner or page overflow; real line/pie chart elements and target value; profile setup link navigates to login without opening onboarding.
2. Header login/optional install/menu remain visible and >=44px on phones.
3. Guest before/after profile setup shows actual target data; editing the target updates fixture state; ranking opens/closes its existing modal.
4–7. Existing student/guest Dashboard and PWA reflow, 200% text, text-spacing, runtime and unexpected-write assertions.
8. Empty guest transcript at 320/390/768/1440px: zero credit progress, no fabricated lines/pie/courses, no banner actions/locks, real empty state and direct login navigation.

Study-data/admin-student regressions **19/19 PASS**. Frontend typecheck, Cloudflare typecheck, build and diff check **PASS**; the existing chunk-size warning remains. Full offline/local suite is verified by final-HEAD PR CI, linked from the PR.

Source proof: Dashboard controller/calculation AST is identical after normalizing the name-only `isLocked→needsProfileSetup` change. The entire SemesterTable AST, LineChart/PieChart/TargetGpaTipInput JSX ASTs and credit-progress function AST are identical. The intended UI gating/login-navigation change is recorded explicitly; this is not a new calculation or backend access policy.

[Measurements/source hashes](validation.json) · [Chromium](chromium.log) · [WebKit](webkit.log) · [models](model.log) · [frontend typecheck](typecheck.log) · [Cloudflare typecheck](cf-typecheck.log) · [build](build.log).

[Before mobile](before-mobile-390.png) · [Current mobile](mobile-390.png) · [Current desktop](desktop-1440.png) · [WebKit mobile](webkit-390.png).

The earlier preview/lock/banner report is historical and superseded. Test fixtures contain synthetic scores only for isolated testing; production UI uses actual available user data. Existing GPA rounding/display conventions, chart rendering, permissions, Auth, APIs, database, Overlay, PWA implementation and production remain unchanged. Physical iPhone Safari: **REAL_DEVICE_ACCEPTANCE=NOT_VERIFIED**. No merge/deployment.
