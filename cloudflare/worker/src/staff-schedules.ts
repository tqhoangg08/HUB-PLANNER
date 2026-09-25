import { requireBetterAuthStaff, type BetterAuthIdentityEnv } from './better-auth-identity.ts';
import { listUserSchedules } from './user-schedules.ts';

export interface StaffSchedulesEnv extends BetterAuthIdentityEnv { DB: D1Database; }

export class StaffSchedulesError extends Error {
  readonly status: 400 | 403 | 405;
  constructor(status: 400 | 403 | 405, message: string) {
    super(message);
    this.name = 'StaffSchedulesError';
    this.status = status;
  }
}

const USER_ID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const text = (value: unknown, max = 96) => String(value || '').trim().slice(0, max);
const authEmails = async (request: Request, env: StaffSchedulesEnv, userIds: string[]) => {
  const emails = new Map<string, string>();
  if (!env.AUTH_SERVICE) return emails;
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json' });
  const overrides = request.headers.get('Cloudflare-Workers-Version-Overrides');
  if (overrides) headers.set('Cloudflare-Workers-Version-Overrides', overrides);
  // The internal Auth endpoint accepts at most 50 IDs per call; never query per student.
  const batches = Array.from({ length: Math.ceil(userIds.length / 50) }, (_, index) => userIds.slice(index * 50, index * 50 + 50));
  await Promise.all(batches.map(async (userIdsBatch) => {
    try {
      const response = await env.AUTH_SERVICE.fetch(new Request('https://auth-service.internal/internal/auth/user-names', {
        method: 'POST', headers, body: JSON.stringify({ userIds: userIdsBatch }),
        signal: AbortSignal.timeout(5_000),
      }));
      if (!response.ok) return;
      const payload = await response.json() as { names?: Array<{ userId?: unknown; email?: unknown }> };
      for (const entry of payload.names || []) {
        if (typeof entry.userId === 'string' && USER_ID.test(entry.userId) && typeof entry.email === 'string') {
          emails.set(entry.userId.toLowerCase(), entry.email);
        }
      }
    } catch { /* Email is optional; never invent one when Auth is unavailable. */ }
  }));
  return emails;
};

export const handleStaffSchedules = async (request: Request, url: URL, env: StaffSchedulesEnv) => {
  const staff = await requireBetterAuthStaff(request, env);
  if (request.method !== 'GET') throw new StaffSchedulesError(405, 'Chỉ hỗ trợ đọc lịch quản trị.');
  const mode = text(url.searchParams.get('mode'), 20);
  const semester = text(url.searchParams.get('semester'), 64);
  if (!semester) throw new StaffSchedulesError(400, 'Học kỳ không hợp lệ.');

  if (mode === 'courses') {
    const userId = text(url.searchParams.get('userId'), 36);
    if (!USER_ID.test(userId)) throw new StaffSchedulesError(400, 'Người dùng không hợp lệ.');
    const result = await listUserSchedules(env, userId);
    return { success: true, data: result.data.filter((row) => String(row.semester || '') === semester), role: staff.role };
  }

  const rows = await env.DB.prepare(
    `WITH effective_courses AS (
       SELECT us.user_id, up.student_code, up.full_name,
         CASE
           WHEN json_type(CASE WHEN json_valid(us.custom_data) THEN us.custom_data ELSE '{}' END,'$.credits') IS NOT NULL
             THEN json_extract(us.custom_data,'$.credits')
           WHEN (CASE WHEN json_valid(snapshots.course_json) THEN json_type(snapshots.course_json) ELSE NULL END) = 'object'
             THEN json_extract(snapshots.course_json,'$.credits')
           ELSE cs.credits
         END AS effective_credits
       FROM user_schedules us
       LEFT JOIN user_profiles up ON up.user_id = us.user_id
       LEFT JOIN course_schedules cs ON cs.id = us.course_id
       LEFT JOIN user_schedule_course_snapshots snapshots ON snapshots.schedule_id=us.id
         AND snapshots.user_id=us.user_id AND snapshots.course_id=us.course_id
       WHERE us.semester = ?
     )
     SELECT user_id, student_code, full_name, COUNT(*) AS course_count,
       SUM(CASE WHEN typeof(effective_credits) IN ('integer','real') AND effective_credits >= 0
         THEN effective_credits ELSE 0 END) AS total_credits
     FROM effective_courses
     GROUP BY user_id, student_code, full_name
     ORDER BY COALESCE(student_code, user_id) ASC
     LIMIT 500`
  ).bind(semester).all<{ user_id: string; student_code: string | null; full_name: string | null; course_count: number; total_credits: number }>();

  if (mode === 'summaries') {
    const emails = await authEmails(request, env, (rows.results || []).map((row) => row.user_id));
    return { success: true, data: (rows.results || []).map((row) => ({ ...row, email: emails.get(row.user_id.toLowerCase()) || null, semesters: [semester] })), role: staff.role };
  }
  if (mode === 'changed') {
    const changed = await env.DB.prepare(
      `SELECT us.user_id, us.id AS user_schedule_id
         FROM user_schedules us
        WHERE us.semester = ? AND us.custom_data IS NOT NULL AND us.custom_data != '{}'`
    ).bind(semester).all<{ user_id: string; user_schedule_id: string }>();
    const changedIds = new Set((changed.results || []).map((row) => row.user_id));
    const filteredUsers = (rows.results || []).filter((row) => changedIds.has(row.user_id));
    const data: Record<string, unknown>[] = [];
    for (const row of filteredUsers) {
      const result = await listUserSchedules(env, row.user_id);
      for (const course of result.data) {
        if (String(course.semester || '') !== semester || !course.custom_data || Object.keys(course.custom_data as object).length === 0) continue;
        data.push({ ...course, user: { id: row.user_id, student_code: row.student_code, full_name: row.full_name } });
      }
    }
    return { success: true, data, role: staff.role };
  }
  throw new StaffSchedulesError(400, 'Chế độ lịch quản trị không hợp lệ.');
};

export const staffSchedulesErrorStatus = (error: unknown) =>
  error instanceof StaffSchedulesError ? error.status : 500;
