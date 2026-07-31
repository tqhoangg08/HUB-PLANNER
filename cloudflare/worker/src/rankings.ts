interface RankingsEnv {
  DB: D1Database;
}

type RankingScopeType = 'school' | 'major';

interface RankingScopeRow {
  total_students: number;
  comparable_students: number;
}

interface RankingBucketRow {
  rank_value: number;
}

interface RankingUserRow {
  student_rank: number | null;
  total_students: number;
  rank_in_class: number | null;
  total_in_class: number | null;
  class_code: string | null;
  rank_in_major: number | null;
  total_in_major: number | null;
  major: string | null;
}

export interface RankingForecastInput {
  semesters: string[];
  gpa: number;
  credits: number;
  trainingScore: number;
  major: string | null;
}

type RankingErrorStatus = 400 | 413 | 503;

const MAX_RANKING_BODY_BYTES = 4_096;
const MAX_RANKING_SEMESTERS = 12;
const MAX_MAJOR_LENGTH = 160;
const SEMESTER_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export class RankingError extends Error {
  readonly status: RankingErrorStatus;

  constructor(status: RankingErrorStatus, message: string) {
    super(message);
    this.name = 'RankingError';
    this.status = status;
  }
}

const readBoundedBody = async (request: Request) => {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_RANKING_BODY_BYTES) {
    throw new RankingError(413, 'Dữ liệu xếp hạng vượt quá giới hạn cho phép.');
  }
  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_RANKING_BODY_BYTES) {
        await reader.cancel('ranking-body-too-large');
        throw new RankingError(
          413,
          'Dữ liệu xếp hạng vượt quá giới hạn cho phép.'
        );
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
};

const parseFiniteNumber = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
) => {
  const parsed =
    typeof value === 'number' || typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new RankingError(400, `${field} không hợp lệ.`);
  }
  return parsed;
};

const parseSemester = (value: unknown) => {
  const semester = String(value || '').trim();
  if (!SEMESTER_PATTERN.test(semester)) {
    throw new RankingError(400, 'Học kỳ không hợp lệ.');
  }
  return semester;
};

export const parseRankingForecastInput = (
  value: unknown
): RankingForecastInput => {
  if (!isRecord(value)) {
    throw new RankingError(400, 'Dữ liệu xếp hạng không hợp lệ.');
  }

  const rawSemesters = Array.isArray(value.semesters)
    ? value.semesters
    : [value.semester];
  const semesters = [
    ...new Set(rawSemesters.map(parseSemester)),
  ];
  if (
    semesters.length === 0 ||
    semesters.length > MAX_RANKING_SEMESTERS
  ) {
    throw new RankingError(400, 'Số học kỳ cần xếp hạng không hợp lệ.');
  }

  const majorValue = String(value.major || '').trim();
  if (majorValue.length > MAX_MAJOR_LENGTH) {
    throw new RankingError(400, 'Tên ngành vượt quá giới hạn cho phép.');
  }

  return {
    semesters,
    gpa: parseFiniteNumber(value.gpa, 'GPA', 0, 4.5),
    credits: parseFiniteNumber(value.credits, 'Số tín chỉ', 0, 300),
    trainingScore: parseFiniteNumber(
      value.trainingScore,
      'Điểm rèn luyện',
      0,
      100
    ),
    major: majorValue || null,
  };
};

export const readRankingForecastBody = async (request: Request) => {
  const body = await readBoundedBody(request);
  if (!body) {
    throw new RankingError(400, 'Thiếu dữ liệu xếp hạng.');
  }
  try {
    return parseRankingForecastInput(JSON.parse(body));
  } catch (error) {
    if (error instanceof RankingError) throw error;
    throw new RankingError(400, 'Dữ liệu xếp hạng không phải JSON hợp lệ.');
  }
};

export const parseRankingSemester = parseSemester;

export const buildRankingScoreKey = (
  gpa: number,
  trainingScore: number,
  credits: number
) =>
  Math.round(gpa * 1_000_000) * 1_000_000_000 +
  Math.round(trainingScore * 100) * 100_000 +
  Math.round(credits * 100);

const readScope = async (
  env: RankingsEnv,
  semester: string,
  scopeType: RankingScopeType,
  scopeValue: string
) =>
  env.DB.prepare(
    `SELECT total_students, comparable_students
       FROM benchmark_ranking_scopes
      WHERE semester = ?
        AND scope_type = ?
        AND scope_value = ?
      LIMIT 1`
  )
    .bind(semester, scopeType, scopeValue)
    .first<RankingScopeRow>();

const readForecastRank = async (
  env: RankingsEnv,
  semester: string,
  scopeType: RankingScopeType,
  scopeValue: string,
  input: RankingForecastInput
) => {
  const scope = await readScope(env, semester, scopeType, scopeValue);
  if (!scope) return null;

  const bucket = await env.DB.prepare(
    `SELECT rank_value
       FROM benchmark_ranking_buckets
      WHERE semester = ?
        AND scope_type = ?
        AND scope_value = ?
        AND score_key <= ?
      ORDER BY score_key DESC
      LIMIT 1`
  )
    .bind(
      semester,
      scopeType,
      scopeValue,
      buildRankingScoreKey(
        input.gpa,
        input.trainingScore,
        input.credits
      )
    )
    .first<RankingBucketRow>();

  return {
    rank: bucket?.rank_value ?? scope.comparable_students + 1,
    total: scope.total_students,
  };
};

export const listRankingSemesters = async (env: RankingsEnv) => {
  const result = await env.DB.prepare(
    `SELECT semester, total_students
       FROM benchmark_ranking_semesters
      ORDER BY semester DESC`
  ).all<{ semester: string; total_students: number }>();

  if (!result.results.length) {
    throw new RankingError(
      503,
      'Dữ liệu xếp hạng trên Cloudflare chưa được khởi tạo.'
    );
  }

  return {
    success: true,
    data: result.results.map((row) => ({
      semester: row.semester,
      totalStudents: Number(row.total_students),
    })),
  };
};

export const forecastBenchmarkRankings = async (
  env: RankingsEnv,
  input: RankingForecastInput
) => {
  const rows = [];
  for (const semester of input.semesters) {
    const school = await readForecastRank(
      env,
      semester,
      'school',
      '',
      input
    );
    if (!school) continue;

    const major = input.major
      ? await readForecastRank(env, semester, 'major', input.major, input)
      : null;
    rows.push({
      semester,
      rank: school.rank,
      totalStudents: school.total,
      rankInMajor: major?.rank ?? null,
      totalInMajor: major?.total ?? null,
      major: major ? input.major : null,
    });
  }

  if (!rows.length) {
    throw new RankingError(
      503,
      'Dữ liệu học kỳ trên Cloudflare chưa được khởi tạo.'
    );
  }

  return { success: true, data: rows };
};

export const readOwnBenchmarkRanking = async (
  env: RankingsEnv,
  userId: string,
  semester: string
) => {
  const seeded = await env.DB.prepare(
    `SELECT semester
       FROM benchmark_ranking_semesters
      WHERE semester = ?
      LIMIT 1`
  )
    .bind(semester)
    .first<{ semester: string }>();
  if (!seeded) {
    throw new RankingError(
      503,
      'Dữ liệu học kỳ trên Cloudflare chưa được khởi tạo.'
    );
  }

  const row = await env.DB.prepare(
    `SELECT
       student_rank,
       total_students,
       rank_in_class,
       total_in_class,
       class_code,
       rank_in_major,
       total_in_major,
       major
     FROM benchmark_ranking_users
     WHERE user_id = ?
       AND semester = ?
     LIMIT 1`
  )
    .bind(userId, semester)
    .first<RankingUserRow>();

  return {
    success: true,
    data: row
      ? {
          studentRank: row.student_rank,
          totalStudents: Number(row.total_students),
          rankInClass: row.rank_in_class,
          totalInClass: row.total_in_class,
          classCode: row.class_code,
          rankInMajor: row.rank_in_major,
          totalInMajor: row.total_in_major,
          major: row.major,
        }
      : null,
  };
};
