# 4K.4 R1 Google-only production login recovery candidate

- Clean worktree: `D:\Projects\HUB-PLANNER\.worktrees\recovery-r1`
- Branch: `codex/recovery-r1`
- Base commit: `47007a373080effa04e8ade54d3f5ced5595acc8`
- Deployment status: not deployed

## Exact candidate files

- `.env.integration-preview`
- `.env.production`
- `.gitignore`
- `App.tsx`
- `LegacyApp.tsx`
- `app/auth/recoveryAuthClient.ts`
- `app/auth/studentAuthClient.ts`
- `app/bootstrap/selectApplicationEntry.ts`
- `app/routing/AppRoutes.tsx`
- `app/routing/lazyScreens.ts`
- `app/shell/ProtectedAppShell.tsx`
- `cloudflare/auth-integration-stage2-worker-configuration.d.ts`
- `cloudflare/auth-production-migrations/0001_unique_auth_account_provider_account.sql`
- `cloudflare/auth-production-migrations/0002_unique_auth_account_user_provider.sql`
- `cloudflare/auth-production-worker-configuration.d.ts`
- `cloudflare/auth-production-worker/src/auth-integration-stage2-profile.ts`
- `cloudflare/auth-production-worker/src/auth-integration-stage2.ts`
- `cloudflare/auth-production-worker/src/auth-production.ts`
- `cloudflare/auth-production-worker/src/index.ts`
- `cloudflare/migrations/0014_add_user_schedule_write_safety.sql`
- `cloudflare/migrations/0015_add_user_schedule_transaction_assertions.sql`
- `cloudflare/shared/auth-sensitive-routes.ts`
- `cloudflare/tsconfig.auth-integration-stage2.json`
- `cloudflare/tsconfig.auth-production.json`
- `cloudflare/worker-configuration.d.ts`
- `cloudflare/worker/src/better-auth-identity.ts`
- `cloudflare/worker/src/d1-user-schedule-mutations.ts`
- `cloudflare/worker/src/index.ts`
- `cloudflare/worker/src/private-notifications.ts`
- `cloudflare/worker/src/private-policy-consent.ts`
- `cloudflare/worker/src/private-profile.ts`
- `cloudflare/worker/src/schedule-write-mode.ts`
- `cloudflare/worker/src/user-schedules.ts`
- `cloudflare/wrangler.auth-integration-stage2.jsonc`
- `cloudflare/wrangler.auth-production.jsonc`
- `cloudflare/wrangler.jsonc`
- `components/AuthMaintenanceScreen.tsx`
- `components/Dashboard.tsx`
- `components/Handbook.tsx`
- `components/LoginScreen.tsx`
- `components/LostFoundBoard.tsx`
- `components/MobileDashboard.tsx`
- `components/MobileHandbook.tsx`
- `components/MobileHome.tsx`
- `components/MobileLostFound.tsx`
- `components/MobileProfile.tsx`
- `components/MobileSchedule.tsx`
- `components/NotificationBell.jsx`
- `components/NotificationNudge.tsx`
- `components/PasswordSetupModal.tsx`
- `components/PublicRankings.tsx`
- `components/PushNotificationPrompt.tsx`
- `components/RecoveryAccountScreen.tsx`
- `components/RecoveryForgotPasswordScreen.tsx`
- `components/RecoveryLoginScreen.tsx`
- `components/RecoveryResetPasswordScreen.tsx`
- `components/RegistrationPasswordScreen.tsx`
- `components/ScheduleBoard.tsx`
- `docs/releases/3c2-b1-schedule-write-safety.md`
- `docs/releases/3c2-b2-atomicity-gate.md`
- `docs/releases/3c2-b2-r3a-schedule-source-barrier.md`
- `docs/releases/4k4-r1-google-only-recovery.md`
- `hooks/useAccountPassword.ts`
- `hooks/useAccountProfileDraft.ts`
- `hooks/useDeleteAccount.ts`
- `hooks/useForecastRank.ts`
- `hooks/useSemesterLookback.ts`
- `hooks/useSessionAccessControl.ts`
- `hooks/useSessionLifecycle.ts`
- `hooks/useStudyData.ts`
- `hooks/useUserRole.ts`
- `index.tsx`
- `legacy-entry.tsx`
- `package-lock.json`
- `package.json`
- `pages/ProfilePage.jsx`
- `recovery-entry.tsx`
- `scripts/apply-integration-auth-account-unique-index.mjs`
- `scripts/audit-recovery-bundle-graph.mjs`
- `scripts/cleanup-integration-activation-fixture.mjs`
- `scripts/compare-production-user-schedules.mjs`
- `scripts/integration-auth-d1.mjs`
- `scripts/prepare-integration-activation-fixture.mjs`
- `server/api-handlers/auth.js`
- `server/api-handlers/courses.js`
- `server/api-handlers/schedule-source-barrier.js`
- `server/api-handlers/scraper.js`
- `supabase/functions/_shared/schedule-source-barrier.ts`
- `supabase/functions/auth/index.ts`
- `supabase/functions/courses/index.ts`
- `supabase/functions/scraper/index.ts`
- `supabase/migrations/20260812120000_schedule_cutover_source_barrier.sql`
- `supabase/migrations/20260813120000_add_better_auth_schedule_import_bridge.sql`
- `tests/auth-google-account-chooser.test.ts`
- `tests/auth-integration-stage2.test.ts`
- `tests/auth-production-policy.test.ts`
- `tests/auth-ux-restoration.test.ts`
- `tests/better-auth-private-frontend-bridge.test.ts`
- `tests/cloudflare-better-auth-identity.test.ts`
- `tests/cloudflare-d1-schedule-write.test.mjs`
- `tests/cloudflare-private-exact-ranking-auth.test.ts`
- `tests/cloudflare-private-schedule-read-auth.test.ts`
- `tests/cloudflare-production-auth-recovery.test.ts`
- `tests/cloudflare-schedule-b2-atomicity-gate.test.mjs`
- `tests/cloudflare-schedule-write-mode.test.ts`
- `tests/cloudflare-worker-auth.test.ts`
- `tests/compare-production-user-schedules.test.mjs`
- `tests/integration-activation-scripts.test.ts`
- `tests/recovery-auth-client.test.ts`
- `tests/recovery-execution-graph.test.ts`
- `tests/recovery-routing.test.ts`
- `tests/schedule-source-application-guards.test.mjs`
- `tests/supabase-schedule-source-barrier.test.mjs`
- `utils/activityLogger.ts`
- `utils/benchmarkRankingsApi.ts`
- `utils/clientSession.ts`
- `utils/logWebError.ts`
- `utils/policyConsent.ts`
- `utils/privateApi.ts`
- `utils/privateNotificationsApi.ts`
- `utils/privateProfileApi.ts`
- `utils/pushNotifications.ts`
- `utils/rescueMode.ts`
- `utils/scheduleImportPreview.ts`
- `utils/scheduleSourceBarrier.ts`
- `utils/supabase.ts`
- `utils/userSchedulesApi.ts`
- `vite.config.ts`

## Release scope

The local candidate restores the established HUB Planner login/register
presentation while keeping Better Auth as the only ordinary-student browser
identity authority. Password login and recovery accept MSSV, email/OTP signup
and Google signup create one canonical student identity, Google login is
existing-account-only, and first-time Google signup requires password setup.
Same-origin private calls use the host-only session cookie; legacy Supabase
remains the schedule source authority. The additive D1 account-provider
uniqueness migration must be applied and audited before the Auth Worker and
frontend candidates can be released.

## Public Worker production delta

- `AUTH_SERVICE` -> `hub-planner-auth-production`
- `AUTH_SERVICE_PROXY_ENABLED=true`
- `AUTH_INGRESS_IP_RATE_LIMIT` namespace `45871911`, 120 requests / 60 seconds
- Auth proxy host: exactly `hotrosinhvienhub.id.vn`
- Allowed routes:
  - `POST /api/auth/sign-in/social`
  - `GET /api/auth/callback/google`
  - `GET /api/auth/get-session`
  - `POST /api/auth/sign-out`
  - `POST /api/auth/sign-in/email`
  - `POST /api/auth/request-password-reset`
  - `GET /api/auth/reset-password/:token` (exactly one path segment)
  - `POST /api/auth/reset-password`
  - `POST /api/auth/mssv/sign-in`
  - `POST /api/auth/mssv/request-password-reset`
  - `POST /api/auth/student/sign-up/start`
  - `POST /api/auth/student/sign-up/verify`
  - `POST /api/auth/student/sign-up/resend`
  - `GET /api/auth/registration/status`
  - `POST /api/auth/registration/set-password`
- The original Request and auth Response are forwarded without rebuilding,
  preserving OAuth query strings, request bodies, cookies and Set-Cookie.
- Requests on workers.dev and all non-production hosts fail closed for Auth.

## Auth Worker production delta

- `AUTH_ENABLED=true`
- Worker remains private: `workers_dev=false`, `preview_urls=false`, with no
  route, custom domain, assets, cron, or service binding.
- Better Auth remains exactly `1.6.26`.
- D1 remains `AUTH_DB` -> `hub-planner-auth-production`
  (`4f42d86e-f924-4ecc-b3af-fc947b48810b`).

## Frontend public variables

- `VITE_AUTH_MAINTENANCE_MODE`
- `VITE_AUTH_TURNSTILE_SITE_KEY`

## Worker public variables

- Public Worker: `AUTH_SERVICE_PROXY_ENABLED`
- Auth Worker: `AUTH_ENABLED`, `AUTH_ORIGIN`,
  `AUTH_TURNSTILE_EXPECTED_HOSTNAME`, `AUTH_TURNSTILE_SITE_KEY`,
  `AUTH_GOOGLE_CLIENT_ID`, `AUTH_EMAIL_FROM`,
  `AUTH_RESET_EMAIL_DAILY_BUDGET`

## Required secret names

- Public Worker existing secrets remain unchanged.
- Auth Worker requires:
  - `AUTH_BETTER_AUTH_SECRET`
  - `AUTH_TURNSTILE_SECRET`
  - `AUTH_GOOGLE_CLIENT_SECRET`
  - `AUTH_RESEND_API_KEY`

No secret value is part of this candidate.

## Dependency audit note

`npm audit --omit=dev` reports seven advisories in the repository's existing
locked application/tooling dependencies (six high, one moderate): Axios,
DOMPurify, React Router, Cheerio/Wrangler's Undici, and transitive
brace-expansion/form-data. Better Auth 1.6.26 is not in the reported advisory
set. The recovery path does not use Axios, DOMPurify, SSR/RSC/data-router
actions, or user-controlled React Router destinations; its external OAuth URL
is separately restricted to HTTPS on `accounts.google.com`. Dependency
upgrades are intentionally not mixed into this emergency recovery release and
remain a follow-up review item.

## Mandatory pre-deploy gates

1. Re-run the read-only account inventory and confirm namespace
   `45871911` is still unused by every other Worker.
2. Confirm the Auth Worker secret list contains the four required names; do
   not read or replace their values.
3. Re-run the read-only production Auth D1 baseline and foreign-key check.
4. Review both Wrangler dry-runs from this worktree.

No separate namespace creation command is part of this candidate; the
pre-inventoried namespace ID is declared by the Public Worker rate-limit
binding.

## Deployment order (not executed)

1. Deploy `hub-planner-auth-production` from
   `cloudflare/wrangler.auth-production.jsonc`. It remains unreachable from
   production ingress until step 2.
2. Verify the Auth Worker still has no public target and the D1 baseline did
   not change merely from deployment.
3. Deploy `hub-planner-public-dev-api` from the top-level environment of
   `cloudflare/wrangler.jsonc`; this publishes the recovery assets and
   activates the private service binding in one release.
4. Run the controlled Stage-2 activation/reset, email login, session reload,
   and sign-out smoke plan. Re-run the existing Google regression. Do not test
   signup, MSSV, auditor provisioning, private data, or admin routes.

## Rollback anchors

- Public Production: `f046c580-bf68-47e8-9b07-36a1a21cf3cf`
- Auth Production: `baf1e205-c877-431c-af01-a03ea8852b5d`

Rollback order: restore Public Production first to the live Stage-1 route/UI
surface, then restore Auth Production to the live Stage-1 anchor.

## Stage 2 password activation/reset candidate

- Migration candidate:
  `cloudflare/auth-production-migrations/0001_unique_auth_account_provider_account.sql`.
  Its duplicate precondition must return zero rows before applying the unique
  `(provider_id, account_id)` index. The index changes no existing row and is
  compatible with Better Auth's `credential` / `accountId=userId` tuple.
- Eligibility is server-authoritative: exact normalized student email, an
  existing `role=user`, and either no provider or an existing credential
  provider. Google-only, admin, auditor, unknown-domain, and unexpected
  provider states receive the same generic response without email delivery.
- Request/reset actions remain protected by Turnstile actions `login`,
  `forgot_password`, and `reset_password`; Google remains `google_login`.
- Public ingress keeps namespace `45871911` at 120/60 seconds and applies to
  the three Stage-2 POST routes. GET callbacks and get-session do not consume
  it.
- Native identifier keys are purpose-separated HMACs (`login:` and `reset:`),
  never raw email. Reset email reservations use D1 transactions with a
  3/hour pseudonymous-identifier cap and the configurable global daily budget
  `AUTH_RESET_EMAIL_DAILY_BUDGET=80`.
- A reservation is retained once an email send attempt is scheduled with
  `waitUntil`; it represents an accepted send attempt, not guaranteed
  delivery. Synchronous handler failure releases it. Asynchronous Resend
  failure keeps the count to prevent unlimited retry/spam and logs only a
  safe event/code.
- The Auth Worker fixes `redirectTo` to the production `/reset-password` page.
  The callback token is forwarded through the exact one-segment route and is
  redacted to `:token` in Auth error logging. The frontend removes it from
  history after success and never stores it in local/session storage.
- No new secret or paid service is introduced. Existing Better Auth,
  Turnstile, Resend, Workers, and D1 resources are reused.

### Stage 2 P2 order (not executed)

1. Re-run production D1/FK and duplicate precondition read-only audits.
2. Apply only the reviewed unique-index migration to Production Auth D1.
3. Deploy Auth Production; verify it remains private and bindings/secrets by
   name are unchanged.
4. Deploy Public Production to publish the exact route allowlist and recovery
   UI.
5. Use one controlled eligible test account: request reset, inspect one email,
   set password, email-login, reload session, sign out. Then run one existing
   Google-account regression and re-check D1 aggregates/FK.

Rollback remains Public first, then Auth to the anchors above. The unique
index can remain during code rollback because Stage 1 account tuples already
satisfy it; dropping it would require a separately reviewed migration and is
not part of emergency rollback.
