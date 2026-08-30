export type ApplicationEntry = 'recovery' | 'legacy';

const RECOVERY_PATHS = new Set([
  '/login', '/forgot-password', '/reset-password', '/account',
  '/staff/login', '/staff/activate', '/staff/reset-password',
]);

export const selectApplicationEntry = (
  pathname: string,
  authMaintenanceMode: boolean,
): ApplicationEntry => authMaintenanceMode && RECOVERY_PATHS.has(pathname)
  ? 'recovery'
  : 'legacy';
