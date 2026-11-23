# Windows remote binding session investigation

Base: `d0a91352ec7e32744e4f6e8331c88b56347717df`. This change is for Draft review.
It does not authorize production publication, generate/post owner comments,
upgrade production dependencies, import, migrate or deploy anything.

## Findings and limits of the evidence

At the initial inspection on 2026-11-23, the original import run's
`resume-operator.lock` did not exist and no publication/importer or workerd process
was running. No existing operator lock was removed. The old output directory
`.cache/hk2-publication-20261123075324` contained only two comment-body files and
`verification.json`. It had no PID/start identity/heartbeat, `owner-comments.json`,
`stop.json` or publication receipt. Its 15-minute verification had expired.
The old PID and cause of process termination cannot be reconstructed from these
artifacts. `status` labels this legacy directory untracked/invalid, never alive.

The supplied Wrangler log is only 805 bytes / 31 lines. SHA-256:
`cb33c85065a992f1ff62c485ce3d0ffc2ff1605abcae3f566904a4d285f23e99`.
It records connection establishment at `2026-11-23T00:53:30.290Z`, followed by
three errors at `00:55:45.541–543Z` (about 135 seconds later):

- `gjs8658c2ntsgi7lfp9e5lmb`
- `4fhhcf9b24vobe9paepvcnpd`
- `c09lo65hhsv18715pp56tn94`

There is no fatal stack, exit code, `Network connection lost`, D1 error response,
quota/size error, auth rejection or preview-expiry error in that log. The original
operator makes only GitHub reads while waiting for comments; it does not poll D1.
These background messages therefore do **not** prove a publication transaction
failed, and absence of a local terminal file does not by itself prove no commit.
Bounded primary D1 reads confirm CLOSED/revision 0, zero publication receipts,
2,357 HK2 rows and 95 import receipts at the recorded experiment times.

Separate issues must not be conflated:

1. [workers-sdk #15351](https://github.com/cloudflare/workers-sdk/issues/15351)
   describes delayed errors from an unused RPC WebSocket while D1 HTTP requests
   still succeed. [Fix #15432](https://github.com/cloudflare/workers-sdk/pull/15432)
   creates the RPC session lazily. Installed Miniflare 4.20260722.1 creates the
   fallback stub eagerly; the isolated newer package contains the lazy `getStub`
   implementation. This is consistent with the old three-message cluster but
   does **not** establish why this operator process terminated.
2. [#15421](https://github.com/cloudflare/workers-sdk/issues/15421) reports longer
   degradation/process failure which maintainers distinguish from the early
   message noise. Installed Wrangler removes its startup error listener after
   establishing a remote session. An idle remote session is not a continuous
   guarantee that a future request will work. The installed proactive preview
   refresh interval is 50 minutes, not two minutes; no refresh failure is observed
   in the supplied log.
3. The original operator keeps the SDK in its own process throughout a 15-minute
   owner wait and writes a terminal artifact only from a caught exception.
   Native abort, forced exit or external process termination can escape this
   handler. The missing liveness/exit evidence is a proven operator observability
   gap, independent of the unproven termination cause.

## Controlled experiments

Production D1 experiments use fixed SELECTs only, no publication call and no
owner body generation. Each checks `rows_written=0`, `changed_db=false` and
primary service. No D1 heartbeat/polling or query loop is used. The investigation
budget is at most ten explicit SQL requests, including the abandoned prototype
probe; the final report records actual counts. Raw SDK logs stay in ignored
storage and are not uploaded.

| Runtime | Scope | Observed result |
| --- | --- | --- |
| Repo Wrangler 4.115.0 / Miniflare 4.20260722.1 / workerd 1.20260722.1 | Two SELECTs separated by 180 seconds idle, Windows Node 24.12.0 | Both succeeded; process exited 0; no error cluster or crash reproduced. |
| Isolated Wrangler 4.131.0 / Miniflare 5.20260910.0-alpha / workerd 1.20260910.1 | Same two SELECTs and idle period | Both succeeded; process exited 0; no crash reproduced. This does not establish that upgrading fixes the reported crash. |
| New short-lease isolation on repo 4.115.0 | Close first native child, wait 14 minutes without an SDK, then open a fresh native child | PASS, `01:31:09–01:45:33Z`; parent heartbeat remained live, fresh primary SELECTs succeeded; CLOSED/0, 2,357/95, zero publication receipts. No owner approvals or writes generated. |

The two SDK smoke experiments partly overlap; they are bounded compatibility
observations, not a statistically controlled performance comparison or proof of
long-session stability. The newer SDK is installed only below ignored
`.cache/hk2-remote-binding-investigation/sdk-4.131.0` with lifecycle scripts off.
Root `package.json` dependencies, `package-lock.json` and installed production
Wrangler remain unchanged. A dependency upgrade would require separate review.
Actual production budget used: **eight explicit SELECT requests**, including one
initial probe from the interrupted heartbeat prototype. All successful queries
reported/validated zero writes. The final successful soak used three requests and
none during its 14-minute idle period. No SDK/workerd child remained afterward.

## Containment and lifecycle fix

- The parent retains the original **in-memory** verified object and all original
  GitHub/backup/data/release authorization. It never serializes/reconstructs
  authority. `publication.mjs`, both guard modules, import writer and SQL remain
  byte-identical to main.
- Each native binding runs in a private child process using the existing locked
  Wrangler and fixed account/D1 configuration. The IPC bridge forwards prepared
  values unchanged. The child calls one **native `D1Database.batch()`** for the
  original two-statement publication pair. There is no HTTP write endpoint, REST
  transaction adapter, SQL rewrite, statement splitting or dependency override.
- A 60-second child lease and 40-second request timeout bound SDK failure.
  Failed children are terminal, never automatically restarted. Before emitting
  owner files, verification must complete, a primary read-only health probe must
  succeed and the child must dispose/exit successfully.
- **No Wrangler/Miniflare/workerd session exists during the owner wait.** The
  parent keeps only the verified data object, local heartbeat and original GitHub
  polling. After two authentic comments, it opens a fresh child, checks primary
  read-only connectivity, obtains the original 60-second capability and invokes
  unchanged atomic publication. The original 15-minute clock is not reset.
- The approved expiry is checked again at the parent's final native send and
  the child's native batch dispatch. No new connection resets the 15-minute clock.
- SIGINT/SIGTERM stop future actions. The transport checks cancellation again
  at the last IPC send, so a cancellation during authorization/pre-read cannot
  start a mutation. A write already sent may commit; it is never retried or
  described as rolled back just because the client stopped.
- SDK child exit, timeout and request errors reach the parent's catch block and
  `stop.json`. A failed/uncertain mutation gets one new **read-only** child to
  inspect gate/receipts. No mutation retry is hidden in cleanup or reconciliation.
- The parent records PID **and OS creation identity**, stage, expiry and a local
  three-second heartbeat in append-only `session-state.jsonl`. A partial final
  line, expired verification, PID reuse, stale heartbeat or dead process is invalid.
  Journal append avoids Windows `rename`/EPERM races seen in the prototype tests;
  that new prototype issue was not the old operator's crash cause.
- Unexpected parent exit attempts synchronous `stop.json`/`abnormal-stop.json`
  evidence. SIGKILL/power loss cannot run any exit handler: the independent
  status check detects the dead/stale parent instead. Locks survive an abrupt
  exit; cleanup releases only the exact PID/nonce lock acquired by this process.

## Safe operation after review

This Draft must be reviewed/merged and exact-main independent CI must pass before
using the production session. No OPEN or owner-comment creation is authorized by
this investigation. A future separately authorized session uses the existing
[production runbook](PRODUCTION-TRANSPORT.md).

Check a session without connecting to D1 or loading Wrangler:

```powershell
node scripts/hk2-production-publication.mjs status --out=.cache/ACTUAL-SESSION-DIRECTORY
```

Only exit 0 / `approval_valid=true` permits using that session's generated
commands. The commands themselves perform this status check before each owner
POST. While waiting, `native_active=false` is intentional: a **new connection
must still pass health/authorization before any write**. Status does not assert
continuous Cloudflare connectivity and is not publication authority.

If dead/stale/unknown, do not post or reuse the old bodies. Never delete a lock
belonging to a live process. Read its PID/out directory, compare OS creation time,
and reconcile gate plus deterministic receipt through the existing read-only
inspection before any separately authorized stale-lock recovery. Do not infer
rollback from an exit code. No automatic stale-lock removal or resume is added.

Regression tests use isolated local D1: atomic rollback, lost ACK with durable
receipt, no write retry/restart, timeout/SDK exit, cancellation, unchanged HK1 and
personal rows, dead-parent detection, PID reuse, incomplete journal and lock
ownership. Golden checks pin all publication/import guards, 15-minute limit,
atomic SQL, catalogue, migrations, Worker/UI and production dependencies.

Local validation: combined lifecycle/fault and publication-sized UTF-8 IPC
regressions **14/14 PASS**, and existing publication regressions **8/8 PASS**.
The exit/hang fixture has no Miniflare startup dependency: the combined Windows
run exposed a fixture startup timeout that masked the intended exit fault; the
minimal IPC fixture now tests that fault deterministically. No production timeout
or guard was relaxed. Syntax and diff checks pass. The PR head CI additionally
runs the unchanged full suite, browser acceptance, typechecks and build; inspect
its exact-head result before review/merge. No production write is a test.
