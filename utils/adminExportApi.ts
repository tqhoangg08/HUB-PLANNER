import { privateApiRequest } from './privateApi';

const PATH = '/api/private/v1/admin/export';
const request = async <T>(payload: Record<string, unknown>) => {
  const response = await privateApiRequest(PATH, { method: 'POST', body: JSON.stringify(payload) });
  return response.json() as Promise<T>;
};

export const requestAdminExcelOtp = () => request<{ success: boolean; expires_in_seconds: number; retry_after_seconds: number }>({ action: 'request-otp' });
export const verifyAdminExcelOtp = (otp: string) => request<{ success: boolean; verified: boolean }>({ action: 'verify-otp', otp });
export const fetchAdminExcelExportRows = (otp: string) => request<{ success: boolean; rows: any[] }>({ action: 'excel', otp });
