import { privateApiRequest } from './privateApi';

export type CourseAuthorityCourse = Record<string, unknown>;

export type CourseAuthorityRequest = {
  id: string;
  course_code: string;
  subject_name: string;
  semester?: string | null;
  instructor?: string | null;
  request_note?: string | null;
  status?: string;
  revision: number;
  created_at?: string;
};

const mutationKey = (scope: string) => `${scope}:${crypto.randomUUID()}`;

const json = async <T>(path: string, init: RequestInit) => {
  const response = await privateApiRequest(path, init);
  return response.json() as Promise<T>;
};

export const createD1Course = (course: CourseAuthorityCourse) =>
  json<{ id: string; revision: number }>('/api/private/v1/courses', {
    method: 'POST',
    headers: { 'Idempotency-Key': mutationKey('course-create') },
    body: JSON.stringify(course),
  });

export const updateD1Course = (id: string, revision: number, course: CourseAuthorityCourse) =>
  json<{ id: string; revision: number }>(`/api/private/v1/courses/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${revision}"`, 'Idempotency-Key': mutationKey('course-update') },
    body: JSON.stringify(course),
  });

export const retireD1Course = (id: string, revision: number) =>
  json<{ id: string; revision: number }>(`/api/private/v1/courses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'If-Match': `"${revision}"`, 'Idempotency-Key': mutationKey('course-retire') },
  });

export const createD1CourseRequest = (input: {
  courseCode: string;
  subjectName: string;
  semester?: string;
  instructor?: string;
  note?: string;
}) => json<{ id: string; revision: number }>('/api/private/v1/course-requests', {
  method: 'POST',
  headers: { 'Idempotency-Key': mutationKey('course-request-create') },
  body: JSON.stringify(input),
});

export const listD1CourseRequestsForReview = () =>
  json<{ data: CourseAuthorityRequest[] }>('/api/private/v1/course-requests/review', { method: 'GET' });

export const approveD1CourseRequest = (id: string, revision: number, course: CourseAuthorityCourse) =>
  json<{ id: string; revision: number }>(`/api/private/v1/course-requests/${encodeURIComponent(id)}/approve`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${revision}"`, 'Idempotency-Key': mutationKey('course-request-approve') },
    body: JSON.stringify(course),
  });

export const rejectD1CourseRequest = (id: string, revision: number) =>
  json<{ id: string; revision: number }>(`/api/private/v1/course-requests/${encodeURIComponent(id)}/reject`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${revision}"`, 'Idempotency-Key': mutationKey('course-request-reject') },
    body: JSON.stringify({}),
  });
