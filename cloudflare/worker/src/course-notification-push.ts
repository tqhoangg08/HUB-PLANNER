import { deliverPushBatch, sourceDeliveryProgress, type PushDeliveryEnv, type PushDeliveryOptions } from './push-delivery.ts';
import { publishPushEvent, type PushEventQueueEnv } from './push-events.ts';

export interface CourseNotificationPushEnv extends PushDeliveryEnv, PushEventQueueEnv {
  SCHEDULE_PUSH_CUTOFF?: string;
}

type CourseOutboxRow = {
  id: string;
  event_type: 'course_request.approved' | 'course_request.rejected';
  user_id: string | null;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  course_code: string | null;
  subject_name: string | null;
};
export type CoursePushProcessResult = {
  success: boolean; queued: number; sent: number;
  state: 'idle' | 'claimed' | 'sent' | 'pending' | 'terminal';
  hasMore?: boolean; retryAt?: string | null;
};

const CLAIM_LEASE_MS = 14 * 60_000;
const MAX_ATTEMPTS = 3;
const DECISION_TYPES = "('course_request.approved','course_request.rejected')";

const isUsableOutboxId = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const scheduleCutoff = (env: CourseNotificationPushEnv) => {
  const parsed = Date.parse(String(env.SCHEDULE_PUSH_CUTOFF || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

export const signalCourseRequestDecision = async (env: PushEventQueueEnv, outboxId: string) =>
  isUsableOutboxId(outboxId)
    ? publishPushEvent(env, { v: 1, type: 'schedule', sourceId: outboxId })
    : false;

const selectOutbox = async (env: CourseNotificationPushEnv, outboxId?: string, cutoff?: string | null) => {
  const now = new Date().toISOString();
  const exact = outboxId ? ' AND o.id = ?' : '';
  const fresh = cutoff ? ' AND o.created_at >= ?' : '';
  const bindings: string[] = [now, now];
  if (outboxId) bindings.push(outboxId);
  if (cutoff) bindings.push(cutoff);
  return env.DB.prepare(
    `SELECT o.id,o.event_type,o.user_id,o.status,o.attempts,r.course_code,r.subject_name
       FROM course_mutation_outbox o
       LEFT JOIN user_course_requests r ON r.id = o.request_id
      WHERE o.event_type IN ${DECISION_TYPES}
        AND (o.status = 'pending' OR (o.status = 'failed' AND o.attempts < ${MAX_ATTEMPTS}))
        AND (o.next_retry_at IS NULL OR o.next_retry_at <= ?)
        AND (o.lease_expires_at IS NULL OR o.lease_expires_at <= ?)${exact}${fresh}
      ORDER BY o.created_at, o.id LIMIT 1`,
  ).bind(...bindings).first<CourseOutboxRow>();
};

const terminalFailure = async (env: CourseNotificationPushEnv, outboxId: string, reason: string) => {
  await env.DB.prepare(
    `UPDATE course_mutation_outbox
        SET status='failed', attempts=${MAX_ATTEMPTS}, lease_expires_at=NULL, next_retry_at=NULL, last_error=?
      WHERE id=?`,
  ).bind(reason, outboxId).run();
};

const payloadFor = (row: CourseOutboxRow) => {
  const course = String(row.course_code || row.subject_name || '').trim();
  const approved = row.event_type === 'course_request.approved';
  return {
    title: approved ? 'Yêu cầu thêm môn đã được duyệt' : 'Yêu cầu thêm môn chưa được duyệt',
    body: `${approved ? 'Yêu cầu' : 'Yêu cầu'}${course ? ` môn ${course}` : ' thêm môn'} ${approved ? 'đã được duyệt.' : 'đã bị từ chối.'}`.slice(0, 240),
    url: '/schedule', category: 'schedule' as const,
  };
};

export const processCourseNotificationOutboxItem = async (
  env: CourseNotificationPushEnv,
  outboxId: string,
  fetcher: typeof fetch = fetch,
  sender?: PushDeliveryOptions['sender'],
): Promise<CoursePushProcessResult> => {
  if (!isUsableOutboxId(outboxId)) return { success: true, queued: 0, sent: 0, state: 'terminal' };
  const row = await selectOutbox(env, outboxId);
  if (!row) return { success: true, queued: 0, sent: 0, state: 'idle' };
  if (!row.user_id) {
    await terminalFailure(env, row.id, 'MISSING_REQUEST_OWNER');
    return { success: false, queued: 1, sent: 0, state: 'terminal' };
  }
  const now = new Date().toISOString();
  const leaseExpiresAt = new Date(Date.now() + CLAIM_LEASE_MS).toISOString();
  const claimed = await env.DB.prepare(
    `UPDATE course_mutation_outbox
        SET lease_expires_at=?
      WHERE id=? AND event_type IN ${DECISION_TYPES}
        AND (status='pending' OR (status='failed' AND attempts < ${MAX_ATTEMPTS}))
        AND (next_retry_at IS NULL OR next_retry_at <= ?)
        AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
  ).bind(leaseExpiresAt, row.id, now, now).run();
  if (Number(claimed.meta?.changes || 0) !== 1) return { success: true, queued: 0, sent: 0, state: 'claimed' };
  try {
    const result = await deliverPushBatch(env, payloadFor(row), {
      userId: row.user_id, limit: 100, fetcher, sender,
      deliveryKey: { type: 'schedule', id: row.id },
    });
    const { continuation, retryAt: effectiveRetryAt, completed: complete } = sourceDeliveryProgress(result);
    const status = complete ? 'delivered' : effectiveRetryAt ? 'failed' : 'pending';
    await env.DB.prepare(
      `UPDATE course_mutation_outbox
          SET status=?, delivered_at=CASE WHEN ? THEN ? ELSE delivered_at END,
              attempts=CASE WHEN ? THEN attempts ELSE attempts+1 END,
              next_retry_at=?, lease_expires_at=NULL,
              last_error=CASE WHEN ? IS NULL THEN NULL ELSE 'DELIVERY_RETRY_PENDING' END
        WHERE id=?`,
    ).bind(status, complete ? 1 : 0, new Date().toISOString(), continuation ? 1 : 0, effectiveRetryAt, effectiveRetryAt, row.id).run();
    return {
      success: complete || result.sent > 0, queued: 1, sent: result.sent,
      state: complete ? 'sent' : 'pending', hasMore: continuation, retryAt: effectiveRetryAt,
    };
  } catch {
    const retryAt = new Date(Date.now() + 15 * 60_000).toISOString();
    await env.DB.prepare(
      `UPDATE course_mutation_outbox
          SET status='failed', attempts=attempts+1, next_retry_at=?, lease_expires_at=NULL, last_error='PUSH_TRANSPORT_FAILED'
        WHERE id=?`,
    ).bind(retryAt, row.id).run();
    return { success: false, queued: 1, sent: 0, state: 'pending', hasMore: false, retryAt };
  }
};

// Recovery deliberately scans only decision rows newer than an explicit
// cutover. New writes use Queue immediately; this scan protects missed signals
// without sending historical request outcomes on first deployment.
export const runCourseNotificationRecovery = async (env: CourseNotificationPushEnv, fetcher: typeof fetch = fetch) => {
  const cutoff = scheduleCutoff(env);
  if (!cutoff) return { success: true, queued: 0, sent: 0, state: 'idle' as const };
  const row = await selectOutbox(env, undefined, cutoff);
  return row ? processCourseNotificationOutboxItem(env, row.id, fetcher) : { success: true, queued: 0, sent: 0, state: 'idle' as const };
};
