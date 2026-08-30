import { createD1CourseRequest } from './courseAuthorityApi';

export interface MatchingSystemCourse {
  id: string;
  course_code: string;
  subject_name: string;
  semester?: string;
  instructor?: string;
  [key: string]: unknown;
}

interface SubmitManualCourseRequestInput {
  subjectName: string;
  courseCode: string;
  instructor?: string;
  semester?: string;
}

export type ManualCourseRequestResult =
  | { duplicateCourse: MatchingSystemCourse; requestId?: never }
  | { requestId: string; duplicateCourse?: never };

export const submitManualCourseRequest = async ({
  subjectName,
  courseCode,
  instructor,
  semester,
}: SubmitManualCourseRequestInput): Promise<ManualCourseRequestResult> => {
  const payload = await createD1CourseRequest({
    subjectName: subjectName.trim(),
    courseCode: courseCode.trim(),
    instructor: instructor?.trim() || 'Chưa rõ',
    semester,
  });
  return { requestId: String(payload.id || '') };
};
