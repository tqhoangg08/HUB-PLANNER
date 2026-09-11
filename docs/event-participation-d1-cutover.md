# Event participation D1 authority

Phase 3B1 changes participation storage only. Core events and candidates remain unchanged.

- `GET /api/user/v1/event-participations`: own data; optional other user requires Auth Worker role admin/auditor.
- `PUT|DELETE /api/user/v1/event-participations/:eventId`: owner always comes from Better Auth session. Client owner parameters cannot select a write target.
- D1 `user_event_participations` key `(user_id,event_id)` is the existing API identity. The old source surrogate `id` is not exposed or used by clients. There is no separate participation status: row presence means participated.
- Join checks D1 `public_events` eligibility and inserts in a single statement. Duplicate joins preserve creation time. Leave is an owner-scoped idempotent delete, including when the event no longer exists.
- Hidden/deleted/draft/pending/unpublished/rejected events cannot receive joins. Closed/past public events remain trackable, preserving the existing attendance UI.
- Supabase participation cron, mutation repair, and account deletion request were removed. The old seed command is disabled to prevent resurrecting cancelled participation.
- No schema migration, no push, no frontend changes, no event/candidate write changes.

Pre-cutover read-only audit: 1,376 source and D1 rows; zero duplicate owner/event keys; normalized owner/event/timestamp hashes equal. No row data is printed. Run `npm run cf:d1:audit:event-participations` before deployment. After cutover source divergence is expected and must not be repaired by source overwrite.

Rollback caution: do not deploy the old participation sync after accepting D1 writes. Preserve D1 participation data and keep sync disabled in any rollback build; otherwise old source rows could overwrite new joins/leaves. Retained Supabase data is historical, not an automatic rollback authority.
