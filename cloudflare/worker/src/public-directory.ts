export interface PublicDirectoryEnv {
  DB?: D1Database;
}

export class PublicDirectoryError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PublicDirectoryError';
    this.status = status;
  }
}

const MAX_SEARCH_LENGTH = 40;
const MAX_SEARCH_RESULTS = 200;
const MAX_DONATION_RESULTS = 500;

const requireDb = (env: PublicDirectoryEnv) => {
  if (!env.DB) throw new PublicDirectoryError(503, 'Dịch vụ hồ sơ tạm thời chưa sẵn sàng.');
  return env.DB;
};

const publicProfileSelect = `SELECT user_id AS id, student_code, full_name, avatar_url,
  created_at, bio, class_name, profile_tags_json, public_profile_enabled,
  show_profile_stats, public_gpa, public_completed_semesters, public_credits
  FROM user_profiles`;

const profileRow = (row: Record<string, unknown>) => ({
  ...row,
  profile_tags: (() => {
    try {
      const value = JSON.parse(String(row.profile_tags_json || '[]')) as unknown;
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  })(),
  public_profile_enabled: Number(row.public_profile_enabled || 0) === 1,
  show_profile_stats: Number(row.show_profile_stats || 0) === 1,
  profile_tags_json: undefined,
});

export const searchPublicProfiles = async (url: URL, env: PublicDirectoryEnv) => {
  const query = String(url.searchParams.get('q') || '').trim().slice(0, MAX_SEARCH_LENGTH);
  const requestedLimit = Number(url.searchParams.get('limit') || 80);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_SEARCH_RESULTS)
    : 80;
  if (query.length < 2) return { data: [] };

  const like = `%${query.replace(/[\\%_]/g, (value) => `\\${value}`)}%`;
  const result = await requireDb(env).prepare(`${publicProfileSelect}
    WHERE public_profile_enabled = 1
      AND (student_code LIKE ? ESCAPE '\\' OR full_name LIKE ? ESCAPE '\\')
    ORDER BY student_code ASC LIMIT ?`).bind(like, like, limit).all<Record<string, unknown>>();
  return { data: (result.results || []).map(profileRow) };
};

export const readPublicProfile = async (studentCode: string, env: PublicDirectoryEnv) => {
  const normalized = decodeURIComponent(studentCode).trim().slice(0, 80);
  if (!normalized) throw new PublicDirectoryError(400, 'Mã sinh viên không hợp lệ.');
  const row = await requireDb(env).prepare(`${publicProfileSelect}
    WHERE public_profile_enabled = 1 AND student_code = ? LIMIT 1`)
    .bind(normalized).first<Record<string, unknown>>();
  if (!row) throw new PublicDirectoryError(404, 'Không tìm thấy hồ sơ công khai.');
  return { data: profileRow(row) };
};

export const readPublicDonations = async (env: PublicDirectoryEnv) => {
  // Donations are the intentionally-public subset of the Phase 4D protected
  // submission payload.  The projection never exposes submission ownership,
  // contact keys, source records, or other moderation metadata.
  const result = await requireDb(env).prepare(`SELECT id,
    json_extract(payload_json, '$.name') AS name,
    CAST(json_extract(payload_json, '$.amount') AS INTEGER) AS amount,
    json_extract(payload_json, '$.message') AS message,
    json_extract(payload_json, '$.student_id') AS student_id,
    created_at
    FROM protected_submissions
    WHERE kind = 'donation'
    ORDER BY CAST(json_extract(payload_json, '$.amount') AS INTEGER) DESC, created_at DESC, id DESC
    LIMIT ?`).bind(MAX_DONATION_RESULTS).all<Record<string, unknown>>();
  return { data: result.results || [] };
};

export const publicDirectoryErrorStatus = (error: unknown) =>
  error instanceof PublicDirectoryError ? error.status : 500;
