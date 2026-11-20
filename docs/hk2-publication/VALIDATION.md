# Publication gate validation evidence

Base: `7521f3a3e10448dc04e3b5838880e18553bbd694` (merged #160).
All D1 writes in these checks target ephemeral local Miniflare/SQLite fixtures.
No production D1, migration, deploy, publication, GitHub owner attestation or merge
is performed. The external authorization providers are mocked only in tests;
actual owner authentication, comment validation and capability logic execute.

| Check | Evidence / required result |
| --- | --- |
| Frozen source/package | Original `loadBulkPackage()` verifies every source/generated hash, builder/policy hash, manifest and payload. No diff under `data/hk2-2026-2027` or the #160 writer/CLI. |
| Runtime publication regression | Three Miniflare tests: absent schema/row and CLOSED; complete 95-batch verification + atomic OPEN; actual bundled Worker warmed-cache bypass. |
| Authorization and atomicity | Forged JSON rejected; wrong authenticated owner rejected; successful validation without real deploy rejected; stale serving Worker rejected. Changed class or receipt between verification and opening aborts both receipt and OPEN. Lost-response retry returns unchanged for the same receipt. |
| API and consumers | List/detail/search/pagination/suggestions, facets, Elite filter (29), official class selection, personal historical snapshots, Advisor, scraper, HK1 and user-created records. Partial import is 25 classes; completed import is 2,357 classes and 95 apply receipts. Neither opens the gate automatically. |
| Existing source/import regressions | `npm run test:hk2-import` includes #159 source/actual desktop+mobile renderer tests and #160 full 2,357-class resume/no-op/rollback plus cross-plan ledger tests. Public API assertions now correctly expect CLOSED independently of import completion. Writer logic is unchanged. |
| Consumer targeted checks | 43 tests passed for course authority/scraper, D1 schedule mutations, schedule model and read optimization during local validation. Advisor intent/retrieval plus publication tests passed 89/89; the final publication regression run passed 3/3 including stale serving-version rejection and lost-response idempotency. The workflow baseline test also passes with validation/release workflows unchanged. |
| Browser acceptance | `npm run test:hk2-publication:browser` passed locally in installed Chrome: actual desktop (1366×900) and mobile (390×844), partial D1 import, stale local cache, real client fetch and real `/hub-sw.js`. HK2 returns zero/no-store and HK1 returns its original fixture. No page errors. Screenshots inspected locally, not committed. |
| Frontend / Worker | `npm run typecheck` and `npm run cf:typecheck` passed locally; repeated at head in CI. |
| Build | `npm run build` passed locally, including generated Workbox service worker. Existing chunk-size warnings remain non-fatal. No API JSON runtime-cache rule is configured. |
| Full suite / diff | `npm test` and `git diff --check` run locally and in PR validation. Review the head-SHA Checks result for final status/counts; no deployment workflow is dispatched. |

Reproduction commands:

```sh
npm run test:hk2-import
npm run test:hk2-publication:browser
node --test --experimental-strip-types tests/ai-advisor-intent-retrieval.test.ts
npm test
npm run typecheck
npm run cf:typecheck
npm run build
git diff --check
```

The isolated browser entry and acceptance instrumentation are test-only. They do
not add production hooks, auth bypasses or a new UI. The server test bundles and
executes the real Worker handler with a deliberately leaking warmed cache; it
asserts cache reads are zero for sensitive routes and retained for explicit HK1.

Local Windows note: an existing unrelated DRL fixture compares raw migration text
with LF. Its working-copy CRLF was temporarily normalized for the full suite and
restored byte-for-byte afterwards; no DRL migration change belongs in this PR.
Linux CI checks the committed LF baseline directly. A synthetic local backup proof
and mocked provider responses are not production release/restore evidence.

Outstanding production work remains the separately approved compatible release,
migration 0062, real backup/isolated restore proof, reviewed production bulk
transport, exact-plan import approval and distinct owner publication approval.
See the ordered checklist in [README.md](README.md). This PR never grants those
approvals or performs those actions.
