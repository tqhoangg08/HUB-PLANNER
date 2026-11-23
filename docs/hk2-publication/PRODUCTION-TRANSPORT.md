# Owner-operated atomic HK2 publication

Windows lifecycle containment and status/abnormal-exit handling are documented in
[WINDOWS-REMOTE-BINDING.md](WINDOWS-REMOTE-BINDING.md). Native connections are now
short-lived SDK children, closed during the owner wait and freshly health-checked
before authorization. All existing approval/data/atomic publication guards below
remain unchanged. Do not use an expired or untracked legacy session.

This operator-only change prepares publication; it does **not** open production.
No HTTP write endpoint, deployment, migration, permission, course writer or UI
change is added. Keep `HK2_2026_2027` CLOSED until the two separate owner comments
below pass provider authentication. PR approval/import approval does not substitute
for either comment. Do not use raw SQL to open the gate.

## Reviewed production target and release

- Account `6cd8bac6009a55f96bdf9df7c2057548`, D1
  `88d702e1-60d3-490a-8514-38ef881cf133` (`hub-planner-public-dev`).
- Original import plan
  `b256c155b9f25050dcc2e641651d642c33c78424c04fcb520b28230d793d1000`:
  2,357 classes, 95 receipts, three temporary subjects excluded.
- Serving v477 `04e1f162-6ca5-4ef1-8161-aa74deefef68`, 100% traffic,
  guarded release [44764100186](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/44764100186),
  deployed SHA `8416837eb5ce648ce9c1c6237b4eed81802dbd03`.
- Observed frontend Vite manifest SHA-256
  `5a5cddda178f1817aba68e54f356ea16393dd3b4692b5f18b26b8f6fd215cdd0`.
  [The original public manifest bytes](v477-asset-manifest.json) are retained for
  review and offline provider fixtures. They contain asset paths, not credentials.

This PR separates the operator SHA from the deployed release SHA, as the import
transport already does. The original same-SHA publication path is retained. The
new v2 path permits **only this pinned v477 release**, requires the authenticated
owner, unchanged live main/environment protections, successful independent CI
on exact **current main**, no active release, all predeploy/owner/deploy/postdeploy
receipts, unchanged deployed gate Git blob, correct D1 binding/authorities and
the pinned actual frontend manifest. It cannot claim that a later operator-only
commit was deployed. The v2 OPEN comment explicitly binds both SHAs. A different
release or frontend needs a new review; no skip/override flag exists.

No Worker redeploy is necessary for these operator files. Existing release
workflows/guards and frontend/Worker assets remain unchanged. Nothing dispatches
a workflow, changes an environment variable, deploys, migrates or imports.

## Ordered procedure

1. Owner reviews this PR and its CI, then merges separately. Check out the exact
   new main with a clean tracked tree. Run the existing independent validation
   workflow on that exact main SHA. A green PR check is not exact-main CI.
2. Use existing owner GitHub authentication (`gh`, `GH_TOKEN` or `GITHUB_TOKEN`)
   and existing Wrangler/Cloudflare credentials. `CLOUDFLARE_API_TOKEN` must be
   supplied through the protected environment for provider reads. Never paste
   secrets into commands/comments/reports, create a token, grant rights or login
   using another account to bypass a failure. Keep an exclusive operator window;
   stop releases/importers before starting. This CLI takes the import run's
   exclusive `resume-operator.lock` and never removes another process's lock.
3. Retain the **original** plan, snapshot, journal and sanitized backup/restore
   report. The report is validated using the original importer validator. The
   private exported SQL must still exist with the original length and SHA-256;
   the CLI streams/hashes it but never executes or uploads it. Reference/restored
   hashes for all four protected tables are independently carried into the
   publication backup proof. The original full report hash is retained too.
4. Launch a new, persistent owner session in the repository, using an unused
   directory directly under `.cache` and the number of this reviewed PR:

   ```powershell
   node scripts/hk2-production-publication.mjs session --plan=.cache/hk2-live-20261121035646881/plan.json --backup=.cache/v477-0062-preflight/BACKUP-RESTORE-REPORT.sanitized.json --out=.cache/hk2-publication-NEW-UNUSED-DIRECTORY --issue=REVIEWED_PR_NUMBER
   ```

   This opens the **existing native authenticated D1 binding** from #164; it does
   not deploy a Worker. It validates exact migration 0062 tables plus its tracking
   receipt, pristine CLOSED/revision 0 and zero publication receipts, all 43 fields
   of all 2,357 classes, provenance/payload/manifest, NULL lecturers/eight estimated
   PE markers and all 95 original contiguous receipts using `verifyHk2Publication()`.
   The raw verification must come from primary D1. Failure stops without opening.

5. **STOP before OPEN.** The live session prints exactly two PowerShell commands
   and writes `owner-backup-comment-lf.json` and `owner-open-comment-lf.json`.
   The owner reviews the backup/export/isolated restore proof and fresh verification,
   then posts these as **two distinct, unedited** GitHub comments. For example,
   with the absolute output directory assigned to `$publicationDir`:

   ```powershell
   & "C:\Program Files\GitHub CLI\gh.exe" api --method POST repos/tqhoangg08/HUB-PLANNER/issues/REVIEWED_PR_NUMBER/comments --input "$publicationDir\owner-backup-comment-lf.json" --jq ".id"
   & "C:\Program Files\GitHub CLI\gh.exe" api --method POST repos/tqhoangg08/HUB-PLANNER/issues/REVIEWED_PR_NUMBER/comments --input "$publicationDir\owner-open-comment-lf.json" --jq ".id"
   ```

   The OPEN action is `OPEN_HK2_2026_2027`; it binds the fresh verification digest,
   backup proof, deployed release SHA and exact operator SHA. Its expiry is at most
   **15 minutes from verification**, not from the comment. The backup comment is
   a separate attestation, not a JSON role claim or implicit OPEN authorization.
   The session finds both IDs automatically and makes no GitHub writes. Expired,
   edited, duplicate, wrong-owner, missing or mismatching comments stop the session.
   A new process cannot deserialize the verification into authority: start a fresh
   session and use newly generated text after expiry/process loss.
6. After both authentic comments pass, the session calls the existing
   `authorizeHk2Publication()` and **unchanged** `openHk2Publication()` once. Their
   opaque one-use capability lasts at most 60 seconds. The existing complete-row,
   full-ledger and CLOSED-state guards, receipt INSERT and gate UPDATE remain two
   statements in **one native D1 transaction**. The adapter refuses other mutation
   shapes; it never changes class/user data. The separate 95 import transactions
   are not replayed and are not one publication transaction.
7. Save `verification.json`, both comment URLs/IDs, `publication-receipt.json`
   and the gate/receipt postcondition. On any error the CLI stops and saves
   `stop.json` plus read-only reconciliation if available. **No automatic write
   retry.** Inspect `hk2-publication:<OPEN-comment-id>` and current gate first.
   A lost response may already have committed. The library supports a fresh
   authorization with the **same still-live in-memory verification** to reconcile
   that receipt without another mutation; serialized artifacts grant no authority.
   Never reset state/delete receipts, create a replacement import plan, restore
   production or reopen using another verification as an error workaround.

## Post-publication acceptance

Verify website and Worker origins, HK2 total 2,357, HK1 total 2,103, programme
filters/facets/pagination/detail, `no-store`, a fresh browser and existing PWA,
desktop/mobile multi-session rooms and eight owner-estimated PE labels. ICS must
retain unknown precise clocks. Save programme counts and receipt hash. Compare
protected-data checksums with the pre-publication baseline; distinguish independent
user activity from an operator mutation. Keep the importer stopped.

Local tests exercise real D1 selection before/after OPEN and both real schedule
renderers. A production authenticated selection is a user-data write: use a
separately approved disposable owner test account/manual check. Do not alter a
student's schedule to demonstrate publication. Public browser reads alone do not
prove authenticated selection or an existing installed PWA. Publication rollback/
reclosure is a separate owner decision, never an automatic full database rewind.

## Validation and limitations

`tests/hk2-publication-transport.test.mjs` uses real isolated Miniflare with the full
2,357/95 import. Only provider boundaries are fixtures. It rejects missing owner
proof, CI/protection/release/asset/binding drift, partial import and arbitrary writes;
it proves atomic rollback, lost-response reconciliation, real gated API visibility,
and unchanged HK1/personal rows. Existing publication tests additionally cover
catalogue/ledger races, filters, selection, Advisor, cache and desktop/mobile/PWA.

Run targeted tests, `npm test`, frontend/Worker typechecks, build, browser acceptance,
release-assistant regressions and `git diff --check`. No production write is a test.
The read-only [readiness evidence](transport-readiness.json) is not an OPEN approval;
its verification expires and must be regenerated after merge/exact-main CI.
