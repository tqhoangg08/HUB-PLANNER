# Main consolidation — 2026-10-16

This is a source-code integration, not a website release. No deployment, remote
migration, production data write, Auth Worker change or release approval change
is part of this integration. Production publication gates below remain in force.

## Git inventory

Fetched `origin` and independently checked GitHub's main branch and `git ls-remote`.
All three agreed on baseline `f010175259151f183cc04b0f68b2e78a7c65e54f`.
The directories share `D:/Projects/HUB-PLANNER/.git`; they are not three clones.
All use `https://github.com/tqhoangg08/HUB-PLANNER.git`.

| Directory | Type / branch | HEAD before integration | Commits exclusive to HEAD / main | Unpushed to upstream | Working changes |
| --- | --- | --- | --- | --- | --- |
| HUB-PLANNER | Primary checkout, feature/hub-scholarship-frontend | c0e551359264b970b39f8bc326f483903d01a141 | 34 / 25 | 0; local branch is 19 commits behind upstream | 4 modified files, 1 deletion, 1 untracked AI planning text |
| HUB-PLANNER-pat-probe | Linked worktree, codex/public-release-pat-probe | 0143e4a9f3c10a9fcd41e29dd8ccd5493880938c | 0 / 71 | 0 | Clean |
| HUB-PLANNER-text-policy-retrieval | Linked worktree, codex/ai-advisor-document-tags | 68814f3078f67af8d306a45a17667578e0d1cf01 | 0 / 14 | 0 | Clean |

No decision used directory timestamps. The primary dirty patch, untracked planning
text and SHA-256 manifest were backed up outside Git under the owner's private
Codex backups directory. Their original checkout is not reset, stashed or overwritten.
The local edits remove request cancellation/stale-response protection, approval
resets and accessibility labels; they are preserved for review, not applied over
the newer hardened implementation. The local deletion of the Canva handoff is
also retained in that checkout without treating it as the integration source.

Git additionally registers older worktrees. Dirty `recovery-r1`, `turnstile-deploy`,
`word-first-parser-hardening`, `hub-scholarship-final-hardening` and
`scholarship-final-backend-integration` must be retained. In particular, recovery
has local environment/diagnostic files; none are staged or read as release input.
The final-hardening working files were compared with the committed candidate:
the committed candidate contains their Admin/API protections and later Studio
word wrapping, heading layout and long-name regression improvements.

## Integration decisions

| PR / work | Decision and evidence |
| --- | --- |
| #89, #88, #90, #93, #95, #96, #97, #98, #100, #99 | Already merged. Main contains the metadata probe, grounded Advisor, guarded rollout code, Text-first documents, tuition retrieval, document tags, cleanup, dependency remediation and 2026 DRL catalog/UI. No duplicate cherry-picks. |
| #91 Scholarship backend | Integrate committed head 9f3e1356e7653d4b04d78926f1bab302ef11d6e1, with snapshot approval, Admin authorization, publication transactions and independent facets. Real-data publication remains blocked. |
| #94 Scholarship frontend | Integrate committed head 092aac420b6c4afbe31fe31af7495b3d363ccab6, including bounded portraits, fresh ownership checks, revision conflicts, pagination and compact responsive UI. |
| Local integration 0efd50b3bd7f4fc323565cb3bfc147db5ccda248 | Contains both #91 and #94 heads as ancestors, plus main's dependency remediation. Merge into current main without copying directories. Automatic package merge retains main's DRL and security tests. |
| #92 Word/long-document parser | Keep Draft. Real staging examination upload failed before derived storage/persistence completed; only 2/5 first-document receipts were complete at its last acceptance. Other source uploads and AI questions remain unverified. The parser branch also conflicts with current main. No deployment or retry is authorized by consolidation. |
| #86 Premium/Freemium | Keep separate. Conflicting old Supabase/payment/Advisor implementation; its own staging acceptance remains outstanding. No evidence of completed integration with current Cloudflare/Auth architecture. |
| #85 Rollup 4.59.0 | Superseded: main's lockfile already resolves Rollup 4.60.4 from dependency remediation. Do not replace it with the stale lockfile. |
| codex/pr93-local-release-record | Patch-equivalent commit 2a488ca is already represented on main (`git cherry` reports `-`). No duplicate commit needed. |
| Older local backup / archive snapshots | Retain; do not merge historical snapshots, generated artifacts or old environment state as feature branches. |

The local QA script now rejects `NODE_ENV=production` before importing the emulator,
bundler or synthetic identity code. The pre-existing rejection test initially
timed out while importing these modules; it passes with the earlier rejection.
All 32 frontend/hardening tests are included in `npm test` so required CI covers
them as well as the backend and existing main regression chains.

No dependency version or lockfile change is needed. Existing reviewed synthetic
design/QA documentation assets are retained; no newly generated build output,
backup, private workbook, Word source, environment file or credential is added.

## Protection and verification

Active ruleset `24867954` requires a PR and the GitHub Actions check
`AI Advisor independent validation`, requires the branch to be current with main,
forbids deletion/non-fast-forward updates and has no bypass actors. Classic main
metadata independently reports the same required check. The connector cannot read
the full classic administration endpoint (403); the ordinary merge API still
enforces it. Use a normal merge with the expected head SHA, never an admin bypass.
The release workflow is manual only; merging this PR does not dispatch it.

Local validation logs are ignored under `.cache/consolidation-*`. Results and the
required CI run are recorded in the integration PR after completion. No check
that is pending or unrun is claimed to pass here. Runtime D1 regressions use
ephemeral synthetic local databases; no remote migration command is used.

Scholarship migration filenames 0055/0056/0057 remain unchanged and distinct from
the already merged AI migrations with the same numeric prefixes. Release must
review the complete filename-based ledger; source integration does not apply SQL.

## Release gates that remain

- Official Scholarship data and documented permission for each republished field
  are absent. No real student-data import/publication is approved.
- Empty-data deployment still needs explicit release approval, live binding,
  backup/restore and operational checks. Retention, correction, withdrawal and
  authority to roll back a published snapshot require owner decisions.
- Live Google/email/OTP, native OS sharing and production load are not certified
  by synthetic acceptance. Word parser staging failure remains unresolved.
- Public/Auth release separation, environment approvals, current AI rollout and
  document/completeness flags remain intact. Prior release attempts are separate
  from this source consolidation and are not retried.

## Cleanup proposal

After the final main containment and dirty-state checks, the clean pat-probe and
text-policy worktrees can be removed if the owner no longer needs their local
tools. Clean already-merged Advisor, dependency-security and cleanup worktrees
can likewise be retired after checking their ignored local files. Branches whose
tips are ancestors of main and whose upstream has no exclusive commits can be
deleted later. No branch/worktree is deleted by this task.

Retain #92/#86 branches, all dirty worktrees, private backups and any local-only
archive/backup refs pending their own review. The three named directories need
not all be current for GitHub main to be the single canonical code source.
