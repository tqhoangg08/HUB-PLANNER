# Public release: verified production baseline and remaining gates

Source baseline: main `c7c8de7db91dbe4aa26f355e3a2cebd26f4aa6d2` (PR #107).
This repair changes the reviewed release baseline only. It does not deploy, migrate, change
token permissions, write owner approvals or change Auth/AI/student data.

## Binding transition

Read-only Cloudflare metadata rechecked on 2026-10-17 confirms Public Worker
`hub-planner-public-dev-api` serves `6ff2cbdb-5c4a-485b-8bb6-f310e5d39ec6`
at 100%, deployment `e4651bb1-61eb-4418-bba2-05176f2f2584`, created
2026-10-16T15:34:48.213916Z. Both settings and the serving version contain
`SCHOLARSHIP_SEARCH_RATE_LIMIT`, namespace `45871912`, limit 60/period 60.
The Auth service binding is unchanged; this PR authorizes no Auth operation.

Owner `tqhoangg08` dispatched successful run
[38923977060](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/38923977060)
on main `ed8a795cbf83834608d4a8fefc1a8b4ded84ed9b`. Preflight accepted
`9497fa3b...` at 15:34:39Z; `PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS` was recorded
at 15:34:41Z; upload and trigger deployment succeeded; postflight accepted
`6ff2cbdb...` at 15:34:55Z. Current Cloudflare deployment metadata independently
matches that exact version and time.

Run [39013405379](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39013405379)
on main `c7c8de7...` passed validation but stopped at
`UNREVIEWED_PREDEPLOY_VERSION` on 2026-10-17T07:30:24Z: the static pin still
named the previous version. Its final owner guard, deploy and postflight were
skipped. That failed run did not change serving traffic.

The repaired guard accepts only the audited `6ff2cbdb...` version before deploy.
The previous `9497fa3b...`, obsolete `d102b7e6...` and unknown versions are
rejected; there is no accept-latest behavior or automatic baseline advancement.
The complete configured bindings, including the limiter, are mandatory in both
phases. Postdeploy still requires a different single version at 100%, the exact
recorded before-version, matching live/serving bindings, observability and flags.
Missing, altered, duplicated or extra resource bindings fail closed. There is no
either-version fallback, optional limiter, bypass flag or production cache reset.
Text-first and Scholarship exact-filename ledger/schema gates remain mandatory.

## Historical Route and Queue failure investigation

The following records the earlier failed upload. Successful run 38923977060 later
completed trigger deployment. Its receipt does not prove current credential
permissions or authorize a future release; reverify those at the next owner review.

The old job log identifies two failed PUT requests after upload: Public Worker
routes, and the existing push Queue consumer. Wrangler 4.115.0 aggregates only
inner `error.message`; the retained Actions log does not include HTTP status or
provider error codes. Do not invent a historical 403/10000 receipt.

Cloudflare Audit log `01a14400-63aa-7540-a3c8-e5259082357d` records the successful
version upload at `2026-10-16T09:17:18.634Z`, version `9497fa3b...`, and token
`hub-planner-public-release-v2` (ID `839d496c489477e662441782f44bb8ae`).
Read-only review of that exact token's policy shows only Workers Editor and D1
Read. Its Workers description explicitly excludes Routes and observability;
Queues permissions and DNS/Zone permissions are not selected. Thus missing
trigger permissions are independently established, rather than inferred from
the generic job error. No token value was read/copied and no policy was saved.

The desired trigger state itself is correct: the sole domain route is
`hotrosinhvienhub.id.vn/*` -> Public Worker. Push Queue
`hub-planner-push-events` retains its existing Public Worker consumer, batch 10,
wait 1000 ms, retries 3, concurrency 2, retry delay 0, and
`hub-planner-push-events-dlq`. The three configured Cron schedules are unchanged.
No production PUT or notification smoke test was used to diagnose this.

Owner must review the narrow trigger grants before another release: Queues Edit
on the intended account and Workers Routes Edit for the intended domain/zone;
retain D1 Read and the existing Worker grant. Review any resource scope supported
by the token type. Do not grant Admin/All permissions or deploy using local OAuth
to work around the scoped release credential. If this account-token type cannot
express a necessary zone grant, the owner must choose a suitable narrowly scoped
credential and update the existing protected secret themselves. Never paste its
value into chat. No such access expansion is authorized by this code repair.

References: [Workers roles](https://developers.cloudflare.com/workers/authorization/workers/),
[Queue consumer update](https://developers.cloudflare.com/api/resources/queues/subresources/consumers/methods/update/).

## Release order and stop points

1. Required PR CI and protected merge of this guard repair.
2. Manual independent validation on the exact resulting main SHA; PR merge-ref
   CI does not substitute for this receipt. Keep main unchanged thereafter.
3. Verify owner-managed token trigger permissions and all live
   preflight/schema/backup/trigger checks remain valid. Do not replay migrations.
4. Only then request a NEW owner Public-only dispatch and freshly timestamped
   `PUBLIC_RELEASE_APPROVAL_SHA` / `PUBLIC_RELEASE_APPROVAL_RUN_ID` confirmations
   in `public-production`. Never reuse or rerun either failed release.
5. After approved deployment, verify workflow postflight, actual serving version,
   unchanged Auth/flags/route/Queue targets, HTTP routes/APIs and desktop/mobile
   menu. Do not declare release complete merely because upload or CI succeeded.

Independent backup-security containment and D1 recovery evidence remain release
blockers. This baseline-only PR does not implement containment or approve handling
real backup data. Sensitive operational evidence and object locations stay out of
this public document and PR. No production operation is authorized by CI passing.

Until those blockers, token permissions and all other gates are verified, production is NO-GO;
there is no pending deploy approval for the owner to sign yet.
