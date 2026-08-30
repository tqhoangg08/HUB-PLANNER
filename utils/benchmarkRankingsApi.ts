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

const REQUEST_TIMEOUT_MS = 6_000;

const readError = async (response: Response) => {
  if (response.status === 401) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  }
  if (response.status === 403) return 'Bạn không có quyền xem dữ liệu này.';
  if (response.status === 503) {
    return 'Dịch vụ xếp hạng tạm thời chưa khả dụng. Vui lòng thử lại sau.';
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    try {
      const payload = await response.json();
      if (typeof payload?.error === 'string' && payload.error.length <= 240) {
        return payload.error;
      }
    } catch {
      // Keep the generic fallback for invalid client-error bodies.
    }
  }
  return 'Không thể tải dữ liệu xếp hạng từ Cloudflare.';
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

  if (init.body) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(path, {
      ...init,
      headers,
      cache: 'no-store',
      credentials: authenticated ? 'include' : 'omit',
      redirect: 'manual',
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
