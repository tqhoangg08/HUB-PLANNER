export type ScheduleWriteMode = 'legacy' | 'frozen' | 'd1' | 'invalid';

export interface ScheduleWriteModeEnv {
  SCHEDULE_WRITE_MODE?: string;
  COURSE_SUPABASE_TO_D1_SYNC_ENABLED?: string;
}

const COURSE_ROUTE = /^\/api\/user\/v1\/schedules\/courses\/[0-9a-f-]+$/i;
const ENTRY_ROUTE = /^\/api\/user\/v1\/schedules\/entries\/[0-9a-f-]+$/i;

export const readScheduleWriteMode = (
  env: ScheduleWriteModeEnv
): ScheduleWriteMode => {
  const configured = env.SCHEDULE_WRITE_MODE;
  if (configured === undefined) return 'legacy';
  if (configured === 'legacy' || configured === 'frozen' || configured === 'd1') {
    return configured;
  }
  return 'invalid';
};

export const isScheduleMutationRequest = (pathname: string, method: string) =>
  (COURSE_ROUTE.test(pathname) && (method === 'PUT' || method === 'DELETE')) ||
  (ENTRY_ROUTE.test(pathname) && method === 'PATCH') ||
  (pathname === '/api/user/v1/schedules/replace' && method === 'PUT');

export const isD1ScheduleCourseMutation = (pathname: string, method: string) =>
  COURSE_ROUTE.test(pathname) && (method === 'PUT' || method === 'DELETE');

export const allowsLegacyScheduleWrites = (env: ScheduleWriteModeEnv) =>
  readScheduleWriteMode(env) === 'legacy';

export const allowsSupabaseUserScheduleSync = (env: ScheduleWriteModeEnv) =>
  readScheduleWriteMode(env) === 'legacy';

export const allowsSupabaseCourseSync = (env: ScheduleWriteModeEnv) => {
  // Course authority has an independent cutover. Keep the historical default
  // for older deployed versions, but let the final Course D1 candidate turn
  // off only the Supabase->D1 course ingestion cron.
  if (env.COURSE_SUPABASE_TO_D1_SYNC_ENABLED === 'false') return false;
  const mode = readScheduleWriteMode(env);
  return mode === 'legacy' || mode === 'd1';
};
