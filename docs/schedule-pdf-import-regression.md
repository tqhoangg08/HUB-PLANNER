# HUB PDF schedule import regression audit

Base: `origin/main` at `cd6c2df4b72ac7b38797805adae087f443346771`.
Scope: schedule PDF extraction, catalogue matching, fallback sessions, preview and the existing private D1 import contract. No migrations, dependency changes, catalogue mutations, production data writes or deployment.

## Root causes

1. `resolveImportedScheduleMetadata` turned the PDF start/end into one inclusive week range. `scheduleSessionsFromLegacyFields` expanded that full range independently for every meeting, without a course-wide credit target. The supplied sample reproduced GDTC **12 instead of 3**, English **20 instead of 12**, and each ten-Tuesday course **10 instead of 9**. Shared weeks on different weekdays were legitimate sessions, not duplicates.
2. Legacy conversion accepted only literal `S`/`C`. The parser deliberately retained exact strings such as `13:00-17:05`, leaving the structured shift empty.
3. Both `getDuplicateWeekSessionIndexes` and the worker's `seenWeeks` rejected any repeated week, even when weekdays or times differed.
4. The final course on the headerless second PDF page inherited a row boundary derived from the previous page. Summary/footer text contaminated its subject and instructor. The parser now ends table extraction at the credit summary and checks valid ordered dates before declaring a direct parse reliable.
5. Catalogue selection took the first official candidate without rejecting ambiguity. The repaired path completes pagination, filters the exact semester and normalized full class code, deduplicates by id, rejects ambiguous/missing-id official matches, and never matches by subject name.

## Import contract

- The HUB layout parser still runs before AI; only an unreliable direct parse invokes AI and consumes fallback quota. Reading a PDF never saves a schedule.
- Catalogue lookup uses the existing canonical code normalization and all four equivalent semester/phase spellings. An official match (`is_user_added !== true`) returns the official course unchanged, keeps `systemCourseId`/`isSystemCourse`, and stays locked in preview. Confirmation sends only its id. PDF dates, credits, teachers and rooms cannot overwrite it.
- Only unmatched classes use `generateImportedScheduleSessions`. Supported integer credits are 1–4, matching the existing twelve-session worker limit. The proposed count is exactly `credits * 3`.
- Candidates are actual dates paired with PDF-declared weekday/time/room/campus. They are sorted by date/time and deduplicated by date/time regardless of room. One chronological sequence is sampled at evenly spaced positions, including its first and last candidates. There is no randomness and no per-weekday independent expansion.
- If the PDF range is too short, additional declared slots are taken after the range, then before it, within the selected semester only. Every added session carries `isEstimated: true`; preview explains that these dates are estimates. If the semester cannot supply enough unique slots, the proposal remains visibly incomplete and cannot be confirmed until corrected. Missing/invalid dates or credits require review instead of guessed values.
- Exact `startTime`/`endTime` are retained alongside `S`/`C`. A range must be ordered and wholly within 07:00–11:05 or 13:00–17:05. Invalid, incomplete and cross-shift ranges receive no guessed shift. Exact times are editable, serialized into legacy schedule fields, and retained with estimation flags in private snapshots.
- Frontend and worker reject actual time overlap on a shared week/day; they permit different days, separate shifts, and non-overlapping partial ranges. Desktop/mobile cross-course conflict checks also compare actual intervals. Unknown legacy time labels remain conservative in the existing board checks.
- New private imports require valid credits, exactly the target count, bounded weeks/day/location, valid matching times/shift and no internal overlap. Validation happens before mutation. Existing D1 batch transactions, owner scoping, revisions, idempotency receipts and rollback outbox remain intact. Existing saved schedules are not migrated or regenerated.
- Preview remains editable for unmatched courses and requires explicit confirmation to replace the semester. Its existing mobile cards are used below the table's safe width; the footer stays visible.

## Anonymized sample and catalogue audit

`tests/fixtures/hub-schedule-11.layout.json` contains the sample PDF's actual PDF.js table glyph coordinates across both pages. Student header, identifying URL/footer and student signature were excluded. A neutral title item supplies the parser heading; credit-summary/footer layout is retained to reproduce the final-row bug. No real PDF is committed. Public instructor/course information remains so extraction assertions can check the source accurately.

The source has **11 courses / 23 credits**. GDTC and English have blank instructor cells: these stay blank and require student input in preview. They are never guessed.

Read-only audit on **2026-10-16 (Asia/Saigon)** queried the public `/courses` API for the selected semester and each code variant. Result: **1 official match / 10 fallback classes**. `hub-schedule-catalog.json` captures that public course with a synthetic id for deterministic tests; future catalogue contents may differ.

| Class code in PDF | Source used | Proposed fallback count |
|---|---|---:|
| AMA308_261_1_D01 | PDF fallback | 6 |
| ITE713_LT_261_1_D01 | PDF fallback | 6 |
| ITE717_LT_261_1_D01 | PDF fallback | 6 |
| LAW349_2611_1_D01 | Official catalogue | Unchanged |
| GYM301_2611_1_D07 | PDF fallback; instructor missing | 3 |
| ENP706_261_1_D05 | PDF fallback; instructor missing | 12 |
| MLM306_2611_1_D05 | PDF fallback | 9 |
| ITS798_261_1_D01 | PDF fallback | 9 |
| AMA308_TH_261_1_D01 | PDF fallback | 3 |
| ITE713_TH_261_1_D01 | PDF fallback | 6 |
| ITE717_TH_261_1_D01 | PDF fallback | 3 |

The official LAW course has catalogue weeks `2-7`, which differ from the PDF dates. These official weeks are deliberately retained; no fallback formula is applied to them.

## Regression coverage and commands

`npm run test:schedule-import` separates extraction, parser/AI orchestration, official matching, deterministic generation, shift mapping, overlap detection, preview validation and request persistence into dedicated test files. It also runs the existing structured-session frontend/worker tests and is included in `npm test`.

`npm run build && npm run test:schedule-import:browser` exercises the real React preview and owner schedule API client at 1280, 1024, 768 and 390 px. It verifies official locks, missing instructor validation, populated shifts/original times, independent edits, no premature writes, no horizontal overflow, visible confirmation, and the exact confirmed payload.

`node --test tests/cloudflare-d1-schedule-write.test.mjs` runs real local Miniflare/D1 transactions. The PDF regression now persists two different afternoon slots on the same date plus an estimated session, preserves original hours/campus/flags on reload, and verifies rejected overlap/count replacements leave the previous snapshot intact. The existing cases cover authentication, ownership, CAS/idempotency races, rollback and private-only storage.

Other required checks: `npm test`, `npm run typecheck`, `npm run cf:typecheck`, `npm run build`, `git diff --check`. Browser acceptance is a separate explicit command because it requires Chrome and built CSS. The sample catalogue audit is a read-only observation, not a live dependency of any test.

## Verified results (2026-10-16)

| Check | Result |
|---|---|
| Full `npm test` | 1,006 PASS, 0 FAIL, 0 SKIP |
| Dedicated schedule import suite (included above) | 44 PASS |
| Additional course-request/admin/source-barrier compatibility | 14 PASS |
| Browser acceptance on final built CSS | 1 PASS; all four viewport widths |
| Frontend / Cloudflare typecheck | Both PASS |
| Local production build | PASS |
| Staged whitespace diff check | PASS |
| Original PDF read again with PDF.js | Reliable; 11 courses / 23 credits; course output exactly equals anonymized fixture |

The native Windows checkout uses `core.autocrlf=true`; its full test command reaches an unrelated Event DRL assertion comparing generated LF SQL byte-for-byte with a CRLF working file. The successful full run used an ignored source mirror exported with `git -c core.autocrlf=false archive`, overlaid with this change, and the identical locked installed dependencies. All 25 staged files were byte-for-byte equal to the tested mirror before adding this results section. No Event DRL source, test or migration was changed. An initial overloaded parallel run also hit local Wrangler/Miniflare timing/connection failures; the subsequent full run passed those checks, including all 13 real D1 schedule tests.

Runtime files changed: `utils/hubScheduleParser.ts`, `utils/scheduleImportUtils.ts`, `utils/scheduleImportSessions.ts`, `utils/scheduleImportPreview.ts`, `utils/scheduleSessions.ts`, `components/ScheduleImportPreviewModal.tsx`, `components/ScheduleSessionsEditor.tsx`, `components/ScheduleBoard.tsx`, `components/MobileSchedule.tsx`, `cloudflare/worker/src/course-schedule-sessions.ts`, and `cloudflare/worker/src/d1-user-schedule-mutations.ts`. `package.json` only wires regression commands; remaining changes are tests, anonymized fixtures and this audit. `schedulePdfImport.ts`, `academicCalendar.ts` and the public/private API clients were audited and retain their existing transport and calendar behavior.
