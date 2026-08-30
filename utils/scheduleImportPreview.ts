import { resolveImportedScheduleMetadata } from './scheduleImportUtils';
import { replaceCloudflareUserScheduleSemester } from './userSchedulesApi';
import { fetchPublicCourses } from './coursesApi';

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
    const payloads = await Promise.all(equivalentCodes.map(async (courseCode) => {
      const params = new URLSearchParams({
        semester,
        courseCode,
        limit: '100',
      });
      const response = await fetchPublicCourses(`/courses?${params.toString()}`);
      if (!response.ok) throw new Error('KhÃ´ng thá»ƒ Ä‘á»‘i chiáº¿u danh má»¥c mÃ´n há»c.');
      return response.json() as Promise<{ data?: ScheduleImportCourse[] }>;
    }));
    const catalogRows = payloads.flatMap((payload) => payload.data || []);
    const uniqueRows = [...new Map(catalogRows.map((course) => [course.id || `${course.course_code}:${course.phase}`, course])).values()];
    for (const course of uniqueRows) {
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

export const replaceUserScheduleFromPreview = async (
  semester: string,
  rows: ScheduleImportPreviewRow[],
) => {
  const importRows = rows.map((row) => row.systemCourseId
    ? { systemCourseId: row.systemCourseId }
    : {
      course: {
        course_code: row.course.course_code,
        subject_name: row.course.subject_name,
        credits: Number(row.course.credits) || 0,
        instructor: row.course.instructor || '',
        day_of_week: row.course.day_of_week || '',
        shift: row.course.shift || '',
        room: row.course.room || '',
        campus: row.course.campus || 'TD',
        weeks: row.course.weeks || '',
        phase: row.course.phase || '1',
      },
    });
  const result = await replaceCloudflareUserScheduleSemester(semester, [], importRows);
  return result.count;
};
