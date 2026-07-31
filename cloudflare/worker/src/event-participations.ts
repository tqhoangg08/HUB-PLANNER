interface EventParticipationsEnv {
  DB: D1Database;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface SupabaseParticipationRow {
  user_id: string;
  event_id: number;
  created_at: string | null;
}

interface D1ParticipationRow {
  event_id: number;
}

export interface EventParticipationMutationResult {
  success: true;
  eventId: number;
  participated: boolean;
  mirrorSynced: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYNC_PAGE_SIZE = 1_000;
const WRITE_TIMEOUT_MS = 8_000;
const RESOURCE_NAME = 'user_event_participations';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

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

export const buildSupabaseParticipationsSyncUrl = (
  baseUrl: string,
  offset = 0
) => {
  const url = new URL(
    '/rest/v1/user_participations',
    baseUrl.replace(/\/$/, '')
  );
  url.searchParams.set('select', 'user_id,event_id,created_at');
  url.searchParams.set('user_id', 'not.is.null');
  url.searchParams.set('event_id', 'not.is.null');
  url.searchParams.set('order', 'id.asc');
  url.searchParams.set('limit', String(SYNC_PAGE_SIZE));
  url.searchParams.set('offset', String(Math.max(0, Math.trunc(offset))));
  return url;
};

export const buildSupabaseParticipationMutationUrl = (
  baseUrl: string,
  userId: string,
  eventId: number,
  participating: boolean
) => {
  const url = new URL(
    '/rest/v1/user_participations',
    baseUrl.replace(/\/$/, '')
  );
  if (participating) {
    url.searchParams.set('on_conflict', 'user_id,event_id');
    url.searchParams.set('select', 'user_id,event_id,created_at');
  } else {
    url.searchParams.set('user_id', `eq.${userId}`);
    url.searchParams.set('event_id', `eq.${eventId}`);
  }
  return url;
};

const parseSupabaseParticipationRows = (
  value: unknown
): SupabaseParticipationRow[] => {
  if (!Array.isArray(value)) {
    throw new EventParticipationError(
      502,
      'Nguồn tạm thời trả về lịch sử tham gia không hợp lệ.'
    );
  }
  return value.map((row) => {
    if (!isRecord(row)) {
      throw new EventParticipationError(
        502,
        'Nguồn tạm thời trả về lịch sử tham gia không hợp lệ.'
      );
    }
    let userId: string;
    let eventId: number;
    try {
      userId = parseParticipationUserId(row.user_id);
      eventId = parseParticipationEventId(row.event_id);
    } catch {
      throw new EventParticipationError(
        502,
        'Nguồn tạm thời trả về lịch sử tham gia không hợp lệ.'
      );
    }
    return {
      user_id: userId,
      event_id: eventId,
      created_at:
        typeof row.created_at === 'string' && row.created_at
          ? row.created_at
          : null,
    };
  });
};

const readSyncConfig = (env: EventParticipationsEnv) => {
  const supabaseUrl = String(env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new EventParticipationError(
      503,
      'Cấu hình đồng bộ lịch sử tham gia chưa đầy đủ.'
    );
  }
  return { supabaseUrl, serviceRoleKey };
};

const readWriteConfig = (env: EventParticipationsEnv) => {
  const supabaseUrl = String(env.SUPABASE_URL || '').trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !anonKey) {
    throw new EventParticipationError(
      503,
      'Cấu hình lưu lịch sử tham gia chưa đầy đủ.'
    );
  }
  return { supabaseUrl, anonKey };
};

const writeParticipationRows = async (
  env: EventParticipationsEnv,
  rows: SupabaseParticipationRow[]
) => {
  if (rows.length === 0) return;
  const sql = `
    INSERT INTO user_event_participations (user_id, event_id, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, event_id) DO UPDATE SET
      created_at = excluded.created_at
    WHERE user_event_participations.created_at IS NOT excluded.created_at
  `;

  for (let index = 0; index < rows.length; index += 100) {
    await env.DB.batch(
      rows.slice(index, index + 100).map((row) =>
        env.DB.prepare(sql).bind(
          parseParticipationUserId(row.user_id),
          parseParticipationEventId(row.event_id),
          row.created_at || new Date().toISOString()
        )
      )
    );
  }
};

const deleteMissingParticipationRows = async (
  env: EventParticipationsEnv,
  sourceRows: SupabaseParticipationRow[]
) => {
  const sourceKeys = new Set(
    sourceRows.map(
      (row) =>
        `${parseParticipationUserId(row.user_id)}:${parseParticipationEventId(row.event_id)}`
    )
  );
  const existing = await env.DB.prepare(
    'SELECT user_id, event_id FROM user_event_participations'
  ).all<{ user_id: string; event_id: number }>();
  const stale = (existing.results || []).filter(
    (row) => !sourceKeys.has(`${row.user_id}:${Number(row.event_id)}`)
  );

  for (let index = 0; index < stale.length; index += 100) {
    await env.DB.batch(
      stale.slice(index, index + 100).map((row) =>
        env.DB.prepare(
          `DELETE FROM user_event_participations
            WHERE user_id = ? AND event_id = ?`
        ).bind(row.user_id, Number(row.event_id))
      )
    );
  }
  return stale.length;
};

export const syncEventParticipations = async (
  env: EventParticipationsEnv,
  fetcher: typeof fetch = fetch
) => {
  const { supabaseUrl, serviceRoleKey } = readSyncConfig(env);
  const rows: SupabaseParticipationRow[] = [];

  for (let offset = 0; ; offset += SYNC_PAGE_SIZE) {
    const response = await fetcher(
      buildSupabaseParticipationsSyncUrl(supabaseUrl, offset),
      {
        headers: {
          Accept: 'application/json',
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    if (!response.ok) {
      throw new EventParticipationError(
        502,
        'Không thể đồng bộ lịch sử tham gia từ nguồn tạm thời.'
      );
    }
    const page = parseSupabaseParticipationRows(await response.json());
    rows.push(...page);
    if (page.length < SYNC_PAGE_SIZE) break;
  }

  await writeParticipationRows(env, rows);
  const deleted = await deleteMissingParticipationRows(env, rows);
  const syncedAt = new Date().toISOString();
  const sourceMaxCreatedAt = rows.reduce<string | null>(
    (current, row) =>
      row.created_at && (!current || row.created_at > current)
        ? row.created_at
        : current,
    null
  );
  await env.DB.prepare(
    `INSERT INTO sync_metadata (
       resource, source_row_count, source_max_created_at, synced_at,
       visible_row_count
     ) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET
       source_row_count = excluded.source_row_count,
       source_max_created_at = excluded.source_max_created_at,
       synced_at = excluded.synced_at,
       visible_row_count = excluded.visible_row_count`
  )
    .bind(
      RESOURCE_NAME,
      rows.length,
      sourceMaxCreatedAt,
      syncedAt,
      rows.length
    )
    .run();

  return { sourceRowCount: rows.length, deleted, syncedAt };
};

export const listEventParticipations = async (
  env: EventParticipationsEnv,
  userId: string
) => {
  const normalizedUserId = parseParticipationUserId(userId);
  const metadata = await env.DB.prepare(
    'SELECT synced_at FROM sync_metadata WHERE resource = ?'
  )
    .bind(RESOURCE_NAME)
    .first<{ synced_at: string }>();
  if (!metadata?.synced_at) {
    throw new EventParticipationError(
      503,
      'Lịch sử tham gia trên Cloudflare chưa được khởi tạo.'
    );
  }

  const result = await env.DB.prepare(
    `SELECT event_id
       FROM user_event_participations
      WHERE user_id = ?
      ORDER BY event_id ASC`
  )
    .bind(normalizedUserId)
    .all<D1ParticipationRow>();

  return {
    success: true,
    data: (result.results || []).map((row) =>
      parseParticipationEventId(row.event_id)
    ),
  };
};

const writeLegacyParticipation = async (
  env: EventParticipationsEnv,
  accessToken: string,
  userId: string,
  eventId: number,
  participating: boolean,
  fetcher: typeof fetch
) => {
  const { supabaseUrl, anonKey } = readWriteConfig(env);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort('event-participation-write-timeout'),
    WRITE_TIMEOUT_MS
  );

  try {
    const response = await fetcher(
      buildSupabaseParticipationMutationUrl(
        supabaseUrl,
        userId,
        eventId,
        participating
      ),
      {
        method: participating ? 'POST' : 'DELETE',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          Prefer: participating
            ? 'resolution=ignore-duplicates,return=representation'
            : 'return=minimal',
        },
        body: participating
          ? JSON.stringify({ user_id: userId, event_id: eventId })
          : undefined,
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new EventParticipationError(
        response.status === 404 ? 404 : 502,
        response.status === 404
          ? 'Không tìm thấy sự kiện.'
          : 'Không thể lưu trạng thái tham gia.'
      );
    }

    if (!participating) return new Date().toISOString();
    const payload = parseSupabaseParticipationRows(await response.json());
    return payload[0]?.created_at || new Date().toISOString();
  } catch (error) {
    if (error instanceof EventParticipationError) throw error;
    throw new EventParticipationError(
      503,
      'Dịch vụ lưu trạng thái tham gia tạm thời không khả dụng.'
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

export const mutateEventParticipation = async (
  env: EventParticipationsEnv,
  accessToken: string,
  userId: string,
  eventIdValue: unknown,
  participating: boolean,
  fetcher: typeof fetch = fetch
): Promise<EventParticipationMutationResult> => {
  const normalizedUserId = parseParticipationUserId(userId);
  const eventId = parseParticipationEventId(eventIdValue);
  const createdAt = await writeLegacyParticipation(
    env,
    accessToken,
    normalizedUserId,
    eventId,
    participating,
    fetcher
  );

  let mirrorSynced = true;
  try {
    if (participating) {
      await writeParticipationRows(env, [
        {
          user_id: normalizedUserId,
          event_id: eventId,
          created_at: createdAt,
        },
      ]);
    } else {
      await env.DB.prepare(
        `DELETE FROM user_event_participations
          WHERE user_id = ? AND event_id = ?`
      )
        .bind(normalizedUserId, eventId)
        .run();
    }
  } catch (error) {
    mirrorSynced = false;
    console.error(JSON.stringify({
      event: 'event_participation_targeted_mirror_failed',
      eventId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return {
    success: true,
    eventId,
    participated: participating,
    mirrorSynced,
  };
};
