# Post-PR #97 minimal cleanup

Base: `93eda001ed12271b3f10853ede207a5cb264fc82` (`origin/main`).
Scope: tracked generated artifacts only; no application, provider, schema,
workflow or production configuration change.

## Removed files and evidence

These eleven `.cache/ocr-debug/` files are diagnostic outputs written only when
OCR output is too short/corrupt (`scripts/ocr_need_review_notifications.js`,
`processNotification`). That script never reads these debug files; it reads its
temporary `ocr.txt` instead. A tracked-source reference search found no consumers
of the individual filenames. No source PDFs, runtime documents or test inputs
are removed.

```text
04b6b691-f1b3-4b59-8bb7-13a1f3e16c57.txt
3f43c742-c1c3-4fdb-a89b-7a66011aa892.txt
672fe7bd-d1cd-4c57-9e39-5d16de956b48.txt
77c9a133-753c-4601-b437-82763ed7f1b5.txt
7b3d7d6a-88b9-4bca-80af-4c17e6ce9c17.txt
9b13ab10-fe48-4b35-b299-82514686eb36.txt
9e6b517a-42fe-4425-8b81-71cff8526cdc.txt
b05de790-8e77-4ebe-897d-cde8248311f9.txt
de76848c-3827-4b63-9498-0242801e9353.txt
e53a6de4-7958-4d1d-b713-74676830b4a6.txt
eeb67dcc-51d2-41d4-8478-51e71c28cbde.txt
```

Four generated Vite PWA development outputs are also removed:

```text
dev-dist/registerSW.js
dev-dist/sw.js
dev-dist/workbox-5a5d9309.js
dev-dist/workbox-7a5e81cd.js
```

There are no application/script/test imports of these files. `tsconfig.app.json`
only excludes `dev-dist`. Vite PWA generates development workers as needed;
`npm run build` generates the production worker under ignored `dist/`, using
the preserved `public/hub-sw.js`. Public runtime assets are unchanged.

## Retained deliberately

- `.cache/tessdata/vie.traineddata`: the existing OCR notification tool reads
  this model. Keep it rather than changing that tool's offline behavior.
- `git/` (42 tracked files): appears to be a copied Git metadata/object tree.
  Its backup purpose is not established; no backup deletion was authorized.
  Preserve every tracked file. Add `/git/` to ignore future accidental additions.
- All regression fixtures, tests, OCR/provider/staging tools, reports, generated
  Worker type declarations and public assets: used or not proven obsolete.
- Existing uncommitted changes in other worktrees: untouched.

`.cache/` was already ignored. `/dev-dist/` is newly ignored; `/git/` affects
only future untracked files and does not untrack the retained metadata copy.

## Size and recovery

15 deleted files total **357,825 bytes** (Git blob sizes, approximately 349.4 KiB).
The baseline tracked tree is **24,552,720 bytes**; final net size also accounts
for the small ignore/report additions. This does **not** shrink historical Git
objects or rewrite history. Deleted files remain recoverable from the base
commit. No local/cloud backup, database or remote resource is deleted.

## Validation and release boundary

Local validation (Node 24.12.0):

- `npm test`: **886/886 PASS**, no failures, skips or cancellations.
- `npm run typecheck`: PASS.
- `npm run cf:typecheck`: PASS. The repository has no `cf` npm script;
  this is its existing Worker check, not a deploy command.
- `npm run build`: PASS; production `dist/sw.js` and Workbox generated normally.
- `git diff --check` and staged diff check: PASS.
- Ignore probes for future `.cache/ocr-debug/`, `dev-dist/` and `git/objects/`
  artifacts: PASS.

The first full-suite attempt, concurrent with build/typechecking, hit the existing
ZIP64 subprocess's 2.5-second timeout (458/459 Advisor tests passed). With those
tasks finished, the unchanged ZIP64 test passed alone in 276 ms and the complete
unchanged `npm test` passed. No timeout, assertion or security test was relaxed.
Build warnings about old Browserslist data and large chunks remain unchanged.

Only independent PR validation is triggered by opening this PR; production
release remains manual. No deploy, migration, provider test, flag change or live
data/index operation is performed. The previously failed release run is not
retried. Serving-version verification remains mandatory before any future,
separately approved deployment; this cleanup is not a production release.
