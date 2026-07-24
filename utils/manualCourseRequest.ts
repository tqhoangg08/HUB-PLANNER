import { apiHeaders, apiUrl } from './api';

export interface MatchingSystemCourse {
  id: string;
  course_code: string;
  subject_name: string;
  semester?: string;
  instructor?: string;
  [key: string]: unknown;
}

interface SubmitManualCourseRequestInput {
  accessToken: string;
  subjectName: string;
  courseCode: string;
  instructor?: string;
  semester?: string;
}

export type ManualCourseRequestResult =
  | { duplicateCourse: MatchingSystemCourse; requestId?: never }
  | { requestId: string; duplicateCourse?: never };

export const submitManualCourseRequest = async ({
  accessToken,
  subjectName,
  courseCode,
  instructor,
  semester,
}: SubmitManualCourseRequestInput): Promise<ManualCourseRequestResult> => {
  const response = await fetch(apiUrl('/courses?resource=manual-course-request'), {
    method: 'POST',
    headers: apiHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify({
      subject_name: subjectName.trim(),
      course_code: courseCode.trim(),
      instructor: instructor?.trim() || 'Chưa rõ',
      semester,
    }),
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 409 && payload?.code === 'COURSE_ALREADY_EXISTS' && payload?.data?.id) {
    return { duplicateCourse: payload.data as MatchingSystemCourse };
  }

  if (!response.ok) {
    throw new Error(payload?.error || 'Không thể gửi yêu cầu thêm môn.');
  }

  return { requestId: String(payload?.data?.id || '') };
};
