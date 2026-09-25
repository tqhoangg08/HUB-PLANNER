import {
  DEFAULT_SCHEDULE_SEMESTER,
  SEMESTER_OPTIONS,
  getSemesterMaxWeek,
  getWeekNumberForDate,
} from '../../utils/academicCalendar.ts';
import type { StructuredScheduleSession } from '../../utils/scheduleSessions.ts';

export interface UserProfile {
    id?: string;
    full_name?: string;
    student_code?: string;
    email?: string;
}

export interface StudentScheduleSummary {
    user_id: string;
    full_name: string;
    student_code: string;
    email?: string;
    course_count: number;
    total_credits: number;
    semesters: string[];
}

export interface CourseLabel {
    id: string;
    type: string;
    text?: string;
    color: string;
    date?: string;
    makeupId?: string;
}

export interface MakeupScheduleItem {
    id: string;
    originalDate: string;
    date: string;
    shift: string;
    room: string;
}

export interface Course {
    id: string;
    course_code: string;
    subject_name: string;
    prerequisite?: string | null;
    credits: number;
    knowledge_block?: string | null;
    shift: string;
    day_of_week: string;
    weeks: string;
    room: string;
    campus: string;
    managing_faculty?: string | null;
    exam_date: string;
    exam_shift: string;
    exam_campus?: string | null;
    exam_room?: string;
    cohort: string;
    major: string;
    group_name?: string | null;
    orientation?: string | null;
    orientation_note_3?: string | null;
    registration_type?: string | null;
    general_note?: string | null;
    academic_program: string;
    student_count?: number | null;
    phase: string;
    semester: string;
    instructor?: string;
    revision?: number;
    is_user_added?: boolean;
    user_schedule_id?: string;
    user?: UserProfile;
    labels?: CourseLabel[];
    makeup_schedules?: MakeupScheduleItem[];
    dateStr?: string;
    original_course?: Partial<Course>;
    custom_data?: Record<string, any>;
}

export interface CourseRequest {
  id: string;
  subject_name: string;
  course_code: string;
  semester: string;
  instructor?: string;
    status?: string;
    created_at?: string;
    user_id?: string;
    user?: UserProfile | null;
    duplicate_course?: Course | null;
    revision?: number;
    scheduleSessions?: StructuredScheduleSession[];
    request_note?: string | null;
}

export interface CourseRequestPageCache {
    data: CourseRequest[];
    total: number;
    hasMore: boolean;
    cachedAt: number;
}

export type ScheduleViewMode = 'official' | 'plan';
export type PlanScheduleKey = 'A' | 'B' | 'C';
export type PlanSchedules = Record<PlanScheduleKey, Course[]>;

export const COURSE_REQUEST_PAGE_SIZE = 10;
export const COURSE_REQUEST_CACHE_TTL_MS = 5 * 60 * 1000;
export const COURSE_REQUEST_CACHE_PREFIX = 'hub_admin_course_requests_v3';
export const PDF_SCHEDULE_FILE_MESSAGE = 'Vui lòng tải lên file PDF lịch học, hệ thống chưa hỗ trợ ảnh PNG/JPG.';
export const SCHEDULE_UPDATE_NOTICE_STORAGE_KEY = 'hub_schedule_board_update_notice_hidden_v1';
export const PLAN_SCHEDULE_STORAGE_PREFIX = 'hub_schedule_plans_v1';
export const COURSE_PAGE_SIZE_COMPACT = 30;
export const COURSE_PAGE_SIZE_EXPANDED = 40;
export const SYSTEM_COURSE_SUGGESTION_LIMIT = 10;
export const DEFAULT_ACADEMIC_PROGRAM_OPTIONS = ['Chính quy chuẩn'];
export const PLAN_KEYS: PlanScheduleKey[] = ['A', 'B', 'C'];

const getCourseRequestTime = (request: CourseRequest) => {
    const time = request.created_at ? new Date(request.created_at).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
};

export const sortCourseRequestsNewestFirst = (requests: CourseRequest[]) => (
    [...requests].sort((a, b) => getCourseRequestTime(b) - getCourseRequestTime(a))
);

export const getCourseRequestStudentCode = (request: CourseRequest) => {
    const profileCode = request.user?.student_code?.trim();
    return profileCode || 'Chưa có MSSV';
};

export type AdminScheduleTab = 'system' | 'user' | 'requested' | 'user_changed' | 'student_schedules';
export type AdminScheduleSort = 'default' | 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc' | 'student-code-asc' | 'course-count-desc' | 'credits-desc';
const tabUrls: Record<AdminScheduleTab, string> = {
    system: 'system', user: 'user', requested: 'requested',
    user_changed: 'user-changed', student_schedules: 'student-schedules',
};
export const adminScheduleTabUrl = (tab: AdminScheduleTab) => tabUrls[tab];
export const parseAdminScheduleTab = (value: string | null): AdminScheduleTab =>
    (Object.keys(tabUrls) as AdminScheduleTab[]).find(tab => tabUrls[tab] === value) || 'system';
export const parseAdminScheduleSort = (value: string | null): AdminScheduleSort =>
    (['default', 'name-asc', 'name-desc', 'created-desc', 'created-asc', 'student-code-asc', 'course-count-desc', 'credits-desc'] as const).find(sort => sort === value) || 'default';
export const parseAdminSchedulePage = (value: string | null) => {
    const page = Number(value);
    return Number.isSafeInteger(page) && page >= 1 && page <= 10000 ? page : 1;
};
export const parseAdminSchedulePageSize = (value: string | null) => {
    const size = Number(value);
    return size === 10 || size === 20 || size === 50 ? size : 10;
};
export const resolveAdminScheduleSemester = (params: URLSearchParams) => {
    const term = params.get('semester') || '';
    const year = (params.get('year') || '').replaceAll('-', '_');
    const candidate = SEMESTER_OPTIONS.some(option => option.value === term) ? term : `${term}_${year}`;
    return SEMESTER_OPTIONS.some(option => option.value === candidate) ? candidate : DEFAULT_SCHEDULE_SEMESTER;
};
const viCompare = (left: unknown, right: unknown) => String(left || '').localeCompare(String(right || ''), 'vi', { numeric: true, sensitivity: 'base' });
const compareNewest = (left?: string, right?: string) => (Date.parse(right || '') || 0) - (Date.parse(left || '') || 0);
export const sortManagementRequests = (rows: CourseRequest[], sort: AdminScheduleSort) => [...rows].sort((a, b) => {
    const primary = sort === 'name-asc' ? viCompare(a.subject_name, b.subject_name)
        : sort === 'name-desc' ? viCompare(b.subject_name, a.subject_name)
        : sort === 'created-asc' ? -compareNewest(a.created_at, b.created_at)
        : compareNewest(a.created_at, b.created_at);
    return primary || viCompare(a.id, b.id);
});
export const sortManagementCourses = (rows: Course[], sort: AdminScheduleSort) => sort === 'default' ? [...rows] : [...rows].sort((a, b) => {
    const aName = a.user?.full_name || a.subject_name || a.course_code;
    const bName = b.user?.full_name || b.subject_name || b.course_code;
    const primary = sort === 'name-asc' ? viCompare(aName, bName)
        : sort === 'name-desc' ? viCompare(bName, aName)
        : 0;
    return primary || viCompare(a.user?.student_code, b.user?.student_code) || viCompare(a.course_code, b.course_code) || viCompare(a.id, b.id);
});
export const sortManagementStudents = (rows: StudentScheduleSummary[], sort: AdminScheduleSort) => sort === 'default' ? [...rows] : [...rows].sort((a, b) => {
    const aName = a.full_name || a.student_code;
    const bName = b.full_name || b.student_code;
    const primary = sort === 'name-asc' ? viCompare(aName, bName)
        : sort === 'name-desc' ? viCompare(bName, aName)
        : sort === 'student-code-asc' ? viCompare(a.student_code, b.student_code)
        : sort === 'course-count-desc' ? b.course_count - a.course_count
        : sort === 'credits-desc' ? b.total_credits - a.total_credits
        : 0;
    return primary || viCompare(a.student_code, b.student_code) || viCompare(a.user_id, b.user_id);
});

export const getPaginationPages = (currentPage: number, totalPages: number) => {
    const pages = new Set([1, totalPages]);
    for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
        if (page >= 1 && page <= totalPages) pages.add(page);
    }
    return [...pages].sort((a, b) => a - b);
};

export const getManagementPage = <T,>(rows: T[], page: number, pageSize: number) => {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    return {
        rows: rows.slice((safePage - 1) * pageSize, safePage * pageSize),
        page: safePage,
        totalPages,
        start: rows.length ? (safePage - 1) * pageSize + 1 : 0,
        end: Math.min(safePage * pageSize, rows.length),
        total: rows.length,
    };
};

export const isPdfScheduleFile = (file: File) => (
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
);

export const createEmptyPlanSchedules = (): PlanSchedules => ({
    A: [],
    B: [],
    C: [],
});

export const normalizeAcademicProgramOptions = (values: string[]) => {
    const options = [...DEFAULT_ACADEMIC_PROGRAM_OPTIONS, ...values]
        .map(value => String(value || '').trim())
        .filter(Boolean);

    return [...new Set(options)].sort((a, b) => {
        if (DEFAULT_ACADEMIC_PROGRAM_OPTIONS.includes(a)) return -1;
        if (DEFAULT_ACADEMIC_PROGRAM_OPTIONS.includes(b)) return 1;
        return a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
    });
};

export const getSemesterContainingDate = (date: Date, fallbackSemester: string) => {
    const matchedSemester = SEMESTER_OPTIONS.find(option => {
        const weekNumber = getWeekNumberForDate(date, option.value);
        return weekNumber >= 1 && weekNumber <= getSemesterMaxWeek(option.value);
    });
    return matchedSemester?.value || fallbackSemester;
};
