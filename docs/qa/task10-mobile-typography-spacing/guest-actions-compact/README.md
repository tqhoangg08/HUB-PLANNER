# Compact preview-banner actions

Only the browser Dashboard guest banner's **Cập nhật thông tin** and **Đăng nhập ngay** pair changes. Each visible surface is 32px high with 13px/500 Inter text. The real mobile button/link retains a >=44px hit area; desktop uses >=36px. The action row now fits the labels instead of spanning the full banner, with equal mobile columns and an 8px gap. The update callback, login route/click handler, preview copy, page title and other controls are unchanged.

At 320px the first implementation's 8px horizontal padding left 110.5px for a label whose measured single-line width was 114.30px, causing a second line. Scoped 6px horizontal padding fits both full labels without lowering font size or hiding content. At enlarged text, surfaces remain free to grow. No fixed text height or zoom prevention is used.

Chromium 155 and WebKit 26.5 each passed **2/2 targeted tests**: the actual guest Dashboard with normal/reflow/200% text/text-spacing checks, and the banner actions at 320/360/375/390/430/1440px. Assertions cover 13px/500 labels, 32px painted surfaces, equal mobile frames, text centering within 2px, >=44px mobile hit areas, pointer ownership of transparent padding and no horizontal page overflow. Clicking that padding invokes the existing onboarding callback exactly once and navigates to the existing `/login` route. Runtime warnings/errors and unexpected fixture writes are asserted empty. Identity/API data are isolated synthetic fixtures in React StrictMode.

Frontend typecheck, Cloudflare typecheck, build and diff check passed; the existing build chunk-size warning remains. Full-suite final-HEAD CI is recorded in the PR. Production Dashboard AST is equal to the previous commit after normalizing only class names, the new presentation spans and JSX indentation. PWA, Auth, permissions, API/database and Overlay are unchanged. No merge or deployment; physical iPhone acceptance is **NOT_VERIFIED**.

[Measurements/source proof](validation.json) · [Chromium log](chromium.log) · [WebKit log](webkit.log) · [Typecheck](typecheck.log) · [Cloudflare typecheck](cf-typecheck.log) · [Build](build.log).

[Before](before-390.png) · [After 390px](after-390.png) · [After 320px](after-320.png) · [WebKit](webkit-after-390.png).
