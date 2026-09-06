# HK1 browser audit — phase 1

Log in normally at https://online.hub.edu.vn/. Open Chrome DevTools → Sources → Snippets → New snippet. Paste `hk1-course-schedule-audit.js`, fill `COURSE_CODES` or `PASTED_JSON` with a JSON array, then Run. The download remains local. No session extraction, uploading, or database writes occur.

Optional reference objects have `canonical_course_code`, `instructor`, and `normalized_schedule` (an array using the exported schedule fields). Unknown or missing references require two agreeing timetable results before proposing a schedule for review. Blank source data never proposes clearing a field. `REVIEW_SCHEDULE` is a proposal, not permission to write.

## Rule evidence (2026-09-05)

Read-only D1 inventory: 2,101 codes in semesters containing HK1/2026/2027. Internal numeric segments: `_1_` in 44 codes, `_2_` in 3 codes, `_3_` in zero. These are canonical code shapes, **not measurements of successful upstream aliases**. The retired Vercel scraper implemented inserted and appended 1/2 aliases. No success-frequency evidence was available; historical order is retained. Variant 3 is excluded until observed.

GYM has 1 two-part, 1 three-part, 209 four-part and 12 five-part codes. The old last-segment-only transform could discard meaningful segments. The new bounded GYM transform preserves all segments after the second and uses inserted 1/2 only; its actual upstream success still needs browser validation. No fixed table index is used. Roster parsing requires an identifier header in an owned nested table; unsupported structures return unresolved instead of guessing.

Identifier matching trims surrounding whitespace only and uses equality against the complete alias set. MSSV values stay inside the run closure and are excluded from exported data. Timetable tables without recognized class headers are reported as unrecognized, not authentication failure. Session expiry stops the run and exports partial results.

The root bootstrap command and legacy cookie-based writer are retired locally. No Cloudflare deployment or global secret deletion was performed. Historical recovery worktrees and deployed version history are not modified by this local patch. Bindings eligible for later retirement review: COURSE_SCRAPER_UPSTREAM_USERNAME, COURSE_SCRAPER_UPSTREAM_PASSWORD, COURSE_SCRAPER_UPSTREAM_COOKIE, HK1_AUTO_AUTH_CANARY_SECRET; HK1_BROWSER_RUN is also an obsolete experimental binding. They are not claimed unused by every deployed version.

Tests: `node tools/hub-devtools-snippets/hk1-course-schedule-audit.test.mjs`. Tests use synthetic HTML in a temporary local browser and never contact HUB.
