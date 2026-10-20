# Public baseline evidence — 3e7f80ec

- `github-provenance.json`: independent GitHub connector GETs for production
  run 39402488104, its jobs/log receipts, and exact-main CI run 39405698063.
- `release-receipts.txt`: allowlisted timestamped preflight, owner approval,
  upload/deployment/full-UUID and postflight lines from release job 118561614898.
  Full logs, environment values and credentials are not persisted.
- `dashboard-observation.json`: sanitized text observed directly through the
  authorized existing Chrome session. Prefix `3e7f80ec`, one displayed active
  version, 100% and Ready were visible. Initial control timeouts and subsequent
  recovery in a new tab of the same Chrome are retained. The Owner's described
  screenshot is attributed separately and was not independently inspected.
- `dashboard-metadata.json`: the browser connector's documented CDP capability
  read only deployments/versions GET response bodies already loaded by Dashboard
  Refresh. The full UUID and single 100% traffic are verified in the same response;
  version/deployment IDs, creation times and source are allowlisted. No headers,
  email addresses, credential values or full binding payloads are persisted.
- `validation.json`: local test results, command/log hashes, runtime versions,
  and scope/equivalence checks. PR CI is a separate GitHub check on its head.
- `SHA256SUMS.txt`: SHA-256 of canonical committed Git blobs, excluding itself.
  Windows checkout CRLF conversion can change working-file hashes; verify from
  `git show HEAD:<path>` bytes.

GitHub release receipts and the independently captured live Dashboard metadata
agree on the full version UUID. The initial UI observation's exact timestamp was
not supplied by the tool; recovered metadata was recorded at 14:26:33.282 UTC.
No new screenshot or live commit SHA annotation was captured. This is a point-in-
time read, not continuous monitoring or a release approval.

All historical baseline documents/evidence remain unchanged. Only the strict
predeploy version pin and comments change in the state script. The normal
protected release preflight still performs its existing drift/schema checks;
it was not run remotely during this preparation. No production SQL, deployment,
configuration, approval, migration, Auth, billing, limiter or permission changes.
