# Facebook Event Collector — guarded pilot (Apify)

## Architecture
A scheduled **Apify Task**, managed from Apify, collects posts from pages that can
lawfully be accessed. The Worker polls only the **last succeeded run**, every
six hours using the existing `7 * * * *` cron (at UTC hours divisible by 6), or via the admin-only **Duyệt sự kiện → Đồng bộ Apify** button.

Apify Task -> last successful dataset -> bounded adapter/keyword filter -> existing
D1 event candidate ingest -> existing Groq AI extraction + DRL prediction ->
**manual staff approval** -> official events. No Facebook credentials/cookies
are accepted or stored by HUB PLANNER.

## Setup (pilot only; disabled by default)
1. Configure an Apify Facebook public-page actor/task in your own Apify account.
   Choose and verify its supported output schema, permitted access and price.
   Add 3–5 test fanpages. Enable a schedule there (e.g. every six hours).
   Verify that each output item includes a **permalink** and **post text**.
2. Keep the existing \`EVENT_CANDIDATE_INGEST_SECRET\` secret on the Worker.
   Configure Worker secrets with Wrangler:
   \`npx wrangler secret put APIFY_TOKEN --config cloudflare/wrangler.jsonc\`
   And configure the Apify task identifier as secret:
   \`npx wrangler secret put APIFY_TASK_ID --config cloudflare/wrangler.jsonc\`
   **Never commit API keys or Facebook session cookies.**
3. Apply migration \`0061_facebook_event_collector_state.sql\` using the established
   migration preflight / release pipeline (not manually in production).
4. Test with \`FACEBOOK_EVENT_COLLECTOR_ENABLED=false\`, on an isolated D1 preview.
   After approving the pilot, enable this Worker variable in controlled release.
5. On the Admin "Duyệt sự kiện" page, review collector receipts and sync
   status. Click "Đồng bộ Apify" after a succeeded Apify task run.
   Check 5 sample posts against their source pages and validate DRL information
   before approving any candidate.

## Safety / operations
- No automatic approval, publication, official DRL score assertion, or push.
- No implicit image rights: third-party photos are not copied to R2.
- Latest run only: no backlog backfill. Maximum 100 dataset items scanned
  per pass, maximum 8 *new* candidates per invocation. The same run can be
  replayed after partial ingestion, safely deduplicating by source post URL.
- Exact source permalink required; page profile URLs are ignored. Posts
  older than 21 days (when date is provided) or missing meaningful content
  are ignored. A keyword gate is only a cost-saving heuristic; it may miss
  events without recognizable event words.
- Atomic D1 lease reduces concurrent sync conflicts; a 35-minute stale lease
  can be recovered. Duplicate post URL protection already exists.
- No Apify or Groq usage while \`FACEBOOK_EVENT_COLLECTOR_ENABLED=false\`.
- Failure is reflected in the private admin receipt, not in public events.
- Existing event candidate logic invokes Groq per new post; test quota first.
  An Apify task run is scheduled separately in Apify, **not** triggered by the
  Worker. Monitor actor billing and enforce task-level spending limits.
- Never claim 100% coverage of Facebook posts; scraping may fail and pages
  can restrict visibility. Follow applicable platform and privacy rules.

## Validation
\`node --test --experimental-strip-types tests/facebook-event-collector.test.ts\`
\`npm run cf:typecheck\`
\`npm run typecheck\`
\`npm run build\`
Run the existing event candidate regressions and CI before merge.
No deployment or production migration is performed by this PR.
