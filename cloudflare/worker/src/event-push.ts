export interface EventPushEnv {
  DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  EVENT_PUSH_CUTOFF?: string;
}

export interface PublicEventPushCandidate {
  id: number;
  title: string;
  status: string | null;
  is_deleted: number | boolean | null;
  created_at: string;
}

const BLOCKED_EVENT_STATES = new Set([
  'pending',
  'draft',
  'rejected',
  'deleted',
  'hidden',
]);

const clean = (value: unknown) => String(value || '').trim();

export const eventPushCutoff = (env: EventPushEnv) => {
  const value = clean(env.EVENT_PUSH_CUTOFF);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error('Event push cutoff is unavailable.');
  }
  return new Date(value).toISOString();
};

export const isEventPushEligible = (
  event: PublicEventPushCandidate,
  cutoffIso: string
) => {
  const createdAt = Date.parse(clean(event.created_at));
  const cutoff = Date.parse(cutoffIso);
  const status = clean(event.status).toLowerCase();
  return (
    Number.isSafeInteger(Number(event.id))
    && Number(event.id) > 0
    && Boolean(clean(event.title))
    && !Boolean(event.is_deleted)
    && !BLOCKED_EVENT_STATES.has(status)
    && Number.isFinite(createdAt)
    && Number.isFinite(cutoff)
    && createdAt >= cutoff
  );
};

export const buildEventPushPayload = (event: PublicEventPushCandidate) => ({
  title: 'Sự kiện mới trên HUB Planner',
  body: clean(event.title).slice(0, 240),
  url: `/events/${Number(event.id)}`,
  category: 'events',
});

const readNextCandidate = async (env: EventPushEnv) => {
  const row = await env.DB.prepare(
    `SELECT e.id, e.title, e.status, e.is_deleted, e.created_at
       FROM public_events e
       LEFT JOIN event_push_deliveries d ON d.event_id = e.id
      WHERE d.event_id IS NULL
        AND e.created_at >= ?
        AND COALESCE(e.is_deleted, 0) = 0
        AND LOWER(COALESCE(e.status, '')) NOT IN ('pending', 'draft', 'rejected', 'deleted', 'hidden')
      ORDER BY e.created_at ASC, e.id ASC
      LIMIT 1`
  ).bind(eventPushCutoff(env)).first<PublicEventPushCandidate>();
  return row && isEventPushEligible(row, eventPushCutoff(env)) ? row : null;
};

const reserveEvent = async (env: EventPushEnv, event: PublicEventPushCandidate) => {
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO event_push_deliveries (
       event_id, event_created_at, state, attempted_at, attempts
     ) VALUES (?, ?, 'sending', ?, 1)`
  ).bind(event.id, event.created_at, new Date().toISOString()).run();
  return Number(result.meta?.changes || 0) === 1;
};

const completeEvent = async (
  env: EventPushEnv,
  eventId: number,
  state: 'sent' | 'skipped' | 'failed',
  reason: string | null
) => {
  const completedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE event_push_deliveries
        SET state = ?, sent_at = ?, last_error = ?
      WHERE event_id = ? AND state = 'sending'`
  ).bind(state, completedAt, reason, eventId).run();
};

const readPushConfig = (env: EventPushEnv) => {
  const base = clean(env.SUPABASE_URL).replace(/\/$/, '');
  const key = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || key.length < 32) throw new Error('Event push delivery is unavailable.');
  return { base, key };
};

export const runEventPush = async (
  env: EventPushEnv,
  fetcher: typeof fetch = fetch
) => {
  const event = await readNextCandidate(env);
  if (!event) return { success: true, queued: 0, sent: 0, state: 'idle' as const };
  if (!(await reserveEvent(env, event))) {
    return { success: true, queued: 0, sent: 0, state: 'deduplicated' as const };
  }

  const { base, key } = readPushConfig(env);
  let response: Response;
  try {
    response = await fetcher(`${base}/functions/v1/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ resource: 'send', ...buildEventPushPayload(event) }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    await completeEvent(env, event.id, 'failed', 'PUSH_TRANSPORT_FAILED');
    return { success: false, queued: 1, sent: 0, state: 'failed' as const };
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.ok) {
    const sent = Math.max(0, Number(payload?.sent || 0));
    await completeEvent(env, event.id, sent > 0 ? 'sent' : 'skipped', null);
    return { success: true, queued: 1, sent, state: sent > 0 ? 'sent' as const : 'skipped' as const };
  }
  if (response.status === 404) {
    await completeEvent(env, event.id, 'skipped', 'NO_SUBSCRIPTIONS');
    return { success: true, queued: 1, sent: 0, state: 'skipped' as const };
  }

  await completeEvent(env, event.id, 'failed', `PUSH_HTTP_${response.status}`);
  return { success: false, queued: 1, sent: 0, state: 'failed' as const };
};
