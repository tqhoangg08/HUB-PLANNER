import {
  BetterAuthIdentityError,
  requireBetterAuthSession,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';

export interface AccountDeleteEnv extends BetterAuthIdentityEnv {
  DB?: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPPORT_ATTACHMENTS_BUCKET?: R2Bucket;
  ACCOUNT_DELETE_SYNTHETIC_TEST_ENABLED?: string;
  ACCOUNT_DELETE_SYNTHETIC_TEST_USER_ID?: string;
  ACCOUNT_DELETE_SYNTHETIC_MAILTM_TOKEN?: string;
  TURNSTILE_SITE_KEY?: string;
}

export class AccountDeleteError extends Error {
  readonly status: number;
  readonly errorClass: string;
  constructor(status: number, message: string, errorClass = 'ACCOUNT_DELETE_ERROR') {
    super(message);
    this.name = 'AccountDeleteError';
    this.status = status;
    this.errorClass = errorClass;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4 * 1024;
const INTERNAL_ORIGIN = 'https://auth-service.internal';
const INTERNAL_TIMEOUT_MS = 15_000;
const SYNTHETIC_TEST_MAX_WAIT_MS = 30_000;
const SYNTHETIC_TEST_POLL_MS = 1_500;
const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

// Deletion failures must be diagnosable without recording an identity, OTP,
// cookie, or other account data.  These events are server-only Worker logs.
const accountDeleteStepStatus = (error: unknown) =>
  error instanceof AccountDeleteError || error instanceof BetterAuthIdentityError
    ? error.status
    : 500;

const accountDeleteStep = async <T>(name: string, work: () => Promise<T>) => {
  try {
    const value = await work();
    console.log(JSON.stringify({ event: 'account_delete_step', step: name, result: 'pass', status: 200 }));
    return value;
  } catch (error) {
    console.error(JSON.stringify({
      event: 'account_delete_step',
      step: name,
      result: 'fail',
      status: accountDeleteStepStatus(error),
    }));
    throw error;
  }
};

type DeleteStepBackend = 'source' | 'r2' | 'd1' | 'auth';

type DeleteStepTelemetry = {
  attemptId: string;
  nextOrder: number;
};

const sanitizedDeleteErrorClass = (error: unknown) => {
  if (error instanceof AccountDeleteError) return error.errorClass;
  if (error instanceof BetterAuthIdentityError) return 'BETTER_AUTH_IDENTITY_ERROR';
  return 'INTERNAL_ERROR';
};

const persistDeleteStep = async (
  env: AccountDeleteEnv,
  telemetry: DeleteStepTelemetry,
  stepOrder: number,
  stepName: string,
  backend: DeleteStepBackend,
  resource: string,
  state: 'started' | 'passed' | 'failed',
  statusCode: number | null,
  errorClass: string | null,
) => {
  if (!env.DB) throw new AccountDeleteError(503, 'Dịch vụ dữ liệu tài khoản chưa sẵn sàng.');
  if (state === 'started') {
    await env.DB.prepare(
      `INSERT INTO account_delete_step_telemetry
        (attempt_id, step_order, step_name, backend, resource, state, status_code, error_class)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(telemetry.attemptId, stepOrder, stepName, backend, resource, state, statusCode, errorClass).run();
    return;
  }
  await env.DB.prepare(
    `UPDATE account_delete_step_telemetry
        SET state = ?, status_code = ?, error_class = ?, recorded_at = CURRENT_TIMESTAMP
      WHERE attempt_id = ? AND step_order = ?`,
  ).bind(state, statusCode, errorClass, telemetry.attemptId, stepOrder).run();
};

// Persists only an opaque attempt id and a sanitised operational label.  It never
// receives or writes a user id, account identifier, OTP, token, cookie, or body.
const persistedDeleteStep = async <T>(
  env: AccountDeleteEnv,
  telemetry: DeleteStepTelemetry,
  stepName: string,
  backend: DeleteStepBackend,
  resource: string,
  work: () => Promise<T>,
) => {
  const stepOrder = telemetry.nextOrder++;
  await persistDeleteStep(env, telemetry, stepOrder, stepName, backend, resource, 'started', null, null);
  try {
    const value = await work();
    await persistDeleteStep(env, telemetry, stepOrder, stepName, backend, resource, 'passed', 200, null);
    console.log(JSON.stringify({ event: 'account_delete_step', step: stepName, result: 'pass', status: 200 }));
    return value;
  } catch (error) {
    await persistDeleteStep(
      env,
      telemetry,
      stepOrder,
      stepName,
      backend,
      resource,
      'failed',
      accountDeleteStepStatus(error),
      sanitizedDeleteErrorClass(error),
    );
    console.error(JSON.stringify({
      event: 'account_delete_step',
      step: stepName,
      result: 'fail',
      status: accountDeleteStepStatus(error),
    }));
    throw error;
  }
};

const readBody = async (request: Request) => {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new AccountDeleteError(413, 'Yêu cầu xóa tài khoản quá lớn.');
  }
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new AccountDeleteError(400, 'Yêu cầu xóa tài khoản không hợp lệ.');
  }
};

const authCall = async (
  request: Request,
  env: AccountDeleteEnv,
  path: '/internal/account-delete/request-otp' | '/internal/account-delete/verify' | '/internal/account-delete/commit',
  body: Record<string, unknown>,
  extraHeaders: HeadersInit = {},
) => {
  if (!env.AUTH_SERVICE) throw new AccountDeleteError(503, 'Dịch vụ xác thực tạm thời chưa sẵn sàng.');
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie) throw new AccountDeleteError(401, 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  let response: Response;
  try {
    response = await env.AUTH_SERVICE.fetch(new Request(new URL(path, INTERNAL_ORIGIN), {
      method: 'POST',
      headers: { Cookie: cookie, Accept: 'application/json', 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(INTERNAL_TIMEOUT_MS),
    }));
  } catch {
    throw new AccountDeleteError(503, 'Dịch vụ xác thực tạm thời chưa sẵn sàng.');
  }
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const status = [400, 401, 403, 429].includes(response.status) ? response.status : 503;
    throw new AccountDeleteError(status, typeof payload.error === 'string' ? payload.error : 'Không thể xác minh yêu cầu xóa tài khoản.');
  }
  return payload;
};

const serverSource = (env: AccountDeleteEnv) => {
  const base = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || !key) throw new AccountDeleteError(503, 'Dịch vụ dọn dữ liệu tài khoản chưa sẵn sàng.');
  return { base, key };
};

const sourceRequest = async (env: AccountDeleteEnv, path: string, init: RequestInit = {}) => {
  const { base, key } = serverSource(env);
  let response: Response;
  try {
    response = await fetch(new URL(path, base), {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json', ...init.headers },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new AccountDeleteError(
      503,
      'Dịch vụ dọn dữ liệu tài khoản tạm thời chưa sẵn sàng.',
      timedOut ? 'SOURCE_REQUEST_TIMEOUT' : 'SOURCE_NETWORK_FAILURE',
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new AccountDeleteError(502, 'Không thể hoàn tất dọn dữ liệu tài khoản.', 'SOURCE_HTTP_FAILURE');
  }
  return response;
};

type SourceOwnerTable = readonly [table: string, column: string];

// These are the current server-side source resources still owned by a user.
// Keep the registry explicit: a missing current table must fail the preflight,
// before any destructive source cleanup begins.
const SOURCE_OWNER_TABLES: readonly SourceOwnerTable[] = [
  ['bug_reports', 'user_id'],
  ['canva_pro_requests', 'user_id'],
  ['course_reports', 'user_id'],
  ['event_reports', 'user_id'],
  ['feedback', 'user_id'],
  ['user_course_requests', 'user_id'],
  ['schedule_notification_logs', 'user_id'],
  ['subscriptions', 'user_id'],
  ['auth_trigger_errors', 'user_id'],
  ['web_error_logs', 'user_id'],
];

const D1_CLEANUP_TABLES = [
  'user_schedule_course_snapshots',
  'user_schedules',
  'user_schedule_revisions',
  'user_schedule_mutation_receipts',
  'user_schedule_rollback_outbox',
  'course_mutation_receipts',
  'course_mutation_outbox',
  'user_course_requests',
  'user_event_participations',
  'benchmark_ranking_users',
  'admin_event_mutations',
  'lost_found_items',
  'public_lost_found_items',
  'admin_export_otps',
  'push_subscriptions',
  'notification_preferences',
  'push_delivery_attempts',
  'support_notifications',
  'protected_submission_moderator_notifications',
  'protected_submissions',
  'support_ticket_attachments',
  'support_ticket_messages',
  'support_tickets',
  'support_attachment_uploads',
  'ai_chat_logs',
  'policy_consents',
  'activity_logs',
  'practice_attempts',
  'practice_pro_access',
  'practice_sets',
  'user_profile_private',
  'user_profiles',
] as const;

const preflightServerSideUserData = async (env: AccountDeleteEnv) => {
  // This validates binding presence without returning or logging a secret.
  await accountDeleteStep('source_binding', async () => serverSource(env));
  // The source database validates every explicit table/column contract in one
  // server-side RPC. This avoids consuming a Worker subrequest per resource
  // before the strict, individually instrumented mutations begin.
  await accountDeleteStep('source_preflight:cleanup_contract', async () => {
    const response = await sourceRequest(env, '/rest/v1/rpc/preflight_account_delete_source_cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: '{}',
    });
    await response.body?.cancel();
  });
  // Practice core data is D1-authoritative and is deliberately not preflighted
  // against Supabase here.
};

const preflightD1UserData = async (env: AccountDeleteEnv) => {
  if (!env.DB) throw new AccountDeleteError(503, 'Dịch vụ dữ liệu tài khoản chưa sẵn sàng.');
  for (const table of D1_CLEANUP_TABLES) {
    await accountDeleteStep(`d1_preflight:${table}`, async () => {
      await env.DB!.prepare(`SELECT 1 FROM ${table} LIMIT 0`).first();
    });
  }
};

const deleteSourceRows = async (
  env: AccountDeleteEnv,
  telemetry: DeleteStepTelemetry,
  table: string,
  column: string,
  userId: string,
  step = `source_delete:${table}`,
) => {
  await persistedDeleteStep(env, telemetry, step, 'source', table, async () => {
    const path = `/rest/v1/${table}?${column}=eq.${encodeURIComponent(userId)}`;
    const response = await sourceRequest(env, path, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    await response.body?.cancel();
  });
};

export const cleanupServerSideUserData = async (env: AccountDeleteEnv, userId: string, telemetry: DeleteStepTelemetry) => {
  // Never begin a source delete until every current authoritative source table
  // used by this pipeline has passed a read-only schema check.
  await preflightServerSideUserData(env);
  // Child/owned resources first. Every deletion is exact-owner scoped and strict.
  for (const [table, column] of SOURCE_OWNER_TABLES) await deleteSourceRows(env, telemetry, table, column, userId);
  await deleteSourceRows(env, telemetry, 'notifications', 'receiver_id', userId, 'source_delete:notifications_receiver');
  await deleteSourceRows(env, telemetry, 'notifications', 'actor_id', userId, 'source_delete:notifications_actor');
  await deleteSourceRows(env, telemetry, 'profile_private_data', 'user_id', userId);
  await deleteSourceRows(env, telemetry, 'user_roles', 'user_id', userId);
  await deleteSourceRows(env, telemetry, 'profiles', 'id', userId);
};

const cleanupD1UserData = async (env: AccountDeleteEnv, userId: string) => {
  await preflightD1UserData(env);
  const uploadRows = await env.DB.prepare(
    `SELECT file_key FROM support_attachment_uploads WHERE user_id = ?1
     UNION
     SELECT a.file_key FROM support_ticket_attachments a
       LEFT JOIN support_tickets t ON t.id = a.ticket_id
      WHERE a.uploaded_by = ?1 OR t.user_id = ?1`,
  ).bind(userId).all<{ file_key: string }>();
  const lostFoundImages = await env.DB.prepare(
    `SELECT image_key FROM lost_found_items
      WHERE user_id = ? AND image_key LIKE 'lost-found/%'`,
  ).bind(userId).all<{ image_key: string }>();
  // Audit history is intentionally retained but de-identified, matching the
  // legacy source policy. This is not part of the hard-delete table list.
  const userHash = Array.from(new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(userId),
  ))).map((part) => part.toString(16).padStart(2, '0')).join('');
  const now = new Date().toISOString();
  const anonymizationMetadata = JSON.stringify({
    anonymized: true,
    anonymization_reason: 'account_hard_delete',
    user_id_hash: userHash,
  });
  await env.DB.prepare(`UPDATE activity_logs
    SET user_id=NULL,user_email=NULL,ip_address=NULL,device_info=NULL,location_guess=NULL,
      old_data_json=NULL,new_data_json=NULL,
      details_json=?,metadata_json=json_patch(COALESCE(metadata_json,'{}'), ?)
    WHERE user_id=?`).bind(
    JSON.stringify({ anonymized: true, anonymization_reason: 'account_hard_delete', user_id_hash: userHash }),
    anonymizationMetadata,
    userId,
  ).run();
  const deleteLogKey = `account-delete:${userHash}`;
  const deleteLogHash = Array.from(new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(deleteLogKey),
  ))).map((part) => part.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare(`INSERT OR IGNORE INTO activity_logs
    (source_key,canonical_hash,created_at,action,action_label,target_id,record_id,status,metadata_json,details_json)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(
    deleteLogKey, deleteLogHash, now, 'delete_account_hard_delete', 'delete_account_hard_delete', userHash, userHash,
    'success', JSON.stringify({ source: 'account_delete', anonymized: true }),
    JSON.stringify({ anonymized: true, anonymization_reason: 'account_hard_delete', user_id_hash: userHash }),
  ).run();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_schedule_course_snapshots WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_schedules WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_schedule_revisions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_schedule_mutation_receipts WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_schedule_rollback_outbox WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM course_mutation_receipts WHERE actor_scope = ? AND actor_id = ?').bind('user', userId),
    env.DB.prepare('DELETE FROM course_mutation_outbox WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_course_requests WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_event_participations WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM benchmark_ranking_users WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM admin_event_mutations WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM public_lost_found_items WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM lost_found_items WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM admin_export_otps WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM support_notifications WHERE receiver_id = ? OR actor_id = ?').bind(userId, userId),
    env.DB.prepare('DELETE FROM protected_submission_moderator_notifications WHERE receiver_id = ? OR actor_id = ?').bind(userId, userId),
    env.DB.prepare('DELETE FROM protected_submissions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM support_ticket_attachments WHERE uploaded_by = ?').bind(userId),
    env.DB.prepare('DELETE FROM support_ticket_messages WHERE sender_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM support_tickets WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM support_attachment_uploads WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM ai_chat_logs WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM practice_attempts WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM practice_pro_access WHERE user_id = ?').bind(userId),
    // Private sets are owner-only data. Shared/public authored sets survive an
    // account deletion with ownership detached; the NULL predicate prevents a
    // no-op cleanup from writing an unchanged row.
    env.DB.prepare("DELETE FROM practice_sets WHERE owner_id = ? AND visibility = 'private'").bind(userId),
    env.DB.prepare("UPDATE practice_sets SET owner_id = NULL, updated_at = ? WHERE owner_id = ? AND visibility <> 'private' AND owner_id IS NOT NULL")
      .bind(now, userId),
    env.DB.prepare('DELETE FROM push_delivery_attempts WHERE subscription_id IN (SELECT id FROM push_subscriptions WHERE user_id = ?)').bind(userId),
    env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM notification_preferences WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_profile_private WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_profiles WHERE user_id = ?').bind(userId),
  ]);
  const remaining = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM user_schedules WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM user_course_requests WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM user_profiles WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM lost_found_items WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM notification_preferences WHERE user_id = ?1) +
        (SELECT COUNT(*) FROM support_notifications WHERE receiver_id = ?1 OR actor_id = ?1) +
        (SELECT COUNT(*) FROM protected_submission_moderator_notifications WHERE receiver_id = ?1 OR actor_id = ?1) +
        (SELECT COUNT(*) FROM protected_submissions WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM support_ticket_attachments WHERE uploaded_by = ?1) +
       (SELECT COUNT(*) FROM support_ticket_messages WHERE sender_id = ?1) +
       (SELECT COUNT(*) FROM support_tickets WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM support_attachment_uploads WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM ai_chat_logs WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM practice_attempts WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM practice_pro_access WHERE user_id = ?1) +
       (SELECT COUNT(*) FROM practice_sets WHERE owner_id = ?1) AS remaining`,
  ).bind(userId).first<{ remaining: number }>();
  if (!remaining || Number(remaining.remaining) !== 0) throw new AccountDeleteError(500, 'Không thể xác nhận dọn dữ liệu tài khoản.');
  if (env.SUPPORT_ATTACHMENTS_BUCKET) {
    const keys = [
      ...(uploadRows.results || []).map((row) => row.file_key),
      ...(lostFoundImages.results || []).map((row) => row.image_key),
    ].filter(Boolean);
    if (keys.length) await env.SUPPORT_ATTACHMENTS_BUCKET.delete(keys);
  }
};

// Used only by the admin student lifecycle after its authenticated Auth-side
// delete has been reserved. It reuses the exact-owner cleanup and postcondition
// checks from the self-service deletion flow; callers must provide their own
// admin authorization and cross-database saga state.
export const cleanupD1UserDataForAdminLifecycle = cleanupD1UserData;

const isSyntheticFixture = (env: AccountDeleteEnv, userId: string) =>
  env.ACCOUNT_DELETE_SYNTHETIC_TEST_ENABLED === 'true' &&
  UUID.test(String(env.ACCOUNT_DELETE_SYNTHETIC_TEST_USER_ID || '')) &&
  userId === env.ACCOUNT_DELETE_SYNTHETIC_TEST_USER_ID &&
  String(env.ACCOUNT_DELETE_SYNTHETIC_MAILTM_TOKEN || '').length >= 20;

const readSyntheticMailboxOtp = async (env: AccountDeleteEnv, afterMs: number) => {
  const token = String(env.ACCOUNT_DELETE_SYNTHETIC_MAILTM_TOKEN || '');
  const deadline = Date.now() + SYNTHETIC_TEST_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const list = await fetch('https://api.mail.tm/messages?page=1', {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      });
      if (list.ok) {
        const payload = await list.json() as { 'hydra:member'?: Array<{ id?: string; createdAt?: string }> };
        for (const message of payload['hydra:member'] || []) {
          if (!message.id || Date.parse(String(message.createdAt || '')) + 2_000 < afterMs) continue;
          const detail = await fetch(`https://api.mail.tm/messages/${encodeURIComponent(message.id)}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(8_000),
          });
          if (!detail.ok) continue;
          const content = await detail.json() as { text?: string; html?: string | string[] };
          const text = `${content.text || ''}\n${Array.isArray(content.html) ? content.html.join('\n') : content.html || ''}`;
          const match = text.match(/Mã xác nhận xóa tài khoản(?: của bạn)? là\s*(\d{6})/iu);
          if (match) return match[1];
        }
      }
    } catch {
      // Mailbox polling is deliberately silent: no OTP, recipient, or provider data is logged.
    }
    await new Promise((resolve) => setTimeout(resolve, SYNTHETIC_TEST_POLL_MS));
  }
  throw new AccountDeleteError(503, 'Không nhận được mã xác nhận kiểm thử đúng hạn.');
};

const commitVerifiedDelete = async (
  request: Request,
  env: AccountDeleteEnv,
  identity: { userId: string },
  grant: string,
) => {
  const telemetry: DeleteStepTelemetry = { attemptId: crypto.randomUUID(), nextOrder: 1 };
  await cleanupServerSideUserData(env, identity.userId, telemetry);
  await persistedDeleteStep(env, telemetry, 'd1_cleanup', 'd1', 'user_owned_data', async () => cleanupD1UserData(env, identity.userId));
  const committed = await persistedDeleteStep(env, telemetry, 'auth_teardown', 'auth', 'better_auth_identity', async () => (
    authCall(request, env, '/internal/account-delete/commit', { grant })
  ));
  if (committed.deleted !== true) throw new AccountDeleteError(503, 'Không thể hoàn tất xóa tài khoản.');
  return { deleted: true };
};


const syntheticTestHtml = () => `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HUB Planner — Synthetic account deletion test</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f5f9;color:#0f172a;font:16px system-ui,sans-serif}.card{width:min(440px,calc(100vw - 32px));box-sizing:border-box;background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:28px;box-shadow:0 14px 36px #0f172a22}h1{font-size:20px;margin:0 0 16px}.state{padding:12px;border-radius:10px;background:#f8fafc;line-height:1.7}.turnstile{display:grid;justify-content:center;margin:22px 0}.turnstile iframe{width:320px;height:90px;border:0}button{width:100%;padding:12px;border:0;border-radius:10px;background:#dc2626;color:white;font-weight:700;font-size:15px}button:disabled{background:#94a3b8}.note{font-size:13px;color:#475569;margin-top:16px}.hidden{display:none}</style></head><body><main class="card"><h1>Kiểm thử xóa tài khoản synthetic</h1><div id="state" class="state">Đang xác minh phiên…</div><div id="turnstile-slot" class="turnstile hidden"><iframe title="Xác minh Turnstile" src="/__account-delete-synthetic-test/turnstile-frame"></iframe></div><button id="delete" disabled>Xóa tài khoản synthetic test</button><p class="note">Trang tạm thời này chỉ chấp nhận fixture synthetic đã được chuẩn bị sẵn.</p></main><script>const state=document.querySelector('#state'),button=document.querySelector('#delete'),slot=document.querySelector('#turnstile-slot');let token='',guardPassed=false;const render=(s)=>state.textContent=s;window.addEventListener('message',(event)=>{if(!guardPassed||event.origin!==location.origin||event.data?.type!=='account-delete-synthetic-turnstile-token'||typeof event.data.token!=='string'||event.data.token.length<20)return;token=event.data.token;button.disabled=false});const start=async()=>{try{const r=await fetch('/api/private/v1/account-delete/synthetic-test/status',{credentials:'include'});const p=await r.json().catch(()=>({}));if(!p.authenticated){render('Cần đăng nhập bằng tài khoản synthetic trước khi tiếp tục.');return}if(!p.synthetic){render('Phiên hiện tại không phải tài khoản synthetic được phép kiểm thử.');return}guardPassed=true;render('AUTHENTICATED=YES\\nSYNTHETIC_TEST_ACCOUNT=YES');slot.classList.remove('hidden')}catch{render('Không thể xác minh phiên kiểm thử.')}};button.onclick=async()=>{if(!guardPassed||!token)return;button.disabled=true;render('Đang chạy kiểm thử xóa an toàn…');const r=await fetch('/api/private/v1/account-delete/synthetic-test/execute',{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-turnstile-token':token},body:'{}'});await r.body?.cancel();if(!r.ok){render('Kiểm thử không hoàn tất. Tài khoản synthetic không được xóa.');return}render(['BETTER_AUTH_USER_DELETED=PASS','BETTER_AUTH_SESSIONS_DELETED=PASS','PROFILE_CLEANUP=PASS','PRIVATE_SCHEDULE_CLEANUP=PASS','COURSE_REQUEST_CLEANUP=PASS','PUSH_CLEANUP=PASS','OTHER_USER_DATA_CLEANUP=PASS','SHARED_PUBLIC_DATA_UNCHANGED=PASS'].join('\\n'));};start();</script></body></html>`;

const syntheticTestTurnstileFrameHtml = (siteKey: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;display:grid;place-items:center;min-height:85px}</style></head><body><div id="turnstile-widget"></div><script>window.accountDeleteSyntheticTurnstileFrameLoaded=()=>{if(!window.turnstile||typeof window.turnstile.render!=='function')return;window.turnstile.render('#turnstile-widget',{sitekey:${JSON.stringify(siteKey)},action:'account_delete',callback:(token)=>parent.postMessage({type:'account-delete-synthetic-turnstile-token',token},location.origin)})}</script><script id="account-delete-synthetic-turnstile-loader" src="${TURNSTILE_SCRIPT}&onload=accountDeleteSyntheticTurnstileFrameLoaded"></script></body></html>`;

export const handleAccountDeleteSyntheticTestPage = (env: AccountDeleteEnv) => {
  if (env.ACCOUNT_DELETE_SYNTHETIC_TEST_ENABLED !== 'true' || !String(env.TURNSTILE_SITE_KEY || '')) {
    throw new AccountDeleteError(404, 'Không tìm thấy endpoint.');
  }
  return new Response(syntheticTestHtml(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
};

export const handleAccountDeleteSyntheticTestTurnstileFrame = (env: AccountDeleteEnv) => {
  if (env.ACCOUNT_DELETE_SYNTHETIC_TEST_ENABLED !== 'true' || !String(env.TURNSTILE_SITE_KEY || '')) {
    throw new AccountDeleteError(404, 'Không tìm thấy endpoint.');
  }
  return new Response(syntheticTestTurnstileFrameHtml(String(env.TURNSTILE_SITE_KEY)), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
};

export const handleAccountDeleteSyntheticTest = async (request: Request, url: URL, env: AccountDeleteEnv) => {
  const identity = await requireBetterAuthSession(request, env);
  if (!isSyntheticFixture(env, identity.userId)) throw new AccountDeleteError(403, 'Không có quyền chạy kiểm thử này.');
  if (url.pathname.endsWith('/status')) return { authenticated: true, synthetic: true };
  if (request.method !== 'POST' || !url.pathname.endsWith('/execute')) throw new AccountDeleteError(405, 'Phương thức không được hỗ trợ.');
  const turnstile = request.headers.get('x-turnstile-token') || '';
  if (!turnstile) throw new AccountDeleteError(400, 'Vui lòng xác minh bạn không phải robot.');
  const sentAt = Date.now();
  await authCall(request, env, '/internal/account-delete/request-otp', {}, { 'x-turnstile-token': turnstile });
  const otp = await readSyntheticMailboxOtp(env, sentAt);
  const verified = await authCall(request, env, '/internal/account-delete/verify', { otp });
  if (verified.userId !== identity.userId || typeof verified.grant !== 'string') {
    throw new AccountDeleteError(503, 'Không thể xác minh kiểm thử xóa tài khoản.');
  }
  await commitVerifiedDelete(request, env, identity, verified.grant);
  return { deleted: true, synthetic: true };
};

export const handleAccountDelete = async (request: Request, url: URL, env: AccountDeleteEnv) => {
  const identity = await requireBetterAuthSession(request, env);
  if (!UUID.test(identity.userId)) throw new AccountDeleteError(400, 'Danh tính tài khoản không hợp lệ.');
  // Account deletion is intentionally self-service for ordinary users only.
  // The role is resolved by the Auth service from D1; no browser role is read.
  if (identity.role !== 'user') throw new AccountDeleteError(403, 'Tài khoản nhân sự không thể tự xóa qua luồng này.');

  if (url.pathname === '/api/private/v1/account-delete/preflight') {
    if (request.method !== 'GET') throw new AccountDeleteError(405, 'Phương thức không được hỗ trợ.');
    await preflightServerSideUserData(env);
    await preflightD1UserData(env);
    return { ready: true };
  }

  if (request.method !== 'POST') throw new AccountDeleteError(405, 'Phương thức không được hỗ trợ.');
  const body = await readBody(request);

  if (url.pathname === '/api/private/v1/account-delete/request-otp') {
    const turnstile = request.headers.get('x-turnstile-token') || '';
    if (!turnstile) throw new AccountDeleteError(400, 'Vui lòng xác minh bạn không phải robot.');
    return authCall(request, env, '/internal/account-delete/request-otp', {}, { 'x-turnstile-token': turnstile });
  }
  if (url.pathname !== '/api/private/v1/account-delete/confirm') throw new AccountDeleteError(404, 'Không tìm thấy endpoint.');
  const otp = typeof body.otp === 'string' ? body.otp : '';
  if (!/^\d{6}$/.test(otp)) throw new AccountDeleteError(400, 'Mã xác nhận không hợp lệ hoặc đã hết hạn.');
  const verified = await authCall(request, env, '/internal/account-delete/verify', { otp });
  if (verified.userId !== identity.userId || typeof verified.grant !== 'string') {
    throw new AccountDeleteError(503, 'Không thể xác minh yêu cầu xóa tài khoản.');
  }
  return commitVerifiedDelete(request, env, identity, verified.grant);
};

export const accountDeleteErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof AccountDeleteError ? error.status : 500;
