import { ScholarshipApiError, type AdminCampaign } from './scholarshipApi.ts';

export const adminPageSize = 20;
export const canEditCampaign = (campaign: AdminCampaign | null) => campaign?.status === 'draft';
export function campaignFormError(fields: {title: string; schoolYear: string; semester: string}, slug?: string): string | null {
  if (slug !== undefined && !/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return 'Mã chiến dịch gồm 1–64 chữ thường, số hoặc dấu gạch ngang.';
  for (const [key, label, max] of [['title', 'Tiêu đề', 240], ['schoolYear', 'Năm học', 80], ['semester', 'Học kỳ', 80]] as const) {
    const value = fields[key];
    if (!value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return `${label} cần có từ 1 đến ${max} ký tự hợp lệ.`;
  }
  return null;
}
export function adminError(error: unknown): string {
  return error instanceof ScholarshipApiError ? error.message : 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.';
}
export function checkedAdminPage<T extends {total: number; page: number; limit: number}>(data: T, page: number): T {
  if (!Number.isSafeInteger(data.total) || data.total < 0 || data.page !== page || data.limit !== adminPageSize)
    throw new ScholarshipApiError(503, 'Phản hồi phân trang không hợp lệ. Vui lòng thử lại.');
  return data;
}
