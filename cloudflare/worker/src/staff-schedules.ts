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
    `SELECT us.user_id, up.student_code, up.full_name, COUNT(*) AS course_count
       FROM user_schedules us
       LEFT JOIN user_profiles up ON up.user_id = us.user_id
      WHERE us.semester = ?
      GROUP BY us.user_id, up.student_code, up.full_name
      ORDER BY COALESCE(up.student_code, us.user_id) ASC
      LIMIT 500`
  ).bind(semester).all<{ user_id: string; student_code: string | null; full_name: string | null; course_count: number }>();

  if (mode === 'summaries') {
    return { success: true, data: (rows.results || []).map((row) => ({ ...row, email: null })), role: staff.role };
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
