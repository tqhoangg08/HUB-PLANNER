export interface NotificationCronEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  NOTIFICATION_REENABLE_CUTOFF?: string;
  NOTIFICATION_JOBS_ENABLED?: string;
}

export class NotificationCronError extends Error {
  readonly status: 503 | 502;

  constructor(status: 503 | 502, message: string) {
    super(message);
    this.name = 'NotificationCronError';
    this.status = status;
  }
}

type QueueAction = 'status' | 'suppress_backlog' | 'dry_run' | 'process';

const cutoff = (env: NotificationCronEnv) => {
  const value = String(env.NOTIFICATION_REENABLE_CUTOFF || '');
  if (!Number.isFinite(Date.parse(value))) throw new NotificationCronError(503, 'Notification cutoff is unavailable.');
  return new Date(value).toISOString();
};

export const runNotificationQueueControl = async (
  env: NotificationCronEnv,
  action: QueueAction
) => {
  const base = String(env.SUPABASE_URL || '').trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!base || serviceKey.length < 32) throw new NotificationCronError(503, 'Notification queue is unavailable.');

  const response = await fetch(new URL('/functions/v1/push', base).toString(), {
    method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'Content-Type': 'application/json',
      },
    body: JSON.stringify({ resource: 'announcement-queue', action, notificationCutoff: cutoff(env) }),
  });
  if (!response.ok) throw new NotificationCronError(502, `Notification queue request failed with status ${response.status}.`);
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || body.success !== true) throw new NotificationCronError(502, 'Notification queue response was invalid.');
  return body;
};
