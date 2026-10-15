> Historical implementation brief. Current v1.1.0 API contract, the owner-approved compact table, and the release audit handoff supersede the old mock/landing/card/rebase guidance. This file is retained for provenance, not as a new execution instruction.

# ANTIGRAVITY EXECUTION BRIEF — HUB SCHOLARSHIP FRONTEND

ROLE: You own React UI/UX, route integration, client API adapter, photo editor and browser-side exports. Implement working code and demonstrate it; do not just create Figma-like static mockups.

## Mandatory context
Repository https://github.com/tqhoangg08/HUB-PLANNER
Backend PR: https://github.com/tqhoangg08/HUB-PLANNER/pull/91
Backend branch: feature/hub-scholarship-foundation
Read docs/hub-scholarship-api-contract.md and docs/hub-scholarship-codex-brief.md plus React router, protected/public routing, shells, nav/sidebar/mobile conventions and package.json. Check backend branch commit and especially the ANTIGRAVITY_READY handoff from Codex before implementation. If not present, use contract v0.1 for mock development and explicitly flag that final API integration is pending.
Start AFTER Codex finishes and commits the backend contract when possible.

## Branch strategy
- Fetch latest feature/hub-scholarship-foundation and branch from that exact HEAD into feature/hub-scholarship-frontend (do not write to main or the backend branch).
- Open Draft PR targeting feature/hub-scholarship-foundation (stacked PR); do not merge. If GitHub refuses this base, report it and keep branch separate.
- Do not modify Worker code, migrations, Auth Worker, production settings or scripts that mutate production. Avoid changing backend API contracts; if contract issues arise document them rather than inventing server behavior.

## Product: three linked experiences
1. /scholarships — PUBLIC landing. Academic celebration visual direction (HUB navy + champagne gold + spacious type, tasteful glows, accessible contrast), clear tabs/cards "Danh sách", "Tra cứu", "Vinh danh", campaign selector and official source/provenance label. With zero published campaigns, show honest "Sắp công bố"/no results, never fake stats.
2. /scholarships/list — PUBLIC full officially published recipient list with school-approved public scores, readable desktop table, mobile cards, pagination, filters for campaign/semester/award type and only backend-supported sort. Protect against loading 10k records at once; good pending/empty/error/retry states. Fields not public or null must not be fabricated.
3. /scholarships/search — PUBLIC fast search by name or student code, display source + year + approved score columns; show multiple candidates when names repeat, support diacritics/no diacritics; debounce, latest-request wins, accessible keyboard, no result vs unavailable distinction. CTA to log in to view PERSONAL awards; never say this public result is verified ownership.
4. /scholarships/me — AUTHENTICATED personal view. Reuse Better Auth login/session flow; ensure redirect back after sign-in using existing routing conventions. Distinguish unauthenticated, authenticated-unverified, verified-with-no-award, verified-with-award, expired session and network error. Only use server response from /api/me/scholarships; do not take student ID from query or search.
5. /scholarships/celebrate — AUTH + VERIFIED award required. Select award from /api/me/scholarships and render 3 to 4 tasteful card templates (Academic Gold, HUB Minimal, Scholarship Flex, Soft Achievement). Accurate immutable verified recipient name and award/category from backend. User may toggle visibility of optional published scores and student code; cannot edit them to fabricate recognition.

## Portrait/photo editor acceptance criteria
- Upload JPG/PNG/WebP from device to browser memory, validate MIME and magic bytes where reasonable, size and pixel bounds; error states clear.
- EXIF/phone orientation handled; drag, crop, zoom, focal positioning and mask shape (circle or card layout); preview for each layout.
- Use local Canvas / browser APIs only; no face inference, no server upload, no third-party photo processing, no data URLs in analytics, no image persistence by default. Release object URLs on unmount.
- Export true high-resolution PNGs for portrait Story (1080x1920, 9:16) and feed card (1080x1350, 4:5), correct fonts, safe text wrapping, image orientation, no watermark covering personal data. Provide accessible retry on export errors.
- Web Share API for image files only if device supports it, otherwise download and let user post manually. Do NOT promise one-click posting to Instagram, Threads, Facebook, Zalo if unsupported. No unsolicited public share page exposing score data.
- Gentle opt-in Victory Reveal animation/confetti, prefers-reduced-motion support, no heavy blocking splash, easy bypass.
- No fabricated award when authenticated student's record not found.

## UI integration & code quality
- Use React 19, TypeScript, Tailwind 4, Lucide (existing dependency), clean modular components under features/scholarships or consistent repo design.
- Register PUBLIC routes in AppRoutes before catch-all / to prevent protected-redirects for guests; use existing authenticated route/session mechanisms for /me and /celebrate. Inspect desktop and mobile shell before changing menus. Admin /admin/scholarships page may be built according to finalized admin API; server always enforces admin permission.
- Source types from shared contract and create centralized API client in frontend. No hard-coded backend URLs; use same-origin relative /api calls, AbortController, sensible timeout/error handling.
- Include UX for campaign archived/withdrawn after user selects it, network failure, 401, 403, unpublished and null score fields.
- All mock local fixtures must be visually marked SAMPLE and absent from production UI/build paths. With empty backend list the real UI says "Sắp công bố".
- Desktop, tablet and especially narrow mobile 360px plus safe area. Maintain HUB navigation/accessibility and visually consistent typography; do not substitute a completely separate app.

## Test, review, deliverable
- Run npm run typecheck, npm run build, relevant existing tests and new UI tests as possible. Capture local/browser screenshots, examine mobile/tablet/desktop and check at least one complete route transition.
- Test portrait upload/crop/export visually at both exact output sizes; confirm files work.
- Demonstrate manual QA states (mock/empty/verified/unverified/error, with clearly labeled mocks).
- Commit changes and open a Draft PR targeting feature/hub-scholarship-foundation, providing screenshots and exact changed files, test results and remaining gaps. No deploy, no merge, no production data import.
- Avoid touching backend branch while Codex works. If backend changes while frontend work proceeds, rebase/sync latest contract carefully and report differences before integration.

## Handoff to integration Codex
Provide PR URL, frontend branch/head SHA, screenshot links or descriptions, updated client types, any unresolved API mismatches, and browser test report. Backend Codex will handle stacked merge after tests and user approval.