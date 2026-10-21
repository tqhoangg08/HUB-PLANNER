# Task 05/10 — Production baseline preparation

Preparation main: `78cc4b5e36d1de993e2fd6d506fefb55bead4cfe`, the confirmed merge of
[Task 05 PR #128](https://github.com/tqhoangg08/HUB-PLANNER/pull/128).
**This baseline preparation is not the Task 05 production release.** The already
serving release uses its parent SHA `379332840b540bc3a6e9eff7797f7f276409bb72`.

## Independent read-only verification

The [sanitized JSON evidence](public-release-baseline-58c94fc8.json) records
verification at **2026-10-21 09:32:47.972 UTC / 16:32:47.972 Vietnam**, using the
existing authorized Chrome Cloudflare Dashboard session:

- Repository release account `6cd8bac6009a55f96bdf9df7c2057548`, Worker
  `hub-planner-public-dev-api`, environment **Production**.
- Dashboard active version prefix `58c94fc8`, traffic **100%**, status **Ready**.
- Latest deployment `3b40e18e-b23d-4f8a-9101-49f08bb84ae6` contains exactly one
  serving version, `58c94fc8-5bfe-41e3-97f5-d0c39bc8be65`, percentage **100**;
  no split. Source `wrangler`, strategy `percentage`, created
  **2026-10-21 08:06:53.629868 UTC**.
- Matching version **#464**, source `wrangler`, created
  **2026-10-21 08:06:52.950924 UTC**.

Dashboard UI and the ordinary metadata GET documents agree. Only deployment ID,
UUID, traffic, source and timestamps were retained. No cookies, credentials,
tokens, response headers, secrets, SQL or production writes were used/extracted.
The JSON preserves the metadata GET URLs; no screenshot is stored.

## Successful release provenance

[Release run 39565559132](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39565559132)
completed with `success`, event `workflow_dispatch`, branch `main`, attempt 1,
exact SHA `379332840b540bc3a6e9eff7797f7f276409bb72`. Read-only GitHub run/job
metadata and allowlisted log receipts agree:

- Validation job `119106864149`: success, **07:56:35–08:01:08 UTC**.
- Public release job `119108704790`: success, **08:06:11–08:07:02 UTC**.
- **08:06:45.3266441 UTC:** predeploy PASS on previous baseline
  `cd1d81be-966f-4518-8729-0b1c3e5484ce`.
- Checked-out SHA and `APPROVED_SHA` both equal `3793328…`.
- **08:06:47.2488616 UTC:** `PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS`.
- **08:06:57.8464353 UTC:** Current Version ID `58c94fc8…`.
- **08:06:59.9383423 UTC:** postdeploy PASS on `58c94fc8…`.

All four required preflight/approval/deploy/postdeploy steps succeeded. Both live
creation timestamps fall inside the successful deploy step's **08:06:47–08:06:57
UTC** window. The historical release completed at **08:07:03 UTC**, before Task
05 merged at **09:27:22 UTC**. GitHub confirms PR #128 merged at preparation main;
its parents are release SHA `3793328…` and Task 05 HEAD `67c31d9…`.
These historical receipts neither authorize nor execute a new release.

## Scope and validation

Exactly four files change: predeploy UUID plus its two provenance comments, the
rollout regression test, and this new JSON/Markdown evidence pair. All historical
baseline files, including [cd1d81be JSON](public-release-baseline-cd1d81be.json)
and [report](public-release-baseline-cd1d81be.md), remain byte-for-byte unchanged.
Guard source outside the UUID/two comments is compared against preparation main;
its normalized hash is recorded in JSON after validation.

Regression accepts only the verified pin and rejects previous, obsolete, unknown,
partial/split versions and stale/wrong postdeploy `beforeVersion`. It also checks
release/job identities, actor, required step order/status, timestamps, receipts,
and the actual Task 05 Git merge parents. Existing owner approval, exact-main SHA,
protected environment, V2 100%, binding/schema/ledger, quota, read-only metadata,
postdeploy and fail-closed guards are unchanged.

Targeted release/security tests: **294/294 PASS**. Frontend and Cloudflare
typechecks, build and diff check: **PASS**. The JSON records command exit codes
and log SHA-256 hashes. The normalized guard hash is
`6e7df8326271770a80634d1c719273c535a650b4fbe073b1c26d79da39c94acb`.
All **21 historical baseline JSON/Markdown Git blobs** are preserved; the
comparison uses repository clean filters to account for Windows checkout CRLF,
and its manifest hash is retained in JSON. No history file was edited.
Full-suite validation belongs to final-HEAD PR CI. No local full suite, Ticket
browser matrix, AI benchmark or database benchmark is run.

This evidence is a point-in-time baseline comparison, not a fresh quota, health,
schema/ledger, binding or secrets audit. The unchanged protected release preflight
must verify those conditions and reject future drift. A future Task 05 release
still needs exact-main validation and separate owner approval. No UI, API, Auth,
database, dependency, workflow, protection, Cloudflare configuration, merge or
deployment changes are performed by this task.
