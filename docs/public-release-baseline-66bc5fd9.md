# Task 03/10 — Production baseline preparation

Preparation main: `9e9ae1e0f06df21f9bbf2bf2ac8790631b1df442`, the confirmed
merge of [Task 03 PR #124](https://github.com/tqhoangg08/HUB-PLANNER/pull/124).
This change prepares the baseline only; it does not release Task 03.

## Independent live verification

The [JSON evidence](public-release-baseline-66bc5fd9.json) contains sanitized
Dashboard metadata, GitHub provenance, exact receipts and validation results.
At **2026-10-21 03:47:20.884 UTC / 10:47:20.884 Vietnam**, the existing authorized
Chrome session independently confirmed:

- Public Worker `hub-planner-public-dev-api`: version
  `66bc5fd9-55f4-4983-9048-0a271550ef9f`, **one serving version, 100% traffic**.
  No split traffic. Dashboard UI displayed `66bc5fd9`, `100%`, `Ready`.
- Latest deployment `74e7ba89-e2ea-49a9-861b-2f741f80b1a0`, source `wrangler`,
  created **2026-10-20 16:09:09.025933 UTC / 23:09:09.025933 Vietnam**.
- Matching version #462, source `wrangler`, created
  **2026-10-20 16:09:08.252599 UTC / 23:09:08.252599 Vietnam**.

Read-only verification used the Dashboard UI and ordinary navigation to its
metadata GET URLs, reading rendered JSON. No cookies, credentials or request
headers were extracted; no OAuth refresh, production SQL or configuration writes.
Only allowlisted metadata is retained; historical evidence remains untouched.

## Release provenance

[Successful release run 39453522579](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39453522579)
was `workflow_dispatch` on `main`, exact SHA
`1a61b4451c43a1a26fadc8174a9ec05014d19739` (an ancestor of preparation main).
Both validation and Public release jobs succeeded. The release job
`118735986485` ran **16:08:19–16:09:18 UTC / 23:08:19–23:09:18 Vietnam** on
2026-10-20. Both metadata creation timestamps fall inside that job.

The exact checkout and approved SHA agree. Receipts independently show:

- Predeploy PASS at 16:08:58.8803667 UTC: `93e9bad7-39f3-4635-bb97-c6d71ccc4524`.
- Owner/protections/exact-SHA approval guard PASS at 16:09:00.2914697 UTC.
- Wrangler Current Version ID at 16:09:13.8752973 UTC: `66bc5fd9…`.
- Postdeploy PASS at 16:09:16.6662659 UTC: `66bc5fd9…`.

This is point-in-time version/provenance evidence. Current D1 quota, health,
complete schema/ledger and bindings were not rechecked. Normal protected release
preflight must still verify those gates and reject any subsequent drift. The
running baseline predates the Task 03 merge; no claim is made that Task 03 is live.

## Minimal change and validation

Only the predeploy UUID and its two evidence comments change in the state script.
All other guard source is identical to main. Regression accepts the reviewed
version and rejects the previous `93e9bad7…`, older/unknown versions, stale
postdeploy before-version, partial/non-numeric/split traffic. Additional evidence
assertions link the single-version traffic snapshot, release SHA, successful job
window and postdeploy receipt. Owner approval, exact-SHA, security, bindings,
schema and postdeploy guards are unchanged.

Targeted release/security tests: **294/294 PASS**. Frontend/Cloudflare typechecks,
build and diff check are recorded in the JSON with exit codes and log hashes.
Full tests are delegated to standard PR CI; no local full suite, mobile browser
matrix or performance benchmark. Existing matching dependencies were reused.
No feature, Overlay, Auth, backend, migration, Cloudflare configuration, workflow
or protection edits. No merge, deployment or production changes.

Review the baseline PR separately from any release approval. PR CI does not
replace exact-main validation and owner approval for a later release.
