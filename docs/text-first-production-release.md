# Text-first production release (PR #93)

## Last verified production snapshot (2026-10-15)

PR #93 and the PR #95 retrieval repair are merged. Production migrations
0054/0055/0056 were applied and verified; do not replay them. The Public Worker
serves version `95cf2335-f93f-476f-8037-3f42a625aabf` at 100% traffic, from main
`41b7745a5ee075079cef96c6d1fdd6221169d71f`. Public `/` and `/health` returned
HTTP 200; the route and Queue consumer still target the Public Worker.

Release run `38591158185` remains **FAILED**: Worker/assets uploaded, then
route/Queue updates failed. Read-only serving verification is not a successful
workflow run or an authenticated chatbot UI acceptance. Inspect serving state
before considering any separately approved retry or rollback.

V2 remains `canary/100`; completeness is false and Cloudflare-first document
policy is false/0. The narrow PR #95 tuition-condition path works without enabling
those flags. The academic presentation commit is not deployed by this cleanup.
This is a recorded snapshot, not a fresh live check.

## Mandatory order and stop points

1. Review the intended change, exact-head independent CI, public production UUID
   `88d702e1-60d3-490a-8514-38ef881cf133`, live bindings/variables/traffic,
   R2 `hub-planner`, AI Search namespace `hub-ai-production` and instance
   `hub-ai-text-production`. Never substitute staging or touch Auth.
2. Verify a private production D1 backup outside Git plus recovery metadata.
   No backup/restore claim is made by this document. Restore requires a separate
   impact decision: Time Travel may discard concurrent writes after its point.
3. Verify schema/ledger before any separately approved schema change. 0055/0056
   are already applied. The historical 0056 whole-file import retained the
   original trigger after `/query` rejected its shape; it is not a command to
   rerun. On unknown failure STOP and inspect read-only, never automatically
   retry or repair the ledger.
4. Compare schema and legacy data. Gate validates nullable INTEGER count,
   original 1..128 CHECK, both ledger names exactly once and the exact tables,
   index and publication trigger. No schema repair happens in the release job.
5. Use protected main after CI; do not import PR #92 as part of Text-first
   maintenance. Run independent validation on the exact resulting main SHA using
   workflow_dispatch. Publication/deployment need their own approvals.
6. Owner dispatches the Public-only release with that SHA, then separately sets
   environment `PUBLIC_RELEASE_APPROVAL_SHA` and `PUBLIC_RELEASE_APPROVAL_RUN_ID`
   to the current SHA/run after dispatch. Keep environment wait/main-only,
   classic protections, token separation and all provenance checks intact.
   An agent must not fabricate the separate owner confirmation or bypass it.
7. Mandatory read-only preflight → final approval guard → Public-only deploy →
   serving-version/schema/bindings/flags postflight. No automatic migrations or
   Auth deployment. If route/Queue permission fails after upload, inspect serving
   state first; do not blindly retry the whole deployment.
8. Admin tests draft create/read/preview. Default scope Admin. Never index/publish
   a smoke draft or treat upload as authorization to publish a real document.
   Only the human Admin reviews and confirms actual source content/public scope.
9. Verify the approved real source is public, published, source hash/revision
   correct, all receipts completed and previous/draft revisions excluded. Then
   permit a separately recorded small cohort in document policy. Do not change
   personal/structured routing or the global completeness flag.
10. Confirm actual content/citations/permissions, telemetry and fallback before
    enlarging the policy cohort. Provider failures/invalid citation/latency or
    usage anomalies stop expansion. No published Text-first source means policy
    stays OFF/0; a deployed Admin UI alone is not a chatbot acceptance PASS.

## Rollback

Record Public version/config before deploy. Turning document policy OFF/0 is
the first controlled stop; it does not delete or alter sources. Keep additive
D1 schema and original/revision R2 objects on Worker rollback. Never drop tables,
restore the whole production database or reset an index automatically. Restoring
a prior live Text-first revision needs explicit Admin confirmation and a reviewed
pointer/readiness operation; retaining bytes is not an automatic rollback.

## Limits unchanged

Admin-only backend, same-origin writes, 1 MiB source, at most 128 segments and
8 uploads per request; at most three receipt pages. 100% receipts + exact
revision/key/scope + source hash + explicit publication guard remain mandatory.
Document routing has at most three Search calls, three bounded R2 hydration reads
and one generation under the shared deadline/quota. No fake Word/text page numbers,
no public draft retrieval and no permission expansion for students/auditors.
