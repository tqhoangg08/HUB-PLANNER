interface EventParticipationsEnv {
  DB: D1Database;
}

export interface EventParticipationMutationResult {
  success: true;
  eventId: number;
  participated: boolean;
  // Retained for the existing client contract; a successful D1 write is authoritative.
  mirrorSynced: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class EventParticipationError extends Error {
  readonly status: 400 | 404 | 502 | 503;
  constructor(status: 400 | 404 | 502 | 503, message: string) {
    super(message);
    this.name = 'EventParticipationError';
    this.status = status;
  }
}

export const parseParticipationEventId = (value: unknown) => {
  const eventId = Number(value);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    throw new EventParticipationError(400, 'Mã sự kiện không hợp lệ.');
  }
  return eventId;
};

export const parseParticipationUserId = (value: unknown) => {
  const userId = String(value || '').trim();
  if (!UUID_PATTERN.test(userId)) {
    throw new EventParticipationError(400, 'Mã người dùng không hợp lệ.');
  }
  return userId.toLowerCase();
};

export const listEventParticipations = async (env: EventParticipationsEnv, userId: string) => {
  const result = await env.DB.prepare(
    'SELECT event_id FROM user_event_participations WHERE user_id = ? ORDER BY event_id ASC'
  ).bind(parseParticipationUserId(userId)).all<{event_id: number}>();
  return {success: true, data: (result.results || []).map(row => parseParticipationEventId(row.event_id))};
};

// The event existence check and insert execute in one SQL statement: a hide/delete
// cannot race between authorization of the event and registration.
// Closed/past public events remain trackable (existing participation UX).
const ELIGIBLE_EVENT = `COALESCE(is_deleted, 0) = 0
  AND LOWER(TRIM(COALESCE(status, ''))) NOT IN
    ('pending','draft','unpublished','rejected','hidden','deleted')`;

export const mutateEventParticipation = async (
  env: EventParticipationsEnv,
  userId: string,
  eventIdValue: unknown,
  participating: boolean
): Promise<EventParticipationMutationResult> => {
  const owner = parseParticipationUserId(userId);
  const eventId = parseParticipationEventId(eventIdValue);
  if (participating) {
    const result = await env.DB.prepare(
      `INSERT INTO user_event_participations(user_id,event_id,created_at)
       SELECT ?, id, ? FROM public_events WHERE id = ? AND ${ELIGIBLE_EVENT}
       ON CONFLICT(user_id,event_id) DO UPDATE SET created_at = user_event_participations.created_at
       RETURNING event_id`
    ).bind(owner, new Date().toISOString(), eventId).all<{event_id: number}>();
    if (!result.results?.length) {
      throw new EventParticipationError(404, 'Không tìm thấy sự kiện công khai.');
    }
  } else {
    // Leave remains an owner-scoped no-op when absent, including after event removal.
    await env.DB.prepare(
      'DELETE FROM user_event_participations WHERE user_id = ? AND event_id = ?'
    ).bind(owner,eventId).run();
  }
  return {success:true,eventId,participated:participating,mirrorSynced:true};
};
