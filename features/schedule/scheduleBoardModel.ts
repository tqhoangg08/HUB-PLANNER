import {
    SEMESTER_OPTIONS,
    getSemesterMaxWeek,
    getWeekNumberForDate,
} from '../../utils/academicCalendar.ts';

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
    instructor?: string;
    status?: string;
    created_at?: string;
    user_id?: string;
    user?: UserProfile | null;
    duplicate_course?: Course | null;
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
export const COURSE_REQUEST_CACHE_PREFIX = 'hub_admin_course_requests_v2';
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
    if (profileCode) return profileCode;

    const email = request.user?.email?.trim();
    if (email) return email.split('@')[0];

    return request.user_id || '-';
};

export const getPaginationPages = (currentPage: number, totalPages: number) => {
    const pages = new Set([1, totalPages]);
    for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
        if (page >= 1 && page <= totalPages) pages.add(page);
    }
    return [...pages].sort((a, b) => a - b);
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
