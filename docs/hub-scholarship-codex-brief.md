# CODEX EXECUTION BRIEF — HUB SCHOLARSHIP BACKEND

ROLE: You own backend, data, permissions and release-safety. Implement in the repository, do not merely propose an implementation.

## Context / mandatory reading
Repository: https://github.com/tqhoangg08/HUB-PLANNER
Active integration branch: feature/hub-scholarship-foundation
Existing draft PR: https://github.com/tqhoangg08/HUB-PLANNER/pull/91
Read docs/hub-scholarship-api-contract.md, cloudflare/migrations/0055_scholarships.sql, cloudflare/worker/src/scholarships.ts, cloudflare/worker/src/index.ts, tests/cloudflare-scholarships.test.ts. Inspect current HEAD, git status, and existing routing/Better Auth/Admin/D1 conventions before any edits.
No Codex or Antigravity instance has been launched automatically; you are the agent that the user has manually launched.

## Product requirements (non-negotiable)
HUB Scholarship has three areas:
- FULL PUBLIC LIST: all officially published award recipients and school-approved public score columns; filters and paginated access without login.
- PUBLIC SEARCH: by Vietnamese name (with/without accents), student code; handle duplicate names and selectable semester/campaign, appropriate no-match states.
- VERIFIED PERSONAL CELEBRATION: login + server-verified student identity + officially published matching recipient record are all required before the user's own celebration result may be issued. Portrait uploaded locally by the browser and not stored on a server in MVP. No public-search result can confer an ownership claim.
Separate award decisions from exact rankings / scholarship forecasts and Student Directory; never infer an award from GPA or historical benchmark.

## Working boundaries
1. Work on feature/hub-scholarship-foundation (PR #91), or on a backend-only child branch targeting it if you cannot safely work on it. Do not write to main.
2. Do not deploy, merge PRs, execute remote D1 migrations, touch production data, or run a CI workflow that would redeploy the Auth Worker.
3. Never change Better Auth Worker, AI Advisor rollout, rankings, Student Directory or existing role model outside the minimum necessary read integration. Preserve production behavior.
4. Never add raw award XLSX/CSV, student PII, secrets, fake production recipients, or logs with search query/personally identifying values.
5. Distinguish implemented, tested, and production-verified. Do not report unrun tests as PASS.

## Tasks in implementation order
A. BASELINE AUDIT AND FIX
- Inspect and test PR #91 foundation, including TS/Cloudflare typecheck and scholarship tests. Fix identified errors, contract discrepancies, route matching issues and SQL problems before extending it.
- Validate migration 0055 against a local D1 database. Preserve backwards compatibility (0054 is the previous migration).
- Validate method, query length, pagination, score gate, full-name normalization, LIKE wildcard escaping, indexes and error responses. Ensure draft/unapproved campaigns and unpublished recipient rows cannot be enumerated by guessing IDs.
- Design a stable field mapping layer because the final official XLSX/CSV has NOT been supplied. Do not invent missing score semantics or impose unverified GPA scales. Support source-specific approved columns.

B. ADMIN INGESTION AND PUBLISHING
- Implement secure admin-only campaign CRUD as appropriate for the defined states: draft, validated, approved, published, archived; include explicit unpublish/rollback path.
- Implement Excel/CSV ingest with safe bounded parsing (worker or trusted offline importer as appropriate), preview, column mapping, row/duplicate checks, SHA-256 source checksum, import batch receipts, clear error reporting, and idempotent apply. Ensure no partial import and avoid overwriting the live published snapshot before explicit approval.
- For each row support multiple awards for the same student and multiple campaigns, preserve source row ordering and source identifiers; reject ambiguous duplicates rather than silently dropping awards.
- Approval must explicitly record the official source/document and which fields, including individual score columns, are approved for public republishing. Default private/unpublished, with no accidental public leak.
- Require verified Better Auth ADMIN role server-side for every mutation; an auditor may not publish by default. Keep audit trail of import, approval, publish/unpublish, actor and checksum.
- Design and implement API endpoints under a consistent /api/admin/v1/scholarships namespace; update contract with exact request/response, validation limits, status codes and capability requirements.

C. READ APIs AND VERIFIED AWARDS
- Complete/refine public campaigns, summary, list, search with bounded pagination and filters. Diacritic-insensitive Vietnamese search must work for words anywhere in names, not just name prefixes if safe performance allows; document the matching semantics honestly.
- Return only columns approved for publication; be explicit about potentially sensitive score values. Rate-limit high-volume searches where practical, cache only non-sensitive public responses, and avoid PII logging.
- For /api/me/scholarships, verify session via Better Auth and student-code ownership on the server using existing school-email verification convention. Do not accept a studentCode, userId or recipient ID claim from the browser.
- Ensure user with no verified student code is distinct from verified user with no matching award. A student with multiple awards must see all their published awards.
- Provide exactly the data needed for frontend to select a VERIFIED celebration record. No portrait upload backend required.

D. TESTS AND HANDOFF
- Add tests for unpublished visibility; source-score approval; cross-account impersonation; unverified email; wrong role; import corruption/duplicates/idempotency; atomic publish/rollback; diacritic matching; percent/underscore search injection; pagination; invalid method; failed D1/auth; multi-award student.
- Run and report actual outputs for targeted tests, npm run typecheck, npm run cf:typecheck, npm run build, relevant full npm test (if practical), and local Wrangler migration check.
- Update docs/hub-scholarship-api-contract.md with real API and fixtures (synthetic local data only).
- Write a brief ANTIGRAVITY_READY section: final backend branch + commit SHA, contract version, route names, example responses, known limitations, tests performed, integration warnings.
- Commit and push to the backend branch, update Draft PR #91; DO NOT MERGE or DEPLOY.

## Definition of done
Production unchanged. Admin ingestion + approvals exist with tests, public list/search correct for approved fields, verified-own API cannot be abused for another student's award, contract frozen for frontend handoff. If blockers are unavoidable, document exactly what remains and do not claim complete.