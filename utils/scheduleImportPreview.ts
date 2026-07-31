import { supabase } from './supabase';
import { resolveImportedScheduleMetadata } from './scheduleImportUtils';
import { replaceCloudflareUserScheduleSemester } from './userSchedulesApi';

export interface ScheduleImportCourse {
  id?: string;
  course_code: string;
  subject_name: string;
  credits?: number;
  instructor?: string;
  day_of_week?: string;
  shift?: string;
  room?: string;
  campus?: string;
  weeks?: string;
  semester?: string;
  phase?: string;
  is_user_added?: boolean;
  [key: string]: unknown;
}

export interface ScheduleImportPreviewRow {
  previewId: string;
  semester: string;
  isSystemCourse: boolean;
  systemCourseId?: string;
  course: ScheduleImportCourse;
}

export const normalizeComparableCourseCode = (value = '') => {
  const tokens = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .split('_')
    .filter(Boolean);

  let semesterIndex = -1;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (/^\d{2}[123](?:1)?$/.test(tokens[index])) {
      semesterIndex = index;
      break;
    }
  }

  if (semesterIndex < 0) return tokens.join('_');
  tokens[semesterIndex] = tokens[semesterIndex].slice(0, 3);
  if (tokens[semesterIndex + 1] === '1') tokens.splice(semesterIndex + 1, 1);
  return tokens.join('_');
};

const buildEquivalentCourseCodes = (value = '') => {
  const canonical = normalizeComparableCourseCode(value);
  const tokens = canonical.split('_').filter(Boolean);
  let semesterIndex = -1;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (/^\d{2}[123]$/.test(tokens[index])) {
      semesterIndex = index;
      break;
    }
  }
  if (semesterIndex < 0) return canonical ? [canonical] : [];

  const withStandalonePhase = [...tokens];
  withStandalonePhase.splice(semesterIndex + 1, 0, '1');
  const withCompactSemester = [...tokens];
  withCompactSemester[semesterIndex] = `${withCompactSemester[semesterIndex]}1`;
  const withCompactSemesterAndPhase = [...withCompactSemester];
  withCompactSemesterAndPhase.splice(semesterIndex + 1, 0, '1');

  return [...new Set([
    canonical,
    withStandalonePhase.join('_'),
    withCompactSemester.join('_'),
    withCompactSemesterAndPhase.join('_'),
  ])];
};

const chooseOfficialCourse = (courses: ScheduleImportCourse[]) => (
  courses.find(course => course.is_user_added !== true)
);

export const buildScheduleImportPreview = async (
  importedCourses: ScheduleImportCourse[],
  semester: string,
): Promise<ScheduleImportPreviewRow[]> => {
  const canonicalCodes = [...new Set(
    importedCourses.map(course => normalizeComparableCourseCode(course.course_code)).filter(Boolean),
  )];
  const equivalentCodes = [...new Set(importedCourses.flatMap(course => buildEquivalentCourseCodes(course.course_code)))];
  const candidatesByCode = new Map<string, ScheduleImportCourse[]>();

  if (equivalentCodes.length > 0) {
    const filters = equivalentCodes.map(courseCode => `course_code.ilike.${courseCode}`).join(',');
    const { data, error } = await supabase
      .from('course_schedules')
      .select('*')
      .eq('semester', semester)
      .or(filters)
      .limit(1000);

    if (error) throw error;
    for (const course of (data || []) as ScheduleImportCourse[]) {
      const canonical = normalizeComparableCourseCode(course.course_code);
      if (!canonicalCodes.includes(canonical)) continue;
      const matches = candidatesByCode.get(canonical) || [];
      matches.push(course);
      candidatesByCode.set(canonical, matches);
    }
  }

  return importedCourses.map((importedCourse, index) => {
    const cleanCode = String(importedCourse.course_code || '').replace(/\s+/g, '_');
    const canonical = normalizeComparableCourseCode(cleanCode);
    const systemCourse = chooseOfficialCourse(candidatesByCode.get(canonical) || []);

    if (systemCourse?.id) {
      return {
        previewId: `system-${systemCourse.id}-${index}`,
        semester,
        isSystemCourse: true,
        systemCourseId: systemCourse.id,
        course: {
          ...systemCourse,
          semester,
        },
      };
    }

    const { phase, weeks } = resolveImportedScheduleMetadata(importedCourse, semester);
    return {
      previewId: `import-${canonical || index}-${index}`,
      semester,
      isSystemCourse: false,
      course: {
        ...importedCourse,
        course_code: cleanCode,
        subject_name: String(importedCourse.subject_name || cleanCode || 'Môn học chưa có tên'),
        credits: Number(importedCourse.credits) || 0,
        instructor: String(importedCourse.instructor || ''),
        day_of_week: String(importedCourse.day_of_week || ''),
        shift: String(importedCourse.shift || ''),
        room: String(importedCourse.room || ''),
        campus: String(importedCourse.campus || 'TD'),
        weeks,
        semester,
        phase,
        is_user_added: true,
      },
    };
  });
};

const createImportedCourse = async (row: ScheduleImportPreviewRow) => {
  const course = row.course;
  const { data, error } = await supabase
    .from('course_schedules')
    .insert({
      course_code: course.course_code,
      subject_name: course.subject_name,
      credits: Number(course.credits) || 0,
      instructor: course.instructor || '',
      day_of_week: course.day_of_week || '',
      shift: course.shift || '',
      room: course.room || '',
      campus: course.campus || 'TD',
      weeks: course.weeks || '',
      semester: row.semester,
      phase: course.phase || '1',
      is_user_added: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
};

export const replaceUserScheduleFromPreview = async (
  userId: string,
  semester: string,
  rows: ScheduleImportPreviewRow[],
) => {
  if (!userId) throw new Error('Không tìm thấy người dùng đang đăng nhập.');
  const courseIds: string[] = [];

  for (const row of rows) {
    const courseId = row.systemCourseId || await createImportedCourse(row);
    courseIds.push(courseId);
  }

  const uniqueCourseIds = [...new Set(courseIds)];
  const result = await replaceCloudflareUserScheduleSemester(
    semester,
    uniqueCourseIds
  );
  return result.count;
};
