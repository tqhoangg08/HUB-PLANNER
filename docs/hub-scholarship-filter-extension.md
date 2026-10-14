# Scholarship combined filters — backend v1.1.0

2026-10-14, branch `feature/hub-scholarship-foundation`, Draft PR #91.

`awardType` in v1.0 is an unrestricted mandatory source award label; its content does not establish program/rank semantics. No real source file was provided. Nullable `scholarshipType`, `scholarshipRank`, `cohort` are therefore independent, optional source mappings with individual approval, not backfilled aliases or inferred data. Migration 0057 adds columns/indexes without updating immutable legacy rows or preview hashes.

Recipients/search combine q, legacy awardType and all five new exact filters using bound SQL AND predicates. Total/pagination cover the entire active approved snapshot. Facets share publication/revision/approval gates; each option list applies every other condition, excludes nulls and paginates metadata without returning recipients. Unapproved fields cannot be searched or exposed as options. Limits remain 2000 source rows, 1 MiB JSON, 50 recipient rows/page; facets max 200 options/page and 2000 pages. Filtered/facet reads share the existing rate-limit binding. Queries are snapshot-bounded; cohort/major/class uses a composite index verified through EXPLAIN QUERY PLAN.

Validation:
- Scholarship tests: 31/31 PASS, actual SQLite and Miniflare D1.
- Tests cover independent program/rank, AND combinations, global counts/pagination, Vietnamese q, null/private fields, dependent facets, metadata pagination, malicious/repeated/oversized queries, rate limiting, duplicate imports and old preview checksum/apply after additive upgrade.
- Offline CSV/XLSX mapped-field test PASS; preparer uses shared validator without network.
- Frontend typecheck, Cloudflare typecheck and build PASS. Existing build chunk/Browserslist notices remain.
- Wrangler 4.115.0: `d1 migrations apply hub-planner-public-dev --local --config cloudflare/wrangler.jsonc` PASS, including 0057, in isolated worktree local state. No remote flag, no remote database operation.

Full extended protocol and integration instructions: `docs/hub-scholarship-api-contract.md` v1.1.0. No Auth Worker changes, production deployment, main merge or real student import. Backend integration is ready for synthetic local/frontend QA; production readiness is not established.
