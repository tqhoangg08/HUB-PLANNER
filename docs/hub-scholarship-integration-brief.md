# CODEX INTEGRATION AND RELEASE-CANDIDATE REVIEW — HUB SCHOLARSHIP

> Historical integration brief. The pre-deploy cleanup audit and v1.1.0 contract supersede its rebase, score-table and launch guidance. Preserve local work; do not merge, rebase, deploy or migrate remote D1 as an automatic step.

Run ONLY after:
1. Backend branch feature/hub-scholarship-foundation has completed backend implementation, tests and contract handoff.
2. Antigravity has opened the frontend Draft PR targeting the backend branch.
No production deploy is authorized by this brief.

## Required work
- Fetch both branches and PRs. Inspect actual diff, route ownership, auth assumptions, contract version and schema migrations, never blindly merge.
- Rebase frontend branch onto the backend HEAD safely, resolve any conflicts with minimal scope; preserve both sets of tests and animations.
- Verify three end-to-end flows locally: public full list and score fields; public name/MSSV search with invalid/duplicate/no-match cases; authenticated student matching self record -> local portrait upload/crop -> 9:16 and 4:5 PNG download. Also verify direct guest URL access, insufficient privileges, unpublished campaign and malicious/forged user ID.
- Run local D1 migration 0055 against empty and applicable upgrade paths; test import/approval/publish/unpublish with synthetic test data only. Never use real user data as a test fixture.
- Run scholarship tests, typechecks, build and full test suite; run browser QA for desktop and mobile. Report PASS only with command + real output, otherwise specify remaining blockers.
- Review PII/data-republication permissions, score column policy, rate limiting, cache control, high traffic performance and Auth separation. Ensure official scholarship announcement file was not assumed or invented.
- Update both docs/hub-scholarship-api-contract.md and PR #91 with final integration results. Keep original PR #91 Draft until owner manually reviews.
- DO NOT call remote D1 migrations; do not deploy Public Worker or Auth Worker; do not merge into main; do not change AI Advisor rollout or ranking sources.
- Deliver clear GO/NO-GO recommendation, PR URLs, unmerged commit SHA, test matrix, remaining data requirements and exact manual production launch steps for owner approval.

## Key release gate
The university's officially published list and its approved republication fields are necessary before importing data and enabling scholarship publication. If source file or publication authorization is absent, ship code as a pre-launch candidate only, showing "Sắp công bố" to all public users.
