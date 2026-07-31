export type RankingsBackendMode = 'supabase' | 'shadow' | 'cloudflare';

export interface CloudflareRankingForecastRow {
  semester: string;
  rank: number;
  totalStudents: number;
  rankInMajor: number | null;
  totalInMajor: number | null;
  major: string | null;
}

export interface CloudflareOwnRanking {
  studentRank: number | null;
  totalStudents: number;
  rankInClass: number | null;
  totalInClass: number | null;
  classCode: string | null;
  rankInMajor: number | null;
  totalInMajor: number | null;
  major: string | null;
}

const DEFAULT_CLOUDFLARE_PUBLIC_API =
  'https://hub-planner-public-dev-api.tqhoangg2.workers.dev';
const REQUEST_TIMEOUT_MS = 6_000;

const normalizeMode = (value: unknown): RankingsBackendMode => {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'shadow' || mode === 'cloudflare') return mode;
  return 'supabase';
};

export const RANKINGS_BACKEND_MODE = normalizeMode(
  import.meta.env?.VITE_RANKINGS_BACKEND
);

const cloudflareBase = String(
  import.meta.env?.VITE_CLOUDFLARE_PUBLIC_API_BASE_URL ||
    DEFAULT_CLOUDFLARE_PUBLIC_API
).replace(/\/$/, '');

const readError = async (response: Response) => {
  try {
    const payload = await response.json();
    if (typeof payload?.error === 'string') return payload.error;
  } catch {
    // Use the safe fallback below for non-JSON responses.
  }
  return response.status === 401
    ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
    : 'Không thể tải dữ liệu xếp hạng từ Cloudflare.';
};

const cloudflareRequest = async (
  path: string,
  init: RequestInit = {},
  authenticated = false
) => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort('ranking-timeout'),
    REQUEST_TIMEOUT_MS
  );
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');

  if (authenticated) {
    const { supabase } = await import('./supabase');
    const { data, error } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (error || !accessToken) {
      globalThis.clearTimeout(timeout);
      throw new Error(
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
      );
    }
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  if (init.body) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(`${cloudflareBase}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await readError(response));
    return response;
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') throw error;
    throw new Error(
      'Cloudflare phản hồi quá chậm. Vui lòng kiểm tra mạng và thử lại.'
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

export const fetchCloudflareRankingSemesters = async () => {
  const response = await cloudflareRequest(
    '/api/public/v1/rankings/semesters'
  );
  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error('Cloudflare trả về danh sách học kỳ không hợp lệ.');
  }
  return payload.data as Array<{
    semester: string;
    totalStudents: number;
  }>;
};

export const forecastCloudflareRankings = async (input: {
  semesters: string[];
  gpa: number;
  credits: number;
  trainingScore: number;
  major?: string | null;
}) => {
  const response = await cloudflareRequest(
    '/api/public/v1/rankings/forecast',
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  );
  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload.data)) {
    throw new Error('Cloudflare trả về kết quả xếp hạng không hợp lệ.');
  }
  return payload.data as CloudflareRankingForecastRow[];
};

export const fetchCloudflareOwnRanking = async (
  semester: string
): Promise<CloudflareOwnRanking | null> => {
  const response = await cloudflareRequest(
    `/api/user/v1/rankings/exact?semester=${encodeURIComponent(semester)}`,
    {},
    true
  );
  const payload = await response.json();
  if (!payload?.success) {
    throw new Error('Cloudflare trả về xếp hạng cá nhân không hợp lệ.');
  }
  return (payload.data || null) as CloudflareOwnRanking | null;
};
