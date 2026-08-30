import { BetterAuthIdentityError, requireBetterAuthSession, type BetterAuthIdentityEnv } from './better-auth-identity.ts';

interface PrivateNotificationsEnv extends BetterAuthIdentityEnv {
  DB?: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const MAX_BODY_BYTES = 16 * 1024;
const PREFERENCE_FIELDS = ['system', 'events', 'lost_found', 'schedule', 'school'] as const;

export class PrivateNotificationsError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PrivateNotificationsError';
    this.status = status;
  }
}

const config = (env: PrivateNotificationsEnv) => {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !key) throw new PrivateNotificationsError(503, 'Dá»‹ch vá»¥ thÃ´ng bÃ¡o táº¡m thá»i chÆ°a kháº£ dá»¥ng.');
  return { url, key };
};

const sourceRequest = async (
  env: PrivateNotificationsEnv,
  path: string,
  init: RequestInit = {},
) => {
  const { url, key } = config(env);
  const response = await fetch(new URL(path, url), {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...init.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new PrivateNotificationsError(502, 'KhÃ´ng thá»ƒ xá»­ lÃ½ thÃ´ng bÃ¡o.');
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) as unknown : null;
};

const sourceCount = async (env: PrivateNotificationsEnv, path: string) => {
  const { url, key } = config(env);
  const response = await fetch(new URL(path, url), {
    method: 'HEAD',
    headers: {
      Accept: 'application/json',
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new PrivateNotificationsError(502, 'Khong the xu ly thong bao.');
  const total = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1];
  return total ? Number(total) : 0;
};

const readBody = async (request: Request) => {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new PrivateNotificationsError(400, 'Dá»¯ liá»‡u thÃ´ng bÃ¡o vÆ°á»£t giá»›i háº¡n.');
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new PrivateNotificationsError(400, 'Dá»¯ liá»‡u thÃ´ng bÃ¡o khÃ´ng há»£p lá»‡.');
  }
};

const firstRow = (value: unknown) => Array.isArray(value) && value[0] && typeof value[0] === 'object'
  ? value[0] as Record<string, unknown>
  : null;

const attachD1ActorProfiles = async (
  env: PrivateNotificationsEnv,
  notifications: unknown[],
) => {
  const actorIds = [...new Set(notifications.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const actorId = (item as Record<string, unknown>).actor_id;
    return typeof actorId === 'string' && /^[0-9a-f-]{36}$/i.test(actorId) ? [actorId] : [];
  }))];
  if (actorIds.length === 0) return notifications;
  if (!env.DB) throw new PrivateNotificationsError(503, 'Dịch vụ hồ sơ D1 tạm thời chưa khả dụng.');
  const actorRows = await Promise.all(actorIds.map(async (actorId) => env.DB!.prepare(
    `SELECT user_id, full_name, avatar_url, student_code
      FROM user_profiles WHERE user_id = ?`,
  ).bind(actorId).first<Record<string, unknown>>()));
  const actors = new Map(actorRows.filter(Boolean).map((row) => [row!.user_id, {
    full_name: row!.full_name,
    avatar_url: row!.avatar_url,
    student_code: row!.student_code,
  }]));
  return notifications.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const row = item as Record<string, unknown>;
    return { ...row, actor: typeof row.actor_id === 'string' ? actors.get(row.actor_id) || null : null };
  });
};

const readPreferences = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PrivateNotificationsError(400, 'TÃ¹y chá»n thÃ´ng bÃ¡o khÃ´ng há»£p lá»‡.');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !PREFERENCE_FIELDS.includes(key as typeof PREFERENCE_FIELDS[number]))) {
    throw new PrivateNotificationsError(400, 'TÃ¹y chá»n thÃ´ng bÃ¡o chá»©a trÆ°á»ng khÃ´ng Ä‘Æ°á»£c phÃ©p.');
  }
  const preferences: Record<string, boolean> = {};
  for (const field of PREFERENCE_FIELDS) {
    if (typeof input[field] !== 'boolean') {
      throw new PrivateNotificationsError(400, 'TÃ¹y chá»n thÃ´ng bÃ¡o khÃ´ng há»£p lá»‡.');
    }
    preferences[field] = input[field] as boolean;
  }
  return preferences;
};

export const handlePrivateNotifications = async (
  request: Request,
  env: PrivateNotificationsEnv,
) => {
  const identity = await requireBetterAuthSession(request, env);
  const userId = encodeURIComponent(identity.userId);

  if (request.method === 'GET') {
    const [notifications, unreadCount, preferenceRows] = await Promise.all([
      sourceRequest(
        env,
        `/rest/v1/notifications?receiver_id=eq.${userId}&select=id,receiver_id,actor_id,type,content,link,is_read,created_at&order=created_at.desc&limit=20`,
      ),
      sourceCount(
        env,
        `/rest/v1/notifications?receiver_id=eq.${userId}&is_read=eq.false&select=id`,
      ),
      sourceRequest(
        env,
        `/rest/v1/notification_preferences?user_id=eq.${userId}&select=system,events,lost_found,schedule,school&limit=1`,
      ),
    ]);
    const rows = await attachD1ActorProfiles(env, Array.isArray(notifications) ? notifications : []);
    return {
      success: true,
      notifications: rows,
      unreadCount,
      preferences: firstRow(preferenceRows),
    };
  }

  if (request.method !== 'PATCH') {
    throw new PrivateNotificationsError(405, 'PhÆ°Æ¡ng thá»©c khÃ´ng Ä‘Æ°á»£c há»— trá»£.');
  }
  const body = await readBody(request);
  if ('userId' in body || 'user_id' in body || 'receiver_id' in body) {
    throw new PrivateNotificationsError(400, 'KhÃ´ng cho phÃ©p chá»‰ Ä‘á»‹nh chá»§ sá»Ÿ há»¯u thÃ´ng bÃ¡o.');
  }

  if (body.action === 'preferences') {
    const preferences = readPreferences(body.preferences);
    await sourceRequest(env, '/rest/v1/notification_preferences?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: identity.userId,
        ...preferences,
        updated_at: new Date().toISOString(),
      }),
    });
    return { success: true };
  }

  if (body.action === 'read') {
    if (typeof body.notificationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.notificationId)) {
      throw new PrivateNotificationsError(400, 'ThÃ´ng bÃ¡o khÃ´ng há»£p lá»‡.');
    }
    await sourceRequest(
      env,
      `/rest/v1/notifications?id=eq.${encodeURIComponent(body.notificationId)}&receiver_id=eq.${userId}`,
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_read: true }) },
    );
    return { success: true };
  }

  if (body.action === 'read-all') {
    await sourceRequest(
      env,
      `/rest/v1/notifications?receiver_id=eq.${userId}&is_read=eq.false`,
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_read: true }) },
    );
    return { success: true };
  }

  throw new PrivateNotificationsError(400, 'Thao tÃ¡c thÃ´ng bÃ¡o khÃ´ng há»£p lá»‡.');
};

export const privateNotificationsErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof PrivateNotificationsError
    ? error.status
    : 500;
