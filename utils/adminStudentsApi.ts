import { privateApiRequest } from './privateApi';

export type AdminStudent = {
  student_code: string | null;
  full_name: string | null;
  class_name: string | null;
  cohort: string | null;
  program_name: string | null;
  major_name: string | null;
  specialization_name: string | null;
  gender: null;
  birth_date: null;
  phone_masked: null;
  email_masked: string | null;
  status: 'onboarded' | 'pending';
  last_active_at: string | null;
};

export type AdminStudentPage = { success: true; data: AdminStudent[]; next_cursor: string | null; has_more: boolean };
export type AdminStudentFilters = { q?: string; className?: string; major?: string; status?: string; start?: string; end?: string };
export type AdminStudentCreateInput = { studentCode: string; fullName: string; className?: string; cohort?: string; programName?: string; majorName?: string; specializationName?: string };

const query = (filters: AdminStudentFilters, limit: number, cursor: string | null) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (filters.q) params.set('q', filters.q);
  if (filters.className) params.set('class', filters.className);
  if (filters.major) params.set('major', filters.major);
  if (filters.status) params.set('status', filters.status);
  if (filters.start) params.set('start', filters.start);
  if (filters.end) params.set('end', filters.end);
  if (cursor) params.set('cursor', cursor);
  return params;
};

export const fetchAdminStudents = async (filters: AdminStudentFilters, limit: number, cursor: string | null) => {
  const response = await privateApiRequest(`/api/admin/students?${query(filters, limit, cursor)}`);
  return response.json() as Promise<AdminStudentPage>;
};

export const updateAdminStudent = async (studentCode: string, patch: Record<string, string>) => {
  const response = await privateApiRequest(`/api/admin/students/${encodeURIComponent(studentCode)}`, {
    method: 'PATCH', headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(patch),
  });
  return response.json() as Promise<{ success: boolean; unchanged?: boolean }>;
};

export const createAdminStudent = async (input: AdminStudentCreateInput, idempotencyKey: string) => {
  const response = await privateApiRequest('/api/admin/students', {
    method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input),
  });
  return response.json() as Promise<{ success: boolean; invited: boolean; student: AdminStudent }>;
};

export const deleteAdminStudent = async (studentCode: string, idempotencyKey: string) => {
  const response = await privateApiRequest(`/api/admin/students/${encodeURIComponent(studentCode)}`, {
    method: 'DELETE', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({}),
  });
  return response.json() as Promise<{ success: boolean; deleted: boolean }>;
};
