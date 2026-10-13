/**
 * HUB Scholarship — Client API & Types (v1.0.0)
 * Compliant with docs/hub-scholarship-api-contract.md
 */

// ============================================================================
// Public & Core Scholarship Types
// ============================================================================

export interface ScoreColumn {
  key: string;
  label: string;
}

export const formatScoreValue = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return String(value);
};

export interface Campaign {
  slug: string;
  title: string;
  schoolYear: string;
  semester: string;
  sourceTitle: string;
  sourceUrl: string | null;
  sourceDocument: string;
  sourceSha256: string;
  publishedAt: string;
  approvedFields: string[];
  scoreColumns: ScoreColumn[];
}

export interface Recipient {
  id: number;
  fullName: string;
  studentCode: string;
  awardType: string;
  className: string | null;
  major: string | null;
  scores: Record<string, number | string | null>;
  gpa: number | string | null;
  trainingScore: number | string | null;
  selectionScore: number | string | null;
}

export interface CampaignSummary {
  campaign: Campaign;
  totalRecipients: number;
  totalStudents: number;
  awards: Array<{ awardType: string; count: number }>;
}

export interface PaginatedCampaigns {
  campaigns: Campaign[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedRecipients {
  campaign: Campaign;
  recipients: Recipient[];
  total: number;
  page: number;
  limit: number;
}

export interface OwnAward extends Recipient {
  campaignSlug: string;
  campaignTitle: string;
  schoolYear: string;
  semester: string;
}

export interface MyScholarshipsResponse {
  verified: boolean;
  awards: OwnAward[];
}

// ============================================================================
// Admin Types
// ============================================================================

export interface AdminCampaign {
  slug: string;
  title: string;
  schoolYear: string;
  semester: string;
  status: 'draft' | 'validated' | 'approved' | 'published' | 'archived' | string;
  revision: number;
  candidateBatchId: string | null;
  activeBatchId: string | null;
}

export interface PaginatedAdminCampaigns {
  campaigns: AdminCampaign[];
  total: number;
  page: number;
  limit: number;
}

export interface Receipt {
  batchId: string;
  campaignSlug: string;
  status: 'previewed' | 'applied' | 'rejected';
  sourceSha256: string;
  payloadSha256: string;
  expectedRows: number;
  acceptedRows: number;
  rejectedRows: number;
}

export interface ImportPreviewSuccess {
  valid: true;
  receipt: Receipt;
  idempotent: boolean;
  revision: number;
}

export interface ImportPreviewFailure {
  valid: false;
  receipt: Receipt;
  expectedRows: number;
  acceptedRows: number;
  rejectedRows: number;
  errors: Array<{ sourceRowNumber: number; field: string; code: string }>;
  idempotent: boolean;
}

export type ImportPreviewResponse = ImportPreviewSuccess | ImportPreviewFailure;

export interface OfficialSource {
  title: string;
  url: string | null;
  reference: string;
}

export interface ImportMetadata extends Receipt {
  sourceFilename: string;
  mapping: ImportMapping;
  approvedFields: string[] | null;
  officialSource: OfficialSource | null;
  actorUserId: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface PaginatedImports {
  imports: ImportMetadata[];
  total: number;
  page: number;
  limit: number;
}

export interface PrivateSnapshotRow {
  id: number;
  sourceRowNumber: number;
  sourceIdentifier: string | null;
  studentCode: string;
  fullName: string;
  className: string | null;
  major: string | null;
  awardType: string;
  scores: Record<string, string | number | null>;
  rowSha256: string;
}

export interface PaginatedImportRows {
  receipt: Receipt;
  mapping: ImportMapping;
  rows: PrivateSnapshotRow[];
  total: number;
  page: number;
  limit: number;
}

export interface ImportMapping {
  studentCode: string; fullName: string; awardType: string;
  className?: string; major?: string; sourceIdentifier?: string;
  scores: { key: string; column: string; label: string }[];
}

export interface AuditEvent {
  id: number;
  campaignSlug: string;
  batchId: string | null;
  action: string;
  actorUserId: string;
  sourceSha256: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface PaginatedAuditEvents {
  audit: AuditEvent[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// API Error Handling
// ============================================================================

export class ScholarshipApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfter?: number;

  constructor(status: number, message: string, code?: string, retryAfter?: number) {
    super(message);
    this.name = 'ScholarshipApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const parseErrorResponse = async (response: Response): Promise<ScholarshipApiError> => {
  let message = `Lỗi hệ thống (${response.status})`;
  let code: string | undefined;

  try {
    const data = await response.json();
    if (data && typeof data === 'object') {
      if ('error' in data && typeof data.error === 'string') {
        code = data.error;
        message = mapScholarshipErrorCode(data.error, response.status);
      }
    }
  } catch {
    // If not JSON, use HTTP status text
    if (response.status === 429) {
      message = 'Đã vượt quá giới hạn tra cứu (60 yêu cầu/phút). Vui lòng thử lại sau 60 giây.';
    } else if (response.status === 401) {
      message = 'Phiên làm việc đã hết hạn hoặc chưa đăng nhập.';
    } else if (response.status === 403) {
      message = 'Bạn không có quyền thực hiện thao tác này.';
    } else if (response.status === 404) {
      message = 'Không tìm thấy dữ liệu hoặc đợt học bổng chưa được công bố.';
    } else if (response.status === 409) {
      message = 'Dữ liệu đã bị thay đổi bởi thao tác khác (xung đột phiên bản). Vui lòng làm mới trang.';
    }
  }

  const retryHeader = response.headers.get('retry-after');
  const retryAfter = retryHeader ? parseInt(retryHeader, 10) : undefined;

  return new ScholarshipApiError(response.status, message, code, retryAfter);
};

export const mapScholarshipErrorCode = (code: string, status: number): string => {
  const map: Record<string, string> = {
    CAMPAIGN_NOT_FOUND: 'Không tìm thấy chiến dịch học bổng.',
    BATCH_NOT_FOUND: 'Không tìm thấy đợt dữ liệu (batch).',
    REVISION_OR_STATE_CONFLICT: 'Xung đột phiên bản dữ liệu. Vui lòng làm mới và thử lại.',
    DUPLICATE_CAMPAIGN: 'Mã định danh chiến dịch (slug) đã tồn tại.',
    INVALID_JSON: 'Định dạng dữ liệu JSON không hợp lệ.',
    BODY_TOO_LARGE: 'Kích thước tệp vượt quá giới hạn cho phép (1 MB).',
    JSON_REQUIRED: 'Yêu cầu định dạng application/json.',
    EXPECTED_REVISION_REQUIRED: 'Thiếu thông tin phiên bản kiểm soát (revision).',
    OFFICIAL_SOURCE_REQUIRED: 'Vui lòng cung cấp đầy đủ thông tin nguồn văn bản quyết định chính thức.',
    INVALID_SOURCE_URL: 'Đường dẫn nguồn phải là URL HTTPS hợp lệ.',
    INVALID_BATCH_ID: 'Mã đợt dữ liệu không hợp lệ.',
    INVALID_SOURCE_CHECKSUM: 'Mã băm SHA-256 của tệp nguồn không khớp.',
    METHOD_NOT_ALLOWED: 'Phương thức HTTP không được hỗ trợ.',
    ENDPOINT_NOT_FOUND: 'Không tìm thấy đường dẫn API.',
    FORBIDDEN: 'Bạn không có quyền quản trị học bổng.',
    UNAUTHORIZED: 'Vui lòng đăng nhập để tiếp tục.',
    SCHOLARSHIP_DATABASE_UNAVAILABLE: 'Hệ thống cơ sở dữ liệu học bổng tạm thời không sẵn sàng.',
  };

  if (map[code]) return map[code];
  if (status === 429) return 'Đã vượt quá giới hạn tra cứu (60 yêu cầu/phút). Vui lòng thử lại sau 60 giây.';
  return code || `Yêu cầu thất bại (${status})`;
};

// ============================================================================
// Public APIs
// ============================================================================

export const fetchPublicCampaigns = async (
  options?: { page?: number; limit?: number; schoolYear?: string; semester?: string },
  signal?: AbortSignal,
): Promise<PaginatedCampaigns> => {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.schoolYear) params.set('schoolYear', options.schoolYear);
  if (options?.semester) params.set('semester', options.semester);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/public/v1/scholarships/campaigns${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const fetchAllPublicCampaigns = async (signal?: AbortSignal): Promise<Campaign[]> => {
  const campaigns: Campaign[] = [];
  let page = 1;
  while (true) {
    const result = await fetchPublicCampaigns({ page, limit: 50 }, signal);
    campaigns.push(...result.campaigns);
    if (page * result.limit >= result.total) return campaigns;
    if (!result.campaigns.length || page >= 10000) throw new Error('Incomplete campaign pagination');
    page++;
  }
};

export const fetchCampaignSummary = async (
  slug: string,
  signal?: AbortSignal,
): Promise<CampaignSummary> => {
  const response = await fetch(`/api/public/v1/scholarships/${encodeURIComponent(slug)}/summary`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const fetchCampaignRecipients = async (
  slug: string,
  options?: { page?: number; limit?: number; awardType?: string; q?: string },
  signal?: AbortSignal,
): Promise<PaginatedRecipients> => {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.awardType) params.set('awardType', options.awardType);
  if (options?.q) params.set('q', options.q);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/public/v1/scholarships/${encodeURIComponent(slug)}/recipients${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const searchCampaignRecipients = async (
  slug: string,
  options: { q: string; page?: number; limit?: number; awardType?: string },
  signal?: AbortSignal,
): Promise<PaginatedRecipients> => {
  const params = new URLSearchParams();
  params.set('q', options.q);
  if (options.page) params.set('page', String(options.page));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.awardType) params.set('awardType', options.awardType);

  const response = await fetch(`/api/public/v1/scholarships/${encodeURIComponent(slug)}/search?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

// ============================================================================
// Verified Personal Awards API (Own Awards)
// ============================================================================

export const fetchMyScholarships = async (signal?: AbortSignal): Promise<MyScholarshipsResponse> => {
  const response = await fetch('/api/me/scholarships', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

// ============================================================================
// Admin APIs
// ============================================================================

export const fetchAdminCampaigns = async (
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<PaginatedAdminCampaigns> => {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/admin/v1/scholarships/campaigns${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const createAdminCampaign = async (
  data: { slug: string; title: string; schoolYear: string; semester: string },
  signal?: AbortSignal,
): Promise<{ campaign: AdminCampaign }> => {
  const response = await fetch('/api/admin/v1/scholarships/campaigns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const fetchAdminCampaign = async (
  slug: string,
  signal?: AbortSignal,
): Promise<{ campaign: AdminCampaign }> => {
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const updateAdminCampaign = async (
  slug: string,
  data: { expectedRevision: number; title?: string; schoolYear?: string; semester?: string },
  signal?: AbortSignal,
): Promise<{ campaign: AdminCampaign }> => {
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const fetchAdminImports = async (
  slug: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<PaginatedImports> => {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}/imports${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const fetchAdminImportRows = async (
  slug: string,
  batchId: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<PaginatedImportRows> => {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}/imports/${encodeURIComponent(batchId)}/rows${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const fetchAdminAudit = async (
  slug: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<PaginatedAuditEvents> => {
  const params = new URLSearchParams();
  if (options?.page) params.set('page', String(options.page));
  if (options?.limit) params.set('limit', String(options.limit));

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}/audit${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const previewAdminImport = async (
  slug: string,
  payload: {
    sourceSha256: string;
    sourceFilename: string;
    mapping: any;
    rows: Array<{ sourceRowNumber: number; values: Record<string, string | number | null> }>;
  },
  signal?: AbortSignal,
): Promise<ImportPreviewResponse> => {
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}/imports/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const applyAdminImport = async (
  slug: string,
  data: { expectedRevision: number; batchId: string },
  signal?: AbortSignal,
): Promise<{ campaign: AdminCampaign; receipt: Receipt; idempotent: boolean }> => {
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}/imports/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const approveAdminCampaign = async (
  slug: string,
  data: {
    expectedRevision: number;
    batchId: string;
    sourceSha256: string;
    officialSource: OfficialSource;
    approvedFields: string[];
    republicationConfirmed: true;
  },
  signal?: AbortSignal,
): Promise<{ campaign: AdminCampaign }> => {
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const publishAdminCampaign = async (
  slug: string,
  data: { expectedRevision: number; batchId: string },
  signal?: AbortSignal,
): Promise<{ campaign: AdminCampaign }> => {
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const unpublishAdminCampaign = async (
  slug: string,
  data: { expectedRevision: number },
  signal?: AbortSignal,
): Promise<{ campaign: AdminCampaign }> => {
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}/unpublish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const rollbackAdminCampaign = async (
  slug: string,
  data: { expectedRevision: number; batchId: string },
  signal?: AbortSignal,
): Promise<{ campaign: AdminCampaign }> => {
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}/rollback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};

export const archiveAdminCampaign = async (
  slug: string,
  data: { expectedRevision: number },
  signal?: AbortSignal,
): Promise<{ campaign: AdminCampaign }> => {
  const response = await fetch(`/api/admin/v1/scholarships/campaigns/${encodeURIComponent(slug)}/archive`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
    signal,
  });

  if (!response.ok) throw await parseErrorResponse(response);
  return response.json();
};
