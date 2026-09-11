import { handleCourses, syncCourseSchedules } from './courses.ts';
export { AnnouncementCrawlerWorkflow, HK1CourseScraperProbeWorkflow, HK1CourseScraperWorkflow } from './workflow-binding-parity.ts';
import {
  CourseAuthorityError,
  courseAuthorityErrorStatus,
  handleCourseAuthority,
  type CourseAuthorityEnv,
} from './course-authority.ts';
import {
  CourseAuthorityInternalError,
  courseAuthorityInternalErrorStatus,
  courseAuthorityInternalScraperDiagnostic,
  handleCourseAuthorityInternal,
  type CourseAuthorityInternalEnv,
} from './course-authority-internal.ts';
import { handleEvents } from './events.ts';
import { handleLostFound, syncPublicLostFound } from './lost-found.ts';
import { handleAdminEvents } from './admin-events.ts';
import {
  AdminEventMutationError,
  assertAdminEventMutationAllowed,
  cleanupAdminEventMutations,
  mutateAdminEvent,
  readAdminEventIdempotencyKey,
  readAdminEventMutationPayload,
} from './admin-event-mutations.ts';
import {
  EventParticipationError,
  listEventParticipations,
  mutateEventParticipation,
  parseParticipationUserId,
} from './event-participations.ts';
import {
  addUserScheduleForBetterAuth,
  deleteUserScheduleForBetterAuth,
  listUserSchedules,
  readUserScheduleBody,
  replaceUserScheduleSemesterForBetterAuth,
  replaceUserScheduleImportForBetterAuth,
  syncUserSchedules,
  updateUserScheduleForBetterAuth,
  UserScheduleError,
} from './user-schedules.ts';
import {
  forecastBenchmarkRankings,
  listRankingSemesters,
  parseRankingSemester,
  RankingError,
  readOwnBenchmarkRanking,
  readRankingForecastBody,
} from './rankings.ts';
import {
  readBearerToken,
  requireAuthenticatedUser,
  requireStaff,
  StaffAuthError,
  type StaffAuthEnv,
} from './auth.ts';
import { isSensitiveAuthIngressRequest } from '../../shared/auth-sensitive-routes.ts';
import {
  BetterAuthIdentityError,
  handleBetterAuthMeRequest,
  requireBetterAuthStaff,
  requireBetterAuthSession,
  type BetterAuthIdentityEnv,
} from './better-auth-identity.ts';
import {
  allowsSupabaseCourseSync,
  allowsSupabaseUserScheduleSync,
  isScheduleMutationRequest,
  readScheduleWriteMode,
  type ScheduleWriteModeEnv,
} from './schedule-write-mode.ts';
import {
  mutateD1UserScheduleCourse,
  parseD1ScheduleMutationRequest,
  parseD1ScheduleReplaceRequest,
  parseD1ScheduleUpdateRequest,
  replaceD1UserScheduleSemester,
  updateD1UserScheduleCustomData,
} from './d1-user-schedule-mutations.ts';
import {
  handlePrivateProfile,
  privateProfileErrorStatus,
  PrivateProfileError,
} from './private-profile.ts';
import {
  handleProfileAuthorityInternal,
  profileAuthorityInternalErrorStatus,
  ProfileAuthorityInternalError,
  type ProfileAuthorityInternalEnv,
} from './profile-authority-internal.ts';
import {
  handleScheduleAuthorityInternal,
  scheduleAuthorityInternalErrorStatus,
  ScheduleAuthorityInternalError,
  type ScheduleAuthorityInternalEnv,
} from './schedule-authority-internal.ts';
import {
  handleStaffProfile,
  staffProfileErrorStatus,
  StaffProfileError,
  type StaffProfileEnv,
} from './staff-profile.ts';
import {
  handlePrivateNotifications,
  privateNotificationsErrorStatus,
  PrivateNotificationsError,
} from './private-notifications.ts';
import {
  activityLogErrorStatus,
  ActivityLogError,
  handleActivityLog,
  type ActivityLogEnv,
} from './activity-log.ts';
import {
  handlePushSubscription,
  pushSubscriptionErrorStatus,
  PushSubscriptionError,
  type PushSubscriptionEnv,
} from './push-subscriptions.ts';
import {
  handlePushTest,
  pushTestErrorStatus,
  PushTestError,
  type PushTestEnv,
} from './push-test.ts';
import {
  aiAdvisorErrorStatus,
  AiAdvisorError,
  handleAiAdvisor,
  type AiAdvisorEnv,
} from './ai-advisor.ts';
import {
  aiDocumentsErrorStatus,
  AiDocumentsError,
  handleAdminAiDocuments,
  handleAiDocumentSource,
  type AiDocumentsEnv,
} from './ai-documents.ts';
import {
  handlePrivatePolicyConsent,
  privatePolicyConsentErrorStatus,
  PrivatePolicyConsentError,
} from './private-policy-consent.ts';
import {
  handleCtvRegistration,
  handleModeratorNotification,
  handleProtectedSubmission,
  UserSubmissionError,
  userSubmissionErrorStatus,
} from './user-submissions.ts';
import {
  accountPasswordCompatErrorStatus,
  AccountPasswordCompatError,
  handleAccountPasswordCompat,
  type AccountPasswordCompatEnv,
} from './account-password-compat.ts';
import { handleWebErrorTelemetry } from './web-error-telemetry.ts';
import { runNotificationQueueControl } from './notification-cron.ts';
import { runEventPush, type EventPushEnv } from './event-push.ts';
import { ANNOUNCEMENT_SOURCES, crawlAnnouncementSources } from './announcement-crawler.ts';
import { handlePdfAi, PdfAiError, pdfAiErrorStatus, type PdfAiEnv } from './pdf-ai.ts';
import {
  AdminLegacyDataError,
  adminLegacyDataErrorStatus,
  handleAdminLegacyData,
  type AdminLegacyDataEnv,
} from './admin-legacy-data.ts';
import { handleStaffSchedules, staffSchedulesErrorStatus, type StaffSchedulesEnv } from './staff-schedules.ts';
import {
  adminSupportErrorStatus,
  handleAdminSupport,
  handleAdminSupportAttachmentObject,
  type AdminSupportEnv,
} from './admin-support.ts';
import { adminExportErrorStatus, handleAdminExport, type AdminExportEnv } from './admin-export.ts';
import {
  accountDeleteErrorStatus,
  AccountDeleteError,
  handleAccountDelete,
  handleAccountDeleteSyntheticTest,
  handleAccountDeleteSyntheticTestPage,
  handleAccountDeleteSyntheticTestTurnstileFrame,
  type AccountDeleteEnv,
} from './account-delete.ts';
import {
  publicDirectoryErrorStatus,
  readPublicDonations,
  readPublicProfile,
  searchPublicProfiles,
  type PublicDirectoryEnv,
} from './public-directory.ts';

type WorkerEnv = Env & StaffAuthEnv & BetterAuthIdentityEnv & ScheduleWriteModeEnv & PdfAiEnv & EventPushEnv & AccountPasswordCompatEnv &
  ProfileAuthorityInternalEnv & ScheduleAuthorityInternalEnv & CourseAuthorityEnv & CourseAuthorityInternalEnv & StaffProfileEnv & AdminLegacyDataEnv & StaffSchedulesEnv & AdminSupportEnv & AdminExportEnv & AccountDeleteEnv & ActivityLogEnv & PushSubscriptionEnv & PushTestEnv & AiAdvisorEnv & AiDocumentsEnv & PublicDirectoryEnv & {
  AUTH_SERVICE_PROXY_ENABLED?: string;
  AUTH_INGRESS_IP_RATE_LIMIT?: RateLimit;
  ASSETS: Fetcher;
  NOTIFICATION_JOBS_ENABLED?: string;
  NOTIFICATION_JOBS_MODE?: string;
  NOTIFICATION_REENABLE_CUTOFF?: string;
  EVENT_PUSH_CUTOFF?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

interface AnnouncementRow {
  id: number;
  title: string;
  link: string;
  is_new: number;
  date: string | null;
  created_at: string | null;
}


export interface AnnouncementQuery {
  limit: number;
  offset: number;
  search: string;
  startDate: string;
  endDate: string;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://hotrosinhvienhub.id.vn',
];
const ANNOUNCEMENT_EDGE_TTL_SECONDS = 300;
const COURSE_EDGE_TTL_SECONDS = 1800;
const EVENT_EDGE_TTL_SECONDS = 300;
const LOST_FOUND_EDGE_TTL_SECONDS = 120;
const ANNOUNCEMENT_CACHE_PARAMS = new Set([
  'resource',
  'limit',
  'offset',
  'search',
  'startDate',
  'endDate',
]);
const COURSE_CACHE_PARAMS = new Set([
  'resource',
  'semester',
  'major',
  'cohort',
  'academicProgram',
  'subjectName',
  'phase',
  'isUserAdded',
  'search',
  'suggestions',
  'limit',
  'offset',
  'view',
  'groupName',
  'id',
  'courseCode',
  'prerequisite',
  'credits',
  'knowledgeBlock',
  'instructor',
  'dayOfWeek',
  'shift',
  'room',
  'weeks',
  'managingFaculty',
  'campus',
  'examDate',
  'examShift',
  'examCampus',
  'examRoom',
  'orientation',
  'orientationNote3',
  'registrationType',
  'generalNote',
  'studentCount',
]);
const EVENT_CACHE_PARAMS = new Set([
  'limit',
  'offset',
  'search',
  'criteria',
  'scope',
  'sort',
  'group',
  'ids',
]);
const LOST_FOUND_CACHE_PARAMS = new Set([
  'type',
  'limit',
  'offset',
  'search',
]);

const JSON_SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
} satisfies HeadersInit;

const FRONTEND_SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https:; script-src-attr 'none'; worker-src 'self' blob: https://esm.sh; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' https://assets.mixkit.co; connect-src 'self' https: wss://*.supabase.co; frame-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests;",
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
} satisfies HeadersInit;

const isFrontendNavigation = (request: Request) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  return (
    request.headers.get('Sec-Fetch-Mode') === 'navigate' ||
    String(request.headers.get('Accept') || '').includes('text/html')
  );
};

const isAuthServicePath = (pathname: string) =>
  pathname === '/api/auth' || pathname.startsWith('/api/auth/');

const PRODUCTION_AUTH_HOST = 'hotrosinhvienhub.id.vn';
const RECOVERY_AUTH_ROUTES = new Set([
  'POST /api/auth/sign-in/social',
  'GET /api/auth/callback/google',
  'GET /api/auth/get-session',
  'POST /api/auth/sign-out',
  'POST /api/auth/sign-in/email',
  'POST /api/auth/login/dispatch',
  'POST /api/auth/mssv/sign-in',
  'POST /api/auth/mssv/request-password-reset',
  'POST /api/auth/student/sign-up/start',
  'POST /api/auth/student/sign-up/verify',
  'POST /api/auth/student/sign-up/resend',
  'GET /api/auth/registration/status',
  'POST /api/auth/registration/set-password',
  'POST /api/auth/request-password-reset',
  'POST /api/auth/staff/request-password-reset',
  'POST /api/auth/reset-password',
]);

const isPasswordResetCallback = (method: string, pathname: string) =>
  method === 'GET' && /^\/api\/auth\/reset-password\/[^/]+$/.test(pathname);

export const isProductionRecoveryAuthRequest = (request: Request) => {
  const url = new URL(request.url);
  return (
    url.hostname === PRODUCTION_AUTH_HOST &&
    (
      RECOVERY_AUTH_ROUTES.has(`${request.method.toUpperCase()} ${url.pathname}`) ||
      isPasswordResetCallback(request.method.toUpperCase(), url.pathname)
    )
  );
};

export const proxyAuthServiceIfEnabled = async (
  request: Request,
  env: WorkerEnv
): Promise<Response | null> => {
  const url = new URL(request.url);
  if (!isAuthServicePath(url.pathname)) return null;
  if (!isProductionRecoveryAuthRequest(request)) {
    return json({ error: 'Không tìm thấy endpoint.' }, 404);
  }
  if (env.AUTH_SERVICE_PROXY_ENABLED !== 'true' || !env.AUTH_SERVICE) {
    return json({ error: 'Dịch vụ xác thực tạm thời chưa sẵn sàng.' }, 503);
  }

  if (isSensitiveAuthIngressRequest(request)) {
    const ingressIp = request.headers.get('cf-connecting-ip')?.trim();
    if (ingressIp) {
      if (!env.AUTH_INGRESS_IP_RATE_LIMIT) {
        return json({ error: 'Dịch vụ xác thực tạm thời chưa sẵn sàng.' }, 503);
      }
      const outcome = await env.AUTH_INGRESS_IP_RATE_LIMIT.limit({
        key: `auth-ingress-ip:${ingressIp}`,
      });
      if (!outcome.success) {
        return json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }, 429);
      }
    }
  }

  // Forward the original request so callback query parameters, cookies,
  // request bodies, CF metadata and multiple Set-Cookie headers are preserved.
  return env.AUTH_SERVICE.fetch(request);
};

const withFrontendAssetHeaders = (response: Response) => {
  const headers = new Headers(response.headers);
  Object.entries(FRONTEND_SECURITY_HEADERS).forEach(([name, value]) => {
    headers.set(name, value);
  });
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const json = (payload: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...JSON_SECURITY_HEADERS,
      ...headers,
    },
  });

const clamp = (value: string | null, fallback: number, max: number) =>
  Math.max(1, Math.min(Number(value) || fallback, max));

export const normalizeSearch = (value: string) =>
  String(value || '')
    .toLocaleLowerCase('vi-VN')
    .trim()
    .replace(/[%,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const parseAnnouncementQuery = (params: URLSearchParams): AnnouncementQuery => ({
  limit: clamp(params.get('limit'), 10, 60),
  offset: Math.max(0, Number(params.get('offset')) || 0),
  search: normalizeSearch(params.get('search') || ''),
  startDate: String(params.get('startDate') || '').trim(),
  endDate: String(params.get('endDate') || '').trim(),
});

export const buildPublicCacheKey = (request: Request) => {
  const requestUrl = new URL(request.url);
  const resource = String(requestUrl.searchParams.get('resource') || '');
  const allowedParams = requestUrl.pathname.endsWith('/courses')
    ? COURSE_CACHE_PARAMS
    : requestUrl.pathname.endsWith('/lost-found') ||
        resource === 'lost-found'
      ? LOST_FOUND_CACHE_PARAMS
    : resource === 'announcements'
      ? ANNOUNCEMENT_CACHE_PARAMS
      : EVENT_CACHE_PARAMS;
  const sorted = [...requestUrl.searchParams.entries()]
    .filter(([name]) => allowedParams.has(name))
    .sort(([leftName, leftValue], [rightName, rightValue]) =>
      leftName === rightName
        ? leftValue.localeCompare(rightValue)
        : leftName.localeCompare(rightName)
    );
  requestUrl.search = '';
  for (const [name, value] of sorted) requestUrl.searchParams.append(name, value);
  requestUrl.searchParams.set(
    '__hub_cache_origin',
    request.headers.get('Origin') || 'no-origin'
  );
  return new Request(requestUrl.toString(), { method: 'GET' });
};

export const formatPostgrestTimestamp = (value: string | null) => {
  if (!value) return value;
  return value
    .replace(/\.([0-9]*?[1-9])0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '.$1')
    .replace(/\.0+(?=(?:Z|[+-]\d{2}:\d{2})$)/, '');
};

export { syncCrawledSchoolAnnouncements } from './announcement-store.ts';
import { syncCrawledSchoolAnnouncements } from './announcement-store.ts';

export const crawlAndSyncSchoolAnnouncements = async (env: WorkerEnv) =>
  syncCrawledSchoolAnnouncements(env, await crawlAnnouncementSources({ after: '2026-08-05', maxPages: 80 }));

const readAllowedOrigins = (env: WorkerEnv) => {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS);
};

const corsHeaders = (request: Request, env: WorkerEnv): HeadersInit | null => {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  if (!readAllowedOrigins(env).has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods':
      'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

const readSyncHealth = async (env: WorkerEnv) => {
  const rows = await env.DB.prepare(
    `SELECT resource, source_row_count, visible_row_count,
            source_max_created_at, synced_at
       FROM sync_metadata`
  ).all<Record<string, unknown>>();
  const resources = Object.fromEntries(
    (rows.results || []).map((row) => [String(row.resource), row])
  );
  return {
    ok: true,
    resource: 'school_announcements',
    sync: resources.school_announcements || null,
    resources,
  };
};

const adminErrorResponse = (
  error: unknown,
  requestUrl: URL,
  cors: HeadersInit
) => {
  const status =
    error instanceof StaffAuthError || error instanceof BetterAuthIdentityError
      ? error.status
      : 500;
  const message =
    status === 401
      ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
      : status === 403
        ? 'Tài khoản không có quyền quản trị.'
        : status === 503
          ? 'Dịch vụ xác thực quản trị tạm thời không khả dụng.'
          : 'Không thể tải dữ liệu quản trị.';

  console.warn(JSON.stringify({
    event: 'admin_access_denied',
    path: requestUrl.pathname,
    status,
  }));

  return json({ error: message }, status, {
    ...cors,
    'Cache-Control': 'no-store',
    ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}),
  });
};

const adminEventMutationErrorResponse = (
  error: unknown,
  requestUrl: URL,
  cors: HeadersInit
) => {
  if (error instanceof StaffAuthError || error instanceof BetterAuthIdentityError) {
    return adminErrorResponse(error, requestUrl, cors);
  }

  const status =
    error instanceof AdminEventMutationError ? error.status : 500;
  const message =
    error instanceof AdminEventMutationError
      ? error.message
      : 'Không thể lưu sự kiện.';

  return json({ error: message }, status, {
    ...cors,
    'Cache-Control': 'no-store',
  });
};

const eventParticipationErrorResponse = (
  error: unknown,
  requestUrl: URL,
  cors: HeadersInit
) => {
  const status =
    error instanceof BetterAuthIdentityError
      ? error.status
      : error instanceof StaffAuthError
      ? error.status
      : error instanceof EventParticipationError
        ? error.status
        : 500;
  const message =
    status === 401
      ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
      : status === 403
        ? 'Bạn không có quyền xem lịch sử tham gia của người dùng này.'
        : error instanceof EventParticipationError
          ? error.message
          : 'Không thể xử lý lịch sử tham gia sự kiện.';

  if (
    !(error instanceof BetterAuthIdentityError) &&
    !(error instanceof StaffAuthError) &&
    !(error instanceof EventParticipationError)
  ) {
    console.error(JSON.stringify({
      event: 'event_participation_request_failed',
      path: requestUrl.pathname,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return json({ error: message }, status, {
    ...cors,
    'Cache-Control': 'no-store',
  });
};

const userScheduleErrorResponse = (
  error: unknown,
  requestUrl: URL,
  cors: HeadersInit
) => {
  const status =
    error instanceof BetterAuthIdentityError
      ? error.status
      : error instanceof StaffAuthError
      ? error.status
      : error instanceof UserScheduleError
        ? error.status
        : 500;
  const message =
    status === 401
      ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
      : status === 403
        ? 'Bạn không có quyền xem lịch cá nhân của người dùng này.'
        : error instanceof UserScheduleError
          ? error.message
          : 'Không thể xử lý lịch cá nhân.';

  if (
    !(error instanceof BetterAuthIdentityError) &&
    !(error instanceof StaffAuthError) &&
    !(error instanceof UserScheduleError)
  ) {
    console.error(JSON.stringify({
      event: 'user_schedule_request_failed',
      path: requestUrl.pathname,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return json({ error: message }, status, {
    ...cors,
    'Cache-Control': 'no-store',
  });
};

const userScheduleReadErrorResponse = (
  error: unknown,
  requestUrl: URL,
  cors: HeadersInit
) => {
  const status =
    error instanceof BetterAuthIdentityError
      ? error.status
      : error instanceof UserScheduleError
        ? error.status
        : 500;
  const message =
    error instanceof BetterAuthIdentityError
      ? status === 401
        ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
        : status === 403
          ? 'Không có quyền truy cập.'
          : 'Dịch vụ xác thực tạm thời chưa sẵn sàng.'
      : error instanceof UserScheduleError
        ? error.message
        : 'Không thể xử lý lịch cá nhân.';

  if (
    !(error instanceof BetterAuthIdentityError) &&
    !(error instanceof UserScheduleError)
  ) {
    console.error(JSON.stringify({
      event: 'user_schedule_read_failed',
      path: requestUrl.pathname,
      status,
    }));
  }

  return json({ error: message }, status, {
    ...cors,
    'Cache-Control': 'no-store',
  });
};

const userScheduleD1WriteErrorResponse = (
  error: unknown,
  requestUrl: URL,
  cors: HeadersInit
) => {
  const status =
    error instanceof BetterAuthIdentityError
      ? error.status
      : error instanceof UserScheduleError
        ? error.status
        : 503;
  const message =
    error instanceof BetterAuthIdentityError
      ? status === 401
        ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
        : status === 403
          ? 'Không có quyền truy cập.'
          : 'Dịch vụ xác thực tạm thời chưa sẵn sàng.'
      : error instanceof UserScheduleError
        ? error.message
        : 'Không thể cập nhật lịch cá nhân lúc này.';

  if (
    !(error instanceof BetterAuthIdentityError) &&
    !(error instanceof UserScheduleError)
  ) {
    console.error(JSON.stringify({
      event: 'd1_user_schedule_mutation_failed',
      path: requestUrl.pathname,
      status,
    }));
  }
  return json({ error: message }, status, {
    ...cors,
    'Cache-Control': 'no-store',
  });
};

const rankingErrorResponse = (
  error: unknown,
  requestUrl: URL,
  cors: HeadersInit
) => {
  const status =
    error instanceof StaffAuthError
      ? error.status
      : error instanceof RankingError
        ? error.status
        : 500;
  const message =
    status === 401
      ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
      : error instanceof RankingError
        ? error.message
        : 'Không thể xử lý dữ liệu xếp hạng.';

  if (
    !(error instanceof StaffAuthError) &&
    !(error instanceof RankingError)
  ) {
    console.error(JSON.stringify({
      event: 'ranking_request_failed',
      path: requestUrl.pathname,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  return json({ error: message }, status, {
    ...cors,
    'Cache-Control': 'no-store',
    ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}),
  });
};

const exactRankingErrorResponse = (
  error: unknown,
  requestUrl: URL,
  cors: HeadersInit
) => {
  const status =
    error instanceof BetterAuthIdentityError
      ? error.status
      : error instanceof RankingError
        ? error.status
        : 500;
  const message =
    error instanceof BetterAuthIdentityError
      ? status === 401
        ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
        : status === 403
          ? 'Không có quyền truy cập.'
          : 'Dịch vụ xác thực tạm thời chưa sẵn sàng.'
      : error instanceof RankingError
        ? error.message
        : 'Không thể xử lý dữ liệu xếp hạng.';

  if (
    !(error instanceof BetterAuthIdentityError) &&
    !(error instanceof RankingError)
  ) {
    console.error(JSON.stringify({
      event: 'exact_ranking_request_failed',
      path: requestUrl.pathname,
      status,
    }));
  }

  return json({ error: message }, status, {
    ...cors,
    'Cache-Control': 'no-store',
  });
};

const scheduleUserScheduleMirrorRepair = (
  env: WorkerEnv,
  ctx: ExecutionContext
) => {
  if (!allowsSupabaseUserScheduleSync(env)) return;
  ctx.waitUntil(
    syncUserSchedules(env).catch((error) => {
      console.error(JSON.stringify({
        event: 'user_schedule_mirror_repair_failed',
        error: error instanceof Error ? error.message : String(error),
      }));
    })
  );
};

const handleAnnouncements = async (requestUrl: URL, env: WorkerEnv) => {
  const query = parseAnnouncementQuery(requestUrl.searchParams);
  // is_hidden is NOT NULL with a 0/1 CHECK constraint. Keep this predicate
  // sargable so the visibility/date/created_at ordering index can serve
  // the default listing without scanning and sorting the whole table.
  const where = ['is_hidden = 0'];
  const bindings: Array<string | number> = [];

  if (query.search) {
    where.push('title_search LIKE ?');
    bindings.push(`%${query.search}%`);
  }
  if (query.startDate) {
    where.push('date >= ?');
    bindings.push(query.startDate);
  }
  if (query.endDate) {
    where.push('date <= ?');
    bindings.push(query.endDate);
  }

  const whereSql = where.join(' AND ');
  const canUseMetadataCount = !query.search && !query.startDate && !query.endDate;
  const countRow = canUseMetadataCount
    ? await env.DB.prepare(
      'SELECT visible_row_count AS total FROM sync_metadata WHERE resource = ?'
    ).bind('school_announcements').first<{ total: number }>()
    : await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM school_announcements WHERE ${whereSql}`
    )
      .bind(...bindings)
      .first<{ total: number }>();

  const total = Number(countRow?.total || 0);
  const rows = await env.DB.prepare(
    `SELECT id, title, link, is_new, date, created_at
       FROM school_announcements
      WHERE ${whereSql}
      ORDER BY date DESC, created_at DESC
      LIMIT ? OFFSET ?`
  )
    .bind(...bindings, query.limit, query.offset)
    .all<AnnouncementRow>();

  const data = (rows.results || []).map((row) => ({
    id: row.id,
    title: row.title,
    link: row.link,
    is_new: Boolean(row.is_new),
    date: row.date,
    created_at: formatPostgrestTimestamp(row.created_at),
  }));

  return {
    success: true,
    data,
    total,
    hasMore: total > query.offset + data.length,
  };
};

const readCachedResponse = async (request: Request) => {
  try {
    const cached = await caches.default.match(buildPublicCacheKey(request));
    if (!cached) return null;
    const response = new Response(cached.body, cached);
    return response;
  } catch (error) {
    console.warn('edge_cache_read_failed', error);
    return null;
  }
};

const storeCachedResponse = (
  request: Request,
  response: Response,
  ctx: ExecutionContext
) => {
  try {
    ctx.waitUntil(
      caches.default
        .put(buildPublicCacheKey(request), response.clone())
        .catch((error) => console.warn('edge_cache_write_failed', error))
    );
  } catch (error) {
    console.warn('edge_cache_write_failed', error);
  }
};

const worker = {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const requestUrl = new URL(request.url);
    const authServiceResponse = await proxyAuthServiceIfEnabled(request, env);
    if (authServiceResponse) return authServiceResponse;

    if (
      requestUrl.pathname === '/__account-delete-synthetic-test' ||
      requestUrl.pathname === '/__account-delete-synthetic-test/turnstile-frame'
    ) {
      try {
        return requestUrl.pathname.endsWith('/turnstile-frame')
          ? handleAccountDeleteSyntheticTestTurnstileFrame(env)
          : handleAccountDeleteSyntheticTestPage(env);
      } catch (error) {
        return json({ error: 'Không tìm thấy endpoint.' }, accountDeleteErrorStatus(error), {
          ...JSON_SECURITY_HEADERS,
          'Cache-Control': 'no-store',
        });
      }
    }

    if (requestUrl.pathname === '/internal/profile/v1/authority') {
      try {
        return json(await handleProfileAuthorityInternal(request, env), 200, {
          ...JSON_SECURITY_HEADERS,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        const status = profileAuthorityInternalErrorStatus(error);
        if (!(error instanceof ProfileAuthorityInternalError)) {
          console.error(JSON.stringify({ event: 'profile_authority_internal_failed', status }));
        }
        return json({ error: status === 404 ? 'Not found.' : 'Profile authority request rejected.' }, status, {
          ...JSON_SECURITY_HEADERS,
          ...(status === 405 ? { Allow: 'POST' } : {}),
          'Cache-Control': 'no-store',
        });
      }
    }

    if (requestUrl.pathname === '/internal/schedules/v1/authority') {
      try {
        return json(await handleScheduleAuthorityInternal(request, env), 200, {
          ...JSON_SECURITY_HEADERS,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        const status = scheduleAuthorityInternalErrorStatus(error);
        if (!(error instanceof ScheduleAuthorityInternalError)) {
          console.error(JSON.stringify({ event: 'schedule_authority_internal_failed', status }));
        }
        return json({ error: status === 404 ? 'Not found.' : 'Schedule authority request rejected.' }, status, {
          ...JSON_SECURITY_HEADERS,
          ...(status === 405 ? { Allow: 'POST' } : {}),
          'Cache-Control': 'no-store',
        });
      }
    }

    if (requestUrl.pathname === '/internal/courses/v1/authority') {
      try {
        return json(await handleCourseAuthorityInternal(request, env), 200, {
          ...JSON_SECURITY_HEADERS,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        const status = courseAuthorityInternalErrorStatus(error);
        const scraperDiagnostic = courseAuthorityInternalScraperDiagnostic(error);
        if (!(error instanceof CourseAuthorityInternalError)) {
          console.error(JSON.stringify({ event: 'course_authority_internal_failed', status, ...(scraperDiagnostic ? { scraperDiagnostic } : {}) }));
        }
        return json({ error: status === 404 ? 'Not found.' : 'Course authority request rejected.', ...(scraperDiagnostic ? { scraperDiagnostic } : {}) }, status, {
          ...JSON_SECURITY_HEADERS,
          ...(status === 405 ? { Allow: 'POST' } : {}),
          'Cache-Control': 'no-store',
        });
      }
    }

    if (
      requestUrl.pathname === '/api/private/v1/courses' ||
      /^\/api\/private\/v1\/courses\/[0-9a-f-]+$/i.test(requestUrl.pathname) ||
      requestUrl.pathname === '/api/private/v1/course-requests' ||
      requestUrl.pathname === '/api/private/v1/course-requests/review' ||
      /^\/api\/private\/v1\/course-requests\/[0-9a-f-]+\/(approve|reject)$/i.test(requestUrl.pathname)
    ) {
      const cors = corsHeaders(request, env);
      if (cors === null) return json({ error: 'Origin không được phép.' }, 403);
      try {
        const result = await handleCourseAuthority(request, requestUrl, env);
        return json(result.payload, result.status, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = courseAuthorityErrorStatus(error);
        if (!(error instanceof CourseAuthorityError)) {
          console.error(JSON.stringify({ event: 'course_authority_request_failed', status }));
        }
        return json({ error: status === 401 ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' : status === 403 ? 'Không có quyền truy cập.' : status === 503 ? 'Course authority unavailable.' : 'Yêu cầu môn học không hợp lệ.' }, status, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      }
    }

    if (requestUrl.pathname === '/api/staff/v1/schedules') {
      const staffCors = corsHeaders(request, env);
      if (staffCors === null) return json({ error: 'Origin không được phép.' }, 403);
      try {
        return json(await handleStaffSchedules(request, requestUrl, env), 200, {
          ...staffCors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = staffSchedulesErrorStatus(error);
        return json({ error: error instanceof Error ? error.message : 'Không thể đọc lịch quản trị.' }, status, {
          ...staffCors,
          'Cache-Control': 'no-store',
        });
      }
    }

    if (/^\/api\/private\/v1\/support\/attachment-(?:upload|download)\/[0-9a-f-]{36}$/i.test(requestUrl.pathname)) {
      const supportCors = corsHeaders(request, env);
      if (supportCors === null) return json({ error: 'Origin không được phép.' }, 403);
      try {
        const result = await handleAdminSupportAttachmentObject(request, requestUrl, env);
        const headers = new Headers(result.headers);
        new Headers(supportCors).forEach((value, name) => headers.set(name, value));
        headers.set('Cache-Control', 'private, no-store');
        return new Response(result.body, { status: result.status, headers });
      } catch (error) {
        const status = adminSupportErrorStatus(error);
        return json({ error: status === 401 ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' : status === 403 ? 'Không có quyền truy cập.' : status < 500 && error instanceof Error ? error.message : 'Không thể xử lý tệp đính kèm.' }, status, { ...supportCors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/private/v1/support' || requestUrl.pathname === '/api/admin/v1/support/tickets' || /^\/api\/admin\/v1\/support\/tickets\/[0-9a-f-]{36}$/i.test(requestUrl.pathname) || requestUrl.pathname === '/api/admin/v1/support/resolve-all') {
      const supportCors = corsHeaders(request, env);
      if (supportCors === null) return json({ error: 'Origin không được phép.' }, 403);
      try { return json(await handleAdminSupport(request, requestUrl, env), 200, { ...supportCors, 'Cache-Control': 'private, no-store' }); }
      catch (error) { const status = adminSupportErrorStatus(error); return json({ error: status === 401 ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' : status === 403 ? 'Không có quyền truy cập.' : status < 500 && error instanceof Error ? error.message : 'Không thể xử lý ticket hỗ trợ.' }, status, { ...supportCors, 'Cache-Control': 'no-store' }); }
    }

    if (requestUrl.pathname === '/api/private/v1/admin/export') {
      const exportCors = corsHeaders(request, env);
      if (exportCors === null) return json({ error: 'Origin không được phép.' }, 403);
      try { return json(await handleAdminExport(request, env), 200, { ...exportCors, 'Cache-Control': 'private, no-store' }); }
      catch (error) { const status = adminExportErrorStatus(error); return json({ error: status === 401 ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' : status === 403 ? 'Không có quyền truy cập.' : status < 500 && error instanceof Error ? error.message : 'Không thể xử lý yêu cầu xuất dữ liệu.' }, status, { ...exportCors, 'Cache-Control': 'no-store' }); }
    }

    const isLegacyPublicAlias =
      requestUrl.pathname === '/events' ||
      requestUrl.pathname === '/courses' ||
      requestUrl.pathname === '/lost-found';
    if (isLegacyPublicAlias && isFrontendNavigation(request)) {
      return withFrontendAssetHeaders(await env.ASSETS.fetch(request));
    }

    const cors = corsHeaders(request, env);
    if (cors === null) return json({ error: 'Origin không được phép.' }, 403);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...JSON_SECURITY_HEADERS,
          ...cors,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (requestUrl.pathname === '/api/private/v1/me') {
      return handleBetterAuthMeRequest(request, env, cors);
    }

    if (
      requestUrl.pathname === '/api/private/v1/account-delete/preflight' ||
      requestUrl.pathname === '/api/private/v1/account-delete/request-otp' ||
      requestUrl.pathname === '/api/private/v1/account-delete/confirm' ||
      requestUrl.pathname === '/api/private/v1/account-delete/synthetic-test/status' ||
      requestUrl.pathname === '/api/private/v1/account-delete/synthetic-test/execute'
    ) {
      try {
        const result = requestUrl.pathname.includes('/synthetic-test/')
          ? await handleAccountDeleteSyntheticTest(request, requestUrl, env)
          : await handleAccountDelete(request, requestUrl, env);
        return json(result, 200, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = accountDeleteErrorStatus(error);
        if (!(error instanceof BetterAuthIdentityError) && !(error instanceof AccountDeleteError)) {
          console.error(JSON.stringify({ event: 'account_delete_request_failed', status }));
        }
        return json({
          error: status === 401
            ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
            : status === 403
              ? 'Không có quyền truy cập.'
              : status < 500 && error instanceof AccountDeleteError
                ? error.message
                : 'Không thể hoàn tất xóa tài khoản lúc này.',
        }, status, { ...cors, 'Cache-Control': 'private, no-store' });
      }
    }

    if (requestUrl.pathname === '/api/staff/v1/profiles') {
      try {
        return json(await handleStaffProfile(request, env), 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        const status = staffProfileErrorStatus(error);
        if (!(error instanceof StaffProfileError) && !(error instanceof BetterAuthIdentityError)) {
          console.error(JSON.stringify({ event: 'staff_profile_request_failed', status }));
        }
        return json({
          error: status === 401
            ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
            : status === 403
              ? 'Không có quyền truy cập.'
              : status < 500 && error instanceof Error
                ? error.message
                : 'Dịch vụ hồ sơ tạm thời chưa sẵn sàng.',
        }, status, {
          ...cors,
          ...(status === 405 ? { Allow: 'POST, PATCH, OPTIONS' } : {}),
          'Cache-Control': 'no-store',
        });
      }
    }

    if (
      requestUrl.pathname === '/api/admin/v1/reports' ||
      requestUrl.pathname === '/api/admin/v1/activity' ||
      requestUrl.pathname === '/api/admin/v1/lost-found' ||
      requestUrl.pathname === '/api/admin/v1/event-candidates'
    ) {
      try {
        return json(await handleAdminLegacyData(request, requestUrl, env), 200, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = adminLegacyDataErrorStatus(error);
        if (!(error instanceof AdminLegacyDataError) && !(error instanceof BetterAuthIdentityError)) {
          console.error(JSON.stringify({ event: 'admin_legacy_data_failed', status, path: requestUrl.pathname }));
        }
        return json({ error: status === 401 ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' : status === 403 ? 'Không có quyền truy cập.' : status === 405 ? 'Phương thức không được hỗ trợ.' : status === 404 ? 'Không tìm thấy dữ liệu quản trị.' : 'Không thể xử lý dữ liệu quản trị.' }, status, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      }
    }

    if (requestUrl.pathname === '/api/admin/v1/ai-documents') {
      try {
        const payload = await handleAdminAiDocuments(request, requestUrl, env);
        return json(payload, request.method === 'POST' ? 202 : 200, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = aiDocumentsErrorStatus(error);
        if (!(error instanceof BetterAuthIdentityError) && !(error instanceof AiDocumentsError)) {
          console.error(JSON.stringify({ event: 'ai_documents_request_failed', status }));
        }
        return json({
          error: status === 401
            ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
            : status === 403
              ? 'Không có quyền truy cập.'
              : status < 500 && error instanceof AiDocumentsError
                ? error.message
                : 'Không thể xử lý kho tài liệu AI.',
        }, status, { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    const aiDocumentSourceMatch = requestUrl.pathname.match(/^\/api\/private\/v1\/ai-document-source\/([0-9a-f-]{36})$/i);
    if (aiDocumentSourceMatch) {
      try {
        return json(await handleAiDocumentSource(request, aiDocumentSourceMatch[1], env), 200, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = aiDocumentsErrorStatus(error);
        return json({
          error: status === 401
            ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
            : status === 403
              ? 'Không có quyền truy cập.'
              : status < 500 && error instanceof AiDocumentsError
                ? error.message
                : 'Không thể mở nguồn tài liệu.',
        }, status, { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/public/v1/telemetry/web-errors') {
      const result = await handleWebErrorTelemetry(request);
      return json(result.payload, result.status, {
        ...cors,
        ...(result.allow ? { Allow: result.allow } : {}),
        'Cache-Control': 'no-store',
      });
    }

    if (requestUrl.pathname === '/api/public/v1/pdf-ai') {
      try {
        return json(await handlePdfAi(request, env), 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        const status = pdfAiErrorStatus(error);
        if (!(error instanceof PdfAiError)) {
          console.error(JSON.stringify({ event: 'pdf_ai_request_failed', status }));
        }
        return json({
          error: error instanceof PdfAiError && status < 500
            ? error.message
            : 'Dịch vụ phân tích PDF đang tạm thời không phản hồi.',
        }, status, {
          ...cors,
          ...(error instanceof PdfAiError && error.allow ? { Allow: error.allow } : {}),
          'Cache-Control': 'no-store',
        });
      }
    }

    if (requestUrl.pathname === '/api/public/v1/announcement-chat') {
      if (request.method !== 'POST') {
        return json({ error: 'Phương thức không được hỗ trợ.' }, 405, {
          ...cors,
          Allow: 'POST, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }
      return json({
        error: 'hub_notification_chat_disabled',
        message: 'AI tra cứu nội dung thông báo đã được tắt. Vui lòng mở link nguồn chính thức để xem nội dung.',
      }, 410, { ...cors, 'Cache-Control': 'no-store' });
    }

    if (requestUrl.pathname === '/api/private/v1/account-password/otp') {
      try {
        return json(await handleAccountPasswordCompat(request, env), 200, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = accountPasswordCompatErrorStatus(error);
        const payload = error instanceof AccountPasswordCompatError
          ? error.payload
          : {
              error: status === 401
                ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
                : status === 403
                  ? 'Không có quyền truy cập.'
                  : 'Không thể xử lý yêu cầu mật khẩu lúc này.',
            };
        return json(payload, status, { ...cors, 'Cache-Control': 'private, no-store' });
      }
    }

    const userSubmissionHandler = requestUrl.pathname === '/api/submissions/v1/protected'
      ? handleProtectedSubmission
      : requestUrl.pathname === '/api/submissions/v1/ctv-requests'
        ? handleCtvRegistration
        : requestUrl.pathname === '/api/submissions/v1/moderator-notifications'
          ? handleModeratorNotification
          : null;
    if (userSubmissionHandler) {
      try {
        return json(await userSubmissionHandler(request, env), 200, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = userSubmissionErrorStatus(error);
        if (!(error instanceof BetterAuthIdentityError) && !(error instanceof UserSubmissionError)) {
          console.error(JSON.stringify({ event: 'user_submission_request_failed' }));
        }
        return json({
          error: status === 401
            ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
            : status === 403
              ? 'Không có quyền thực hiện thao tác này.'
              : status === 400 || status === 405 || status === 409 || status === 413 || status === 422
                ? (error as UserSubmissionError).message
                : 'Không thể xử lý yêu cầu lúc này.',
        }, status, { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/private/v1/ai-advisor') {
      try {
        return json(await handleAiAdvisor(request, requestUrl, env), 200, {
          ...cors, 'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = aiAdvisorErrorStatus(error);
        if (!(error instanceof BetterAuthIdentityError) && !(error instanceof AiAdvisorError)) {
          console.error(JSON.stringify({ event: 'ai_advisor_request_failed', status }));
        }
        return json({ error: status === 401 ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' : status === 403 ? 'Không có quyền truy cập.' : status < 500 && error instanceof AiAdvisorError ? error.message : 'Không thể xử lý yêu cầu trợ lý.' }, status, { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/private/v1/activity-log') {
      try {
        return json(await handleActivityLog(request, env), 200, {
          ...cors, 'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = activityLogErrorStatus(error);
        return json({ error: status === 401 ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' : status === 403 ? 'Không có quyền truy cập.' : status < 500 && error instanceof ActivityLogError ? error.message : 'Không thể ghi nhật ký hoạt động.' }, status, { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/private/v1/push-subscription') {
      try {
        return json(await handlePushSubscription(request, env), 200, {
          ...cors, 'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = pushSubscriptionErrorStatus(error);
        return json({
          error: status === 401 ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' : status === 403 ? 'Không có quyền truy cập.' : status < 500 && error instanceof PushSubscriptionError ? error.message : 'Không thể đồng bộ thiết bị nhận thông báo.',
          code: error instanceof PushSubscriptionError && /^[A-Z0-9_]{3,64}$/.test(error.code)
            ? error.code
            : 'PUSH_SUBSCRIPTION_FAILED',
        }, status, { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/private/v1/push/test') {
      try {
        return json(await handlePushTest(request, env), 200, {
          ...cors, 'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = pushTestErrorStatus(error);
        return json({
          error: status === 401
            ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
            : status === 403
              ? 'Không có quyền truy cập.'
              : status < 500 && error instanceof PushTestError
                ? error.message
                : 'Không thể gửi thông báo thử.',
        }, status, { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/user/v1/profile') {
      if (request.method !== 'GET' && request.method !== 'PATCH') {
        return json({ error: 'Phương thức không được hỗ trợ.' }, 405, {
          ...cors,
          Allow: 'GET, PATCH, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }
      try {
        return json(await handlePrivateProfile(request, env, ctx), 200, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = privateProfileErrorStatus(error);
        if (!(error instanceof BetterAuthIdentityError) && !(error instanceof PrivateProfileError)) {
          console.error(JSON.stringify({ event: 'private_profile_request_failed' }));
        }
        return json({
          error: status === 401
            ? 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'
            : status === 403
              ? 'Không có quyền truy cập.'
              : status === 400 || status === 405
                ? (error as PrivateProfileError).message
                : 'Không thể xử lý hồ sơ cá nhân.',
        }, status, { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/user/v1/notifications') {
      if (request.method !== 'GET' && request.method !== 'PATCH') {
        return json({ error: 'PhÆ°Æ¡ng thá»©c khÃ´ng Ä‘Æ°á»£c há»— trá»£.' }, 405, {
          ...cors,
          Allow: 'GET, PATCH, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }
      try {
        return json(await handlePrivateNotifications(request, env), 200, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = privateNotificationsErrorStatus(error);
        if (!(error instanceof BetterAuthIdentityError) && !(error instanceof PrivateNotificationsError)) {
          console.error(JSON.stringify({ event: 'private_notifications_request_failed' }));
        }
        return json({
          error: status === 401
            ? 'PhiÃªn Ä‘Äƒng nháº­p khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.'
            : status === 403
              ? 'KhÃ´ng cÃ³ quyá»n truy cáº­p.'
              : status === 400 || status === 405
                ? (error as PrivateNotificationsError).message
                : 'KhÃ´ng thá»ƒ xá»­ lÃ½ thÃ´ng bÃ¡o.',
        }, status, { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/user/v1/policy-consents') {
      if (request.method !== 'POST') {
        return json({ error: 'PhÆ°Æ¡ng thá»©c khÃ´ng Ä‘Æ°á»£c há»— trá»£.' }, 405, {
          ...cors, Allow: 'POST, OPTIONS', 'Cache-Control': 'no-store',
        });
      }
      try {
        return json(await handlePrivatePolicyConsent(request, env), 200, {
          ...cors, 'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        const status = privatePolicyConsentErrorStatus(error);
        if (!(error instanceof BetterAuthIdentityError) && !(error instanceof PrivatePolicyConsentError)) {
          console.error(JSON.stringify({ event: 'private_policy_consent_request_failed' }));
        }
        return json({
          error: status === 401
            ? 'PhiÃªn Ä‘Äƒng nháº­p khÃ´ng há»£p lá»‡ hoáº·c Ä‘Ã£ háº¿t háº¡n.'
            : status === 400 || status === 405
              ? (error as PrivatePolicyConsentError).message
              : 'KhÃ´ng thá»ƒ ghi nháº­n Ä‘á»“ng Ã½.',
        }, status, { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/admin/v1/events/sync') {
      if (request.method !== 'POST') {
        return json({ error: 'Chỉ hỗ trợ phương thức POST.' }, 405, {
          ...cors,
          Allow: 'POST, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      try {
        const identity = await requireBetterAuthStaff(request, env);
        const summary = await env.DB.prepare(
          'SELECT COUNT(*) AS source_row_count, MAX(created_at) AS max_created_at FROM admin_events'
        ).first<{ source_row_count: number; max_created_at: string | null }>();
        console.log(JSON.stringify({
          event: 'admin_event_d1_authority_confirmed',
          role: identity.role,
          sourceRowCount: Number(summary?.source_row_count || 0),
        }));
        return json({
          success: true,
          authority: 'd1',
          sourceRowCount: Number(summary?.source_row_count || 0),
          deleted: 0,
          syncedAt: summary?.max_created_at || null,
        }, 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        if (
          error instanceof StaffAuthError ||
          error instanceof BetterAuthIdentityError
        ) {
          return adminErrorResponse(error, requestUrl, cors);
        }
        console.error(JSON.stringify({
          event: 'admin_event_sync_failed',
          path: requestUrl.pathname,
          error: error instanceof Error ? error.message : String(error),
        }));
        return json({ error: 'Không thể đồng bộ dữ liệu Sự kiện quản trị.' }, 500, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      }
    }

    const adminEventDetailMatch = requestUrl.pathname.match(
      /^\/api\/admin\/v1\/events\/([1-9]\d*)$/
    );
    if (adminEventDetailMatch) {
      if (request.method !== 'PATCH') {
        return json({ error: 'Chỉ hỗ trợ phương thức PATCH.' }, 405, {
          ...cors,
          Allow: 'PATCH, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      try {
        const identity = await requireBetterAuthStaff(request, env);
        const payload = await readAdminEventMutationPayload(request, 'update');
        assertAdminEventMutationAllowed(payload, identity.role);
        const eventId = Number(adminEventDetailMatch[1]);
        const result = await mutateAdminEvent(
          env,
          'update',
          payload,
          eventId
        );
        console.log(JSON.stringify({
          event: 'admin_event_updated',
          eventId,
          role: identity.role,
          mirrorSynced: result.mirrorSynced,
        }));
        return json(result, 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        if (
          !(error instanceof StaffAuthError) &&
          !(error instanceof BetterAuthIdentityError) &&
          !(error instanceof AdminEventMutationError)
        ) {
          console.error(JSON.stringify({
            event: 'admin_event_update_failed',
            path: requestUrl.pathname,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
        return adminEventMutationErrorResponse(error, requestUrl, cors);
      }
    }

    if (requestUrl.pathname === '/api/admin/v1/events') {
      if (request.method !== 'GET' && request.method !== 'POST') {
        return json({ error: 'Chỉ hỗ trợ phương thức GET hoặc POST.' }, 405, {
          ...cors,
          Allow: 'GET, POST, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      try {
        const identity = await requireBetterAuthStaff(request, env);
        if (request.method === 'POST') {
          const mutationId = readAdminEventIdempotencyKey(request);
          const payload = await readAdminEventMutationPayload(request, 'create');
          assertAdminEventMutationAllowed(payload, identity.role);
          const result = await mutateAdminEvent(
            env,
            'create',
            payload,
            undefined,
            fetch,
            { mutationId, userId: identity.userId }
          );
          const eventId = Number(result.data[0].id);
          console.log(JSON.stringify({
            event: 'admin_event_created',
            eventId,
            role: identity.role,
            mirrorSynced: result.mirrorSynced,
          }));
          return json(result, 201, {
            ...cors,
            'Cache-Control': 'no-store',
          });
        }

        return json(await handleAdminEvents(requestUrl, env), 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        if (request.method === 'POST') {
          if (
            !(error instanceof StaffAuthError) &&
            !(error instanceof BetterAuthIdentityError) &&
            !(error instanceof AdminEventMutationError)
          ) {
            console.error(JSON.stringify({
              event: 'admin_event_create_failed',
              path: requestUrl.pathname,
              error: error instanceof Error ? error.message : String(error),
            }));
          }
          return adminEventMutationErrorResponse(error, requestUrl, cors);
        }
        if (
          error instanceof StaffAuthError ||
          error instanceof BetterAuthIdentityError
        ) {
          return adminErrorResponse(error, requestUrl, cors);
        }
        console.error(JSON.stringify({
          event: 'admin_event_query_failed',
          path: requestUrl.pathname,
          error: error instanceof Error ? error.message : String(error),
        }));
        return json({ error: 'Không thể tải dữ liệu Sự kiện quản trị.' }, 500, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      }
    }

    if (requestUrl.pathname === '/api/admin/v1/health') {
      if (request.method !== 'GET') {
        return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, {
          ...cors,
          Allow: 'GET, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      try {
        await requireBetterAuthStaff(request, env);
        return json(await readSyncHealth(env), 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        return adminErrorResponse(error, requestUrl, cors);
      }
    }

    if (requestUrl.pathname === '/api/public/v1/rankings/semesters') {
      if (request.method !== 'GET') {
        return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, {
          ...cors,
          Allow: 'GET, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      try {
        return json(await listRankingSemesters(env), 200, {
          ...cors,
          'Cache-Control':
            'public, max-age=300, s-maxage=1800, stale-while-revalidate=3600',
        });
      } catch (error) {
        return rankingErrorResponse(error, requestUrl, cors);
      }
    }

    if (requestUrl.pathname === '/api/public/v1/profiles/search') {
      if (request.method !== 'GET') return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, { ...cors, Allow: 'GET' });
      try {
        return json(await searchPublicProfiles(requestUrl, env), 200, { ...cors, 'Cache-Control': 'public, max-age=30' });
      } catch (error) {
        return json({ error: 'Không thể tải hồ sơ công khai.' }, publicDirectoryErrorStatus(error), { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    const publicProfileMatch = requestUrl.pathname.match(/^\/api\/public\/v1\/profiles\/([^/]+)$/);
    if (publicProfileMatch) {
      if (request.method !== 'GET') return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, { ...cors, Allow: 'GET' });
      try {
        return json(await readPublicProfile(publicProfileMatch[1], env), 200, { ...cors, 'Cache-Control': 'public, max-age=60' });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Không thể tải hồ sơ công khai.' }, publicDirectoryErrorStatus(error), { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/public/v1/donations') {
      if (request.method !== 'GET') return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, { ...cors, Allow: 'GET' });
      try {
        return json(await readPublicDonations(env), 200, { ...cors, 'Cache-Control': 'public, max-age=60' });
      } catch (error) {
        return json({ error: 'Không thể tải danh sách ủng hộ.' }, publicDirectoryErrorStatus(error), { ...cors, 'Cache-Control': 'no-store' });
      }
    }

    if (requestUrl.pathname === '/api/public/v1/rankings/forecast') {
      if (request.method !== 'POST') {
        return json({ error: 'Chỉ hỗ trợ phương thức POST.' }, 405, {
          ...cors,
          Allow: 'POST, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }
      if (
        !String(request.headers.get('Content-Type') || '')
          .toLowerCase()
          .startsWith('application/json')
      ) {
        return json({ error: 'Content-Type phải là application/json.' }, 415, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      }

      try {
        const input = await readRankingForecastBody(request);
        return json(await forecastBenchmarkRankings(env, input), 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        return rankingErrorResponse(error, requestUrl, cors);
      }
    }

    if (requestUrl.pathname === '/api/user/v1/rankings/exact') {
      if (request.method !== 'GET') {
        return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, {
          ...cors,
          Allow: 'GET, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      try {
        const identity = await requireBetterAuthSession(request, env);
        const semester = parseRankingSemester(
          requestUrl.searchParams.get('semester')
        );
        return json(
          await readOwnBenchmarkRanking(env, identity.userId, semester),
          200,
          {
            ...cors,
            'Cache-Control': 'private, no-store',
          }
        );
      } catch (error) {
        return exactRankingErrorResponse(error, requestUrl, cors);
      }
    }

    const participationDetailMatch = requestUrl.pathname.match(
      /^\/api\/user\/v1\/event-participations\/([1-9]\d*)$/
    );
    if (participationDetailMatch) {
      if (request.method !== 'PUT' && request.method !== 'DELETE') {
        return json({ error: 'Chỉ hỗ trợ phương thức PUT hoặc DELETE.' }, 405, {
          ...cors,
          Allow: 'PUT, DELETE, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      try {
        const identity = await requireBetterAuthSession(request, env);
        const result = await mutateEventParticipation(
          env,
          identity.userId,
          participationDetailMatch[1],
          request.method === 'PUT'
        );
        return json(result, 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        return eventParticipationErrorResponse(error, requestUrl, cors);
      }
    }

    if (
      requestUrl.pathname === '/api/user/v1/event-participations'
    ) {
      if (request.method !== 'GET') {
        return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, {
          ...cors,
          Allow: 'GET, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      try {
        const identity = await requireBetterAuthSession(request, env);
        const requestedUserId = requestUrl.searchParams.get('userId');
        const targetUserId = requestedUserId
          ? parseParticipationUserId(requestedUserId)
          : identity.userId;
        if (targetUserId !== identity.userId && identity.role !== 'admin' && identity.role !== 'auditor') {
          throw new BetterAuthIdentityError(403, 'FORBIDDEN');
        }
        return json(
          await listEventParticipations(env, targetUserId),
          200,
          {
            ...cors,
            'Cache-Control': 'private, no-store',
          }
        );
      } catch (error) {
        return eventParticipationErrorResponse(error, requestUrl, cors);
      }
    }

    const scheduleWriteMode = readScheduleWriteMode(env);
    if (
      isScheduleMutationRequest(requestUrl.pathname, request.method) &&
      scheduleWriteMode !== 'legacy' && scheduleWriteMode !== 'd1'
    ) {
      return json(
        { error: 'Tính năng lưu lịch cá nhân tạm thời chưa khả dụng.' },
        503,
        {
          ...cors,
          'Cache-Control': 'no-store',
        }
      );
    }

    const userScheduleCourseMatch = requestUrl.pathname.match(
      /^\/api\/user\/v1\/schedules\/courses\/([0-9a-f-]+)$/i
    );
    if (userScheduleCourseMatch) {
      if (request.method !== 'PUT' && request.method !== 'DELETE') {
        return json({ error: 'Chỉ hỗ trợ phương thức PUT hoặc DELETE.' }, 405, {
          ...cors,
          Allow: 'PUT, DELETE, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      if (scheduleWriteMode === 'd1') {
        try {
          const identity = await requireBetterAuthSession(request, env);
          const action = request.method === 'PUT' ? 'add' : 'delete';
          const input = await parseD1ScheduleMutationRequest(
            request,
            action,
            userScheduleCourseMatch[1]
          );
          const result = await mutateD1UserScheduleCourse(
            env,
            identity.userId,
            input
          );
          return json(result, 200, {
            ...cors,
            'Cache-Control': 'no-store',
            ETag: `"${result.revision}"`,
          });
        } catch (error) {
          return userScheduleD1WriteErrorResponse(error, requestUrl, cors);
        }
      }

      try {
        const identity = await requireBetterAuthSession(request, env);
        const result =
          request.method === 'PUT'
            ? await addUserScheduleForBetterAuth(
              env,
              identity.userId,
              userScheduleCourseMatch[1],
              (await readUserScheduleBody(request)).semester
            )
            : await deleteUserScheduleForBetterAuth(
              env,
              identity.userId,
              userScheduleCourseMatch[1]
            );
        if (!result.mirrorSynced) {
          scheduleUserScheduleMirrorRepair(env, ctx);
        }
        return json(result, 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        return userScheduleErrorResponse(error, requestUrl, cors);
      }
    }

    const userScheduleEntryMatch = requestUrl.pathname.match(
      /^\/api\/user\/v1\/schedules\/entries\/([0-9a-f-]+)$/i
    );
    if (userScheduleEntryMatch) {
      if (request.method !== 'PATCH') {
        return json({ error: 'Chỉ hỗ trợ phương thức PATCH.' }, 405, {
          ...cors,
          Allow: 'PATCH, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      if (scheduleWriteMode === 'd1') {
        try {
          const identity = await requireBetterAuthSession(request, env);
          const input = await parseD1ScheduleUpdateRequest(
            request,
            userScheduleEntryMatch[1]
          );
          const result = await updateD1UserScheduleCustomData(
            env,
            identity.userId,
            input
          );
          return json(result, 200, {
            ...cors,
            'Cache-Control': 'no-store',
            ETag: `"${result.revision}"`,
          });
        } catch (error) {
          return userScheduleD1WriteErrorResponse(error, requestUrl, cors);
        }
      }

      try {
        const identity = await requireBetterAuthSession(request, env);
        const payload = await readUserScheduleBody(request);
        const result = await updateUserScheduleForBetterAuth(
          env,
          identity.userId,
          userScheduleEntryMatch[1],
          payload.customData
        );
        if (!result.mirrorSynced) {
          scheduleUserScheduleMirrorRepair(env, ctx);
        }
        return json(result, 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        return userScheduleErrorResponse(error, requestUrl, cors);
      }
    }

    if (requestUrl.pathname === '/api/user/v1/schedules/replace') {
      if (request.method !== 'PUT') {
        return json({ error: 'Chỉ hỗ trợ phương thức PUT.' }, 405, {
          ...cors,
          Allow: 'PUT, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      if (scheduleWriteMode === 'd1') {
        try {
          const identity = await requireBetterAuthSession(request, env);
          const input = await parseD1ScheduleReplaceRequest(request);
          const result = await replaceD1UserScheduleSemester(
            env,
            identity.userId,
            input
          );
          return json(result, 200, {
            ...cors,
            'Cache-Control': 'no-store',
            ETag: `"${result.revision}"`,
          });
        } catch (error) {
          return userScheduleD1WriteErrorResponse(error, requestUrl, cors);
        }
      }

      try {
        const identity = await requireBetterAuthSession(request, env);
        const payload = await readUserScheduleBody(request);
        const result = Array.isArray(payload.rows)
          ? await replaceUserScheduleImportForBetterAuth(
            env,
            identity.userId,
            payload.semester,
            payload.rows
          )
          : await replaceUserScheduleSemesterForBetterAuth(
            env,
            identity.userId,
            payload.semester,
            payload.courseIds
          );
        if (!result.mirrorSynced) {
          scheduleUserScheduleMirrorRepair(env, ctx);
        }
        return json(result, 200, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      } catch (error) {
        return userScheduleErrorResponse(error, requestUrl, cors);
      }
    }

    if (requestUrl.pathname === '/api/user/v1/schedules') {
      if (request.method !== 'GET') {
        return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, {
          ...cors,
          Allow: 'GET, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }

      try {
        const identity = await requireBetterAuthSession(request, env);
        return json(await listUserSchedules(env, identity.userId), 200, {
          ...cors,
          'Cache-Control': 'private, no-store',
        });
      } catch (error) {
        return userScheduleReadErrorResponse(error, requestUrl, cors);
      }
    }

    if (requestUrl.pathname === '/health') {
      if (request.method !== 'GET') {
        return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, {
          ...cors,
          Allow: 'GET, OPTIONS',
          'Cache-Control': 'no-store',
        });
      }
      return json({ ok: true }, 200, {
        ...cors,
        'Cache-Control': 'no-store',
      });
    }

    if (request.method !== 'GET') {
      return json({ error: 'Chỉ hỗ trợ phương thức GET.' }, 405, {
        ...cors,
        Allow: 'GET, OPTIONS',
      });
    }

    const isEventsPath =
      requestUrl.pathname === '/events' || requestUrl.pathname === '/api/events';
    const isCoursesPath =
      requestUrl.pathname === '/courses' || requestUrl.pathname === '/api/courses';
    const isLostFoundPath =
      requestUrl.pathname === '/lost-found' ||
      requestUrl.pathname === '/api/lost-found';

    if (!isEventsPath && !isCoursesPath && !isLostFoundPath) {
      return json({ error: 'Không tìm thấy endpoint.' }, 404, cors);
    }

    const bypassCache =
      requestUrl.searchParams.has('refresh') ||
      String(request.headers.get('Cache-Control') || '').includes('no-cache');
    const cached = bypassCache ? null : await readCachedResponse(request);
    if (cached) return cached;

    if (isCoursesPath) {
      try {
        const result = await handleCourses(requestUrl, env);
        const response = json(result.payload, result.status, {
          ...cors,
          'Cache-Control':
            result.status === 200
              ? `public, max-age=300, s-maxage=${COURSE_EDGE_TTL_SECONDS}, stale-while-revalidate=3600`
              : 'no-store',
        });
        if (result.status === 200 && !bypassCache) {
          storeCachedResponse(request, response, ctx);
        }
        return response;
      } catch (error) {
        console.error('course_query_failed', error);
        return json({ error: 'Không tải được danh sách môn.' }, 500, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      }
    }

    const resource = String(requestUrl.searchParams.get('resource') || '');
    const isLostFoundRequest =
      isLostFoundPath || (isEventsPath && resource === 'lost-found');
    if (isLostFoundRequest) {
      try {
        const payload = await handleLostFound(requestUrl, env);
        const response = json(payload, 200, {
          ...cors,
          'Cache-Control': bypassCache
            ? 'no-store'
            : `public, max-age=60, s-maxage=${LOST_FOUND_EDGE_TTL_SECONDS}, stale-while-revalidate=300`,
        });
        if (!bypassCache) storeCachedResponse(request, response, ctx);
        return response;
      } catch (error) {
        console.error('lost_found_query_failed', error);
        return json({ error: 'Không tải được danh sách tìm đồ.' }, 500, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      }
    }

    if (resource && resource !== 'announcements') {
      return json({ error: 'Resource không hợp lệ.' }, 400, cors);
    }

    if (!resource) {
      try {
        const payload = await handleEvents(requestUrl, env);
        const response = json(payload, 200, {
          ...cors,
          'Cache-Control': bypassCache
            ? 'no-store'
            : `public, max-age=60, s-maxage=${EVENT_EDGE_TTL_SECONDS}, stale-while-revalidate=900`,
        });
        if (!bypassCache) storeCachedResponse(request, response, ctx);
        return response;
      } catch (error) {
        console.error('event_query_failed', error);
        return json({ error: 'Không tải được dữ liệu sự kiện.' }, 500, {
          ...cors,
          'Cache-Control': 'no-store',
        });
      }
    }

    try {
      const payload = await handleAnnouncements(requestUrl, env);
      const response = json(payload, 200, {
        ...cors,
        'Cache-Control': bypassCache
          ? 'no-store'
          : `public, max-age=60, s-maxage=${ANNOUNCEMENT_EDGE_TTL_SECONDS}, stale-while-revalidate=900`,
      });
      if (!bypassCache) storeCachedResponse(request, response, ctx);
      return response;
    } catch (error) {
      console.error('announcement_query_failed', error);
      return json({ error: 'Không tải được thông báo trường.' }, 500, {
        ...cors,
        'Cache-Control': 'no-store',
      });
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: WorkerEnv,
    ctx: ExecutionContext
  ) {
    const hourlyCron = controller.cron === '17 * * * *';
    const notificationControlCron = controller.cron === '* * * * *';
    const announcementCron = controller.cron === '*/15 * * * *';
    const pushQueueCron = controller.cron === '7-59/15 * * * *';
    const eventCron = controller.cron === '*/10 * * * *';
    const adminEventCron = controller.cron === '37 19 * * *';
    const lostFoundCron = controller.cron === '*/5 * * * *';
    const runAll =
      !hourlyCron && !notificationControlCron && !announcementCron && !pushQueueCron && controller.cron !== '0 * * * *' && !eventCron && !adminEventCron && !lostFoundCron;
    const reconcileCourseDeletes =
      (hourlyCron || runAll) &&
      new Date(controller.scheduledTime).getUTCHours() === 20;
    const jobs: Array<{ failureEvent: string; promise: Promise<unknown> }> = [];

    if (hourlyCron || runAll) {
      if (allowsSupabaseCourseSync(env)) {
        jobs.push({
          failureEvent: 'course_sync_failed',
          promise: syncCourseSchedules(env, reconcileCourseDeletes).then((summary) =>
            console.log('course_sync_complete', summary)
          ),
        });
      }
    }

    const notificationMode = String(env.NOTIFICATION_JOBS_MODE || 'disabled');
    if ((notificationControlCron || runAll) && notificationMode === 'suppress_backlog') {
      jobs.push({
        failureEvent: 'notification_backlog_suppression_failed',
        promise: runNotificationQueueControl(env, 'suppress_backlog').then((summary) =>
          console.log('notification_backlog_suppression_complete', summary)
        ),
      });
    }
    if ((notificationControlCron || runAll) && notificationMode === 'test') {
      jobs.push({
        failureEvent: 'notification_job_test_failed',
        promise: runNotificationQueueControl(env, 'dry_run')
          .then((summary) => console.log('notification_job_test_complete', summary)),
      });
    }
    if ((announcementCron || runAll) && notificationMode === 'enabled' && env.NOTIFICATION_JOBS_ENABLED === 'true') {
      jobs.push({
        failureEvent: 'announcement_crawl_enqueue_failed',
        promise: Promise.all(ANNOUNCEMENT_SOURCES.map(([sourceId]) =>
          env.ANNOUNCEMENT_CRAWLER_WORKFLOW.create({
            params: { sourceId, scheduledAt: controller.scheduledTime },
          }).then((instance) => console.log('announcement_crawl_enqueued', { sourceId, instanceId: instance.id }))
        )),
      });
    }
    if ((pushQueueCron || runAll) && notificationMode === 'enabled' && env.NOTIFICATION_JOBS_ENABLED === 'true') {
      jobs.push({
        failureEvent: 'push_queue_process_failed',
        promise: runNotificationQueueControl(env, 'process').then((summary) =>
          console.log('push_queue_process_complete', { processed: true, summary })
        ),
      });
    }
    if (eventCron || runAll) {
      jobs.push({
        failureEvent: 'event_push_failed',
        promise: notificationMode !== 'enabled' || env.NOTIFICATION_JOBS_ENABLED !== 'true'
          ? Promise.resolve({ state: 'disabled' })
          : runEventPush(env).then((push) => {
            console.log('event_push_complete', {
              state: push.state,
              queued: push.queued,
              sent: push.sent,
            });
            return push;
          }),
      });
    }

    if (adminEventCron || runAll) {
      jobs.push(
        {
          failureEvent: 'admin_event_mutation_cleanup_failed',
          promise: cleanupAdminEventMutations(env).then((deleted) =>
            console.log('admin_event_mutation_cleanup_complete', { deleted })
          ),
        }
      );
      if (allowsSupabaseUserScheduleSync(env)) {
        jobs.push({
          failureEvent: 'user_schedule_sync_failed',
          promise: syncUserSchedules(env).then((summary) =>
            console.log('user_schedule_sync_complete', summary)
          ),
        });
      }
    }

    if (lostFoundCron || runAll) {
      jobs.push({
        failureEvent: 'lost_found_sync_failed',
        promise: syncPublicLostFound(env).then((summary) =>
          console.log('lost_found_sync_complete', summary)
        ),
      });
    }

    ctx.waitUntil(
      Promise.allSettled(jobs.map(({ promise }) => promise)).then((results) => {
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(jobs[index].failureEvent, result.reason);
          }
        });
      })
    );
  },
} satisfies ExportedHandler<WorkerEnv>;

export default worker;
