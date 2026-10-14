# Text-first production release (PR #93)

This supersedes the historical 7→100 release preflight. The verified baseline
is V2 `canary/100`, Public version `dd9c548e-1f2e-4983-9946-07fa7b8e7be0`.
Both release phases require exactly 100, not an arbitrary allowed percentage.
Completeness remains false and document policy remains false/0 for code deploy.

## Mandatory order and stop points

1. Review PR #93, exact-head independent CI, public production UUID
   `88d702e1-60d3-490a-8514-38ef881cf133`, live bindings/variables/traffic,
   R2 `hub-planner`, AI Search namespace `hub-ai-production` and instance
   `hub-ai-text-production`. Never substitute staging or touch Auth.
2. Verify a private production D1 backup outside Git plus recovery metadata.
   No backup/restore claim is made by this document. Restore requires a separate
   impact decision: Time Travel may discard concurrent writes after its point.
3. Apply only missing, approved 0055/0056, with ledger in the same successful
   transaction/import. Do not replay historical migrations. For 0056 use the
   already rehearsed whole-file import path, retaining the original trigger;
   `/query` previously rejected this trigger shape. On unknown failure STOP,
   inspect read-only, never automatically retry or repair the ledger.
4. Compare schema and legacy data. Gate validates nullable INTEGER count,
   original 1..128 CHECK, both ledger names exactly once and the exact tables,
   index and publication trigger. No schema repair happens in the release job.
5. Merge only PR #93 through protected main after CI, not PR #92. Run independent
   validation on the exact resulting main SHA using workflow_dispatch.
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
