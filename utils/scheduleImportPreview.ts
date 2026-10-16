import { resolveImportedScheduleMetadata } from './scheduleImportUtils.ts';
import { replaceCloudflareUserScheduleSemester } from './userSchedulesApi';
import { fetchPublicCourses } from './coursesApi';
import { scheduleSessionsAreValid, serializeScheduleSessions, scheduleSessionsFromLegacyFields, scheduleSessionsOverlap, type StructuredScheduleSession } from './scheduleSessions.ts';
import { generateImportedScheduleSessions, getImportedTargetSessionCount } from './scheduleImportSessions.ts';
import type { ImportedScheduleMeeting } from './hubScheduleParser.ts';

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
  scheduleSessions?: StructuredScheduleSession[];
  start_date?: string;
  end_date?: string;
  meetings?: ImportedScheduleMeeting[];
  [key: string]: unknown;
}

export interface ScheduleImportPreviewRow {
  previewId: string;
  semester: string;
  isSystemCourse: boolean;
  systemCourseId?: string;
  course: ScheduleImportCourse;
  warnings?: string[];
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

const chooseOfficialCourse = (courses: ScheduleImportCourse[], code: string) => {
  const official = courses.filter(course => course.is_user_added !== true);
  if (official.length > 1) throw new Error(`Có nhiều môn hệ thống khớp mã ${code}; không thể xác định duy nhất lớp học phần. Vui lòng kiểm tra danh mục.`);
  if (official.length === 1 && !official[0].id) throw new Error(`Môn hệ thống ${code} thiếu mã định danh. Vui lòng thử lại sau.`);
  return official[0];
};

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
      const data: ScheduleImportCourse[] = [];
      for (let offset = 0; offset <= 5000; offset += 100) {
        params.set('offset', String(offset));
        const response = await fetchPublicCourses(`/courses?${params.toString()}`);
        if (!response.ok) throw new Error('Không thể đối chiếu danh mục môn học.');
        const payload = await response.json() as { data?: ScheduleImportCourse[]; hasMore?: boolean; total?: number };
        if (!Array.isArray(payload.data)) throw new Error('Danh mục môn học trả về dữ liệu không hợp lệ.');
        data.push(...payload.data);
        if (!payload.hasMore && !(Number(payload.total) > offset + payload.data.length)) return { data };
        if (!payload.data.length) break;
      }
      throw new Error('Chưa đối chiếu được đầy đủ danh mục môn học. Vui lòng thử lại.');
    }));
    const catalogRows = payloads.flatMap((payload) => payload.data || []);
    const uniqueRows = [...new Map(catalogRows.map((course, index) => [course.id || `missing-id-${index}`, course])).values()];
    for (const course of uniqueRows) {
      const canonical = normalizeComparableCourseCode(course.course_code);
      if (course.semester !== semester || !canonicalCodes.includes(canonical)) continue;
      const matches = candidatesByCode.get(canonical) || [];
      matches.push(course);
      candidatesByCode.set(canonical, matches);
    }
  }

  return importedCourses.map((importedCourse, index) => {
    const cleanCode = String(importedCourse.course_code || '').replace(/\s+/g, '_');
    const canonical = normalizeComparableCourseCode(cleanCode);
    const systemCourse = chooseOfficialCourse(candidatesByCode.get(canonical) || [], cleanCode);

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

    const { phase } = resolveImportedScheduleMetadata(importedCourse, semester);
    const { sessions, warnings } = generateImportedScheduleSessions(importedCourse, semester);
    return {
      previewId: `import-${canonical || index}-${index}`,
      semester,
      isSystemCourse: false,
      warnings,
      course: {
        ...importedCourse,
        course_code: cleanCode,
        subject_name: String(importedCourse.subject_name || cleanCode || 'Môn học chưa có tên'),
        credits: Number(importedCourse.credits) || 0,
        instructor: String(importedCourse.instructor || ''),
        day_of_week: String(importedCourse.day_of_week || ''),
        shift: String(importedCourse.shift || ''),
        room: String(importedCourse.room || ''),
        ...serializeScheduleSessions(sessions),
        scheduleSessions: sessions,
        semester,
        phase,
        is_user_added: true,
      },
    };
  });
};

export const getScheduleImportRowErrors = (row: ScheduleImportPreviewRow, semester: string) => {
  if (row.semester !== semester) return ['Học kỳ không khớp.'];
  if (row.isSystemCourse) return row.systemCourseId ? [] : ['Thiếu mã môn hệ thống.'];
  const errors: string[] = [];
  if (!row.course.course_code?.trim() || !row.course.subject_name?.trim() || !row.course.instructor?.trim()) errors.push('Cần đủ mã, tên và giảng viên.');
  const target = getImportedTargetSessionCount(row.course.credits);
  if (!target) errors.push('Tín chỉ phải là số nguyên từ 1 đến 4.');
  else if (row.course.scheduleSessions?.length !== target) errors.push(`Cần đúng ${target} buổi theo tín chỉ.`);
  if (!scheduleSessionsAreValid(row.course.scheduleSessions || [], semester)) errors.push('Vui lòng hoàn tất các buổi học hợp lệ.');
  return errors;
};

export const getScheduleImportConflicts = (rows: ScheduleImportPreviewRow[], semester: string) => {
  const sessions = rows.map(row => row.isSystemCourse ? scheduleSessionsFromLegacyFields(row.course, semester) : row.course.scheduleSessions || []);
  const conflicts: string[] = [];
  rows.forEach((row, index) => {
    for (let other = index + 1; other < rows.length; other += 1) {
      if (sessions[index].some(left => sessions[other].some(right => scheduleSessionsOverlap(left, right)))) {
        conflicts.push(`${row.course.subject_name} và ${rows[other].course.subject_name} bị trùng ngày và giờ học.`);
      }
    }
  });
  return conflicts;
};

export const replaceUserScheduleFromPreview = async (
  semester: string,
  rows: ScheduleImportPreviewRow[],
) => {
  if (!rows.length || rows.some(row => getScheduleImportRowErrors(row, semester).length) || getScheduleImportConflicts(rows, semester).length) {
    throw new Error('Lịch xem trước chưa hợp lệ. Vui lòng kiểm tra thông tin môn học, số buổi và giờ trùng.');
  }
  const importRows = rows.map((row) => row.isSystemCourse
    ? { systemCourseId: row.systemCourseId }
    : {
      course: {
        course_code: row.course.course_code,
        subject_name: row.course.subject_name,
        credits: Number(row.course.credits) || 0,
        instructor: row.course.instructor || '',
        scheduleSessions: row.course.scheduleSessions || [],
        phase: row.course.phase || '1',
      },
    });
  const result = await replaceCloudflareUserScheduleSemester(semester, [], importRows);
  return result.count;
};
