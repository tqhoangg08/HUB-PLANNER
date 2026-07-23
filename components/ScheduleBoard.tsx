import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { Search, Info, Plus, Calendar, MapPin, Clock, X, CheckCircle, Zap, User, AlertTriangle, Send, BookPlus, List, Trash2, CalendarDays, Lock, FileUp, Loader2, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Settings, Edit, Tag, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { supabase } from '../utils/supabase'; 
import { parseWeeks } from '../utils/scheduleLogic'; 
import { ScheduleImportGuideModal } from './ScheduleImportGuideModal';
import { parseSchedulePdf } from '../utils/schedulePdfImport';
import { useUserRole } from '../hooks/useUserRole';
import { playClick } from '../utils/audio';
import { showConfirm } from '../utils/appNotifications';
import NotificationNudge from './NotificationNudge';
import { notifyModerators } from '../utils/moderatorNotifications';
import { apiHeaders, apiUrl } from '../utils/api';
import { TurnstileBox } from './TurnstileBox';
import { ProtectedSubmitError, protectedSubmit, verifyTurnstileOnly } from '../utils/protectedSubmit';
import { logWebError } from '../utils/logWebError';
import { buildManualSupportTicketDraft, openSupportTicketDraft } from '../utils/supportTicketDraft';
import { promptSendParserDebugFile } from '../utils/parserDebugTicket';
import {
  DEFAULT_SCHEDULE_SEMESTER,
  SEMESTER_OPTIONS,
  getInitialSemesterMonthIndex,
  getSemesterMaxWeek,
  getSemesterMonth,
  getSemesterMonthLabel,
  getSemesterMonths,
  getWeekDatesForSemester,
  getWeekNumberForDate,
  isSemesterHolidayWeek,
} from '../utils/academicCalendar';

interface UserProfile {
  id?: string;
  full_name?: string;
  student_code?: string;
  email?: string;
}

interface StudentScheduleSummary {
  user_id: string;
  full_name: string;
  student_code: string;
  email?: string;
  course_count: number;
  semesters: string[];
}

interface CourseRequest {
  id: string;
  subject_name: string;
  course_code: string;
  instructor?: string;
  status?: string;
  created_at?: string;
  user_id?: string;
  user?: UserProfile | null;
}

interface CourseRequestPageCache {
  data: CourseRequest[];
  total: number;
  hasMore: boolean;
  cachedAt: number;
}

const COURSE_REQUEST_PAGE_SIZE = 10;
const COURSE_REQUEST_CACHE_TTL_MS = 5 * 60 * 1000;
const COURSE_REQUEST_CACHE_PREFIX = 'hub_admin_course_requests_v1';

const getCourseRequestTime = (request: CourseRequest) => {
  const time = request.created_at ? new Date(request.created_at).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

const sortCourseRequestsNewestFirst = (requests: CourseRequest[]) => {
  return [...requests].sort((a, b) => getCourseRequestTime(b) - getCourseRequestTime(a));
};

const getCourseRequestStudentCode = (request: CourseRequest) => {
  const profileCode = request.user?.student_code?.trim();
  if (profileCode) return profileCode;

  const email = request.user?.email?.trim();
  if (email) return email.split('@')[0];

  return request.user_id || '-';
};

const getPaginationPages = (currentPage: number, totalPages: number) => {
  const pages = new Set([1, totalPages]);
  for (let page = currentPage - 2; page <= currentPage + 2; page += 1) {
    if (page >= 1 && page <= totalPages) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
};

const PDF_SCHEDULE_FILE_MESSAGE = 'Vui lòng tải lên file PDF lịch học, hệ thống chưa hỗ trợ ảnh PNG/JPG.';
const isPdfScheduleFile = (file: File) => (
  file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
);

interface CourseLabel {
  id: string;
  type: string;
  text?: string; 
  color: string;
  date?: string; 
  makeupId?: string;
}

interface MakeupScheduleItem {
  id: string;
  originalDate: string;
  date: string;
  shift: string;
  room: string;
}

interface Course {
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

const SCHEDULE_UPDATE_NOTICE_STORAGE_KEY = 'hub_schedule_board_update_notice_hidden_v1';
const STUDENT_EDIT_LOCKED_SEMESTERS = new Set(['HK1_2026_2027']);
const PLAN_SCHEDULE_STORAGE_PREFIX = 'hub_schedule_plans_v1';
const COURSE_PAGE_SIZE_COMPACT = 30;
const COURSE_PAGE_SIZE_EXPANDED = 40;
const DEFAULT_ACADEMIC_PROGRAM_OPTIONS = ['Chính quy chuẩn'];
let hasShownScheduleUpdateNoticeThisLoad = false;

const isStudentCourseEditLocked = (course?: Pick<Course, 'semester'> | null) => (
    !!course?.semester && STUDENT_EDIT_LOCKED_SEMESTERS.has(course.semester)
);

type ScheduleViewMode = 'official' | 'plan';
type PlanScheduleKey = 'A' | 'B' | 'C';
type PlanSchedules = Record<PlanScheduleKey, Course[]>;

const PLAN_KEYS: PlanScheduleKey[] = ['A', 'B', 'C'];

const createEmptyPlanSchedules = (): PlanSchedules => ({ A: [], B: [], C: [] });

const parseGroupTokens = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return [];

    const parts = raw.split(',').map(part => part.trim()).filter(Boolean);
    if (parts.length === 0) return [];

    const firstPrefix = parts[0].match(/^(.+_N)(\d+)$/i)?.[1];
    return [...new Set(parts.map((part, index) => {
        if (index > 0 && firstPrefix && /^\d+$/.test(part)) {
            return `${firstPrefix}${part}`;
        }
        return part;
    }).filter(Boolean))];
};

const normalizeAcademicProgramOptions = (values: string[]) => {
    const options = [...DEFAULT_ACADEMIC_PROGRAM_OPTIONS, ...values]
        .map(value => String(value || '').trim())
        .filter(Boolean);

    return [...new Set(options)].sort((a, b) => {
        if (DEFAULT_ACADEMIC_PROGRAM_OPTIONS.includes(a)) return -1;
        if (DEFAULT_ACADEMIC_PROGRAM_OPTIONS.includes(b)) return 1;
        return a.localeCompare(b, 'vi', { numeric: true, sensitivity: 'base' });
    });
};

const getSemesterContainingDate = (date: Date, fallbackSemester: string) => {
    const matchedSemester = SEMESTER_OPTIONS.find(option => {
        const weekNumber = getWeekNumberForDate(date, option.value);
        return weekNumber >= 1 && weekNumber <= getSemesterMaxWeek(option.value);
    });
    return matchedSemester?.value || fallbackSemester;
};

const SYNCABLE_COURSE_FIELDS: { key: keyof Course; label: string }[] = [
    { key: 'course_code', label: 'Mã học phần' },
    { key: 'subject_name', label: 'Tên môn học' },
    { key: 'prerequisite', label: 'Tiền đề' },
    { key: 'credits', label: 'Tín chỉ' },
    { key: 'knowledge_block', label: 'Khối kiến thức' },
    { key: 'instructor', label: 'Giảng viên' },
    { key: 'day_of_week', label: 'Thứ' },
    { key: 'shift', label: 'Ca / Tiết' },
    { key: 'room', label: 'Phòng' },
    { key: 'weeks', label: 'Tuần học' },
    { key: 'phase', label: 'Đợt' },
    { key: 'managing_faculty', label: 'Khoa quản lý' },
    { key: 'exam_date', label: 'Ngày thi' },
    { key: 'exam_shift', label: 'Ca thi' },
    { key: 'exam_campus', label: 'Cơ sở thi' },
    { key: 'exam_room', label: 'Phòng thi' },
    { key: 'campus', label: 'Cơ sở' },
    { key: 'cohort', label: 'Khóa' },
    { key: 'major', label: 'Ngành' },
    { key: 'group_name', label: 'Nhóm' },
    { key: 'orientation', label: 'Định hướng' },
    { key: 'orientation_note_3', label: 'Ghi chú 3 định hướng' },
    { key: 'registration_type', label: 'Hình thức đăng ký' },
    { key: 'general_note', label: 'Ghi chú chung' },
    { key: 'academic_program', label: 'Chương trình' },
    { key: 'student_count', label: 'Sĩ số sinh viên' },
    { key: 'semester', label: 'Học kỳ' },
];

const COURSE_SCHEDULE_COLUMNS = [
    'id',
    'course_code',
    'subject_name',
    'prerequisite',
    'credits',
    'knowledge_block',
    'shift',
    'day_of_week',
    'weeks',
    'room',
    'campus',
    'managing_faculty',
    'exam_date',
    'exam_shift',
    'exam_campus',
    'exam_room',
    'cohort',
    'major',
    'group_name',
    'orientation',
    'orientation_note_3',
    'registration_type',
    'general_note',
    'academic_program',
    'student_count',
    'phase',
    'semester',
    'instructor',
    'is_user_added',
].join(', ');

const normalizeDiffValue = (value: any) => value === undefined || value === null ? '' : String(value).trim();

const normalizeSortText = (value: any) => normalizeDiffValue(value);

const sortChangedUserScheduleCourses = (courses: Course[]) => {
    return [...courses].sort((a, b) => {
        const codeCompare = normalizeSortText(a.course_code).localeCompare(
            normalizeSortText(b.course_code),
            'vi',
            { numeric: true, sensitivity: 'base' }
        );
        if (codeCompare !== 0) return codeCompare;

        const nameCompare = normalizeSortText(a.subject_name).localeCompare(
            normalizeSortText(b.subject_name),
            'vi',
            { numeric: true, sensitivity: 'base' }
        );
        if (nameCompare !== 0) return nameCompare;

        const studentNameCompare = normalizeSortText(a.user?.full_name || a.user?.student_code).localeCompare(
            normalizeSortText(b.user?.full_name || b.user?.student_code),
            'vi',
            { numeric: true, sensitivity: 'base' }
        );
        if (studentNameCompare !== 0) return studentNameCompare;

        return normalizeSortText(a.user?.student_code).localeCompare(
            normalizeSortText(b.user?.student_code),
            'vi',
            { numeric: true, sensitivity: 'base' }
        );
    });
};

// =======================================================================
// CẤU HÌNH LABEL CÁ NHÂN 
// =======================================================================
const LABEL_TYPES = ['Nghỉ', 'Thi giữa kỳ', 'Thi cuối kỳ', 'Thuyết trình', 'Học online', 'Khác'];
const LABEL_COLORS = [
    { name: 'Đỏ', value: 'red' },
    { name: 'Cam', value: 'orange' },
    { name: 'Vàng', value: 'yellow' },
    { name: 'Lục', value: 'emerald' },
    { name: 'Lam', value: 'blue' },
    { name: 'Tím', value: 'purple' },
    { name: 'Hồng', value: 'rose' },
    { name: 'Xám', value: 'gray' },
];

const FIXED_LABEL_COLORS: Record<string, string> = {
    'Nghỉ': 'red',
    'Thi giữa kỳ': 'yellow',
    'Thi cuối kỳ': 'rose',
    'Thuyết trình': 'orange',
    'Học online': 'emerald',
    'Học bù': 'blue'
};

const getLabelStyle = (color: string) => {
    const styles: Record<string, string> = {
        red: 'bg-red-50 text-red-700 border-red-200',
        orange: 'bg-orange-50 text-orange-700 border-orange-200',
        yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
        purple: 'bg-purple-50 text-purple-700 border-purple-200',
        rose: 'bg-rose-50 text-rose-700 border-rose-200',
        gray: 'bg-gray-50 text-gray-700 border-gray-200',
    };
    return styles[color] || styles.gray;
};

const getLabelDotColor = (color: string) => {
    const styles: Record<string, string> = {
        red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-500',
        emerald: 'bg-emerald-500', blue: 'bg-blue-500', purple: 'bg-purple-500',
        rose: 'bg-rose-500', gray: 'bg-gray-500',
    };
    return styles[color] || 'bg-gray-500';
};

// =======================================================================
// HỆ THỐNG HELPER (NGÀY THÁNG)
// =======================================================================
const formatDateStr = (date: Date) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
};

const getWeekDatesFull = (weekNum: number, sem: string) => {
    if (weekNum === 0) return ['', '', '', '', '', '', '']; 
    return getWeekDatesForSemester(weekNum, sem).map(formatDateStr);
};

const getMainShiftType = (shiftStr?: string) => {
  if (!shiftStr) return '';
  const s = shiftStr.trim().toUpperCase();
  if (s === 'S') return 'S';
  if (s === 'C') return 'C';
  if (/\b(6|7|8|9|10)\b/.test(s)) return 'C'; 
  if (/\b(1|2|3|4|5)\b/.test(s)) return 'S';  
  return '';
};

const getShiftDisplay = (shiftStr?: string) => {
  if (!shiftStr) return '';
  const s = shiftStr.trim().toUpperCase();
  if (s === 'S') return 'Ca Sáng';
  if (s === 'C') return 'Ca Chiều';
  return `Tiết ${s}`; 
};

const getCourseTimeLabel = (shiftStr?: string) => {
  if (!shiftStr) return '';
  const s = shiftStr.trim().toUpperCase();
  if (s === 'S') return '07:00 - 11:05';
  if (s === 'C') return '13:00 - 17:05';
  if (s.includes('1-3')) return '07:00 - 09:15';
  if (s.includes('4-5')) return '09:35 - 11:05';
  if (s.includes('6-8')) return '13:00 - 15:15';
  if (s.includes('9-10')) return '15:35 - 17:05';
  return ''; 
};

const getExamTime = (shiftStr?: string) => {
  if (!shiftStr) return "";
  const normalized = shiftStr.replace(/\s/g, '').toUpperCase();
  switch (normalized) {
    case 'CA1': case '1': return '07:00';
    case 'CA2': case '2': return '09:30';
    case 'CA3': case '3': return '13:00';
    case 'CA4': case '4': return '15:30';
    case 'CA5': case '5': return '18:00';
    case 'CAS1': case 'S1': return '07:00';
    case 'CAS2': case 'S2': return '08:30';
    case 'CAS3': case 'S3': return '10:00';
    case 'CAC1': case 'C1': return '13:00';
    case 'CAC2': case 'C2': return '14:30';
    case 'CAC3': case 'C3': return '16:00';
    default: return '';
  }
};

const getExamStartMinutes = (shiftStr?: string) => {
  const time = getExamTime(shiftStr);
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

const getExamTimeGapMinutes = (firstShift?: string, secondShift?: string) => {
  const firstMinutes = getExamStartMinutes(firstShift);
  const secondMinutes = getExamStartMinutes(secondShift);
  if (firstMinutes === null || secondMinutes === null) return null;
  return Math.abs(firstMinutes - secondMinutes);
};

const getExamDayMonth = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split('/');
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
  return dateStr;
};
const splitData = (str?: string) => {
  if (!str) return [];
  const s = str.toString().trim();
  if (s.includes('\n')) return s.split(/\r?\n/).map(x => x.trim());
  return s.split(/\s+/);
};

const getCourseDetailsForSlot = (course: Course, targetDay: number, targetWeek: number, targetShiftType: string) => {
  const weekArr = splitData(course.weeks);
  const dayArr = splitData(course.day_of_week);
  const roomArr = splitData(course.room);
  const shiftArr = splitData(course.shift);

  if (weekArr.length === 0) return null;
  const maxLen = Math.max(weekArr.length, dayArr.length, shiftArr.length);

  for (let i = maxLen - 1; i >= 0; i--) {
    const cDayStr = dayArr[i] !== undefined ? dayArr[i] : (dayArr[dayArr.length - 1] || "");
    const cShiftStr = shiftArr[i] !== undefined ? shiftArr[i] : (shiftArr[0] || "");
    const cRoomStr = roomArr[i] !== undefined ? roomArr[i] : (roomArr[0] || "");
    const cWeekStr = weekArr[i] !== undefined ? weekArr[i] : (weekArr[0] || "");

    let isWeekMatch = false;
    if (targetWeek === 0) {
        isWeekMatch = true; 
    } else {
        const parsedWks = parseWeeks(cWeekStr, course.semester);
        if (parsedWks.includes(targetWeek)) isWeekMatch = true;
    }
    if (!isWeekMatch) continue;

    const days = cDayStr.replace(/,/g, ' ').trim().split(/\s+/).map(Number);
    if (!days.includes(targetDay)) continue;

    const shiftType = getMainShiftType(cShiftStr);
    if (shiftType !== targetShiftType) continue;

    return { day: targetDay, shift: cShiftStr, room: cRoomStr, weeks: cWeekStr };
  }
  return null;
};

const createInitialTagData = () => ({ type: 'Nghỉ', text: '', color: 'red', makeupDate: '', makeupShift: 'S', makeupRoom: '' });

const normalizeDateInputToDisplay = (value?: string) => {
  const rawValue = (value || '').trim();
  if (!rawValue) return '';

  const isoMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;

  const slashMatch = rawValue.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    return slashMatch[3] ? `${day}/${month}/${slashMatch[3]}` : `${day}/${month}`;
  }

  return rawValue;
};

const buildLabelPayload = (course: Course, labelData: ReturnType<typeof createInitialTagData>, targetDate: string) => {
  const finalColor = labelData.type === 'Khác' ? labelData.color : FIXED_LABEL_COLORS[labelData.type];
  const updatedLabels: CourseLabel[] = [
    ...(course.labels || []),
    {
      id: Math.random().toString(36).substr(2, 9),
      type: labelData.type,
      text: labelData.type === 'Khác' ? labelData.text : undefined,
      color: finalColor,
      date: targetDate
    }
  ];

  const updatedMakeupSchedules = [...(course.makeup_schedules || [])];
  if (labelData.type === 'Nghỉ') {
    const makeupDate = normalizeDateInputToDisplay(labelData.makeupDate);
    const makeupRoom = labelData.makeupRoom.trim();
    const makeupShift = labelData.makeupShift.trim();

    if (!targetDate || !makeupDate || !makeupShift || !makeupRoom) {
      return { error: 'Vui lòng nhập đầy đủ ngày, thời gian và phòng học bù.' };
    }

    const makeupId = Math.random().toString(36).substr(2, 9);
    updatedLabels[updatedLabels.length - 1] = {
      ...updatedLabels[updatedLabels.length - 1],
      makeupId
    };

    updatedMakeupSchedules.push({
      id: makeupId,
      originalDate: targetDate,
      date: makeupDate,
      shift: makeupShift,
      room: makeupRoom
    });

    updatedLabels.push({
      id: Math.random().toString(36).substr(2, 9),
      type: 'Học bù',
      text: `Bù ${targetDate.substring(0, 5)}`,
      color: FIXED_LABEL_COLORS['Học bù'],
      date: makeupDate,
      makeupId
    });
  }

  return { updatedLabels, updatedMakeupSchedules };
};

const colorPalette = [
    { bg: 'bg-emerald-50', border: 'border-l-emerald-500', text: 'text-emerald-900', label: 'text-emerald-700' },
    { bg: 'bg-blue-50', border: 'border-l-blue-500', text: 'text-blue-900', label: 'text-blue-700' },
    { bg: 'bg-orange-50', border: 'border-l-orange-500', text: 'text-orange-900', label: 'text-orange-700' },
    { bg: 'bg-rose-50', border: 'border-l-rose-500', text: 'text-rose-900', label: 'text-rose-700' },
    { bg: 'bg-indigo-50', border: 'border-l-indigo-500', text: 'text-indigo-900', label: 'text-indigo-700' },
];

const getColorForCourse = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return colorPalette[Math.abs(hash) % colorPalette.length];
};

export default function ScheduleBoard({ viewUserId }: { viewUserId?: string }) {
  const navigate = useNavigate();
  const { studentCode: routeStudentCode } = useParams<{ studentCode?: string }>();
  const selectedRouteStudentCode = routeStudentCode ? decodeURIComponent(routeStudentCode) : null;

  useEffect(() => { document.title = "Thời khóa biểu | HUB Planner"; }, []);

  const { session, isAdmin, isAuditor, isStudent, loading } = useUserRole();
  const isAuthenticated = session !== null;

  const [searchTerm, setSearchTerm] = useState('');
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [coursePage, setCoursePage] = useState(0);
  const [courseTotal, setCourseTotal] = useState(0);
  const [courseHasMore, setCourseHasMore] = useState(false);
  const [mySchedule, setMySchedule] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCourseDetailLoading, setIsCourseDetailLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const addScheduleInFlightRef = useRef(false);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [adminScheduleError, setAdminScheduleError] = useState('');
  
  const [selectedSemester, setSelectedSemester] = useState<string>(DEFAULT_SCHEDULE_SEMESTER);
  const [selectedPhase, setSelectedPhase] = useState<string>('all');
  const [selectedSubjectName, setSelectedSubjectName] = useState<string>('all');
  const [selectedMajor, setSelectedMajor] = useState<string>('all');
  const [selectedCohort, setSelectedCohort] = useState<string>('all');
  const [selectedGroupName, setSelectedGroupName] = useState<string>('all');
  const [selectedAcademicProgram, setSelectedAcademicProgram] = useState<string>('all');
  const [subjectNameOptions, setSubjectNameOptions] = useState<string[]>([]);
  const [majorOptions, setMajorOptions] = useState<string[]>([]);
  const [cohortOptions, setCohortOptions] = useState<string[]>([]);
  const [groupNameOptions, setGroupNameOptions] = useState<string[]>([]);
  const [academicProgramOptions, setAcademicProgramOptions] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [scheduleViewMode, setScheduleViewMode] = useState<ScheduleViewMode>('official');
  const [activePlanKey, setActivePlanKey] = useState<PlanScheduleKey>('A');
  const [planSchedules, setPlanSchedules] = useState<PlanSchedules>(() => createEmptyPlanSchedules());
  const [hasLoadedPlanSchedules, setHasLoadedPlanSchedules] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number>(0); 
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(() => getInitialSemesterMonthIndex(DEFAULT_SCHEDULE_SEMESTER)); 
  
  const [isWeekDropdownOpen, setIsWeekDropdownOpen] = useState(false);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false); 
  const weekDropdownButtonRef = useRef<HTMLButtonElement>(null);
  const monthDropdownButtonRef = useRef<HTMLButtonElement>(null);
  
  const [selectedCourseInfo, setSelectedCourseInfo] = useState<{
    course: Course;
    details?: { day: number, shift: string, room: string, weeks: string, isMakeup?: boolean, originalDate?: string, id?: string };
    dateStr?: string;
  } | null>(null);

  const [isMyScheduleModalOpen, setIsMyScheduleModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportTurnstileToken, setReportTurnstileToken] = useState('');
  const [reportData, setReportData] = useState({ course_code: '', subject_name: '', description: '', suggested_correction: '' });
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState(false);
  const [isSubmittingCourse, setIsSubmittingCourse] = useState(false);
  const [newCourseData, setNewCourseData] = useState({ subject_name: '', course_code: '', instructor: '' });
  const currentSemesterSchedule = mySchedule.filter(c => c.semester === selectedSemester);
  const planStorageKey = `${PLAN_SCHEDULE_STORAGE_PREFIX}:${session?.user?.id || 'guest'}`;
  const currentPlanSchedule = planSchedules[activePlanKey].filter(c => c.semester === selectedSemester);
  const isPlanMode = scheduleViewMode === 'plan';
  const displayedSchedule = isPlanMode ? currentPlanSchedule : currentSemesterSchedule;
  const displayedScheduleTitle = isPlanMode ? `Kế hoạch ${activePlanKey}` : 'Lịch cá nhân';
  const displayedScheduleCount = displayedSchedule.length;
  const hasActiveCourseFilters = Boolean(searchTerm.trim()) || selectedSubjectName !== 'all' || selectedMajor !== 'all' || selectedCohort !== 'all' || selectedGroupName !== 'all' || selectedAcademicProgram !== 'all';
  const coursePageSize = isFilterExpanded ? COURSE_PAGE_SIZE_EXPANDED : COURSE_PAGE_SIZE_COMPACT;
  const courseTotalPages = Math.max(1, Math.ceil(courseTotal / coursePageSize));
  const coursePageCacheRef = useRef(new Map<string, { data: Course[]; total: number; hasMore: boolean }>());
  const courseDetailCacheRef = useRef(new Map<string, Course>());
  const courseFilterOptionsCacheRef = useRef(new Map<string, { subjectNameOptions: string[]; majorOptions: string[]; cohortOptions: string[]; groupNameOptions: string[]; academicProgramOptions: string[] }>());
  const courseFilterKeyRef = useRef('');

  useEffect(() => {
    setHasLoadedPlanSchedules(false);
    if (!isAuthenticated) {
        setPlanSchedules(createEmptyPlanSchedules());
        setHasLoadedPlanSchedules(true);
        return;
    }

    try {
        const raw = localStorage.getItem(planStorageKey);
        if (!raw) {
            setPlanSchedules(createEmptyPlanSchedules());
            setHasLoadedPlanSchedules(true);
            return;
        }

        const parsed = JSON.parse(raw);
        setPlanSchedules({
            A: Array.isArray(parsed?.A) ? parsed.A : [],
            B: Array.isArray(parsed?.B) ? parsed.B : [],
            C: Array.isArray(parsed?.C) ? parsed.C : [],
        });
        setHasLoadedPlanSchedules(true);
    } catch (error) {
        console.error('Không thể đọc lịch học kế hoạch:', error);
        setPlanSchedules(createEmptyPlanSchedules());
        setHasLoadedPlanSchedules(true);
    }
  }, [isAuthenticated, planStorageKey]);

  useEffect(() => {
    if (!isAuthenticated || !hasLoadedPlanSchedules) return;
    try {
        localStorage.setItem(planStorageKey, JSON.stringify(planSchedules));
    } catch (error) {
        console.error('Không thể lưu lịch học kế hoạch:', error);
    }
  }, [isAuthenticated, hasLoadedPlanSchedules, planStorageKey, planSchedules]);

  useEffect(() => {
    const maxWeek = getSemesterMaxWeek(selectedSemester);
    setSelectedWeek(prev => Math.min(prev, maxWeek));
    setSelectedMonthIndex(getInitialSemesterMonthIndex(selectedSemester));
  }, [selectedSemester]);

  const [isPdfGuideOpen, setIsPdfGuideOpen] = useState(false);
  const [scheduleImportTurnstileToken, setScheduleImportTurnstileToken] = useState('');
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAdminView, setIsAdminView] = useState(isAdmin);
  const [adminTab, setAdminTab] = useState<'system' | 'user' | 'requested' | 'user_changed' | 'student_schedules'>('system');
  const [isAdminEditModalOpen, setIsAdminEditModalOpen] = useState(false);
  const [adminEditData, setAdminEditData] = useState<Partial<Course>>({});
  const [isSavingAdminCourse, setIsSavingAdminCourse] = useState(false);
  const [courseRequests, setCourseRequests] = useState<CourseRequest[]>([]);
  const [courseRequestPage, setCourseRequestPage] = useState(1);
  const [courseRequestTotal, setCourseRequestTotal] = useState(0);
  const courseRequestPageCacheRef = useRef(new Map<string, CourseRequestPageCache>());
  const courseRequestPrefetchRef = useRef(new Set<string>());
  const courseRequestFetchIdRef = useRef(0);
  const [activeCourseRequest, setActiveCourseRequest] = useState<CourseRequest | null>(null);
  const [studentScheduleSummaries, setStudentScheduleSummaries] = useState<StudentScheduleSummary[]>([]);
  const [selectedStudentSchedule, setSelectedStudentSchedule] = useState<StudentScheduleSummary | null>(null);
  const [selectedStudentCourses, setSelectedStudentCourses] = useState<Course[]>([]);
  const [selectedChangedCourse, setSelectedChangedCourse] = useState<Course | null>(null);
  const [isSyncingChangedCourse, setIsSyncingChangedCourse] = useState(false);

  const [isStudentEditModalOpen, setIsStudentEditModalOpen] = useState(false);
  const [studentEditData, setStudentEditData] = useState<Partial<Course> & { user_schedule_id?: string }>({});
  const [isSavingStudentCourse, setIsSavingStudentCourse] = useState(false);
  
  const [newLabelData, setNewLabelData] = useState({ type: 'Nghỉ', text: '', color: 'red' });

  const [quickTagCourse, setQuickTagCourse] = useState<Course | null>(null);
  const [quickTagData, setQuickTagData] = useState(createInitialTagData());
  const [isSavingQuickTag, setIsSavingQuickTag] = useState(false);

  const [showInlineLabelForm, setShowInlineLabelForm] = useState(false);
  const [inlineLabelData, setInlineLabelData] = useState(createInitialTagData());
  const [isSavingInlineLabel, setIsSavingInlineLabel] = useState(false);

  const [changedUserScheduleCourses, setChangedUserScheduleCourses] = useState<Course[]>([]); 
  const [showScheduleUpdateNotice, setShowScheduleUpdateNotice] = useState(false);
  const [hideScheduleUpdateNoticeNextTime, setHideScheduleUpdateNoticeNextTime] = useState(false);

  useEffect(() => {
    if (!loading) {
        setIsAdminView(isAdmin || isAuditor);
    }
  }, [isAdmin, isAuditor, loading]);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !isStudent || !!viewUserId || isAdminView) return;
    if (hasShownScheduleUpdateNoticeThisLoad) return;

    try {
        if (localStorage.getItem(SCHEDULE_UPDATE_NOTICE_STORAGE_KEY) === 'true') return;
    } catch (error) {
        console.error('Không thể đọc trạng thái thông báo lịch:', error);
    }

    hasShownScheduleUpdateNoticeThisLoad = true;
    setShowScheduleUpdateNotice(true);
  }, [loading, isAuthenticated, isStudent, viewUserId, isAdminView]);

  const handleCloseScheduleUpdateNotice = () => {
    setShowScheduleUpdateNotice(false);
  };

  const handleConfirmScheduleUpdateNotice = () => {
    if (hideScheduleUpdateNoticeNextTime) {
        try {
            localStorage.setItem(SCHEDULE_UPDATE_NOTICE_STORAGE_KEY, 'true');
        } catch (error) {
            console.error('Không thể lưu trạng thái thông báo lịch:', error);
        }
    }
    setShowScheduleUpdateNotice(false);
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  useEffect(() => {
    const closeDropdowns = () => {
        setIsWeekDropdownOpen(false);
        setIsMonthDropdownOpen(false);
    };
    document.addEventListener('click', closeDropdowns);
    return () => document.removeEventListener('click', closeDropdowns);
  }, []);

  const handleWindowMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5; 
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  };
  const handleWindowMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) {
        scrollRef.current.classList.remove('cursor-grabbing');
        scrollRef.current.classList.add('cursor-grab');
    }
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    if (scrollRef.current) {
        scrollRef.current.classList.add('cursor-grabbing');
        scrollRef.current.classList.remove('cursor-grab');
        startX.current = e.pageX - scrollRef.current.offsetLeft;
        scrollLeft.current = scrollRef.current.scrollLeft;
    }
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
  };
  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  const todayStr = formatDateStr(new Date());
  const getToolbarDropdownStyle = (
    triggerRef: React.RefObject<HTMLButtonElement | null>,
    widthPx: number
  ): React.CSSProperties => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return { top: 0, left: 0, width: widthPx };

    const viewportPadding = 12;
    const left = Math.min(
        Math.max(viewportPadding, rect.right - widthPx),
        window.innerWidth - widthPx - viewportPadding
    );

    return {
        position: 'fixed',
        top: rect.bottom + 8,
        left,
        width: widthPx,
    };
  };

  const fetchCourses = async () => {
    setIsLoading(true);
    try {
        const filterKey = JSON.stringify({
            semester: selectedSemester,
            phase: selectedPhase,
            search: searchTerm.trim(),
            subjectName: selectedSubjectName,
            major: selectedMajor,
            cohort: selectedCohort,
            groupName: selectedGroupName,
            academicProgram: selectedAcademicProgram,
            isAdminView,
            adminTab,
            pageSize: coursePageSize,
        });

        if (courseFilterKeyRef.current !== filterKey) {
            courseFilterKeyRef.current = filterKey;
            coursePageCacheRef.current.clear();
            setAvailableCourses([]);
            setCourseTotal(0);
            setCourseHasMore(false);
            if (coursePage !== 0) {
                setCoursePage(0);
                return;
            }
        }

        const pageCacheKey = `${filterKey}:page:${coursePage}`;
        const cachedPage = coursePageCacheRef.current.get(pageCacheKey);
        if (cachedPage) {
            setAvailableCourses(cachedPage.data);
            setCourseTotal(cachedPage.total);
            setCourseHasMore(cachedPage.hasMore);
            return;
        }

        const baseParams = new URLSearchParams({
            semester: selectedSemester,
            view: isAdminView ? 'detail' : 'summary',
            limit: String(coursePageSize),
            offset: String(coursePage * coursePageSize),
        });
        if (selectedPhase !== 'all') baseParams.set('phase', selectedPhase);
        if (selectedSubjectName !== 'all') baseParams.set('subjectName', selectedSubjectName);
        if (selectedMajor !== 'all') baseParams.set('major', selectedMajor);
        if (selectedCohort !== 'all') baseParams.set('cohort', selectedCohort);
        if (selectedGroupName !== 'all') baseParams.set('groupName', selectedGroupName);
        if (selectedAcademicProgram !== 'all') baseParams.set('academicProgram', selectedAcademicProgram);
        const term = searchTerm.trim();
        if (term) baseParams.set('search', term);

        const response = await fetch(apiUrl(`/courses?${baseParams.toString()}`), {
            headers: apiHeaders(),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Không tải được danh sách môn.');

        const rows = Array.isArray(payload.data) ? payload.data : [];
        const pagePayload = {
            data: rows,
            total: Number(payload.total || rows.length),
            hasMore: Boolean(payload.hasMore),
        };
        coursePageCacheRef.current.set(pageCacheKey, pagePayload);
        setAvailableCourses(pagePayload.data);
        setCourseTotal(pagePayload.total);
        setCourseHasMore(pagePayload.hasMore);
    } catch (error) { 
        console.error("Lỗi tải danh sách môn:", error); 
        await logWebError({
            source: 'supabase',
            action: searchTerm.trim() ? 'search_subjects' : 'load_subjects',
            error,
            metadata: {
                semester: selectedSemester,
                phase: selectedPhase,
                subjectName: selectedSubjectName,
                major: selectedMajor,
                cohort: selectedCohort,
                groupName: selectedGroupName,
                academicProgram: selectedAcademicProgram,
                page: coursePage,
                pageSize: coursePageSize,
                hasSearchTerm: Boolean(searchTerm.trim()),
            },
        });
    } finally { setIsLoading(false); }
  };

  const fetchCourseFilterOptions = async () => {
    if (!isAuthenticated) return;
    try {
        const optionsCacheKey = JSON.stringify({
            semester: selectedSemester,
            phase: selectedPhase,
            major: selectedMajor,
            cohort: selectedCohort,
            academicProgram: selectedAcademicProgram,
        });
        const cachedOptions = courseFilterOptionsCacheRef.current.get(optionsCacheKey);
        if (cachedOptions) {
            setSubjectNameOptions(cachedOptions.subjectNameOptions);
            setMajorOptions(cachedOptions.majorOptions);
            setCohortOptions(cachedOptions.cohortOptions);
            setGroupNameOptions(cachedOptions.groupNameOptions);
            setAcademicProgramOptions(normalizeAcademicProgramOptions(cachedOptions.academicProgramOptions));
            return;
        }

        const params = new URLSearchParams({
            resource: 'filter-options',
            semester: selectedSemester,
        });
        if (selectedPhase !== 'all') params.set('phase', selectedPhase);
        if (selectedMajor !== 'all') params.set('major', selectedMajor);
        if (selectedCohort !== 'all') params.set('cohort', selectedCohort);
        if (selectedAcademicProgram !== 'all') params.set('academicProgram', selectedAcademicProgram);

        const response = await fetch(apiUrl(`/courses?${params.toString()}`), {
            headers: apiHeaders(),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Không tải được bộ lọc môn.');
        const nextOptions = {
            subjectNameOptions: Array.isArray(payload.subjectNameOptions) ? payload.subjectNameOptions : [],
            majorOptions: Array.isArray(payload.majorOptions) ? payload.majorOptions : [],
            cohortOptions: Array.isArray(payload.cohortOptions) ? payload.cohortOptions : [],
            groupNameOptions: Array.isArray(payload.groupNameOptions) ? payload.groupNameOptions : [],
            academicProgramOptions: normalizeAcademicProgramOptions(Array.isArray(payload.academicProgramOptions) ? payload.academicProgramOptions : []),
        };
        courseFilterOptionsCacheRef.current.set(optionsCacheKey, nextOptions);
        setSubjectNameOptions(nextOptions.subjectNameOptions);
        setMajorOptions(nextOptions.majorOptions);
        setCohortOptions(nextOptions.cohortOptions);
        setGroupNameOptions(nextOptions.groupNameOptions);
        setAcademicProgramOptions(nextOptions.academicProgramOptions);
    } catch (error) {
        console.error('Lỗi tải bộ lọc chuyên ngành/nhóm:', error);
        await logWebError({
            source: 'supabase',
            action: 'filter_subjects',
            error,
            metadata: {
                semester: selectedSemester,
                phase: selectedPhase,
                major: selectedMajor,
                cohort: selectedCohort,
                academicProgram: selectedAcademicProgram,
            },
        });
        setSubjectNameOptions([]);
        setMajorOptions([]);
        setCohortOptions([]);
        setGroupNameOptions([]);
        setAcademicProgramOptions(DEFAULT_ACADEMIC_PROGRAM_OPTIONS);
    }
  };

  const refreshCourseListAndFilters = () => {
    coursePageCacheRef.current.clear();
    courseFilterOptionsCacheRef.current.clear();
    courseFilterKeyRef.current = '';
    fetchCourseFilterOptions();
    if (coursePage !== 0) {
        setCoursePage(0);
    } else {
        fetchCourses();
    }
  };

  useEffect(() => {
    if (!selectedCourseInfo?.course?.id || selectedCourseInfo.course.user_schedule_id) {
        setIsCourseDetailLoading(false);
        return;
    }

    const courseId = selectedCourseInfo.course.id;
    if ((selectedCourseInfo.course as any).__detailLoaded) {
        setIsCourseDetailLoading(false);
        return;
    }

    const cachedDetail = courseDetailCacheRef.current.get(courseId);
    if (cachedDetail) {
        setSelectedCourseInfo(prev => prev?.course.id === courseId
            ? { ...prev, course: { ...prev.course, ...cachedDetail, __detailLoaded: true } as Course }
            : prev
        );
        setIsCourseDetailLoading(false);
        return;
    }

    let cancelled = false;
    setIsCourseDetailLoading(true);
    const loadCourseDetail = async () => {
        try {
            const params = new URLSearchParams({ resource: 'course-detail', id: courseId });
            const response = await fetch(apiUrl(`/courses?${params.toString()}`), {
                headers: apiHeaders(),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload?.error || 'Không tải được chi tiết môn.');
            if (cancelled || !payload?.data) return;
            courseDetailCacheRef.current.set(courseId, payload.data);
            setSelectedCourseInfo(prev => prev?.course.id === courseId
                ? { ...prev, course: { ...prev.course, ...payload.data, __detailLoaded: true } as Course }
                : prev
            );
        } catch (error) {
            console.error('Lỗi tải chi tiết môn:', error);
            await logWebError({
                source: 'supabase',
                action: 'view_subject_detail',
                error,
                metadata: {
                    courseId,
                    semester: selectedSemester,
                },
            });
        } finally {
            if (!cancelled) setIsCourseDetailLoading(false);
        }
    };
    loadCourseDetail();
    return () => {
        cancelled = true;
    };
  }, [selectedCourseInfo?.course?.id, selectedCourseInfo?.course?.user_schedule_id, (selectedCourseInfo?.course as any)?.__detailLoaded]);

  const fetchAdminUserSchedules = async (mode: 'changed' | 'summaries' | 'courses', extraParams: Record<string, string> = {}) => {
    const token = session?.access_token;
    if (!token) throw new Error('Admin session is missing');

    const params = new URLSearchParams({
        mode,
        semester: selectedSemester,
        ...extraParams
    });

    params.set('resource', 'user-schedules');

    const response = await fetch(apiUrl(`/courses?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json();

    if (!response.ok) throw new Error(payload?.error || 'Unable to load user schedules');
    return payload.data || [];
  };

  const fetchChangedUserScheduleCourses = async () => {
    if (!isAdmin && !isAuditor) return;
    setIsLoading(true);
    setAdminScheduleError('');
    try {
        const data = await fetchAdminUserSchedules('changed', {
            phase: selectedPhase,
            search: searchTerm.trim()
        });
        setChangedUserScheduleCourses(sortChangedUserScheduleCourses(data));
    } catch (err: any) {
        console.error("Lỗi:", err);
        setAdminScheduleError(err?.message || 'Không tải được dữ liệu TKB sinh viên.');
        setChangedUserScheduleCourses([]);
    } finally {
        setIsLoading(false);
    }
  };

  const getChangedCourseDiffs = (course: Course | null) => {
    if (!course?.original_course) return [];
    return SYNCABLE_COURSE_FIELDS
        .filter(field => Object.prototype.hasOwnProperty.call(course.custom_data || {}, field.key))
        .map(field => ({
            ...field,
            originalValue: (course.original_course as any)?.[field.key],
            changedValue: (course.custom_data as any)?.[field.key]
        }))
        .filter(diff => normalizeDiffValue(diff.originalValue) !== normalizeDiffValue(diff.changedValue));
  };

  const handleSyncChangedField = async (fieldKey: string, fieldLabel: string) => {
    if (!selectedChangedCourse?.user_schedule_id || isAuditor) return;
    const diffs = getChangedCourseDiffs(selectedChangedCourse);
    const selectedDiff = diffs.find(diff => String(diff.key) === fieldKey);
    if (!selectedDiff) return;
    if (!await showConfirm(`Đồng bộ riêng trường "${fieldLabel}" của môn ${selectedChangedCourse.course_code}?`)) return;

    setIsSyncingChangedCourse(true);
    try {
        const token = session?.access_token;
        if (!token) throw new Error('Admin session is missing');

        const response = await fetch(apiUrl('/courses?resource=user-schedules'), {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userScheduleId: selectedChangedCourse.user_schedule_id,
                fieldKeys: [fieldKey]
            })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Không đồng bộ được dữ liệu gốc.');

        const syncedValue = payload?.data?.updates?.[fieldKey] ?? selectedDiff.changedValue;
        const syncedCourseId = selectedChangedCourse.id;

        const updateCourseOriginal = (course: Course): Course => {
            if (course.id !== syncedCourseId) return course;

            const nextOriginalCourse = {
                ...(course.original_course || {}),
                [fieldKey]: syncedValue,
            };

            const nextCustomData = { ...(course.custom_data || {}) };
            if (course.user_schedule_id === selectedChangedCourse.user_schedule_id) {
                delete nextCustomData[fieldKey];
            }

            return {
                ...course,
                ...(course.user_schedule_id === selectedChangedCourse.user_schedule_id ? { [fieldKey]: syncedValue } : {}),
                original_course: nextOriginalCourse,
                custom_data: nextCustomData,
            };
        };

        const nextSelectedCourse = updateCourseOriginal(selectedChangedCourse);
        setSelectedChangedCourse(nextSelectedCourse);
        setChangedUserScheduleCourses(prev =>
            sortChangedUserScheduleCourses(
                prev
                    .map(updateCourseOriginal)
                    .filter(course => getChangedCourseDiffs(course).length > 0)
            )
        );
        setAvailableCourses(prev => prev.map(course => (
            course.id === syncedCourseId
                ? { ...course, [fieldKey]: syncedValue }
                : course
        )));
    } catch (err: any) {
        console.error(err);
        alert(err?.message || 'Có lỗi xảy ra khi đồng bộ dữ liệu gốc.');
    } finally {
        setIsSyncingChangedCourse(false);
    }
  };

  const buildCourseFromUserSchedule = (item: any, profile?: UserProfile): Course | null => {
      if (!item?.course_schedules) return null;
      let cData = item.custom_data;
      if (typeof cData === 'string') {
          try { cData = JSON.parse(cData); } catch(e) { cData = {}; }
      }
      return {
          ...item.course_schedules,
          ...cData,
          id: item.course_schedules.id,
          user_schedule_id: item.id,
          semester: item.semester,
          user: profile
      };
  };

  const fetchStudentScheduleSummaries = async () => {
    if (!isAdmin && !isAuditor) return;
    setIsLoading(true);
    setAdminScheduleError('');
    try {
        const summaries = await fetchAdminUserSchedules('summaries');

        if (summaries.length === 0) {
            setStudentScheduleSummaries([]);
            setSelectedStudentSchedule(null);
            setSelectedStudentCourses([]);
            return;
        }

        setStudentScheduleSummaries(summaries);
    } catch (err) {
        console.error("Lỗi tải danh sách TKB sinh viên:", err);
        setAdminScheduleError((err as Error)?.message || 'Không tải được danh sách TKB sinh viên.');
        setStudentScheduleSummaries([]);
    } finally {
        setIsLoading(false);
    }
  };

  const openStudentSchedule = async (student: StudentScheduleSummary, options?: { replace?: boolean }) => {
      playClick();
      setSelectedStudentSchedule(student);
      navigate(`/schedule/${encodeURIComponent(student.student_code || student.user_id)}`, { replace: options?.replace });
      await fetchStudentScheduleCourses(student);
  };

  const fetchStudentScheduleCourses = async (student: StudentScheduleSummary) => {
    if (!student?.user_id) return;
    setIsLoading(true);
    setAdminScheduleError('');
    try {
        const courses = await fetchAdminUserSchedules('courses', { userId: student.user_id });
        setSelectedStudentCourses(courses);
    } catch (err) {
        console.error("Lỗi tải TKB sinh viên:", err);
        setAdminScheduleError((err as Error)?.message || 'Không tải được TKB sinh viên.');
        setSelectedStudentCourses([]);
    } finally {
        setIsLoading(false);
    }
  };

  const getCourseRequestCacheScope = () => (
      `${COURSE_REQUEST_CACHE_PREFIX}:${session?.user?.id || 'anonymous'}`
  );

  const getCourseRequestCacheKey = (page: number, search: string) => (
      `${getCourseRequestCacheScope()}:${encodeURIComponent(search.trim().toLowerCase())}:${page}`
  );

  const readCourseRequestCache = (page: number, search: string) => {
      const key = getCourseRequestCacheKey(page, search);
      const memoryEntry = courseRequestPageCacheRef.current.get(key);
      if (memoryEntry && Date.now() - memoryEntry.cachedAt < COURSE_REQUEST_CACHE_TTL_MS) {
          return memoryEntry;
      }

      try {
          const raw = window.localStorage.getItem(key);
          if (!raw) return null;
          const parsed = JSON.parse(raw) as CourseRequestPageCache;
          const isValid = Array.isArray(parsed?.data)
              && Number.isFinite(parsed?.total)
              && typeof parsed?.hasMore === 'boolean'
              && Number.isFinite(parsed?.cachedAt);
          if (!isValid || Date.now() - parsed.cachedAt >= COURSE_REQUEST_CACHE_TTL_MS) {
              window.localStorage.removeItem(key);
              return null;
          }
          courseRequestPageCacheRef.current.set(key, parsed);
          return parsed;
      } catch (error) {
          console.warn('Không thể đọc cache yêu cầu thêm môn:', error);
          return null;
      }
  };

  const writeCourseRequestCache = (page: number, search: string, entry: CourseRequestPageCache) => {
      const key = getCourseRequestCacheKey(page, search);
      courseRequestPageCacheRef.current.set(key, entry);
      try {
          window.localStorage.setItem(key, JSON.stringify(entry));
      } catch (error) {
          console.warn('Không thể lưu cache yêu cầu thêm môn:', error);
      }
  };

  const clearCourseRequestCache = () => {
      const scope = `${getCourseRequestCacheScope()}:`;
      courseRequestFetchIdRef.current += 1;
      courseRequestPageCacheRef.current.clear();
      courseRequestPrefetchRef.current.clear();
      try {
          Object.keys(window.localStorage).forEach((key) => {
              if (key.startsWith(scope)) window.localStorage.removeItem(key);
          });
      } catch (error) {
          console.warn('Không thể xóa cache yêu cầu thêm môn:', error);
      }
  };

  const fetchCourseRequests = async (
      requestedPage = courseRequestPage,
      options: { force?: boolean; prefetch?: boolean } = {},
  ) => {
    if (!isAdmin && !isAuditor) return;
    const token = session?.access_token;
    if (!token) return;

    const page = Math.max(1, requestedPage);
    const normalizedSearch = searchTerm.trim();
    const cacheKey = getCourseRequestCacheKey(page, normalizedSearch);
    const isPrefetch = options.prefetch === true;
    const fetchId = isPrefetch
        ? courseRequestFetchIdRef.current
        : ++courseRequestFetchIdRef.current;
    const cached = options.force ? null : readCourseRequestCache(page, normalizedSearch);

    if (cached) {
        if (!isPrefetch) {
            setCourseRequests(cached.data);
            setCourseRequestTotal(cached.total);
            setAdminScheduleError('');
            setIsLoading(false);
            if (cached.hasMore) void fetchCourseRequests(page + 1, { prefetch: true });
        }
        return;
    }

    if (isPrefetch && courseRequestPrefetchRef.current.has(cacheKey)) return;
    if (isPrefetch) {
        courseRequestPrefetchRef.current.add(cacheKey);
    } else {
        setIsLoading(true);
        setAdminScheduleError('');
    }

    try {
        const params = new URLSearchParams({
            resource: 'course-requests',
            status: 'pending',
            search: normalizedSearch,
            limit: String(COURSE_REQUEST_PAGE_SIZE),
            offset: String((page - 1) * COURSE_REQUEST_PAGE_SIZE),
        });

        const response = await fetch(apiUrl(`/courses?${params.toString()}`), {
            headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Không tải được yêu cầu thêm môn.');
        const pendingRequests = (payload.data || []).filter((request: CourseRequest) =>
            String(request.status || 'pending').trim().toLowerCase() === 'pending'
        );
        const rows = sortCourseRequestsNewestFirst(pendingRequests);
        const total = Number.isFinite(Number(payload.total))
            ? Number(payload.total)
            : (page - 1) * COURSE_REQUEST_PAGE_SIZE + rows.length + (payload.hasMore ? 1 : 0);
        const hasMore = typeof payload.hasMore === 'boolean'
            ? payload.hasMore
            : total > page * COURSE_REQUEST_PAGE_SIZE;
        const entry: CourseRequestPageCache = {
            data: rows,
            total,
            hasMore,
            cachedAt: Date.now(),
        };

        if (fetchId !== courseRequestFetchIdRef.current) return;
        writeCourseRequestCache(page, normalizedSearch, entry);
        if (!isPrefetch) {
            const resolvedTotalPages = Math.max(1, Math.ceil(total / COURSE_REQUEST_PAGE_SIZE));
            if (page > resolvedTotalPages) {
                setCourseRequestPage(resolvedTotalPages);
                return;
            }
            setCourseRequests(rows);
            setCourseRequestTotal(total);
            if (hasMore) void fetchCourseRequests(page + 1, { prefetch: true });
        }
    } catch (err) {
        if (!isPrefetch && fetchId === courseRequestFetchIdRef.current) {
            console.error("Lỗi tải yêu cầu thêm môn:", err);
            setAdminScheduleError((err as Error)?.message || 'Không tải được yêu cầu thêm môn.');
            setCourseRequests([]);
            setCourseRequestTotal(0);
        }
    } finally {
        if (isPrefetch) {
            courseRequestPrefetchRef.current.delete(cacheKey);
        } else if (fetchId === courseRequestFetchIdRef.current) {
            setIsLoading(false);
        }
    }
  };

  const openCourseRequestEditor = (request: CourseRequest) => {
      if (isAuditor) return;
      setActiveCourseRequest(request);
      setAdminEditData({
          subject_name: request.subject_name,
          course_code: request.course_code,
          instructor: request.instructor || '',
          credits: 3,
          semester: selectedSemester,
          phase: selectedPhase === 'all' ? '1' : selectedPhase,
          campus: 'TD',
          is_user_added: false,
      });
      setIsAdminEditModalOpen(true);
  };

  const rejectCourseRequest = async (request: CourseRequest) => {
      if (isAuditor) { alert("⚠️ Tính năng này bị khóa đối với tài khoản Auditor."); return; }
      if (!await showConfirm(`Từ chối yêu cầu thêm môn "${request.subject_name}"?`)) return;
      const token = session?.access_token;
      if (!token) return;

      try {
          const response = await fetch(apiUrl('/courses?resource=course-requests'), {
              method: 'PATCH',
              headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({ requestId: request.id, status: 'rejected' }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error || 'Không thể từ chối yêu cầu.');
          clearCourseRequestCache();
          if (courseRequests.length === 1 && courseRequestPage > 1) {
              setCourseRequestPage(page => page - 1);
          } else {
              void fetchCourseRequests(courseRequestPage, { force: true });
          }
      } catch (err) {
          console.error(err);
          alert((err as Error)?.message || 'Có lỗi xảy ra khi từ chối yêu cầu.');
      }
  };

  useEffect(() => {
    if (!isAuthenticated || (isAdminView && adminTab !== 'system' && adminTab !== 'user')) return;
    const timeoutId = window.setTimeout(() => {
      fetchCourses();
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm, selectedSemester, selectedPhase, selectedSubjectName, selectedMajor, selectedCohort, selectedGroupName, selectedAcademicProgram, coursePage, coursePageSize, isAuthenticated, isAdminView, adminTab]);
  useEffect(() => {
    if (!isAuthenticated || (isAdminView && adminTab !== 'system' && adminTab !== 'user')) return;
    fetchCourseFilterOptions();
  }, [selectedSemester, selectedPhase, selectedMajor, selectedCohort, selectedAcademicProgram, isAuthenticated, isAdminView, adminTab]);
  useEffect(() => {
    if (selectedSubjectName !== 'all' && !subjectNameOptions.includes(selectedSubjectName)) {
        setSelectedSubjectName('all');
    }
  }, [selectedSubjectName, subjectNameOptions]);
  useEffect(() => {
    if (selectedMajor !== 'all' && !majorOptions.includes(selectedMajor)) {
        setSelectedMajor('all');
    }
  }, [selectedMajor, majorOptions]);
  useEffect(() => {
    if (selectedCohort !== 'all' && !cohortOptions.includes(selectedCohort)) {
        setSelectedCohort('all');
    }
  }, [selectedCohort, cohortOptions]);
  useEffect(() => {
    if (selectedGroupName !== 'all' && !groupNameOptions.includes(selectedGroupName)) {
        setSelectedGroupName('all');
    }
  }, [selectedGroupName, groupNameOptions]);
  useEffect(() => {
    if (selectedAcademicProgram !== 'all' && !academicProgramOptions.includes(selectedAcademicProgram)) {
        setSelectedAcademicProgram('all');
    }
  }, [selectedAcademicProgram, academicProgramOptions]);
  useEffect(() => {
    if (!isAuthenticated || !isAdminView || adminTab !== 'requested') return;
    const timeoutId = window.setTimeout(() => {
      fetchCourseRequests(courseRequestPage);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm, courseRequestPage, isAuthenticated, isAdminView, adminTab]);
  useEffect(() => { if (isAuthenticated && isAdminView && adminTab === 'user_changed') fetchChangedUserScheduleCourses(); }, [searchTerm, selectedSemester, selectedPhase, isAuthenticated, isAdminView, adminTab]);
  useEffect(() => { if (isAuthenticated && isAdminView && adminTab === 'student_schedules') fetchStudentScheduleSummaries(); }, [selectedSemester, isAuthenticated, isAdminView, adminTab]);
  useEffect(() => {
    if (!selectedRouteStudentCode) return;
    if (!(isAdmin || isAuditor)) return;
    setIsAdminView(true);
    setAdminTab('student_schedules');
  }, [selectedRouteStudentCode, isAdmin, isAuditor]);

  useEffect(() => {
    if (!selectedRouteStudentCode || adminTab !== 'student_schedules' || studentScheduleSummaries.length === 0) return;

    const target = studentScheduleSummaries.find(student =>
        student.student_code === selectedRouteStudentCode ||
        student.user_id === selectedRouteStudentCode ||
        student.email === selectedRouteStudentCode
    );

    if (target) {
        setSelectedStudentSchedule(target);
        fetchStudentScheduleCourses(target);
    } else {
        setSelectedStudentSchedule(null);
        setSelectedStudentCourses([]);
    }
  }, [selectedRouteStudentCode, adminTab, studentScheduleSummaries, selectedSemester]);

  const fetchMySchedule = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; 
    const targetId = viewUserId || user.id;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const params = new URLSearchParams({ resource: 'my-schedule' });
      if (targetId !== user.id) params.set('userId', targetId);

      const response = await fetch(apiUrl(`/courses?${params.toString()}`), {
        headers: apiHeaders({ Authorization: `Bearer ${token}` }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Không tải được TKB cá nhân.');
      setMySchedule(payload.data || []);
    } catch (error) {
      console.error("Lỗi kéo TKB:", error);
      await logWebError({
        source: 'supabase',
        action: 'load_schedule',
        error,
        metadata: {
          targetId,
          selectedSemester,
          isViewingOtherUser: targetId !== user.id,
        },
      });
    }
  };
  useEffect(() => { if (isAuthenticated) fetchMySchedule(); }, [isAuthenticated, viewUserId]);

  const isExamInShift = (examShift: string, currentShift: string) => {
    if (!examShift) return false;
    const normalized = examShift.replace(/\s/g, '').toUpperCase();
    const morningShifts = ['CA1', 'CA2', 'CAS1', 'CAS2', 'CAS3', '1', '2', 'S1', 'S2', 'S3'];
    const afternoonShifts = ['CA3', 'CA4', 'CA5', 'CAC1', 'CAC2', 'CAC3', '3', '4', '5', 'C1', 'C2', 'C3'];
    if (currentShift === 'S') return morningShifts.includes(normalized);
    return afternoonShifts.includes(normalized);
  };

  const getScheduleConflictMessage = (course: Course, existingCourses: Course[]) => {
    for (const existingCourse of existingCourses) {
      let isConflict = false;
      let conflictDay: number | null = null;
      let conflictShiftStr = "";

      for (let w = 1; w <= getSemesterMaxWeek(selectedSemester); w++) {
        for (let d = 2; d <= 8; d++) {
          ['S', 'C'].forEach(testShift => {
             const slot1 = getCourseDetailsForSlot(course, d, w, testShift);
             const slot2 = getCourseDetailsForSlot(existingCourse, d, w, testShift);
             if (slot1 && slot2) {
               isConflict = true;
               conflictDay = d;
               conflictShiftStr = slot1.shift;
             }
          });
        }
        if (isConflict) break;
      }

      if (isConflict) {
        return `⛔ CẢNH BÁO TRÙNG LỊCH HỌC!\n\nMôn [${course.subject_name}] bị trùng giờ học với môn [${existingCourse.subject_name}].\n(Bị trùng lặp vào Thứ ${conflictDay} - ${getShiftDisplay(conflictShiftStr)}).\n\nVui lòng chọn Lớp học phần khác!`;
      }

      if (course.exam_date && existingCourse.exam_date && course.exam_date.trim() === existingCourse.exam_date.trim()) {
        const examGapMinutes = getExamTimeGapMinutes(course.exam_shift, existingCourse.exam_shift);

        if (examGapMinutes !== null && examGapMinutes < 120) {
          const newExamTime = getExamTime(course.exam_shift);
          const existingExamTime = getExamTime(existingCourse.exam_shift);
          return `⛔ CẢNH BÁO TRÙNG LỊCH THI!\n\nMôn [${course.subject_name}] có lịch thi quá sát với môn [${existingCourse.subject_name}].\n(Cùng thi ngày ${course.exam_date}: ca ${course.exam_shift || '-'}${newExamTime ? ` lúc ${newExamTime}` : ''} và ca ${existingCourse.exam_shift || '-'}${existingExamTime ? ` lúc ${existingExamTime}` : ''}, cách nhau ${examGapMinutes} phút).\n\nHệ thống chỉ chặn khi 2 ca thi cùng ngày cách nhau dưới 2 tiếng.`;
        }
      }
    }

    return '';
  };

  const ensureCourseDetail = async (course: Course) => {
    if (course.user_schedule_id || (course as any).__detailLoaded) return course;
    const cachedDetail = courseDetailCacheRef.current.get(course.id);
    if (cachedDetail) return { ...course, ...cachedDetail, __detailLoaded: true } as Course;

    const params = new URLSearchParams({ resource: 'course-detail', id: course.id });
    const response = await fetch(apiUrl(`/courses?${params.toString()}`), {
      headers: apiHeaders(),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Không tải được chi tiết môn.');
    courseDetailCacheRef.current.set(course.id, payload.data);
    return { ...course, ...payload.data, __detailLoaded: true } as Course;
  };

  const addToPlanSchedule = async (course: Course) => {
    if (!isAuthenticated) { alert("⚠️ Vui lòng đăng nhập!"); return; }
    if (currentPlanSchedule.some(c => c.id === course.id)) {
      alert(`Môn học đã có trong Kế hoạch ${activePlanKey}!`);
      return;
    }

    let fullCourse = course;
    try {
      fullCourse = await ensureCourseDetail(course);
    } catch (error) {
      console.error('Không tải được chi tiết môn trước khi thêm kế hoạch:', error);
      await logWebError({
        source: 'supabase',
        action: 'add_subject_to_plan',
        error,
        metadata: {
          courseId: course.id,
          courseCode: course.course_code,
          semester: selectedSemester,
          planKey: activePlanKey,
        },
      });
    }

    const conflictMessage = getScheduleConflictMessage(fullCourse, currentPlanSchedule);
    if (conflictMessage) {
      alert(conflictMessage);
      return;
    }

    const planCourse = { ...fullCourse, semester: fullCourse.semester || selectedSemester };
    setPlanSchedules(prev => ({
      ...prev,
      [activePlanKey]: [...prev[activePlanKey], planCourse],
    }));
  };

  const removeFromPlanSchedule = (courseId: string) => {
    setPlanSchedules(prev => ({
      ...prev,
      [activePlanKey]: prev[activePlanKey].filter(c => c.id !== courseId),
    }));
  };

  const addToActiveSchedule = async (course: Course) => {
    if (isPlanMode) {
      await addToPlanSchedule(course);
      return;
    }

    await addToSchedule(course);
  };

  const removeFromActiveSchedule = (courseId: string) => {
    if (isPlanMode) {
      removeFromPlanSchedule(courseId);
      return;
    }

    removeFromSchedule(courseId);
  };

  const addToSchedule = async (course: Course) => {
    if (isSyncing || addScheduleInFlightRef.current) return;
    addScheduleInFlightRef.current = true;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      addScheduleInFlightRef.current = false;
      alert("⚠️ Vui lòng đăng nhập!");
      return;
    }
    if (mySchedule.some(c => c.id === course.id)) {
      addScheduleInFlightRef.current = false;
      alert("Môn này đã có trong lịch");
      return;
    }

    let fullCourse = course;
    try {
      fullCourse = await ensureCourseDetail(course);
    } catch (error) {
      console.error('Không tải được chi tiết môn trước khi thêm lịch:', error);
      await logWebError({
        source: 'supabase',
        action: 'add_subject_to_plan',
        error,
        metadata: {
          courseId: course.id,
          courseCode: course.course_code,
          semester: selectedSemester,
        },
      });
    }

    const conflictMessage = getScheduleConflictMessage(fullCourse, currentSemesterSchedule);
    if (conflictMessage) {
      addScheduleInFlightRef.current = false;
      alert(conflictMessage);
      return;
    }

    setMySchedule([...mySchedule, fullCourse]);
    setIsSyncing(true);
    try {
      const { error } = await supabase
        .from('user_schedules')
        .upsert(
          { user_id: user.id, course_id: fullCourse.id, semester: selectedSemester },
          { onConflict: 'user_id,course_id', ignoreDuplicates: true }
        );
      if (error) throw error;
      fetchMySchedule();
    } catch (err) {
        await logWebError({
          source: 'supabase',
          action: 'save_schedule',
          error: err,
          metadata: {
            operation: 'add_subject_to_plan',
            courseId: fullCourse.id,
            courseCode: fullCourse.course_code,
            semester: selectedSemester,
          },
        });
        setMySchedule(mySchedule.filter(c => c.id !== fullCourse.id));
    } finally {
      addScheduleInFlightRef.current = false;
      setIsSyncing(false);
    }
  };

  const removeFromSchedule = async (courseId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const backup = [...mySchedule];
    setMySchedule(mySchedule.filter(c => c.id !== courseId));
    try {
      const { error } = await supabase.from('user_schedules').delete().eq('user_id', user.id).eq('course_id', courseId);
      if (error) {
        await logWebError({
          source: 'supabase',
          action: 'remove_subject_from_plan',
          error,
          metadata: {
            courseId,
            semester: selectedSemester,
          },
        });
        setMySchedule(backup);
      }
    } catch (err) {
      await logWebError({
        source: 'supabase',
        action: 'remove_subject_from_plan',
        error: err,
        metadata: {
          courseId,
          semester: selectedSemester,
        },
      });
      setMySchedule(backup);
    }
  };

  // ==========================================
  // XỬ LÝ GẮN NHÃN CÁ NHÂN HÓA (ĐÃ CHUẨN HÓA)
  // ==========================================
  const handleAddLabel = () => {
      if (newLabelData.type === 'Khác' && !newLabelData.text.trim()) {
          alert("Vui lòng nhập tên nhãn!"); return;
      }
      const finalColor = newLabelData.type === 'Khác' ? newLabelData.color : FIXED_LABEL_COLORS[newLabelData.type];
      
      const newLabel: CourseLabel = {
          id: Math.random().toString(36).substr(2, 9),
          type: newLabelData.type,
          text: newLabelData.type === 'Khác' ? newLabelData.text : undefined,
          color: finalColor,
          date: '' // Bảng sửa thông tin chung thì không gắn ngày cụ thể
      };
      setStudentEditData(prev => ({
          ...prev,
          labels: [...(prev.labels || []), newLabel]
      }));
      setNewLabelData({ type: 'Nghỉ', text: '', color: 'red' }); 
  };

  const handleRemoveLabel = (idToRemove: string) => {
      setStudentEditData(prev => {
          const labelToRemove = (prev.labels || []).find(item => item.id === idToRemove);
          return {
              ...prev,
              labels: (prev.labels || []).filter(l => l.id !== idToRemove && (!labelToRemove?.makeupId || l.makeupId !== labelToRemove.makeupId)),
              makeup_schedules: (prev.makeup_schedules || []).filter(item => !labelToRemove?.makeupId || item.id !== labelToRemove.makeupId)
          };
      });
  };

  const handleQuickSaveLabel = async () => {
      if (!quickTagCourse || !quickTagCourse.user_schedule_id) return;
      if (quickTagData.type === 'Khác' && !quickTagData.text.trim()) {
          alert("Vui lòng nhập tên nhãn!"); return;
      }
      setIsSavingQuickTag(true);
      try {
          const targetDate = quickTagCourse.dateStr || '';
          const labelPayload = buildLabelPayload(quickTagCourse, quickTagData, targetDate);
          if ('error' in labelPayload) {
              alert(labelPayload.error);
              return;
          }

          const { id, user_schedule_id, is_user_added, user, labels, dateStr, ...rest } = quickTagCourse;
          
          const overrideData = {
              ...rest,
              labels: labelPayload.updatedLabels,
              makeup_schedules: labelPayload.updatedMakeupSchedules
          };

          const { error } = await supabase
              .from('user_schedules')
              .update({ custom_data: overrideData })
              .eq('id', quickTagCourse.user_schedule_id);

          if (error) throw error;
          
          setQuickTagCourse(null);
          setQuickTagData(createInitialTagData());
          fetchMySchedule(); 
      } catch (err) {
          console.error(err);
          alert("Lỗi khi gắn nhãn nhanh.");
      } finally {
          setIsSavingQuickTag(false);
      }
  };

  const handleInlineSaveLabel = async () => {
      if (!selectedCourseInfo || !selectedCourseInfo.dateStr) {
          alert("Vui lòng chọn môn học từ lịch ở một ngày cụ thể để gắn nhãn!");
          return;
      }
      
      const course = currentSemesterSchedule.find(c => c.id === selectedCourseInfo.course.id) || selectedCourseInfo.course;
      if (!course.user_schedule_id) return;

      if (inlineLabelData.type === 'Khác' && !inlineLabelData.text.trim()) {
          alert("Vui lòng nhập tên nhãn!"); return;
      }
      setIsSavingInlineLabel(true);
      try {
          const targetDate = selectedCourseInfo.dateStr || '';
          const labelPayload = buildLabelPayload(course, inlineLabelData, targetDate);
          if ('error' in labelPayload) {
              alert(labelPayload.error);
              return;
          }

          const { id, user_schedule_id, is_user_added, user, labels, dateStr, ...rest } = course;
          const overrideData = {
              ...rest,
              labels: labelPayload.updatedLabels,
              makeup_schedules: labelPayload.updatedMakeupSchedules
          };

          const { error } = await supabase
              .from('user_schedules')
              .update({ custom_data: overrideData })
              .eq('id', course.user_schedule_id);

          if (error) throw error;

          const updatedCourse = { ...course, labels: labelPayload.updatedLabels, makeup_schedules: labelPayload.updatedMakeupSchedules };
          setSelectedCourseInfo({ ...selectedCourseInfo, course: updatedCourse });
          setMySchedule(prev => prev.map(c => c.id === course.id ? updatedCourse : c));
          setChangedUserScheduleCourses(prev => prev.map(c => c.id === course.id ? updatedCourse : c));
          
          setShowInlineLabelForm(false);
          setInlineLabelData(createInitialTagData());
      } catch (err) {
          console.error(err);
          alert("Lỗi khi thêm nhãn.");
      } finally {
          setIsSavingInlineLabel(false);
      }
  };

  const handleInlineRemoveLabel = async (labelIdToRemove: string) => {
      if (!selectedCourseInfo) return;
      const course = currentSemesterSchedule.find(c => c.id === selectedCourseInfo.course.id) || selectedCourseInfo.course;
      if (!course.user_schedule_id) return;
      
      try {
          const { id, user_schedule_id, is_user_added, user, labels, dateStr, ...rest } = course;
          const labelToRemove = (labels || []).find(l => l.id === labelIdToRemove);
          const updatedLabels = (labels || []).filter(l => l.id !== labelIdToRemove && (!labelToRemove?.makeupId || l.makeupId !== labelToRemove.makeupId));
          const updatedMakeupSchedules = (course.makeup_schedules || []).filter(item => !labelToRemove?.makeupId || item.id !== labelToRemove.makeupId);
          const overrideData = {
              ...rest,
              labels: updatedLabels,
              makeup_schedules: updatedMakeupSchedules
          };

          const { error } = await supabase
              .from('user_schedules')
              .update({ custom_data: overrideData })
              .eq('id', course.user_schedule_id);

          if (error) throw error;

          const updatedCourse = { ...course, labels: updatedLabels, makeup_schedules: updatedMakeupSchedules };
          setSelectedCourseInfo({ ...selectedCourseInfo, course: updatedCourse });
          setMySchedule(prev => prev.map(c => c.id === course.id ? updatedCourse : c));
          setChangedUserScheduleCourses(prev => prev.map(c => c.id === course.id ? updatedCourse : c));
      } catch (err) {
          console.error(err);
          alert("Lỗi khi xóa nhãn.");
      }
  };

  const handleStudentSaveCourse = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isStudentCourseEditLocked(studentEditData)) {
          alert("Tạm thời chưa cho phép sinh viên chỉnh sửa thông tin môn học của học kỳ 1 năm học 2026-2027.");
          setIsStudentEditModalOpen(false);
          return;
      }
      if (!studentEditData.subject_name || !studentEditData.course_code) {
          alert("Vui lòng nhập Tên môn và Mã môn!");
          return;
      }
      setIsSavingStudentCourse(true);
      try {
          const { id, user_schedule_id, is_user_added, user, dateStr, ...overrideData } = studentEditData;

          const { error } = await supabase
              .from('user_schedules')
              .update({ custom_data: overrideData })
              .eq('id', user_schedule_id);

          if (error) throw error;
          alert("Cập nhật thông tin môn học cá nhân thành công!");
          setIsStudentEditModalOpen(false);
          setSelectedCourseInfo(null);
          fetchMySchedule();
      } catch (err) {
          console.error(err);
          alert("Có lỗi xảy ra khi lưu lịch cá nhân.");
      } finally {
          setIsSavingStudentCourse(false);
      }
  };

  const handleAdminSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEditData.subject_name || !adminEditData.course_code) {
        alert("Vui lòng nhập Tên môn và Mã môn!"); return;
    }
    if (activeCourseRequest && isAuditor) {
        alert("⚠️ Tính năng này bị khóa đối với tài khoản Auditor.");
        return;
    }
    setIsSavingAdminCourse(true);
    try {
        const payload = {
            ...adminEditData, semester: selectedSemester,
            is_user_added: activeCourseRequest ? false : (adminEditData.is_user_added ?? (adminTab === 'user'))
        };
        if (activeCourseRequest) {
            const token = session?.access_token;
            if (!token) throw new Error('Admin session is missing');
            const response = await fetch(apiUrl('/courses?resource=course-requests'), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ requestId: activeCourseRequest.id, course: payload }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result?.error || 'Không thể thêm môn chính thức.');
            alert("Đã thêm môn thành môn chính thức!");
            setActiveCourseRequest(null);
            clearCourseRequestCache();
            setAdminTab('system');
            fetchCourses();
        } else if (payload.id) {
            const { error } = await supabase.from('course_schedules').update(payload).eq('id', payload.id);
            if (error) throw error; alert("Cập nhật môn học thành công!");
        } else {
            const { error } = await supabase.from('course_schedules').insert(payload);
            if (error) throw error; alert("Thêm môn mới thành công!");
        }
        setIsAdminEditModalOpen(false); fetchCourses();
    } catch (err) {
        console.error(err);
        alert((err as Error)?.message || "Có lỗi xảy ra khi lưu môn học.");
    } 
    finally { setIsSavingAdminCourse(false); }
  };

  const handleAdminDeleteCourse = async (id: string) => {
    if (isAuditor) { alert("⚠️ Tính năng này bị khóa đối với tài khoản Auditor."); return; }
      if (!await showConfirm("BẠN CÓ CHẮC CHẮN MUỐN XÓA?\nHành động này sẽ xóa môn học khỏi cơ sở dữ liệu và tự động xóa khỏi Thời khóa biểu của tất cả sinh viên đang lưu môn này!")) return;
      try {
          const { error } = await supabase.from('course_schedules').delete().eq('id', id);
          if (error) throw error; fetchCourses();
      } catch (err) { alert("Lỗi khi xóa môn học."); }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isPdfScheduleFile(file)) {
      await promptSendParserDebugFile({
        kind: 'schedule',
        file,
        parserMessage: PDF_SCHEDULE_FILE_MESSAGE,
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("⚠️ Vui lòng đăng nhập!"); return; }

    setIsPdfGuideOpen(false); setIsProcessingPdf(true);
    try {
        await verifyTurnstileOnly(scheduleImportTurnstileToken);
        setScheduleImportTurnstileToken('');
        const aiData = await parseSchedulePdf(file);
        if (!aiData || !aiData.courses || aiData.courses.length === 0) {
            const errorLogId = await logWebError({
                source: 'parser',
                action: 'save_schedule',
                error: aiData?.error || 'Schedule parser returned zero courses',
                metadata: {
                    importType: 'schedule',
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
                    semester: selectedSemester,
                },
                level: 'warn',
            });
            await promptSendParserDebugFile({
                kind: 'schedule',
                file,
                errorLogId,
                parserMessage: aiData?.error || 'Schedule parser returned zero courses',
                metadata: {
                    semester: selectedSemester,
                },
            });
            setIsProcessingPdf(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        let addedCount = 0;
        let currentSem = aiData.semester || selectedSemester;

        if (currentSem.includes('HK02')) currentSem = currentSem.replace('HK02', 'HK2').replace('-', '_');
        if (currentSem.includes('HK01')) currentSem = currentSem.replace('HK01', 'HK1').replace('-', '_');
        currentSem = currentSem.replace(/\//g, '_');

        let earliestMonth = 12;
        aiData.courses.forEach((c: any) => {
            if (c.start_date) {
                const parts = c.start_date.split('/');
                if (parts.length >= 2) {
                    const month = parseInt(parts[1], 10);
                    if (!isNaN(month) && month < earliestMonth) earliestMonth = month;
                }
            }
        });

        for (const course of aiData.courses) {
            const cleanCode = course.course_code.replace(/\s+/g, '_');
            let phaseStr = "1";
            if (course.start_date) {
                const parts = course.start_date.split('/');
                if (parts.length >= 2) {
                    const month = parseInt(parts[1], 10);
                    if (!isNaN(month) && month > earliestMonth) phaseStr = "2";
                }
            }

            let finalWeeks = course.weeks || '1-15';
            if (finalWeeks.includes('1-15') || finalWeeks.trim() === '') {
                const creditNum = Number(course.credits);
                if (creditNum === 2) {
                    finalWeeks = phaseStr === "1" ? "1, 5-9" : "15-20";
                } else {
                    finalWeeks = phaseStr === "1" ? "1, 5-12" : "15-23";
                }
            }

            const codeParts = cleanCode.split('_');
            const baseCode = codeParts[0]; 
            const tailCode = codeParts[codeParts.length - 1]; 

            const { data: existingCourses } = await supabase
                .from('course_schedules')
                .select('id, course_code')
                .ilike('course_code', `${baseCode}%`)
                .ilike('course_code', `%${tailCode}`);

            let targetCourseId = null;

            if (existingCourses && existingCourses.length > 0) targetCourseId = existingCourses[0].id;

            if (!targetCourseId) {
                const { data: newCourse, error: insertErr } = await supabase
                    .from('course_schedules')
                    .insert({
                        course_code: cleanCode, subject_name: course.subject_name,
                        credits: course.credits, instructor: course.instructor,
                        day_of_week: course.day_of_week, shift: course.shift,
                        room: course.room, campus: course.campus || 'TD', 
                        weeks: finalWeeks, semester: currentSem, phase: phaseStr, is_user_added: true 
                    })
                    .select('id')
                    .single();
                if (insertErr) {
                    await logWebError({
                        source: 'supabase',
                        action: 'save_schedule',
                        error: insertErr,
                        metadata: {
                            importType: 'schedule',
                            stage: 'insert_course_schedule',
                            courseCode: cleanCode,
                            subjectName: course.subject_name,
                            semester: currentSem,
                        },
                    });
                }
                if (!insertErr && newCourse) targetCourseId = newCourse.id;
            }

            if (targetCourseId) {
                const { data: checkLink } = await supabase
                    .from('user_schedules').select('id').eq('user_id', user.id).eq('course_id', targetCourseId).single();

                if (!checkLink) {
                    const { error: linkError } = await supabase
                        .from('user_schedules')
                        .upsert(
                            { user_id: user.id, course_id: targetCourseId, semester: currentSem },
                            { onConflict: 'user_id,course_id', ignoreDuplicates: true }
                        );
                    if (linkError) {
                        await logWebError({
                            source: 'supabase',
                            action: 'save_schedule',
                            error: linkError,
                            metadata: {
                                importType: 'schedule',
                                stage: 'insert_user_schedule',
                                courseId: targetCourseId,
                                semester: currentSem,
                            },
                        });
                    } else {
                        addedCount++;
                    }
                }
            }
        }
        
        if (addedCount > 0) {
            alert(`✅ Đã đồng bộ thành công ${addedCount} môn học vào Thời khóa biểu!`);
            fetchMySchedule(); setSelectedSemester(currentSem); 
        } else {
            alert(`Các môn học trong file đã có sẵn trong Thời khóa biểu của bạn rồi!`);
        }

    } catch (err) {
        if (err instanceof ProtectedSubmitError) {
            alert(err.message);
            return;
        }
        const errorLogId = await logWebError({
            source: 'parser',
            action: 'save_schedule',
            error: err,
            metadata: {
                importType: 'schedule',
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                semester: selectedSemester,
            },
        });
        const message = err instanceof Error ? err.message : '';
        await promptSendParserDebugFile({
            kind: 'schedule',
            file,
            errorLogId,
            parserMessage: message || 'Lỗi khi đọc PDF.',
            metadata: {
                semester: selectedSemester,
            },
        });
    } 
    finally {
        setIsProcessingPdf(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getCoursesForDate = (targetDate: Date, schedule: Course[]) => {
    const dayOfWeek = targetDate.getDay() === 0 ? 8 : targetDate.getDay() + 1; 
    const targetDateStr = formatDateStr(targetDate);

    return schedule.map(course => {
      const weekNum = getWeekNumberForDate(targetDate, course.semester);

      if (weekNum < 1 || weekNum > getSemesterMaxWeek(course.semester)) return [];

      const sDetails = getCourseDetailsForSlot(course, dayOfWeek, weekNum, 'S');
      const cDetails = getCourseDetailsForSlot(course, dayOfWeek, weekNum, 'C');

      const results = [];
      if (sDetails) results.push({ course, details: sDetails, shiftType: 'S' });
      if (cDetails) results.push({ course, details: cDetails, shiftType: 'C' });
      (course.makeup_schedules || [])
        .filter(item => item.date === targetDateStr)
        .forEach(item => {
          const shiftType = getMainShiftType(item.shift) || 'S';
          results.push({
            course,
            details: {
              id: item.id,
              day: dayOfWeek,
              shift: item.shift,
              room: item.room,
              weeks: 'Học bù',
              isMakeup: true,
              originalDate: item.originalDate
            },
            shiftType
          });
        });

      return results;
    }).flat().filter(Boolean);
  };

  const getExamsForDate = (targetDate: Date, schedule: Course[]) => {
    const shortStr = `${targetDate.getDate().toString().padStart(2, '0')}/${(targetDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const longStr = `${shortStr}/${targetDate.getFullYear()}`;
    return schedule.filter(c => {
       if (!c.exam_date) return false;
       const d = c.exam_date.trim();
       return d === shortStr || d === longStr;
    });
  };

  const renderMonthDays = () => {
    const selectedMonth = getSemesterMonth(selectedSemester, selectedMonthIndex);
    const firstDay = new Date(selectedMonth.year, selectedMonth.month, 1);
    const startingDayOfWeek = firstDay.getDay() === 0 ? 7 : firstDay.getDay(); 
    const daysInMonth = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
    
    const days: (Date | null)[] = [];
    for(let i = 1; i < startingDayOfWeek; i++) days.push(null); 
    for(let i = 1; i <= daysInMonth; i++) days.push(new Date(selectedMonth.year, selectedMonth.month, i));
    
    return days;
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("⚠️ Bạn cần đăng nhập để gửi báo cáo!"); return; }

    openSupportTicketDraft(buildManualSupportTicketDraft({
      category: 'schedule',
      subject: `Báo lỗi môn học: ${reportData.course_code || reportData.subject_name || 'Cần kiểm tra'}`,
      intro: 'Mình muốn báo lỗi thông tin môn học/lịch học trên HUB Planner.',
      fields: [
        ['Mã học phần', reportData.course_code],
        ['Tên môn học', reportData.subject_name],
        ['Chi tiết lỗi', reportData.description],
        ['Thông tin đúng đề xuất', reportData.suggested_correction],
      ],
    }));
    return;

    setIsSubmittingReport(true);
    try {
      const data = await protectedSubmit<{ id?: number }>({
        action: 'course-report',
        turnstileToken: reportTurnstileToken,
        payload: {
          course_code: reportData.course_code,
          subject_name: reportData.subject_name,
          error_description: reportData.description,
          suggested_correction: reportData.suggested_correction.trim() || null,
          user_id: user.id,
        },
      });
      void notifyModerators('course_report', data?.id);
      alert("✅ Gửi báo cáo thành công! Cảm ơn bạn đã đóng góp.");
      setIsReportModalOpen(false); setReportData({ course_code: '', subject_name: '', description: '', suggested_correction: '' });
    } catch (error) { alert("Đã xảy ra lỗi khi gửi báo cáo."); } 
    finally { setIsSubmittingReport(false); }
  };

  const handleCreateCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseData.subject_name.trim() || !newCourseData.course_code.trim()) { alert("Vui lòng điền tối thiểu Tên môn học và Mã học phần!"); return; }
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("⚠️ Bạn cần đăng nhập để gửi yêu cầu!"); return; }

    setIsSubmittingCourse(true);
    try {
      const requestId = crypto.randomUUID();
      const { error } = await supabase.from('user_course_requests').insert({
        id: requestId,
        subject_name: newCourseData.subject_name,
        course_code: newCourseData.course_code,
        instructor: newCourseData.instructor || 'Chưa rõ',
        user_id: user.id,
      });
      if (error) throw error;
      void notifyModerators('user_course_request', requestId);
      alert("✅ Gửi yêu cầu thành công! Admin sẽ kiểm tra và cập nhật môn này.");
      setIsCreateCourseModalOpen(false); setNewCourseData({ subject_name: '', course_code: '', instructor: '' });
    } catch (error) { alert("Đã xảy ra lỗi khi gửi yêu cầu."); } 
    finally { setIsSubmittingCourse(false); }
  };

  const currentWeekDates = getWeekDatesFull(selectedWeek, selectedSemester);
  const weekStartStr = currentWeekDates[0]?.substring(0, 5);
  const weekEndStr = currentWeekDates[6]?.substring(0, 5);
  const selectedSemesterMaxWeek = getSemesterMaxWeek(selectedSemester);
  const selectedSemesterMonths = getSemesterMonths(selectedSemester);

  const prevWeek = () => setSelectedWeek(prev => prev > 0 ? prev - 1 : 0);
  const nextWeek = () => setSelectedWeek(prev => prev < selectedSemesterMaxWeek ? prev + 1 : selectedSemesterMaxWeek);
  const prevMonth = () => setSelectedMonthIndex(prev => prev > 0 ? prev - 1 : 0);
  const nextMonth = () => setSelectedMonthIndex(prev => prev < selectedSemesterMonths.length - 1 ? prev + 1 : selectedSemesterMonths.length - 1);
  const goToToday = () => {
    playClick();
    const now = new Date();
    const targetSemester = getSemesterContainingDate(now, selectedSemester);
    const targetSemesterMaxWeek = getSemesterMaxWeek(targetSemester);
    let weekNum = getWeekNumberForDate(now, targetSemester);
    
    if (weekNum < 1) weekNum = 1;
    if (weekNum > targetSemesterMaxWeek) weekNum = targetSemesterMaxWeek;
    
    setSelectedSemester(targetSemester);
    setSelectedWeek(weekNum);
    setSelectedMonthIndex(getInitialSemesterMonthIndex(targetSemester, now));
  };
  
  let filteredAdminCourses: Course[] = [];
  if (adminTab === 'system') {
      filteredAdminCourses = availableCourses.filter(c => !c.is_user_added);
  } else if (adminTab === 'user') {
      filteredAdminCourses = availableCourses.filter(c => c.is_user_added);
  } else if (adminTab === 'user_changed') {
      filteredAdminCourses = changedUserScheduleCourses;
  }

  const filteredStudentScheduleSummaries = studentScheduleSummaries.filter(student => {
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return (
          student.full_name.toLowerCase().includes(term) ||
          student.student_code.toLowerCase().includes(term) ||
          (student.email || '').toLowerCase().includes(term)
      );
  });
  const courseRequestTotalPages = Math.max(1, Math.ceil(courseRequestTotal / COURSE_REQUEST_PAGE_SIZE));
  const courseRequestPaginationPages = getPaginationPages(courseRequestPage, courseRequestTotalPages);
  const courseRequestRangeStart = courseRequestTotal === 0
      ? 0
      : (courseRequestPage - 1) * COURSE_REQUEST_PAGE_SIZE + 1;
  const courseRequestRangeEnd = Math.min(
      courseRequestPage * COURSE_REQUEST_PAGE_SIZE,
      courseRequestTotal,
  );
  const selectedChangedCourseDiffs = getChangedCourseDiffs(selectedChangedCourse);
  const changedCourseCodeCounts = changedUserScheduleCourses.reduce((map, course) => {
      const key = (course.course_code || '').trim();
      if (!key) return map;
      map.set(key, (map.get(key) || 0) + 1);
      return map;
  }, new Map<string, number>());

  const closeChangedCourseModal = () => {
      setSelectedChangedCourse(null);
  };

    if (loading) {
        return (
            <div className="w-full min-h-[60vh] flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#0052cc] mb-3" size={32} />
                <span className="text-gray-400 text-sm font-medium">Đang tải không gian làm việc...</span>
            </div>
        );
    }

  return (
    <div className={`w-full ${isAdminView ? '' : 'pb-10'}`}>
        {showScheduleUpdateNotice && (
            <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/40 p-4" onClick={handleCloseScheduleUpdateNotice}>
                <div className="w-full max-w-md select-none overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl animate-scaleIn" onClick={(e) => e.stopPropagation()}>
                    <div className="relative border-b border-gray-100 bg-gray-50 px-5 py-4">
                        <button onClick={handleCloseScheduleUpdateNotice} className="absolute right-4 top-4 rounded-full border border-gray-200 bg-white p-1.5 text-gray-400 transition-colors hover:text-gray-700" aria-label="Đóng thông báo">
                            <X size={18} />
                        </button>
                        <div className="flex items-start gap-3 pr-8">
                            <div className="mt-0.5 rounded-xl bg-blue-100 p-2 text-[#003375]">
                                <Info size={18} />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold leading-tight text-[#003375]">Tính năng mới: Chỉnh lịch học và lịch thi</h2>
                                <p className="mt-1 text-sm leading-relaxed text-gray-600">
                                    Cập nhật môn học, ngày thi, ca thi và gắn nhãn cho các ngày quan trọng ngay trên lịch cá nhân.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="px-5 py-4">
                        <ul className="space-y-2 text-sm leading-relaxed text-gray-600">
                            <li className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#003375]" />
                                <span>Chỉnh lịch học, lịch thi ngay trên lịch cá nhân.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#003375]" />
                                <span>Gắn nhãn ngày nghỉ, thuyết trình, thi giữa kỳ, thi cuối kỳ hoặc ghi chú riêng.</span>
                            </li>
                        </ul>
                    </div>

                    <div className="border-t border-gray-100 px-5 py-4">
                        <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-600">
                            <input
                                type="checkbox"
                                checked={hideScheduleUpdateNoticeNextTime}
                                onChange={(e) => setHideScheduleUpdateNoticeNextTime(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#003375] focus:ring-[#003375]"
                            />
                            <span>Không hiển thị lại thông báo này</span>
                        </label>
                        <div className="mt-4 flex justify-end">
                            <button onClick={handleConfirmScheduleUpdateNotice} className="rounded-xl bg-[#003375] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#002855]">
                                Đã hiểu
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}


        <div className="relative md:sticky top-0 z-40 bg-[#F8FAFC] pt-2 pb-1 sm:pb-4 -mt-2 mb-1 sm:mb-4 md:border-b md:border-transparent md:border-gray-200/60">
            <div className="flex flex-row justify-between items-end px-1 overflow-hidden shrink-0">
                <div className="flex flex-col">
                    <h1 className="text-2xl sm:text-[28px] font-black text-[#003375]">Thời khóa biểu</h1>
                    <div className="flex items-center gap-1.5 mt-1 sm:mt-2 text-[12px] sm:text-[13px] text-gray-500 overflow-x-auto whitespace-nowrap custom-scrollbar pb-1">
                        <span className="shrink-0">Quản lý học tập</span><span className="text-gray-300 shrink-0">•</span><span className="font-bold text-gray-700 shrink-0">Lịch học & Thi</span>
                    </div>
                </div>
                {(isAdmin || isAuditor) && (
                    <button onClick={() => { playClick(); setIsAdminView(!isAdminView); }} className="flex items-center gap-1.5 px-4 py-2 bg-purple-100 text-purple-700 font-bold rounded-lg hover:bg-purple-200 transition-colors shadow-sm text-xs sm:text-sm active:scale-95">
                        <Settings size={16}/> <span className="hidden sm:inline">{isAdminView ? 'Về giao diện Sinh viên' : 'Quản lý Môn học'}</span><span className="sm:hidden">Admin</span>
                    </button>
                )}
            </div>
        </div>

        {!isAdminView && <NotificationNudge variant="schedule" className="mb-4" />}

        {isAdminView ? (
            <div className="w-full bg-white rounded-xl border border-gray-300 overflow-hidden flex flex-col h-[calc(100vh-150px)]">
                <div className="p-4 border-b border-gray-200 bg-[#f8fafc] flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex items-center gap-3">
                        <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 outline-none text-sm font-bold text-[#003375] bg-white hover:border-gray-400 transition-colors cursor-pointer">
                            {SEMESTER_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <select value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 outline-none text-sm font-bold text-gray-700 bg-white hover:border-gray-400 transition-colors cursor-pointer">
                            <option value="all">Mọi đợt</option>
                            <option value="1">Đợt 1</option>
                            <option value="2">Đợt 2</option>
                        </select>
                    </div>
                    
                    <div className="flex flex-1 max-w-md items-center gap-2">
                        <div className="relative flex-1">
                            <input type="text" placeholder={adminTab === 'student_schedules' ? 'Tìm tên sinh viên, MSSV, email...' : 'Tìm môn học, mã HP, GV...'} value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); if (adminTab === 'requested') setCourseRequestPage(1); }} className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 outline-none text-sm transition-all hover:border-gray-400 focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"/>
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        </div>
                        <button onClick={() => adminTab === 'student_schedules' ? fetchStudentScheduleSummaries() : adminTab === 'user_changed' ? fetchChangedUserScheduleCourses() : adminTab === 'requested' ? (clearCourseRequestCache(), fetchCourseRequests(courseRequestPage, { force: true })) : fetchCourses()} className="p-2.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"><RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /></button>
                        {adminTab !== 'user_changed' && adminTab !== 'student_schedules' && adminTab !== 'requested' && (
                            <button onClick={() => { setActiveCourseRequest(null); setAdminEditData({ is_user_added: adminTab === 'user' }); setIsAdminEditModalOpen(true); }} className="flex items-center gap-1.5 px-4 py-2 bg-[#003375] text-white font-bold rounded-lg hover:bg-[#002855] transition-colors text-sm whitespace-nowrap"><Plus size={16}/> Thêm môn</button>
                        )}
                    </div>
                </div>

                <div className="px-4 pt-4 border-b border-gray-200 flex gap-6 bg-white shrink-0 overflow-x-auto custom-scrollbar">
                    <button onClick={() => setAdminTab('system')} className={`pb-3 text-sm font-bold transition-colors ${adminTab === 'system' ? 'border-b-2 border-[#003375] text-[#003375]' : 'text-gray-500 hover:text-gray-800'}`}>Môn hệ thống gốc</button>
                    <button onClick={() => setAdminTab('user')} className={`pb-3 text-sm font-bold transition-colors ${adminTab === 'user' ? 'border-b-2 border-[#003375] text-[#003375]' : 'text-gray-500 hover:text-gray-800'}`}>Môn sinh viên thêm</button>
                    <button onClick={() => { setAdminTab('requested'); setCourseRequestPage(1); }} className={`pb-3 text-sm font-bold transition-colors whitespace-nowrap ${adminTab === 'requested' ? 'border-b-2 border-[#003375] text-[#003375]' : 'text-gray-500 hover:text-gray-800'}`}>Môn sinh viên yêu cầu thêm</button>
                    <button onClick={() => setAdminTab('user_changed')} className={`pb-3 text-sm font-bold transition-colors whitespace-nowrap ${adminTab === 'user_changed' ? 'border-b-2 border-[#003375] text-[#003375]' : 'text-gray-500 hover:text-gray-800'}`}>Môn sinh viên thay đổi</button>
                    <button onClick={() => { setAdminTab('student_schedules'); setSelectedStudentSchedule(null); setSelectedStudentCourses([]); if (selectedRouteStudentCode) navigate('/schedule'); }} className={`pb-3 text-sm font-bold transition-colors whitespace-nowrap ${adminTab === 'student_schedules' ? 'border-b-2 border-[#003375] text-[#003375]' : 'text-gray-500 hover:text-gray-800'}`}>Quản lý TKB sinh viên</button>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar bg-white">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full text-gray-500 gap-2"><Loader2 className="animate-spin" size={20}/> Đang tải dữ liệu...</div>
                    ) : adminTab === 'student_schedules' ? (
                        selectedStudentSchedule ? (
                            <div className="h-full flex flex-col">
                                <div className="p-4 border-b border-gray-200 bg-emerald-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div>
                                        <button onClick={() => { playClick(); setSelectedStudentSchedule(null); setSelectedStudentCourses([]); navigate('/schedule'); }} className="text-xs font-bold text-emerald-700 hover:text-emerald-900 mb-2">
                                            ← Quay lại danh sách sinh viên
                                        </button>
                                        <h3 className="text-lg font-extrabold text-[#003375]">{selectedStudentSchedule.full_name}</h3>
                                        <p className="text-sm text-gray-600">
                                            MSSV: <span className="font-mono font-bold text-emerald-700">{selectedStudentSchedule.student_code}</span>
                                            {selectedStudentSchedule.email ? ` • ${selectedStudentSchedule.email}` : ''}
                                        </p>
                                    </div>
                                    <div className="text-sm font-bold text-emerald-700 bg-white border border-emerald-200 rounded-lg px-3 py-2">
                                        {selectedStudentCourses.length} môn trong {selectedSemester}
                                    </div>
                                </div>

                                {selectedStudentCourses.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                        <CalendarDays size={40} className="mb-3 text-gray-300"/>
                                        <p>Chưa có môn học trong học kỳ này.</p>
                                    </div>
                                ) : (
                                    <table className="w-full text-left border-collapse text-sm min-w-[900px]">
                                        <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
                                            <tr>
                                                <th className="p-3 border-b border-gray-200 font-bold text-center w-14">STT</th>
                                                <th className="p-3 border-b border-gray-200 font-bold whitespace-nowrap">Mã Học Phần</th>
                                                <th className="p-3 border-b border-gray-200 font-bold">Tên Môn Học</th>
                                                <th className="p-3 border-b border-gray-200 font-bold text-center">TC</th>
                                                <th className="p-3 border-b border-gray-200 font-bold text-center">Đợt</th>
                                                <th className="p-3 border-b border-gray-200 font-bold">Giảng Viên</th>
                                                <th className="p-3 border-b border-gray-200 font-bold">Lịch Học & Phòng</th>
                                                <th className="p-3 border-b border-gray-200 font-bold">Lịch thi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedStudentCourses.map((course, index) => (
                                                <tr key={course.user_schedule_id || course.id} className="border-b border-gray-100 hover:bg-emerald-50/30 transition-colors">
                                                    <td className="p-3 text-center font-bold text-gray-500">{index + 1}</td>
                                                    <td className="p-3 font-semibold text-[#003375] whitespace-nowrap">{course.course_code}</td>
                                                    <td className="p-3 font-bold text-gray-800">{course.subject_name}</td>
                                                    <td className="p-3 text-center font-medium">{course.credits}</td>
                                                    <td className="p-3 text-center"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-bold text-gray-600">{course.phase || '1'}</span></td>
                                                    <td className="p-3 text-gray-600 font-medium">{course.instructor || '-'}</td>
                                                    <td className="p-3 text-xs text-gray-600 leading-relaxed">
                                                        <span className="font-bold text-gray-800">Thứ {course.day_of_week} ({course.shift})</span> • P.{course.room}<br/>
                                                        Tuần: {course.weeks}
                                                        {course.labels && course.labels.length > 0 && (
                                                            <div className="flex gap-1 mt-1 flex-wrap">
                                                                {course.labels.map((label: any) => (
                                                                    <span key={label.id} className={`text-[9px] px-1 rounded border font-semibold ${getLabelStyle(label.color)}`}>{label.date} - {label.type === 'Khác' ? label.text : label.type}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-xs text-gray-600">
                                                        {course.exam_date ? (
                                                            <span><b>{course.exam_date}</b> • Ca {course.exam_shift || '-'} • P.{course.exam_room || '-'}</span>
                                                        ) : (
                                                            <span className="text-gray-400">Chưa có</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        ) : filteredStudentScheduleSummaries.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                <Search size={40} className="mb-3 text-gray-300"/>
                                <p>Không tìm thấy sinh viên nào đã thêm môn vào TKB.</p>
                            </div>
                        ) : (
                                <table className="w-full text-left border-collapse text-sm min-w-[760px]">
                                <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 border-b border-gray-200 font-bold text-center w-14">STT</th>
                                        <th className="p-3 border-b border-gray-200 font-bold">Sinh viên</th>
                                        <th className="p-3 border-b border-gray-200 font-bold whitespace-nowrap">MSSV</th>
                                        <th className="p-3 border-b border-gray-200 font-bold">Email</th>
                                        <th className="p-3 border-b border-gray-200 font-bold text-center">Số môn</th>
                                        <th className="p-3 border-b border-gray-200 font-bold text-center">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredStudentScheduleSummaries.map((student, index) => (
                                        <tr key={student.user_id} onClick={() => openStudentSchedule(student)} className="border-b border-gray-100 hover:bg-emerald-50/50 transition-colors cursor-pointer group">
                                            <td className="p-3 text-center font-bold text-gray-500">{index + 1}</td>
                                            <td className="p-3 font-bold text-gray-800">{student.full_name}</td>
                                            <td className="p-3 font-mono font-bold text-emerald-700 whitespace-nowrap">{student.student_code}</td>
                                            <td className="p-3 text-gray-600">{student.email || '-'}</td>
                                            <td className="p-3 text-center"><span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-xs">{student.course_count}</span></td>
                                            <td className="p-3 text-center">
                                                <button onClick={(e) => { e.stopPropagation(); openStudentSchedule(student); }} className="px-3 py-1.5 rounded-lg bg-[#003375] text-white text-xs font-bold hover:bg-[#002855] transition-colors">
                                                    Xem TKB
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )
                    ) : adminTab === 'requested' ? (
                        adminScheduleError ? (
                            <div className="flex flex-col items-center justify-center h-full text-red-600">
                                <AlertTriangle size={40} className="mb-3 text-red-300"/>
                                <p className="font-bold">Không tải được yêu cầu thêm môn.</p>
                                <p className="mt-1 text-sm text-red-500">{adminScheduleError}</p>
                            </div>
                        ) : courseRequests.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-500"><Search size={40} className="mb-3 text-gray-300"/><p>Không có yêu cầu thêm môn đang chờ.</p></div>
                        ) : (
                            <div className="min-w-[980px]">
                            <table className="w-full table-fixed text-left border-collapse text-sm">
                                <colgroup>
                                    <col className="w-14" />
                                    <col className="w-[170px]" />
                                    <col />
                                    <col className="w-[180px]" />
                                    <col className="w-[190px]" />
                                    <col className="w-[130px]" />
                                    <col className="w-[150px]" />
                                </colgroup>
                                <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 border-b border-gray-200 font-bold text-center">STT</th>
                                        <th className="p-3 border-b border-gray-200 font-bold whitespace-nowrap">Mã Học Phần</th>
                                        <th className="p-3 border-b border-gray-200 font-bold">Tên Môn Học</th>
                                        <th className="p-3 border-b border-gray-200 font-bold">Giảng Viên</th>
                                        <th className="p-3 border-b border-gray-200 font-bold whitespace-nowrap">MSSV yêu cầu</th>
                                        <th className="p-3 border-b border-gray-200 font-bold whitespace-nowrap">Ngày gửi</th>
                                        <th className="p-3 border-b border-gray-200 font-bold text-center">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {courseRequests.map((request, index) => (
                                        <tr key={request.id} onClick={() => openCourseRequestEditor(request)} className={`border-b border-gray-100 transition-colors ${isAuditor ? '' : 'cursor-pointer hover:bg-emerald-50/40'}`}>
                                            <td className="p-3 text-center font-bold text-gray-500">{(courseRequestPage - 1) * COURSE_REQUEST_PAGE_SIZE + index + 1}</td>
                                            <td className="p-3 font-semibold text-[#003375] whitespace-nowrap overflow-hidden text-ellipsis">{request.course_code}</td>
                                            <td className="p-3 font-bold text-gray-800 break-words leading-snug">{request.subject_name}</td>
                                            <td className="p-3 text-gray-600 font-medium break-words leading-snug">{request.instructor || '-'}</td>
                                            <td className="p-3 font-mono font-bold text-emerald-700 whitespace-nowrap overflow-hidden text-ellipsis">{getCourseRequestStudentCode(request)}</td>
                                            <td className="p-3 text-xs text-gray-500 whitespace-nowrap">{request.created_at ? new Date(request.created_at).toLocaleDateString('vi-VN') : '-'}</td>
                                            <td className="p-3">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button disabled={isAuditor} onClick={(e) => { e.stopPropagation(); openCourseRequestEditor(request); }} className="px-3 py-1.5 rounded-lg bg-[#003375] text-white text-xs font-bold hover:bg-[#002855] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                                        Sửa & thêm
                                                    </button>
                                                    <button disabled={isAuditor} onClick={(e) => { e.stopPropagation(); rejectCourseRequest(request); }} className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Từ chối yêu cầu"><Trash2 size={16}/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="sticky bottom-0 z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.04)]">
                                <p className="text-xs font-medium text-gray-500">
                                    Hiển thị <span className="font-bold text-gray-700">{courseRequestRangeStart}-{courseRequestRangeEnd}</span> trong <span className="font-bold text-gray-700">{courseRequestTotal}</span> yêu cầu
                                </p>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setCourseRequestPage(page => Math.max(1, page - 1))}
                                        disabled={courseRequestPage <= 1}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:border-[#0052cc] hover:text-[#0052cc] disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="Trang trước"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    {courseRequestPaginationPages.map((page, index) => {
                                        const previousPage = courseRequestPaginationPages[index - 1];
                                        return (
                                            <React.Fragment key={page}>
                                                {previousPage && page - previousPage > 1 && (
                                                    <span className="px-1 text-xs text-gray-400">…</span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setCourseRequestPage(page)}
                                                    className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition-colors ${courseRequestPage === page ? 'bg-[#0052cc] text-white' : 'border border-gray-200 text-gray-600 hover:border-[#0052cc] hover:text-[#0052cc]'}`}
                                                    aria-current={courseRequestPage === page ? 'page' : undefined}
                                                >
                                                    {page}
                                                </button>
                                            </React.Fragment>
                                        );
                                    })}
                                    <button
                                        type="button"
                                        onClick={() => setCourseRequestPage(page => Math.min(courseRequestTotalPages, page + 1))}
                                        disabled={courseRequestPage >= courseRequestTotalPages}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors hover:border-[#0052cc] hover:text-[#0052cc] disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label="Trang sau"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                                <div aria-hidden="true" />
                            </div>
                            </div>
                        )
                    ) : adminScheduleError ? (
                        <div className="flex flex-col items-center justify-center h-full text-red-600">
                            <AlertTriangle size={40} className="mb-3 text-red-300"/>
                            <p className="font-bold">Không tải được dữ liệu TKB sinh viên.</p>
                            <p className="mt-1 text-sm text-red-500">{adminScheduleError}</p>
                        </div>
                    ) : filteredAdminCourses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500"><Search size={40} className="mb-3 text-gray-300"/><p>Không có dữ liệu trong mục này.</p></div>
                    ) : adminTab === 'user_changed' ? (
                        <table className="w-full table-fixed text-left border-collapse text-sm min-w-[1080px]">
                            <colgroup>
                                <col className="w-14" />
                                <col className="w-[170px]" />
                                <col className="w-[110px]" />
                                <col className="w-[150px]" />
                                <col className="w-[220px]" />
                                <col className="w-[150px]" />
                                <col className="w-[220px]" />
                                <col className="w-[88px]" />
                            </colgroup>
                            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 border-b border-gray-200 font-bold text-center w-14">STT</th>
                                    <th className="p-3 border-b border-gray-200 font-bold whitespace-nowrap">Tên Sinh Viên</th>
                                    <th className="p-3 border-b border-gray-200 font-bold whitespace-nowrap">MSSV</th>
                                    <th className="p-3 border-b border-gray-200 font-bold whitespace-nowrap">Mã Học Phần</th>
                                    <th className="p-3 border-b border-gray-200 font-bold">Tên Môn Học</th>
                                    <th className="p-3 border-b border-gray-200 font-bold">Giảng Viên</th>
                                    <th className="p-3 border-b border-gray-200 font-bold">Lịch Học & Phòng</th>
                                    <th className="p-3 border-b border-gray-200 font-bold text-center w-28">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAdminCourses.map((c, index) => {
                                    const duplicateCount = changedCourseCodeCounts.get((c.course_code || '').trim()) || 0;
                                    const isDuplicateCourse = duplicateCount > 1;
                                    return (
                                    <tr
                                        key={c.user_schedule_id}
                                        onClick={() => setSelectedChangedCourse(c)}
                                        className={`border-b transition-colors group cursor-pointer ${isDuplicateCourse ? 'bg-amber-50/80 hover:bg-amber-100/80 border-amber-200' : 'hover:bg-blue-50/50'}`}
                                    >
                                        <td className={`p-3 text-center font-bold ${isDuplicateCourse ? 'text-amber-700' : 'text-gray-500'}`}>{index + 1}</td>
                                        <td className="p-3 font-bold text-gray-800 break-words leading-snug">{c.user?.full_name || 'Không xác định'}</td>
                                        <td className="p-3 font-semibold text-orange-700 whitespace-nowrap overflow-hidden text-ellipsis">{c.user?.student_code || '-'}</td>
                                        <td className={`p-3 font-semibold whitespace-nowrap ${isDuplicateCourse ? 'text-amber-800' : 'text-[#003375]'}`}>
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span>{c.course_code}</span>
                                                {isDuplicateCourse && (
                                                    <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold border border-amber-300">
                                                        Trùng {duplicateCount}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3 font-bold text-gray-800 break-words leading-snug">{c.subject_name}</td>
                                        <td className="p-3 text-gray-600 font-medium break-words leading-snug">{c.instructor || '-'}</td>
                                        <td className="p-3 text-xs text-gray-600 leading-relaxed break-words">
                                            <span className="font-bold text-gray-800">Thứ {c.day_of_week} ({c.shift})</span> • P.{c.room}<br/>
                                            Tuần: {c.weeks}
                                            {c.labels && c.labels.length > 0 && (
                                                <div className="flex gap-1 mt-1 flex-wrap">
                                                    {c.labels.map((l: any) => (
                                                        <span key={l.id} className={`text-[9px] px-1 rounded border font-semibold ${getLabelStyle(l.color)}`}>{l.date} - {l.type === 'Khác' ? l.text : l.type}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            <button onClick={(e) => { e.stopPropagation(); setSelectedChangedCourse(c); }} className="px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-100 text-xs font-bold hover:bg-orange-100 transition-colors">
                                                Chi tiết
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full table-fixed text-left border-collapse text-sm min-w-[960px]">
                            <colgroup>
                                <col className="w-14" />
                                <col className="w-[160px]" />
                                <col />
                                <col className="w-14" />
                                <col className="w-16" />
                                <col className="w-[170px]" />
                                <col className="w-[220px]" />
                                <col className="w-28" />
                            </colgroup>
                            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 border-b border-gray-200 font-bold text-center w-14">STT</th>
                                    <th className="p-3 border-b border-gray-200 font-bold whitespace-nowrap">Mã Học Phần</th>
                                    <th className="p-3 border-b border-gray-200 font-bold">Tên Môn Học</th>
                                    <th className="p-3 border-b border-gray-200 font-bold text-center">TC</th>
                                    <th className="p-3 border-b border-gray-200 font-bold text-center">Đợt</th>
                                    <th className="p-3 border-b border-gray-200 font-bold">Giảng Viên</th>
                                    <th className="p-3 border-b border-gray-200 font-bold">Lịch Học & Phòng</th>
                                    <th className="p-3 border-b border-gray-200 font-bold text-center w-28">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAdminCourses.map((c, index) => (
                                    <tr key={c.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors group">
                                        <td className="p-3 text-center font-bold text-gray-500">{index + 1}</td>
                                        <td className="p-3 font-semibold text-[#003375] whitespace-nowrap overflow-hidden text-ellipsis">{c.course_code}</td>
                                        <td className="p-3 font-bold text-gray-800 overflow-hidden text-ellipsis">{c.subject_name}</td>
                                        <td className="p-3 text-center font-medium">{c.credits}</td>
                                        <td className="p-3 text-center"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-bold text-gray-600">{c.phase || '1'}</span></td>
                                        <td className="p-3 text-gray-600 font-medium overflow-hidden text-ellipsis">{c.instructor || '-'}</td>
                                        <td className="p-3 text-xs text-gray-600 leading-relaxed overflow-hidden text-ellipsis"><span className="font-bold text-gray-800">Thứ {c.day_of_week} ({c.shift})</span> • P.{c.room}<br/>Tuần: {c.weeks}</td>
                                        <td className="p-3 text-center">
                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => { setAdminEditData(c); setIsAdminEditModalOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Chỉnh sửa"><Edit size={16}/></button>
                                                {!isAuditor && ( <button onClick={() => handleAdminDeleteCourse(c.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-colors" title="Xóa vĩnh viễn"><Trash2 size={16}/></button> )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        ) : (
            <div className={`flex flex-col lg:flex-row lg:h-[calc(100vh-150px)] items-start transition-[gap] duration-300 ease-out ${isFilterExpanded ? 'gap-0' : 'gap-3 sm:gap-6'}`}>
            
                {/* CỘT TRÁI: SIDEBAR FILTER */}
                <div className={`w-full bg-white rounded-xl border border-gray-300 flex flex-col overflow-visible transition-all duration-300 ease-out ${isFilterExpanded ? 'lg:flex-1 lg:max-w-none h-[calc(100vh-180px)] lg:h-full' : `lg:w-[300px] lg:shrink-0 ${hasActiveCourseFilters ? 'h-[450px]' : 'h-auto'} lg:h-full`}`}>
                    <div className={`border-b border-gray-200 flex justify-between items-center bg-[#f8fafc] ${isFilterExpanded ? 'p-3 sm:p-4' : 'px-3 py-2.5'}`}>
                        <h2 className="text-sm sm:text-base font-bold text-[#003375] flex items-center gap-2"><Search size={16} className="text-[#003375]" /> Bộ lọc</h2>
                        <div className="flex items-center gap-1.5">
                            {isFilterExpanded && (
                                <button onClick={() => setIsMyScheduleModalOpen(true)} className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-[#003375] shadow-sm hover:bg-gray-50 active:scale-95 transition-transform">
                                    <List size={14}/> {isPlanMode ? `KH ${activePlanKey}` : 'Đã lưu'} ({displayedScheduleCount})
                                </button>
                            )}
                            {isSyncing ? ( <Loader2 size={16} className="text-blue-500 animate-spin" /> ) : ( <button onClick={refreshCourseListAndFilters} className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-[#003375] transition-colors" title="Làm mới"><RefreshCw size={14}/></button> )}
                            <button onClick={() => setIsFilterExpanded(prev => !prev)} className="rounded-md p-1.5 text-gray-500 hover:bg-blue-50 hover:text-[#003375] transition-colors" title={isFilterExpanded ? 'Thu gọn bộ lọc' : 'Mở rộng bộ lọc'}>
                                {isFilterExpanded ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                            </button>
                        </div>
                    </div>
                    
                    <div className={`border-b border-gray-200 ${isFilterExpanded ? 'grid grid-cols-1 gap-2 overflow-visible p-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.35fr)_minmax(180px,1.05fr)_minmax(140px,0.75fr)_minmax(100px,0.52fr)_minmax(150px,0.85fr)_minmax(100px,0.52fr)_minmax(110px,0.58fr)_minmax(165px,0.9fr)]' : 'space-y-2 px-3 py-2.5'}`}>
                        <div className="relative">
                            <input disabled={!isAuthenticated} type="text" placeholder="Tên môn + mã (VD: Toán cao cấp D01)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`w-full rounded-lg border border-gray-300 bg-white pr-3 outline-none transition-all hover:border-gray-400 focus:border-[#003375] focus:ring-1 focus:ring-[#003375] disabled:bg-gray-50 disabled:cursor-not-allowed ${isFilterExpanded ? 'h-10 pl-10 text-sm' : 'h-9 pl-9 text-xs'}`}/>
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={isFilterExpanded ? 16 : 14} />
                        </div>

                        <div className={isFilterExpanded ? 'contents' : 'grid grid-cols-[1fr_0.9fr] gap-1.5'}>
                            <div className="min-w-0">
                                <select
                                    disabled={!isAuthenticated}
                                    value={selectedSubjectName}
                                    onChange={(e) => setSelectedSubjectName(e.target.value)}
                                    className={`${isFilterExpanded ? 'h-10 px-3 text-sm' : 'h-9 px-2.5 text-xs'} w-full min-w-0 truncate rounded-lg border border-gray-300 bg-white font-bold text-gray-700 outline-none hover:border-gray-400 transition-colors cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed`}
                                    title={selectedSubjectName === 'all' ? 'Tất cả môn học' : selectedSubjectName}
                                >
                                    <option value="all">Tất cả môn học</option>
                                    {subjectNameOptions.map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="min-w-0">
                                <select
                                    disabled={!isAuthenticated}
                                    value={selectedAcademicProgram}
                                    onChange={(e) => setSelectedAcademicProgram(e.target.value)}
                                    className={`${isFilterExpanded ? 'h-10 px-3 text-sm' : 'h-9 px-2.5 text-xs'} w-full min-w-0 truncate rounded-lg border border-gray-300 bg-white font-bold text-gray-700 outline-none hover:border-gray-400 transition-colors cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed`}
                                    title={selectedAcademicProgram === 'all' ? 'Tất cả chương trình' : selectedAcademicProgram}
                                >
                                    <option value="all">Tất cả chương trình</option>
                                    {academicProgramOptions.map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className={isFilterExpanded ? 'contents' : 'grid grid-cols-[1fr_0.72fr] gap-1.5'}>
                            <div className="flex-1">
                                <select disabled={!isAuthenticated} value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className={`${isFilterExpanded ? 'h-10 px-3 text-sm' : 'h-9 px-2.5 text-xs'} w-full min-w-0 truncate rounded-lg border border-gray-300 bg-white font-bold text-[#003375] outline-none hover:border-gray-400 transition-colors cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed`}>
                                    {SEMESTER_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="min-w-0">
                                <select disabled={!isAuthenticated} value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)} className={`${isFilterExpanded ? 'h-10 px-3 text-sm' : 'h-9 px-2.5 text-xs'} w-full min-w-0 truncate rounded-lg border border-gray-300 bg-white font-bold text-gray-700 outline-none hover:border-gray-400 transition-colors cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed`}>
                                    <option value="all">Mọi đợt</option>
                                    <option value="1">Đợt 1</option>
                                    <option value="2">Đợt 2</option>
                                </select>
                            </div>
                        </div>

                        <div className={isFilterExpanded ? 'contents' : 'grid grid-cols-[1fr_0.7fr_0.78fr] gap-1.5'}>
                            <div className="min-w-0">
                                <select
                                    disabled={!isAuthenticated}
                                    value={selectedMajor}
                                    onChange={(e) => setSelectedMajor(e.target.value)}
                                    className={`${isFilterExpanded ? 'h-10 px-3 text-sm' : 'h-9 px-2.5 text-xs'} w-full min-w-0 truncate rounded-lg border border-gray-300 bg-white font-bold text-gray-700 outline-none hover:border-gray-400 transition-colors cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed`}
                                    title={selectedMajor === 'all' ? 'Tất cả chuyên ngành' : selectedMajor}
                                >
                                    <option value="all">Tất cả chuyên ngành</option>
                                    {majorOptions.map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="min-w-0">
                                <select
                                    disabled={!isAuthenticated}
                                    value={selectedCohort}
                                    onChange={(e) => setSelectedCohort(e.target.value)}
                                    className={`${isFilterExpanded ? 'h-10 px-3 text-sm' : 'h-9 px-2.5 text-xs'} w-full min-w-0 truncate rounded-lg border border-gray-300 bg-white font-bold text-gray-700 outline-none hover:border-gray-400 transition-colors cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed`}
                                    title={selectedCohort === 'all' ? 'Tất cả khóa' : selectedCohort}
                                >
                                    <option value="all">Tất cả khóa</option>
                                    {cohortOptions.map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="min-w-0">
                                <select
                                    disabled={!isAuthenticated}
                                    value={selectedGroupName}
                                    onChange={(e) => setSelectedGroupName(e.target.value)}
                                    className={`${isFilterExpanded ? 'h-10 px-3 text-sm' : 'h-9 px-2.5 text-xs'} w-full min-w-0 truncate rounded-lg border border-gray-300 bg-white font-bold text-gray-700 outline-none hover:border-gray-400 transition-colors cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed`}
                                    title={selectedGroupName === 'all' ? 'Tất cả nhóm' : selectedGroupName}
                                >
                                    <option value="all">Tất cả nhóm</option>
                                    {groupNameOptions.map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handlePdfUpload} />
                    </div>

                    {/* Danh sách môn học gợi ý */}
                    <div className={`flex-1 overflow-y-auto p-3 sm:p-4 bg-gray-50/50 custom-scrollbar relative ${isFilterExpanded || hasActiveCourseFilters ? 'block' : 'hidden lg:block'}`}>
                        {!isAuthenticated ? (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 bg-white/80 animate-fadeIn">
                                <div className="w-14 h-14 bg-blue-50 text-[#003375] rounded-full flex items-center justify-center mb-3 border border-blue-200"><Lock size={24} /></div>
                                <p className="text-xs text-gray-600 font-medium leading-relaxed">Đăng nhập bằng tài khoản sinh viên để xem lịch học.</p>
                            </div>
                        ) : isLoading ? (
                            <p className="text-center text-xs text-gray-400 mt-10 animate-pulse font-medium">Đang tải dữ liệu...</p>
                        ) : availableCourses.length === 0 ? (
                            <div className="text-center mt-8 px-3">
                                <p className="text-gray-500 text-xs mb-2 font-medium">Không tìm thấy môn học.</p>
                                <p className="text-[11px] leading-relaxed text-gray-400">Thử bỏ bớt từ khóa, chọn lại học kỳ/đợt, hoặc kiểm tra chuyên ngành/nhóm.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {isFilterExpanded && (
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <p className="text-sm font-black text-[#003375]">Tìm thấy {courseTotal} môn học</p>
                                        <p className="text-xs font-semibold text-gray-500">Bấm vào card để xem chi tiết</p>
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                                    <p className="text-xs font-bold text-gray-500">
                                        Trang {coursePage + 1}/{courseTotalPages} • {availableCourses.length} môn đang hiển thị
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            disabled={coursePage === 0 || isLoading}
                                            onClick={() => setCoursePage(prev => Math.max(0, prev - 1))}
                                            className="rounded-md border border-gray-200 px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            Trước
                                        </button>
                                        <input
                                            type="number"
                                            min={1}
                                            max={courseTotalPages}
                                            value={coursePage + 1}
                                            onChange={(event) => {
                                                const nextPage = Number(event.target.value);
                                                if (!Number.isFinite(nextPage)) return;
                                                setCoursePage(Math.min(Math.max(nextPage - 1, 0), courseTotalPages - 1));
                                            }}
                                            className="h-7 w-14 rounded-md border border-gray-200 text-center text-xs font-bold text-[#003375] outline-none focus:border-[#003375]"
                                            aria-label="Nhập số trang môn học"
                                        />
                                        <button
                                            disabled={!courseHasMore || isLoading}
                                            onClick={() => setCoursePage(prev => prev + 1)}
                                            className="rounded-md border border-gray-200 px-2 py-1 text-xs font-bold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            Sau
                                        </button>
                                    </div>
                                </div>
                                <div className={isFilterExpanded ? 'grid grid-cols-1 gap-3 xl:grid-cols-2' : 'space-y-3'}>
                                    {availableCourses.map((course) => {
                                        const color = getColorForCourse(course.id);
                                        if (isFilterExpanded) {
                                            return (
                                                <div key={course.id} className={`bg-white border border-gray-200 border-l-4 ${color.border} rounded-xl p-3 relative group hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer`} onClick={() => setSelectedCourseInfo({ course })}>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <h3 className={`line-clamp-2 text-sm font-black leading-snug ${color.text}`}>{course.subject_name}</h3>
                                                            <p className="mt-1 text-xs font-bold text-gray-500">{course.course_code} • Đợt {course.phase || '1'} • {course.credits || 0} TC</p>
                                                        </div>
                                                        <button onClick={(e) => { e.stopPropagation(); addToActiveSchedule(course); }} disabled={isSyncing} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#003375] hover:bg-blue-100 transition-colors disabled:opacity-50" title={isPlanMode ? `Thêm vào Kế hoạch ${activePlanKey}` : 'Thêm vào Lịch cá nhân'}><Plus size={16}/></button>
                                                    </div>

                                                    <div className="mt-3 grid grid-cols-1 gap-1.5 text-xs font-semibold text-gray-600 sm:grid-cols-2 xl:grid-cols-3">
                                                        <div className="flex min-w-0 items-center gap-1.5">
                                                            <Clock size={12} className="shrink-0 text-gray-400" />
                                                            <span className="truncate">Thứ {course.day_of_week || '?'} • {getShiftDisplay(course.shift)}</span>
                                                        </div>
                                                        <div className="flex min-w-0 items-center gap-1.5">
                                                            <MapPin size={12} className="shrink-0 text-gray-400" />
                                                            <span className="truncate">P. {course.room || 'Chưa cập nhật'}{course.campus ? ` • ${course.campus}` : ''}</span>
                                                        </div>
                                                        <div className="flex min-w-0 items-center gap-1.5">
                                                            <User size={12} className="shrink-0 text-gray-400" />
                                                            <span className="truncate">{course.instructor || 'Chưa cập nhật'}</span>
                                                        </div>
                                                        <div className="min-w-0 truncate text-gray-500">Tuần: {course.weeks || 'Chưa cập nhật'}</div>
                                                        <div className="min-w-0 truncate text-gray-500">Nhóm: {course.group_name || 'Tất cả'}</div>
                                                        <div className="min-w-0 truncate text-gray-500">CT: {course.academic_program || 'Chưa cập nhật'}</div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={course.id} className={`bg-white border border-gray-200 border-l-4 ${color.border} rounded-lg p-3 relative group hover:border-gray-300 transition-all cursor-pointer`} onClick={() => setSelectedCourseInfo({ course })}>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className={`font-bold text-xs leading-tight pr-6 line-clamp-2 ${color.text}`}>{course.subject_name}</h3>
                                                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">{course.course_code} • Đợt {course.phase || '1'}</p>
                                                    </div>
                                                    <button onClick={(e) => { e.stopPropagation(); addToActiveSchedule(course); }} disabled={isSyncing} className="text-gray-400 hover:text-[#003375] p-1 bg-gray-50 hover:bg-blue-50 rounded-md transition-colors shrink-0" title={isPlanMode ? `Thêm vào Kế hoạch ${activePlanKey}` : 'Thêm vào Lịch cá nhân'}><Plus size={14}/></button>
                                                </div>
                                                <div className="text-[10px] text-gray-500 mt-2 flex items-center gap-1 font-medium"><Clock size={10} className="text-gray-400"/> Thứ {course.day_of_week} ({getShiftDisplay(course.shift)})</div>
                                                <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1 font-medium"><MapPin size={10} className="text-gray-400"/> P. {course.room}</div>
                                                <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1 font-medium"><User size={10} className="text-gray-400"/> {course.instructor || 'Chưa cập nhật'}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {!courseHasMore && (
                                    <p className="text-center text-[11px] font-semibold text-gray-400">Đã hiển thị tất cả môn phù hợp.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* CỘT PHẢI: KHUNG HIỂN THỊ TKB */}
                <div className={`bg-white rounded-xl border border-gray-300 flex flex-col overflow-hidden min-h-[600px] lg:min-h-0 lg:h-full w-full relative transition-all duration-300 ease-out ${isFilterExpanded ? 'w-0 flex-[0_0_0%] min-w-0 max-h-0 opacity-0 pointer-events-none border-transparent lg:max-h-none' : 'flex-1 opacity-100'}`}>
                    <div className="schedule-toolbar border-b border-gray-200 bg-white shrink-0">
                        <div className="no-scrollbar flex min-h-[54px] items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap px-3 pt-3 sm:px-4">
                            <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
                                <h2 className="flex shrink-0 items-center gap-2 text-lg font-extrabold text-[#003375]"><Calendar size={20} className="shrink-0 text-[#990000]" /> {displayedScheduleTitle}</h2>
                                <div className="relative grid w-[168px] shrink-0 grid-cols-2 items-center rounded-lg border border-gray-300 bg-gray-50 p-1">
                                    <span className={`absolute left-1 top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-md border border-gray-200 bg-white shadow-sm transition-transform duration-300 ease-out ${isPlanMode ? 'translate-x-full' : 'translate-x-0'}`} />
                                    <button onClick={() => setScheduleViewMode('official')} className={`relative z-10 px-2.5 py-1 text-xs font-bold transition-all active:scale-[0.98] ${!isPlanMode ? 'text-[#003375]' : 'text-gray-500 hover:text-gray-800'}`}>Lịch cá nhân</button>
                                    <button onClick={() => setScheduleViewMode('plan')} className={`relative z-10 px-2.5 py-1 text-xs font-bold transition-all active:scale-[0.98] ${isPlanMode ? 'text-[#003375]' : 'text-gray-500 hover:text-gray-800'}`}>Kế hoạch</button>
                                </div>
                            </div>

                            {isPlanMode && (
                                <div className="flex shrink-0 items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 p-1">
                                    {PLAN_KEYS.map(planKey => (
                                        <button key={planKey} onClick={() => setActivePlanKey(planKey)} className={`px-2.5 py-1 text-[11px] font-black rounded-md transition-all active:scale-[0.98] ${activePlanKey === planKey ? 'bg-white text-amber-700 border border-amber-200 shadow-sm' : 'text-amber-600 hover:bg-white/70'}`}>
                                            KH {planKey}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="ml-auto flex shrink-0 items-center gap-2">
                                <div className="flex shrink-0 items-center bg-gray-50 border border-gray-300 rounded-lg p-1">
                                    <button onClick={() => setViewMode('week')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewMode === 'week' ? 'bg-white text-[#003375] border border-gray-200' : 'text-gray-500 hover:text-gray-800'}`}>Tuần</button>
                                    <button onClick={() => setViewMode('month')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewMode === 'month' ? 'bg-white text-[#003375] border border-gray-200' : 'text-gray-500 hover:text-gray-800'}`}>Tháng</button>
                                </div>

                                <button onClick={goToToday} className="shrink-0 px-3 py-1.5 text-xs font-bold bg-blue-50 text-[#003375] rounded-lg hover:bg-blue-100 transition-colors border border-blue-200 active:scale-95 whitespace-nowrap">Hôm nay</button>
                                
                                {viewMode === 'week' ? (
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <div className="flex shrink-0 items-center bg-white border border-gray-300 rounded-lg overflow-hidden">
                                            <button onClick={prevWeek} className="p-1.5 hover:bg-gray-50 text-gray-600 transition-colors border-r border-gray-300"><ChevronLeft size={16}/></button>
                                            <button onClick={nextWeek} className="p-1.5 hover:bg-gray-50 text-gray-600 transition-colors"><ChevronRight size={16}/></button>
                                        </div>
                                        <button ref={weekDropdownButtonRef} onClick={(e) => { e.stopPropagation(); setIsWeekDropdownOpen(!isWeekDropdownOpen); setIsMonthDropdownOpen(false); }} className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-[#003375] hover:bg-gray-50">
                                            {selectedWeek === 0 ? 'Tổng quát' : `Tuần ${selectedWeek}`} <ChevronDown size={14} className="text-gray-400"/>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <div className="flex shrink-0 items-center bg-white border border-gray-300 rounded-lg overflow-hidden">
                                            <button onClick={prevMonth} className="p-1.5 hover:bg-gray-50 text-gray-600 transition-colors border-r border-gray-300"><ChevronLeft size={16}/></button>
                                            <button onClick={nextMonth} className="p-1.5 hover:bg-gray-50 text-gray-600 transition-colors"><ChevronRight size={16}/></button>
                                        </div>
                                        <button ref={monthDropdownButtonRef} onClick={(e) => { e.stopPropagation(); setIsMonthDropdownOpen(!isMonthDropdownOpen); setIsWeekDropdownOpen(false); }} className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-[#003375] hover:bg-gray-50">
                                            {getSemesterMonthLabel(selectedSemester, selectedMonthIndex)} <ChevronDown size={14} className="text-gray-400"/>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="no-scrollbar flex min-h-[34px] items-center gap-2 overflow-x-auto overflow-y-hidden whitespace-nowrap px-3 pb-3 pt-1 sm:px-4">
                            {!isPlanMode && (
                                <div className="flex max-w-[300px] shrink-0 items-center gap-1.5 overflow-hidden rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1 text-[10px] font-bold text-[#003375] transition-colors hover:bg-blue-100 sm:text-xs" title="Click vào môn học trên lịch hoặc dùng Nút Tag để dán nhãn (Label) cho ngày đó!">
                                    <Zap size={14} className="fill-yellow-500 text-yellow-500 animate-pulse shrink-0" />
                                    <span className="truncate">✨ Mới: Gắn nhãn, tùy chỉnh lịch học cá nhân!</span>
                                </div>
                            )}

                            <div className="flex shrink-0 items-center gap-1.5">
                                <button disabled={!isAuthenticated} onClick={() => { setReportData({ course_code: '', subject_name: '', description: '', suggested_correction: '' }); setIsReportModalOpen(true); }} className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"><AlertTriangle size={13} /> Báo lỗi môn</button>
                                <button disabled={!isAuthenticated} onClick={() => setIsCreateCourseModalOpen(true)} className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"><BookPlus size={13} /> Yêu cầu thêm</button>
                                <button disabled={!isAuthenticated || isProcessingPdf} onClick={() => setIsPdfGuideOpen(true)} className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#003375] px-2.5 text-[11px] font-bold text-white transition-colors hover:bg-[#002855] active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400">
                                    {isProcessingPdf ? <Loader2 className="animate-spin" size={13} /> : <FileUp size={13} />} {isProcessingPdf ? 'Đang phân tích...' : 'Nhập PDF'}
                                </button>
                            </div>

                            {selectedWeek !== 0 && viewMode === 'week' && (
                                <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-500">
                                    <CalendarDays size={12}/> {weekStartStr} - {weekEndStr}
                                </span>
                            )}
                        </div>

                        {isWeekDropdownOpen && createPortal(
                            <div onClick={(e) => e.stopPropagation()} style={getToolbarDropdownStyle(weekDropdownButtonRef, 192)} className="z-[100000] rounded-xl border border-gray-200 bg-white py-1 shadow-2xl max-h-[320px] overflow-y-auto custom-scrollbar">
                                <button onClick={() => { setSelectedWeek(0); setIsWeekDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 font-bold text-gray-700 border-b border-gray-100">Hiển thị Tổng quát</button>
                                {Array.from({length: selectedSemesterMaxWeek}, (_, i) => i + 1).map(w => {
                                    const wDates = getWeekDatesFull(w, selectedSemester);
                                    return (
                                        <button key={w} onClick={() => { setSelectedWeek(w); setIsWeekDropdownOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selectedWeek === w ? 'bg-blue-50 text-[#003375] font-bold' : 'text-gray-600 font-medium'}`}>
                                            Tuần {w} <span className="text-xs text-gray-400 ml-1 font-normal">({wDates[0].substring(0,5)} - {wDates[6].substring(0,5)})</span>
                                        </button>
                                    );
                                })}
                            </div>,
                            document.body
                        )}

                        {isMonthDropdownOpen && createPortal(
                            <div onClick={(e) => e.stopPropagation()} style={getToolbarDropdownStyle(monthDropdownButtonRef, 128)} className="z-[100000] rounded-xl border border-gray-200 bg-white py-1 shadow-2xl max-h-[320px] overflow-y-auto custom-scrollbar">
                                {selectedSemesterMonths.map((_, m) => (
                                    <button key={m} onClick={() => { setSelectedMonthIndex(m); setIsMonthDropdownOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selectedMonthIndex === m ? 'bg-blue-50 text-[#003375] font-bold' : 'text-gray-600 font-medium'}`}>
                                        {getSemesterMonthLabel(selectedSemester, m)}
                                    </button>
                                ))}
                            </div>,
                            document.body
                        )}
                    </div>

                    {/* LƯỚI LỊCH (GRID) */}
                    <div className="flex-1 overflow-auto custom-scrollbar relative bg-white">
                        {isSemesterHolidayWeek(selectedSemester, selectedWeek) && viewMode === 'week' && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                                <div className="bg-red-50 text-red-600 px-6 py-3 rounded-full font-bold text-sm border border-red-200 flex items-center gap-2 animate-bounce">
                                    <Zap size={18} className="fill-current"/> Tuần nghỉ Lễ/Tết, không có lịch học!
                                </div>
                            </div>
                        )}
                        
                        {viewMode === 'week' ? (
                            <table className="w-full min-w-[700px] border-collapse table-fixed h-full">
                                <thead>
                                    <tr>
                                        <th className="w-[60px] border-b border-r border-gray-200 bg-[#f8fafc]"></th>
                                        {[2, 3, 4, 5, 6, 7, 8].map((day, index) => {
                                            const isTodayCol = selectedWeek !== 0 && currentWeekDates[index] === todayStr;
                                            return (
                                            <th key={day} className={`py-2 border-b border-r border-gray-200 transition-colors ${isTodayCol ? 'bg-[#F0F9FF]' : 'bg-[#f8fafc]'}`}>
                                                <div className={`flex flex-col items-center gap-0.5 ${isTodayCol ? 'text-[#003375]' : 'text-gray-700'}`}>
                                                    <span className="font-extrabold text-xs uppercase tracking-wide">Thứ {day === 8 ? 'CN' : day}</span>
                                                    {selectedWeek !== 0 && (
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${isTodayCol ? 'bg-[#003375] text-white font-bold' : 'text-gray-500 font-medium'}`}>
                                                            {currentWeekDates[index].substring(0, 5)}
                                                        </span>
                                                    )}
                                                </div>
                                            </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {['S', 'C'].map((shift) => (
                                        <tr key={shift}>
                                            <td className="border-r border-b border-gray-200 text-center align-middle bg-[#f8fafc] py-2">
                                                <span className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${shift === 'S' ? 'text-orange-500' : 'text-indigo-500'}`}>{shift === 'S' ? 'Sáng' : 'Chiều'}</span>
                                                <span className="text-[9px] font-bold text-gray-400 whitespace-pre-line leading-tight">{shift === 'S' ? '07:00\n|\n11:05' : '13:00\n|\n17:05'}</span>
                                            </td>
                                            
                                            {[2, 3, 4, 5, 6, 7, 8].map((day, index) => {
                                                const isTodayCol = selectedWeek !== 0 && currentWeekDates[index] === todayStr;
                                                const cellDateStr = currentWeekDates[index]; 

                                                const slotCourses = displayedSchedule.map(c => {
                                                    const details = getCourseDetailsForSlot(c, day, selectedWeek, shift);
                                                    return details ? { course: c, slotDetails: details } : null;
                                                }).filter(Boolean);
                                                const makeupSlotCourses = displayedSchedule.flatMap(c => (c.makeup_schedules || [])
                                                    .filter(item => item.date === cellDateStr && (getMainShiftType(item.shift) || 'S') === shift)
                                                    .map(item => ({
                                                        course: c,
                                                        slotDetails: {
                                                            id: item.id,
                                                            day,
                                                            shift: item.shift,
                                                            room: item.room,
                                                            weeks: 'Học bù',
                                                            isMakeup: true,
                                                            originalDate: item.originalDate
                                                        }
                                                    }))
                                                );
                                                const displaySlotCourses = [...slotCourses, ...makeupSlotCourses];

                                                const slotExams = displayedSchedule.filter(c => {
                                                    if (!c.exam_date || !c.exam_shift || selectedWeek === 0) return false; 
                                                    const examDM = getExamDayMonth(c.exam_date);
                                                    return examDM === cellDateStr.substring(0, 5) && isExamInShift(c.exam_shift, shift);
                                                });
                                                
                                                return (
                                                    <td key={`${shift}-${day}`} className={`border-r border-b border-gray-100 align-top p-1.5 h-[160px] transition-colors ${isTodayCol ? 'bg-[#F0F9FF]' : 'bg-white hover:bg-gray-50/30'}`}>
                                                        <div className="flex flex-col gap-2 w-full h-full">
                                                            {displaySlotCourses.map(({course, slotDetails}: any) => {
                                                                const color = getColorForCourse(course.id);
                                                                const cellLabels = course.labels?.filter((l: any) => l.date === cellDateStr) || [];
                                                                
                                                                return (
                                                                <div key={`${course.id}-${slotDetails.isMakeup ? slotDetails.id : 'regular'}`} onClick={() => setSelectedCourseInfo({ course, details: slotDetails, dateStr: cellDateStr })} className={`border-l-4 border-y border-r border-gray-100 ${color.border} ${color.bg} rounded-r-lg p-2 cursor-pointer transition-all hover:-translate-y-0.5 relative group w-full shrink-0 flex flex-col`}>
                                                                    
                                                                    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                                                        {selectedWeek !== 0 && (
                                                                            <button onClick={(e) => { e.stopPropagation(); setQuickTagCourse({ ...course, dateStr: cellDateStr }); }} className="bg-white/80 hover:bg-white text-blue-600 hover:text-blue-800 rounded p-1 shadow-sm border border-blue-100" title="Gắn nhãn cho ngày này">
                                                                                <Tag size={12}/>
                                                                            </button>
                                                                        )}
                                                                        <button onClick={(e) => { e.stopPropagation(); removeFromActiveSchedule(course.id); }} className="bg-white/80 hover:bg-white text-red-500 hover:text-red-700 rounded p-1 shadow-sm border border-red-100" title={isPlanMode ? 'Xóa khỏi kế hoạch' : 'Xóa môn'}>
                                                                            <X size={12}/>
                                                                        </button>
                                                                    </div>

                                                                    {cellLabels.length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 mb-1 relative z-0 pr-10">
                                                                            {cellLabels.map((l: any) => (
                                                                                <span key={l.id} className={`text-[8px] px-1.5 py-0.5 rounded border font-bold whitespace-nowrap ${getLabelStyle(l.color)}`}>
                                                                                    {l.type === 'Khác' ? l.text : l.type}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    <h4 className={`font-bold ${color.text} text-[11px] sm:text-xs leading-snug line-clamp-2 pr-10 mb-0.5 mt-0.5`}>{course.subject_name}</h4>
                                                                    <div className={`text-[9px] ${color.text} opacity-80 font-medium mb-1.5 truncate`}>{course.course_code} • Đợt {course.phase || '1'}</div>
                                                                    {slotDetails.isMakeup && (
                                                                        <div className={`text-[9px] ${color.label} font-bold mb-1`}>Học bù cho ngày {slotDetails.originalDate?.substring(0, 5)}</div>
                                                                    )}
                                                                    
                                                                    <div className="mt-auto">
                                                                        <div className={`text-[10px] ${color.label} font-semibold flex items-center gap-1`}><MapPin size={10}/> P. {slotDetails.room}</div>
                                                                        <div className={`text-[10px] ${color.label} font-medium flex items-center gap-1 mt-0.5`}><Clock size={10}/> {getCourseTimeLabel(slotDetails.shift)}</div>
                                                                    </div>
                                                                </div>
                                                                );
                                                            })}

                                                            {slotExams.map(exam => (
                                                                <div key={`exam-${exam.id}`} onClick={() => setSelectedCourseInfo({ course: exam, dateStr: cellDateStr })} className="border-l-4 border-y border-r border-gray-100 border-l-red-500 bg-red-50 rounded-r-lg p-2.5 cursor-pointer transition-all hover:-translate-y-0.5 relative group w-full shrink-0">
                                                                    <div className="text-[9px] font-black text-red-600 uppercase mb-1 tracking-wider flex items-center gap-1 bg-red-100 w-fit px-1.5 py-0.5 rounded"><Zap size={10} className="fill-current"/> Lịch thi</div>
                                                                    <h4 className="font-bold text-red-900 text-[11px] sm:text-xs leading-snug line-clamp-2 mb-1">{exam.subject_name}</h4>
                                                                    <div className="text-[10px] text-red-700 font-bold flex items-center gap-1"><Clock size={10}/> {exam.exam_shift} {getExamTime(exam.exam_shift) ? `(${getExamTime(exam.exam_shift)})` : ''}</div>
                                                                    {exam.exam_room && <div className="text-[10px] text-red-700 font-semibold flex items-center gap-1 mt-0.5"><MapPin size={10}/> P. {exam.exam_room}</div>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
    ) : (
                            // LỊCH THÁNG
                            <div className="flex flex-col h-full bg-white">
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4">
                                    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl border border-gray-300 min-h-full">
                                        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                                            <div key={d} className="bg-[#f8fafc] text-center text-[11px] font-bold py-2.5 text-[#003375] uppercase border-b border-gray-200">{d}</div>
                                        ))}
                                        
                                        {renderMonthDays().map((date, idx) => {
                                            if (!date) return <div key={`empty-${idx}`} className="bg-gray-50/30 min-h-[90px]" />;
                                            
                                            const cellDateStr = formatDateStr(date);
                                            const dayCourses = getCoursesForDate(date, displayedSchedule);
                                            const dayExams = getExamsForDate(date, displayedSchedule);
                                            const isToday = todayStr === cellDateStr;
                                            
                                            return (
                                                <div key={date.toISOString()} className={`bg-white min-h-[90px] p-1.5 transition-colors hover:bg-gray-50/50 ${isToday ? 'bg-[#F0F9FF]' : ''}`}>
                                                    <div className={`text-[11px] font-bold text-center mb-1.5 ${isToday ? 'bg-[#003375] text-white rounded-full w-5 h-5 mx-auto flex items-center justify-center' : 'text-gray-600'}`}>
                                                        {date.getDate()}
                                                    </div>
                                                    <div className="flex flex-col gap-1 overflow-hidden px-0.5">
                                                        {dayCourses.map((item: any, i: number) => {
                                                            const color = getColorForCourse(item.course.id);
                                                            const cellLabels = item.course.labels?.filter((l: any) => l.date === cellDateStr) || [];
                                                            return (
                                                                <div key={i} onClick={() => setSelectedCourseInfo({course: item.course, details: item.details, dateStr: cellDateStr})} className={`text-[9px] px-1.5 py-1 rounded truncate cursor-pointer font-semibold flex items-center gap-1 ${color.bg} ${color.text} border-l-2 ${color.border} hover:opacity-80 transition-opacity`}>
                                                                    {cellLabels.length > 0 && (
                                                                        <div className="flex gap-0.5 shrink-0">
                                                                            {cellLabels.map((l: any) => (
                                                                                <span key={l.id} className={`w-1.5 h-1.5 rounded-full ${getLabelDotColor(l.color)}`} title={l.type === 'Khác' ? l.text : l.type}></span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <span className="truncate">{item.course.subject_name}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        {dayExams.map((exam: any, i: number) => (
                                                            <div key={`exam-${i}`} onClick={() => setSelectedCourseInfo({course: exam, dateStr: cellDateStr})} className="text-[9px] px-1.5 py-1 rounded truncate cursor-pointer bg-red-50 text-red-700 border-l-2 border-l-red-500 font-bold hover:bg-red-100 flex items-center gap-1">
                                                                <Zap size={8} className="shrink-0"/> <span className="truncate">Thi: {exam.subject_name}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {/* NÚT DANH SÁCH MÔN (FAB Nằm trong khung lịch) */}
                    <div className="absolute bottom-4 right-4 flex gap-2">
                        <button onClick={() => setIsMyScheduleModalOpen(true)} className="bg-white border border-gray-300 text-[#003375] hover:bg-gray-50 px-4 py-2.5 rounded-full font-bold text-sm shadow-md flex items-center gap-2 active:scale-95 transition-transform">
                            <List size={16}/> {isPlanMode ? `KH ${activePlanKey}` : 'Đã lưu'} ({displayedScheduleCount})
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL CHI TIẾT MÔN HỌC (TÍCH HỢP QUẢN LÝ LABEL TRỰC TIẾP) */}
        {selectedCourseInfo && (() => {
            const displayCourse = displayedSchedule.find(c => c.id === selectedCourseInfo.course.id) || selectedCourseInfo.course;
            const details = selectedCourseInfo.details;
            const isSaved = !!displayCourse.user_schedule_id;
            const isInCurrentPlan = currentPlanSchedule.some(c => c.id === displayCourse.id);
            const isStudentEditLocked = isStudentCourseEditLocked(displayCourse);
            const targetDateStr = selectedCourseInfo.dateStr;

            const modalLabels = targetDateStr 
                ? displayCourse.labels?.filter((l: any) => l.date === targetDateStr) 
                : displayCourse.labels;

            let timeDisplayValue = '';
            if (details) {
                timeDisplayValue = [`Thứ ${details.day}`, getShiftDisplay(details.shift), getCourseTimeLabel(details.shift)].filter(Boolean).join('\n');
                if (details.isMakeup && details.originalDate) {
                    timeDisplayValue += `\nHọc bù cho ngày ${details.originalDate}`;
                }
            } else {
                const dayArr = splitData(displayCourse.day_of_week);
                const shiftArr = splitData(displayCourse.shift);
                const combined = [];
                const maxLen = Math.max(dayArr.length, shiftArr.length);
                for(let i=0; i<maxLen; i++) {
                    const d = dayArr[i] || dayArr[0];
                    const s = shiftArr[i] || shiftArr[0];
                    const tLabel = getCourseTimeLabel(s);
                    combined.push(`Thứ ${d} • ${getShiftDisplay(s)}${tLabel ? ` (${tLabel})` : ''}`);
                }
                timeDisplayValue = combined.join('\n'); 
            }
            const modalRoom = details ? details.room : displayCourse.room?.replace(/\n/g, ' / ');
            const modalWeeks = details ? details.weeks : displayCourse.weeks?.replace(/\n/g, ' / ');
            const dayValues = details ? [`Thứ ${details.day}`] : splitData(displayCourse.day_of_week).map(day => `Thứ ${day}`);
            const shiftValues = details ? [details.shift] : splitData(displayCourse.shift);
            const modalDayValue = dayValues.filter(Boolean).join(' / ');
            const modalShiftValue = shiftValues
                .filter(Boolean)
                .map(shift => {
                    const display = getShiftDisplay(shift);
                    return display ? `${shift} (${display})` : shift;
                })
                .join(' / ');
            const modalStudyTimeValue = shiftValues.map(shift => getCourseTimeLabel(shift)).filter(Boolean).join(' / ');
            const makeupNote = details?.isMakeup && details.originalDate ? `Học bù cho ngày ${details.originalDate}` : '';
            const examTimeValue = displayCourse.exam_shift ? getExamTime(displayCourse.exam_shift) : '';
            const formatPhaseValue = (phase?: string | null) => {
                const value = String(phase || '').trim();
                if (!value) return '';
                return value.toLocaleLowerCase('vi').startsWith('đợt') ? value : `Đợt ${value}`;
            };
            const hasDetailValue = (value: React.ReactNode) => {
                if (value === undefined || value === null || value === false) return false;
                if (typeof value === 'string') return value.trim().length > 0;
                return true;
            };
            const renderDetailRow = (label: string, value: React.ReactNode, fallback?: React.ReactNode) => {
                const displayValue = hasDetailValue(value) ? value : fallback;
                if (!hasDetailValue(displayValue)) return null;
                return (
                    <div className="min-w-0 rounded-lg border border-gray-100 bg-white px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
                        <p className="mt-0.5 break-words whitespace-pre-line text-sm font-semibold leading-snug text-gray-900">{displayValue}</p>
                    </div>
                );
            };
            const renderDetailSection = (
                title: string,
                icon: React.ReactNode,
                toneClass: string,
                children: React.ReactNode
            ) => {
                const rows = React.Children.toArray(children).filter(Boolean);
                if (!rows.length) return null;
                return (
                    <section className="rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                        <div className="mb-2 flex items-center gap-2">
                            <div className={`rounded-lg p-1.5 ${toneClass}`}>{icon}</div>
                            <h3 className="text-xs font-extrabold uppercase tracking-wide text-gray-600">{title}</h3>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{rows}</div>
                    </section>
                );
            };

            return createPortal(
                <div className="fixed inset-0 bg-black/55 z-[100000] flex items-center justify-center p-4" onClick={() => setSelectedCourseInfo(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-xl max-h-[90vh] border border-gray-200 shadow-2xl flex flex-col overflow-hidden animate-scaleIn" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 relative bg-gray-50 shrink-0">
                            <button onClick={() => setSelectedCourseInfo(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 bg-white rounded-full p-1 border border-gray-200"><X size={16}/></button>
                            <h2 className="text-lg font-bold text-[#003375] pr-8 leading-tight">{displayCourse.subject_name}</h2>
                            <p className="text-gray-500 mt-1 text-sm font-medium">{displayCourse.course_code}</p>
                            
                            <div className="flex gap-1.5 flex-wrap mt-2 items-center">
                                {displayCourse.phase && <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 shrink-0">{formatPhaseValue(displayCourse.phase)}</span>}
                                
                                {/* HIỂN THỊ LABELS */}
                                {modalLabels && modalLabels.map((l: any) => (
                                    <span key={l.id} className={`text-[10px] font-bold pl-2 pr-1 py-0.5 rounded border flex items-center gap-1 ${getLabelStyle(l.color)}`}>
                                        <Tag size={10} /> 
                                        {!targetDateStr && <span className="font-normal opacity-80 mr-0.5">[{l.date?.substring(0,5)}]</span>}
                                        {l.type === 'Khác' ? l.text : l.type}
                                        {isSaved && (
                                            <button onClick={(e) => { e.stopPropagation(); handleInlineRemoveLabel(l.id); }} className="hover:text-red-600 ml-0.5 bg-white/50 rounded-full p-0.5" title="Xóa nhãn"><X size={10}/></button>
                                        )}
                                    </span>
                                ))}

                                {/* NÚT THÊM NHÃN INLINE (Chỉ hiện khi thao tác tại 1 ngày cụ thể) */}
                                {isSaved && targetDateStr && !showInlineLabelForm && (
                                    <button onClick={() => setShowInlineLabelForm(true)} className="text-[10px] font-bold px-2 py-0.5 rounded border border-dashed border-gray-300 text-gray-500 hover:bg-gray-100 flex items-center gap-1 shrink-0 transition-colors">
                                        <Plus size={10}/> Thêm nhãn
                                    </button>
                                )}
                            </div>

                            {/* FORM THÊM NHÃN INLINE */}
                            {isSaved && targetDateStr && showInlineLabelForm && (
                                <div className="mt-3 p-2 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-wrap gap-2 items-start animate-fadeIn">
                                    <select 
                                        value={inlineLabelData.type} 
                                        onChange={(e) => setInlineLabelData({...inlineLabelData, type: e.target.value})}
                                        className="px-2 py-1.5 text-xs border border-gray-300 rounded outline-none focus:border-[#003375] cursor-pointer"
                                    >
                                        {LABEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>

                                    {inlineLabelData.type === 'Khác' && (
                                        <input 
                                            type="text" placeholder="Nhập tên..." 
                                            value={inlineLabelData.text} onChange={e => setInlineLabelData({...inlineLabelData, text: e.target.value})}
                                            className="flex-1 min-w-[80px] px-2 py-1.5 text-xs border border-gray-300 rounded outline-none focus:border-[#003375]"
                                        />
                                    )}
                                    
                                    {inlineLabelData.type === 'Khác' && (
                                        <div className="flex gap-1 items-center bg-gray-50 px-1.5 py-1 rounded border border-gray-200 w-full mt-1">
                                            <span className="text-[10px] font-bold text-gray-500">Màu:</span>
                                            {LABEL_COLORS.map(c => (
                                                <button 
                                                    key={c.value} type="button" title={c.name}
                                                    onClick={() => setInlineLabelData({...inlineLabelData, color: c.value})}
                                                    className={`w-4 h-4 rounded-full ${getLabelDotColor(c.value)} ${inlineLabelData.color === c.value ? 'ring-1 ring-offset-1 ring-gray-400 scale-110' : ''}`}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {inlineLabelData.type === 'Nghỉ' && (
                                        <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2 p-2 rounded-lg border border-red-100 bg-red-50/60">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-red-700">Ngày học bù</label>
                                                <input type="date" value={inlineLabelData.makeupDate} onChange={e => setInlineLabelData({...inlineLabelData, makeupDate: e.target.value})} className="w-full px-2 py-1.5 text-xs border border-red-200 rounded outline-none focus:border-[#003375] bg-white" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-red-700">Thời gian</label>
                                                <select value={inlineLabelData.makeupShift} onChange={e => setInlineLabelData({...inlineLabelData, makeupShift: e.target.value})} className="w-full px-2 py-1.5 text-xs border border-red-200 rounded outline-none focus:border-[#003375] bg-white">
                                                    <option value="S">Sáng</option>
                                                    <option value="C">Chiều</option>
                                                    <option value="1-3">Tiết 1-3</option>
                                                    <option value="4-5">Tiết 4-5</option>
                                                    <option value="6-8">Tiết 6-8</option>
                                                    <option value="9-10">Tiết 9-10</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-red-700">Phòng học</label>
                                                <input type="text" value={inlineLabelData.makeupRoom} onChange={e => setInlineLabelData({...inlineLabelData, makeupRoom: e.target.value})} placeholder="B1.303" className="w-full px-2 py-1.5 text-xs border border-red-200 rounded outline-none focus:border-[#003375] bg-white" />
                                            </div>
                                        </div>
                                    )}
                                    
                                    <div className="flex items-center gap-1 ml-auto">
                                        <button onClick={() => setShowInlineLabelForm(false)} className="bg-gray-100 text-gray-600 px-2 py-1.5 rounded hover:bg-gray-200 text-xs font-bold">
                                            Hủy
                                        </button>
                                        <button onClick={handleInlineSaveLabel} disabled={isSavingInlineLabel} className="bg-[#003375] text-white px-2 py-1.5 rounded hover:bg-[#002855] disabled:opacity-50 flex items-center gap-1 text-xs font-bold shadow-sm">
                                            {isSavingInlineLabel ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle size={12}/>} Lưu
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                            {isCourseDetailLoading && (
                                <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-[#003375]">
                                    <Loader2 size={14} className="animate-spin" />
                                    Đang tải thêm chi tiết môn học...
                                </div>
                            )}
                            {renderDetailSection(
                                'Thông tin học phần',
                                <Info size={14} />,
                                'bg-blue-50 text-blue-600',
                                <>
                                    {renderDetailRow('Tên học phần', displayCourse.subject_name, 'Đang cập nhật')}
                                    {renderDetailRow('Lớp học phần', displayCourse.course_code, 'Đang cập nhật')}
                                    {renderDetailRow('Tín chỉ', displayCourse.credits)}
                                    {renderDetailRow('Tiền đề', displayCourse.prerequisite)}
                                    {renderDetailRow('Khối kiến thức', displayCourse.knowledge_block)}
                                    {renderDetailRow('Khoa quản lý', displayCourse.managing_faculty)}
                                </>
                            )}

                            {renderDetailSection(
                                'Lịch học',
                                <Clock size={14} />,
                                'bg-emerald-50 text-emerald-600',
                                <>
                                    {renderDetailRow('Đợt thi/học', formatPhaseValue(displayCourse.phase))}
                                    {renderDetailRow('Thứ', modalDayValue)}
                                    {renderDetailRow('Ca tiết', modalShiftValue)}
                                    {renderDetailRow('Giờ học', modalStudyTimeValue || timeDisplayValue)}
                                    {renderDetailRow('Tuần', modalWeeks)}
                                    {renderDetailRow('Phòng học', modalRoom ? `Phòng ${modalRoom}` : '', 'Phòng học: Đang cập nhật')}
                                    {renderDetailRow('Cơ sở học', displayCourse.campus, 'Cơ sở: Đang cập nhật')}
                                    {renderDetailRow('Giảng viên', displayCourse.instructor, 'Đang cập nhật')}
                                    {renderDetailRow('Ghi chú lịch học', makeupNote)}
                                </>
                            )}

                            {renderDetailSection(
                                'Lịch thi dự kiến',
                                <CalendarDays size={14} />,
                                'bg-purple-50 text-purple-600',
                                <>
                                    {renderDetailRow('Ngày thi dự kiến', displayCourse.exam_date)}
                                    {renderDetailRow('Ca thi dự kiến', displayCourse.exam_shift)}
                                    {renderDetailRow('Giờ thi', examTimeValue)}
                                    {renderDetailRow('Cơ sở thi', displayCourse.exam_campus)}
                                    {renderDetailRow('Phòng thi', displayCourse.exam_room)}
                                </>
                            )}

                            {renderDetailSection(
                                'Đối tượng đăng ký',
                                <User size={14} />,
                                'bg-orange-50 text-orange-600',
                                <>
                                    {renderDetailRow('Học kỳ', displayCourse.semester)}
                                    {renderDetailRow('Khóa', displayCourse.cohort)}
                                    {renderDetailRow('Ngành / chuyên ngành', displayCourse.major)}
                                    {renderDetailRow('Nhóm', displayCourse.group_name)}
                                    {renderDetailRow('Định hướng', displayCourse.orientation)}
                                    {renderDetailRow('Ghi chú 3 định hướng', displayCourse.orientation_note_3)}
                                    {renderDetailRow('Hình thức đăng ký', displayCourse.registration_type)}
                                    {renderDetailRow('Sĩ số sinh viên', displayCourse.student_count !== undefined && displayCourse.student_count !== null ? `${displayCourse.student_count} sinh viên` : '')}
                                    {renderDetailRow('Chương trình học', displayCourse.academic_program)}
                                </>
                            )}

                            {renderDetailSection(
                                'Ghi chú',
                                <List size={14} />,
                                'bg-gray-100 text-gray-600',
                                <>
                                    {renderDetailRow('Ghi chú chung', displayCourse.general_note)}
                                </>
                            )}
                        </div>
                        <div className="p-4 bg-white border-t border-gray-100 flex gap-2 shrink-0">
                            <button onClick={() => { setReportData({ course_code: displayCourse.course_code, subject_name: displayCourse.subject_name, description: '', suggested_correction: '' }); setIsReportModalOpen(true); setSelectedCourseInfo(null); }} className="px-3 py-2.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors" title="Báo lỗi thông tin">
                                <AlertTriangle size={18} />
                            </button>
                            {isPlanMode ? (
                                isInCurrentPlan ? (
                                    <button onClick={() => { removeFromPlanSchedule(displayCourse.id); setSelectedCourseInfo(null); }} className="flex-1 py-2.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-sm font-bold hover:bg-amber-100 transition-all">Xóa khỏi Kế hoạch {activePlanKey}</button>
                                ) : (
                                    <button onClick={() => { addToPlanSchedule(displayCourse); setSelectedCourseInfo(null); }} disabled={isSyncing} className="flex-1 py-2.5 rounded-lg bg-[#003375] text-white text-sm font-bold hover:bg-[#002855] transition-all disabled:opacity-50">Thêm vào Kế hoạch {activePlanKey}</button>
                                )
                            ) : !isSaved ? (
                                <button onClick={() => { addToSchedule(displayCourse); setSelectedCourseInfo(null); }} disabled={isSyncing} className="flex-1 py-2.5 rounded-lg bg-[#003375] text-white text-sm font-bold hover:bg-[#002855] transition-all disabled:opacity-50">Thêm vào Lịch</button>
                            ) : (
                                <>
                                    {!isStudentEditLocked && (
                                        <button onClick={() => {
                                            setStudentEditData(displayCourse);
                                            setIsStudentEditModalOpen(true);
                                            setSelectedCourseInfo(null);
                                        }} className="px-3 py-2.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors" title="Sửa thông tin cá nhân">
                                            <Edit size={18} />
                                        </button>
                                    )}
                                    <button onClick={() => { removeFromSchedule(displayCourse.id); setSelectedCourseInfo(null); }} className="flex-1 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-bold hover:bg-red-100 transition-all">Xóa khỏi Lịch</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            );
        })()}

        {/* MODAL DANH SÁCH MÔN ĐÃ LƯU */}
        {isMyScheduleModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4" onClick={() => setIsMyScheduleModalOpen(false)}>
                <div className="bg-white rounded-2xl w-full max-w-md border border-gray-200 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-scaleIn" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-50 border-b border-gray-100 p-4 flex items-center justify-between shrink-0">
                        <h2 className="font-bold text-[#003375] text-base flex items-center gap-2"><List size={18}/> {isPlanMode ? `Kế hoạch ${activePlanKey}` : 'Môn học đã lưu'} ({displayedScheduleCount})</h2>
                        <button onClick={() => setIsMyScheduleModalOpen(false)} className="text-gray-400 hover:text-gray-800 bg-white rounded-full p-1 border border-gray-200"><X size={16}/></button>
                    </div>
                    <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-2 bg-white">
                        {displayedSchedule.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">
                                <Search size={40} className="mx-auto text-gray-200 mb-3"/>
                                <p className="font-medium text-sm">{isPlanMode ? `Kế hoạch ${activePlanKey} chưa có môn học nào.` : 'Chưa có môn học nào trong lịch.'}</p>
                            </div>
                        ) : (
                            displayedSchedule.map(course => (
                                <div key={course.id} className="bg-white p-3 rounded-xl border border-gray-200 flex items-center justify-between gap-3 hover:border-blue-300 transition-colors cursor-pointer" onClick={() => { setIsMyScheduleModalOpen(false); setSelectedCourseInfo({ course }); }}>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-800 text-sm truncate">{course.subject_name}</h4>
                                        <p className="text-[10px] text-gray-500 mt-0.5 font-medium">{course.course_code} <span className="mx-1">•</span> Đợt {course.phase || '1'}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {!isPlanMode && !isStudentCourseEditLocked(course) && (
                                            <button onClick={(e) => { e.stopPropagation(); setStudentEditData(course); setIsStudentEditModalOpen(true); setIsMyScheduleModalOpen(false); }} className="text-gray-400 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100" title="Sửa lịch cá nhân"><Edit size={16}/></button>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); removeFromActiveSchedule(course.id); }} className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors border border-transparent hover:border-red-100" title={isPlanMode ? 'Xóa khỏi kế hoạch' : 'Xóa môn khỏi lịch'}><Trash2 size={16}/></button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* MODAL BÁO LỖI */}
        {isReportModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4" onClick={() => setIsReportModalOpen(false)}>
                <div className="bg-white rounded-2xl w-full max-w-sm border border-gray-200 shadow-2xl overflow-hidden flex flex-col animate-scaleIn" onClick={e => e.stopPropagation()}>
                    <div className="p-4 flex items-center justify-between border-b border-gray-100 bg-red-50 text-red-700">
                        <h2 className="font-bold text-base flex items-center gap-2"><AlertTriangle size={18}/> Báo lỗi môn học</h2>
                        <button onClick={() => setIsReportModalOpen(false)} className="text-red-400 hover:text-red-800"><X size={20}/></button>
                    </div>
                    <form onSubmit={handleReportSubmit} className="p-5 space-y-4 bg-white">
                        <div><input required placeholder="Mã học phần (VD: ACC718_2521_L04)" value={reportData.course_code} onChange={e => setReportData({...reportData, course_code: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"/></div>
                        <div><input required placeholder="Tên môn học" value={reportData.subject_name} onChange={e => setReportData({...reportData, subject_name: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"/></div>
                        <div><textarea required rows={3} placeholder="Chi tiết lỗi (VD: Đổi phòng, đổi giờ)..." value={reportData.description} onChange={e => setReportData({...reportData, description: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none transition-colors"></textarea></div>
                        <div><textarea rows={3} placeholder="Sửa lại như nào cho đúng? (VD: Phòng đúng là B2.904, giờ đúng là 13:00...)" value={reportData.suggested_correction} onChange={e => setReportData({...reportData, suggested_correction: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none transition-colors"></textarea></div>
                        <button type="submit" className="w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors ">Tạo ticket hỗ trợ</button>
                    </form>
                </div>
            </div>
        )}

        {/* MODAL THÊM MÔN MỚI DÀNH CHO USER */}
        {isCreateCourseModalOpen && (
            <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4" onClick={() => setIsCreateCourseModalOpen(false)}>
                <div className="bg-white rounded-2xl w-full max-w-sm border border-gray-200 shadow-2xl overflow-hidden flex flex-col animate-scaleIn" onClick={e => e.stopPropagation()}>
                    <div className="p-4 flex items-center justify-between border-b border-gray-100 bg-[#f8fafc]">
                        <h2 className="font-bold text-[#003375] text-base flex items-center gap-2"><BookPlus size={18}/> Yêu cầu thêm môn</h2>
                        <button onClick={() => setIsCreateCourseModalOpen(false)} className="text-gray-400 hover:text-gray-800"><X size={20}/></button>
                    </div>
                    <form onSubmit={handleCreateCourseSubmit} className="p-5 space-y-4 bg-white">
                        <div className="text-xs text-gray-500 mb-2">Hệ thống chưa có môn này? Gửi thông tin để Admin cập nhật nhé.</div>
                        <div><input type="text" required placeholder="Tên môn học *" value={newCourseData.subject_name} onChange={e => setNewCourseData({...newCourseData, subject_name: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-[#003375] focus:ring-1 focus:ring-[#003375] transition-colors"/></div>
                        <div><input type="text" required placeholder="Mã học phần *" value={newCourseData.course_code} onChange={e => setNewCourseData({...newCourseData, course_code: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-[#003375] focus:ring-1 focus:ring-[#003375] transition-colors"/></div>
                        <div><input type="text" placeholder="Giảng viên (Tùy chọn)" value={newCourseData.instructor} onChange={e => setNewCourseData({...newCourseData, instructor: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-[#003375] focus:ring-1 focus:ring-[#003375] transition-colors"/></div>
                        <button type="submit" disabled={isSubmittingCourse} className="w-full py-2.5 rounded-lg bg-[#003375] text-white text-sm font-bold hover:bg-[#002855] transition-colors ">{isSubmittingCourse ? 'Đang gửi...' : 'Gửi yêu cầu'}</button>
                    </form>
                </div>
            </div>
        )}

        {/* ✨ MODAL GẮN NHÃN NHANH (QUICK TAG) ✨ */}
        {quickTagCourse && (
            <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4" onClick={() => setQuickTagCourse(null)}>
                <div className="bg-white rounded-2xl w-full max-w-sm border-2 border-gray-100 shadow-2xl flex flex-col overflow-hidden animate-scaleIn" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center shrink-0">
                        <h2 className="font-bold text-[#003375] text-base flex items-center gap-2"><Tag size={18} /> Gắn nhãn nhanh</h2>
                        <button onClick={() => setQuickTagCourse(null)} className="text-gray-400 hover:text-gray-800 bg-white rounded-full p-1 border border-gray-200 transition-colors"><X size={16}/></button>
                    </div>
                    
                    <div className="p-5 flex flex-col gap-4">
                        <div>
                            <p className="text-xs font-bold text-gray-500 mb-1">Môn học ngày {quickTagCourse.dateStr}:</p>
                            <p className="text-sm font-bold text-[#003375] leading-tight line-clamp-2">{quickTagCourse.subject_name}</p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <label className="text-xs font-bold text-gray-600">Chọn loại nhãn:</label>
                            <select 
                                value={quickTagData.type} 
                                onChange={(e) => setQuickTagData({...quickTagData, type: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#003375] cursor-pointer"
                            >
                                {LABEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>

                            {quickTagData.type === 'Khác' && (
                                <input 
                                    type="text" 
                                    placeholder="Nhập tên nhãn (VD: Mang laptop...)" 
                                    value={quickTagData.text} 
                                    onChange={(e) => setQuickTagData({...quickTagData, text: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-[#003375]"
                                />
                            )}

                            {quickTagData.type === 'Khác' && (
                                <>
                                    <label className="text-xs font-bold text-gray-600 mt-1">Chọn màu sắc:</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {LABEL_COLORS.map(c => (
                                            <button 
                                                key={c.value} type="button" title={c.name}
                                                onClick={() => setQuickTagData({...quickTagData, color: c.value})}
                                                className={`w-8 h-8 rounded-full ${getLabelDotColor(c.value)} ${quickTagData.color === c.value ? 'ring-2 ring-offset-2 ring-gray-400 scale-110 shadow-md' : 'hover:scale-110 shadow-sm'} transition-transform`}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}

                            {quickTagData.type === 'Nghỉ' && (
                                <div className="rounded-xl border border-red-100 bg-red-50/70 p-3 space-y-3">
                                    <div className="flex items-center gap-2 text-red-700">
                                        <CalendarDays size={15} />
                                        <p className="text-xs font-bold">Lịch học bù</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-600">Ngày học bù</label>
                                            <input type="date" value={quickTagData.makeupDate} onChange={e => setQuickTagData({...quickTagData, makeupDate: e.target.value})} className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm outline-none focus:border-[#003375] bg-white" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-gray-600">Thời gian</label>
                                            <select value={quickTagData.makeupShift} onChange={e => setQuickTagData({...quickTagData, makeupShift: e.target.value})} className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm outline-none focus:border-[#003375] bg-white">
                                                <option value="S">Sáng</option>
                                                <option value="C">Chiều</option>
                                                <option value="1-3">Tiết 1-3</option>
                                                <option value="4-5">Tiết 4-5</option>
                                                <option value="6-8">Tiết 6-8</option>
                                                <option value="9-10">Tiết 9-10</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-600">Phòng học bù</label>
                                        <input type="text" value={quickTagData.makeupRoom} onChange={e => setQuickTagData({...quickTagData, makeupRoom: e.target.value})} placeholder="VD: B1.303" className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm outline-none focus:border-[#003375] bg-white" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0">
                        <button type="button" onClick={() => setQuickTagCourse(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-lg transition-colors text-sm">Hủy</button>
                        <button type="button" onClick={handleQuickSaveLabel} disabled={isSavingQuickTag} className="px-6 py-2 bg-[#003375] hover:bg-[#002855] text-white font-bold rounded-lg shadow-md transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                            {isSavingQuickTag ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} Gắn Nhãn
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL SINH VIÊN SỬA MÔN CÁ NHÂN VÀ GẮN NHÃN CHUNG (BẢNG LỚN) */}
        {isStudentEditModalOpen && (
            <div className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4 sm:p-6" onClick={() => setIsStudentEditModalOpen(false)}>
                <div className="bg-white rounded-2xl w-full max-w-3xl border border-gray-200 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-scaleIn" onClick={e => e.stopPropagation()}>
                    <div className="p-4 sm:p-5 bg-[#003375] text-white flex justify-between items-center shrink-0">
                        <h2 className="font-bold text-lg flex items-center gap-2"><Edit size={18} /> Tùy chỉnh môn học cá nhân</h2>
                        <button onClick={() => setIsStudentEditModalOpen(false)} className="hover:bg-white/20 p-1.5 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                    <div className="p-5 overflow-y-auto custom-scrollbar flex-1 bg-gray-50 flex flex-col gap-6">
                        
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="text-sm font-bold text-[#003375] mb-3 flex items-center gap-1.5"><Tag size={16}/> Nhãn dán đã gắn cho môn này</h3>
                            
                            {studentEditData.labels && studentEditData.labels.length > 0 ? (
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {studentEditData.labels.map(l => (
                                        <div key={l.id} className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded border ${getLabelStyle(l.color)}`}>
                                            <span className="font-normal opacity-80 mr-1">[{l.date?.substring(0,5)}]</span>
                                            <span>{l.type === 'Khác' ? l.text : l.type}</span>
                                            <button type="button" onClick={() => handleRemoveLabel(l.id)} className="opacity-60 hover:opacity-100 hover:text-red-600 transition-colors ml-1"><X size={12}/></button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500 mb-4">Môn học này chưa có nhãn nào. Hãy dán nhãn từ trang Lịch!</p>
                            )}

                        </div>

                        <form id="studentCourseForm" onSubmit={handleStudentSaveCourse} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Tên môn học *</label>
                                <input required type="text" value={studentEditData.subject_name || ''} onChange={e => setStudentEditData({...studentEditData, subject_name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Mã học phần *</label>
                                <input required type="text" value={studentEditData.course_code || ''} onChange={e => setStudentEditData({...studentEditData, course_code: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Số Tín Chỉ</label>
                                <input type="number" min="1" max="10" value={studentEditData.credits || ''} onChange={e => setStudentEditData({...studentEditData, credits: parseInt(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Giảng viên</label>
                                <input type="text" value={studentEditData.instructor || ''} onChange={e => setStudentEditData({...studentEditData, instructor: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Ngày học (VD: 2, 4, 6)</label>
                                <input type="text" value={studentEditData.day_of_week || ''} onChange={e => setStudentEditData({...studentEditData, day_of_week: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Ca học (S, C, S C)</label>
                                <input type="text" value={studentEditData.shift || ''} onChange={e => setStudentEditData({...studentEditData, shift: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Phòng học (VD: B1.101, C301)</label>
                                <input type="text" value={studentEditData.room || ''} onChange={e => setStudentEditData({...studentEditData, room: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Tuần học (VD: 1, 5-15)</label>
                                <input type="text" value={studentEditData.weeks || ''} onChange={e => setStudentEditData({...studentEditData, weeks: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Đợt (1, 2)</label>
                                <input type="text" value={studentEditData.phase || ''} onChange={e => setStudentEditData({...studentEditData, phase: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Ngày thi (VD: 15/07/2026)</label>
                                <input type="text" value={studentEditData.exam_date || ''} onChange={e => setStudentEditData({...studentEditData, exam_date: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Ca thi (1, 2, 3...)</label>
                                <input type="text" value={studentEditData.exam_shift || ''} onChange={e => setStudentEditData({...studentEditData, exam_shift: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Phòng thi (VD: B1.303)</label>
                                <input type="text" value={studentEditData.exam_room || ''} onChange={e => setStudentEditData({...studentEditData, exam_room: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                        </form>
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0 rounded-b-xl">
                        <button type="button" onClick={() => setIsStudentEditModalOpen(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors text-sm">Hủy bỏ</button>
                        <button type="submit" form="studentCourseForm" disabled={isSavingStudentCourse} className="px-6 py-2 bg-[#0052cc] hover:bg-[#003d99] text-white font-bold rounded-lg shadow-md transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                            {isSavingStudentCourse ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} Lưu Tùy Chỉnh
                        </button>
                    </div>
                </div>
            </div>
        )}

        {selectedChangedCourse && (
            <div className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4 sm:p-6" onClick={closeChangedCourseModal}>
                <div className="bg-white rounded-2xl w-full max-w-5xl border border-gray-200 shadow-2xl flex flex-col max-h-[82vh] overflow-hidden animate-scaleIn" onClick={e => e.stopPropagation()}>
                    <div className="p-4 sm:p-5 bg-[#003375] text-white flex justify-between items-start gap-4 shrink-0">
                        <div>
                            <h2 className="font-bold text-lg flex items-center gap-2"><Info size={18} /> So sánh thay đổi môn học</h2>
                            <p className="mt-1 text-sm text-blue-50">
                                {selectedChangedCourse.course_code} - {selectedChangedCourse.subject_name}
                            </p>
                            <p className="mt-1 text-xs text-blue-100">
                                {selectedChangedCourse.user?.full_name || 'Không xác định'} • MSSV {selectedChangedCourse.user?.student_code || '-'}
                            </p>
                        </div>
                        <button onClick={closeChangedCourseModal} className="hover:bg-white/20 p-1.5 rounded-full transition-colors"><X size={20}/></button>
                    </div>

                    <div className="p-5 overflow-y-auto custom-scrollbar flex-1 bg-blue-50/40">
                        {selectedChangedCourseDiffs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                                <CheckCircle size={36} className="mb-3 text-[#0052cc]"/>
                                <p className="font-bold">Không còn khác biệt cần đồng bộ.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse text-sm bg-white rounded-xl overflow-hidden border border-gray-200">
                                <thead className="bg-gray-100 text-gray-600">
                                    <tr>
                                        <th className="p-3 border-b border-gray-200 font-bold w-44">Trường dữ liệu</th>
                                        <th className="p-3 border-b border-gray-200 font-bold">Dữ liệu gốc</th>
                                        <th className="p-3 border-b border-gray-200 font-bold">Sinh viên đã chỉnh</th>
                                        <th className="p-3 border-b border-gray-200 font-bold text-center w-28">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedChangedCourseDiffs.map(diff => (
                                        <tr key={String(diff.key)} className="border-b border-gray-100 last:border-b-0">
                                            <td className="p-3 font-bold text-gray-700">{diff.label}</td>
                                            <td className="p-3 text-gray-500 bg-gray-50">
                                                {normalizeDiffValue(diff.originalValue) || <span className="text-gray-300">Trống</span>}
                                            </td>
                                            <td className="p-3 text-[#0052cc] font-semibold bg-blue-50/70">
                                                {normalizeDiffValue(diff.changedValue) || <span className="text-blue-300">Trống</span>}
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSyncChangedField(String(diff.key), diff.label)}
                                                    disabled={isSyncingChangedCourse}
                                                    className="px-3 py-1.5 rounded-lg bg-[#0052cc] hover:bg-[#003d99] text-white text-xs font-bold transition-colors disabled:opacity-50"
                                                >
                                                    Đồng bộ
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <div className="p-4 border-t border-gray-100 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0 rounded-b-xl">
                        <p className="text-xs text-gray-500">
                            Mỗi dòng có nút đồng bộ riêng để giữ những trường đặc thù của sinh viên.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={closeChangedCourseModal} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors text-sm">Đóng</button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL ADMIN: THÊM / SỬA MÔN HỌC */}
        {isAdminEditModalOpen && (
            <div className="fixed inset-0 bg-black/50 z-[99999] flex items-center justify-center p-4 sm:p-6" onClick={() => { setIsAdminEditModalOpen(false); setActiveCourseRequest(null); }}>
                <div className="bg-white rounded-2xl w-full max-w-3xl border border-gray-200 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-scaleIn" onClick={e => e.stopPropagation()}>
                    <div className="p-4 sm:p-5 bg-[#003375] text-white flex justify-between items-center shrink-0">
                        <h2 className="font-bold text-lg flex items-center gap-2"><Edit size={18} /> {activeCourseRequest ? 'Sửa yêu cầu và thêm môn chính thức' : adminEditData.id ? 'Sửa thông tin môn học' : 'Thêm môn học mới'}</h2>
                        <button onClick={() => { setIsAdminEditModalOpen(false); setActiveCourseRequest(null); }} className="hover:bg-white/20 p-1.5 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                    <div className="p-5 overflow-y-auto custom-scrollbar flex-1 bg-gray-50">
                        <form id="adminCourseForm" onSubmit={handleAdminSaveCourse} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Tên môn học *</label>
                                <input required type="text" value={adminEditData.subject_name || ''} onChange={e => setAdminEditData({...adminEditData, subject_name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Mã học phần *</label>
                                <input required type="text" value={adminEditData.course_code || ''} onChange={e => setAdminEditData({...adminEditData, course_code: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Số Tín Chỉ</label>
                                <input type="number" min="1" max="10" value={adminEditData.credits || ''} onChange={e => setAdminEditData({...adminEditData, credits: parseInt(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Giảng viên</label>
                                <input type="text" value={adminEditData.instructor || ''} onChange={e => setAdminEditData({...adminEditData, instructor: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Ngày học (VD: 2, 4, 6)</label>
                                <input type="text" value={adminEditData.day_of_week || ''} onChange={e => setAdminEditData({...adminEditData, day_of_week: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Ca học (S, C, S C)</label>
                                <input type="text" value={adminEditData.shift || ''} onChange={e => setAdminEditData({...adminEditData, shift: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Phòng học (VD: B1.101, C301)</label>
                                <input type="text" value={adminEditData.room || ''} onChange={e => setAdminEditData({...adminEditData, room: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Tuần học (VD: 1, 5-15)</label>
                                <input type="text" value={adminEditData.weeks || ''} onChange={e => setAdminEditData({...adminEditData, weeks: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Đợt (1, 2)</label>
                                <input type="text" value={adminEditData.phase || ''} onChange={e => setAdminEditData({...adminEditData, phase: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Ngày thi (VD: 15/07/2026)</label>
                                <input type="text" value={adminEditData.exam_date || ''} onChange={e => setAdminEditData({...adminEditData, exam_date: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Ca thi (1, 2, 3...)</label>
                                <input type="text" value={adminEditData.exam_shift || ''} onChange={e => setAdminEditData({...adminEditData, exam_shift: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-600">Phòng thi (VD: B1.303)</label>
                                <input type="text" value={adminEditData.exam_room || ''} onChange={e => setAdminEditData({...adminEditData, exam_room: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none text-sm focus:border-blue-500" />
                            </div>
                        </form>
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0 rounded-b-xl">
                        <button type="button" onClick={() => { setIsAdminEditModalOpen(false); setActiveCourseRequest(null); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors text-sm">Hủy bỏ</button>
                        <button type="submit" form="adminCourseForm" disabled={isSavingAdminCourse} className="px-6 py-2 bg-[#003375] hover:bg-[#002855] text-white font-bold rounded-lg shadow-md transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                            {isSavingAdminCourse ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} {activeCourseRequest ? 'Thêm thành môn chính thức' : 'Lưu Thông Tin'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {isPdfGuideOpen && (
            <ScheduleImportGuideModal 
                onClose={() => setIsPdfGuideOpen(false)} 
                securitySlot={<TurnstileBox token={scheduleImportTurnstileToken} onTokenChange={setScheduleImportTurnstileToken} />}
                canSelectFile={Boolean(scheduleImportTurnstileToken)}
                onFileClick={() => fileInputRef.current?.click()} 
            />
        )}
    </div>
  );  
}
