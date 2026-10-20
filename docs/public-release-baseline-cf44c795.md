# Reviewed Public release baseline — cf44c795

Read-only verification on **2026-10-20 at 07:44:27 UTC** found exactly one
serving Public version, `cf44c795-ddf0-4f56-b55c-6100029d6d3e`, at **100%**.
The allowlisted API metadata and successful release receipts are recorded in
[public-release-baseline-cf44c795.json](public-release-baseline-cf44c795.json).

The successful owner release [39219603848](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39219603848)
ran on `main`, SHA `a330d5d9e86fc02083f494bdf833288d79f21f3c`, using
`.github/workflows/deploy-cloudflare-production.yml`. The actor and triggering
actor match the repository's personal owner. The release job `117952753687`
and its final owner/CI/protection guard completed successfully.

- Release job: 2026-10-19 08:07:48–08:08:47 UTC.
- Version created: 2026-10-19 08:08:38.327299 UTC.
- Deployment `1d030acc-35e0-40c9-b5aa-ae27ace93393` created:
  2026-10-19 08:08:39.183596 UTC.
- Both creation timestamps fall inside the successful release job. Its
  predeploy receipt identifies `77374643-bb94-420a-ab4c-fd456fca516d`; its
  postdeploy receipt identifies the currently serving `cf44c795…` version.
- That release SHA is an ancestor of preparation main
  `dc21aeda40db7f05ee96a860363afe4cf5647f74`.

Verification used existing Wrangler authorization for Cloudflare deployments
and version **GETs**, public GitHub run/job **GETs**, and the existing connector's
job-log read. Credential values, headers, email addresses and unrelated metadata
are omitted. No SQL, migration, configuration change, deployment, approval,
production write or new OAuth scope was used. The observation is timestamped;
it is not a claim of continuous monitoring or current release approval.

## Strict pin refresh only

The predeploy pin now accepts only this reviewed version. The prior baseline,
unknown versions and split/partial traffic remain rejected. Postdeploy still
requires the exact reviewed before-version, a different new serving version at
100%, and unchanged binding/schema/variable/observability checks. The owner,
exact-main CI and protected-environment guards are unchanged.

Historical evidence is preserved without edits:
[77374643 baseline](public-release-baseline-evidence.json) and its
[evidence directory](evidence/public-release-baseline-77374643/README.md).
The old baseline is retained as provenance, not an additional accepted pin.

This preparation verified version/traffic and release provenance only. It did
not re-read D1 schemas, migration ledgers or current binding values. The normal
protected release preflight must still verify them and fail closed on drift.
After any merge, the owner must approve the resulting new exact main SHA and
obtain independent exact-main CI; this PR does not authorize merge or deployment.
