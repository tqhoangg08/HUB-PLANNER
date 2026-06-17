import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Info, Plus, Calendar, MapPin, Clock, X, CheckCircle, Zap, User, AlertTriangle, Send, BookPlus, List, Trash2, CalendarDays, Lock, FileUp, Loader2, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Settings, Edit, HelpCircle, Tag, Bell, BarChart3 } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { parseWeeks } from '../utils/scheduleLogic';
import { ScheduleImportGuideModal } from './ScheduleImportGuideModal';
import { parseSchedulePdf } from '../utils/schedulePdfImport';
import { useUserRole } from '../hooks/useUserRole';
import { playClick } from '../utils/audio';
import NotificationNudge from './NotificationNudge';
import { notifyModerators } from '../utils/moderatorNotifications';
import { apiHeaders, apiUrl } from '../utils/api';
import { TurnstileBox } from './TurnstileBox';
import { protectedSubmit, verifyTurnstileOnly } from '../utils/protectedSubmit';

// --- Types ---
interface UserProfile {
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
  credits: number;
  shift: string;
  day_of_week: string;
  weeks: string;
  room: string;
  campus: string;
  exam_date: string;
  exam_shift: string;
  exam_room?: string;
  cohort: string;
  major: string;
  academic_program: string;
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
  custom_data?: Partial<Course>;
}

interface MobileScheduleProps {
    viewUserId?: string;
    managementOnly?: boolean;
}

const COURSE_SCHEDULE_COLUMNS = [
  'id',
  'course_code',
  'subject_name',
  'credits',
  'shift',
  'day_of_week',
  'weeks',
  'room',
  'campus',
  'exam_date',
  'exam_shift',
  'exam_room',
  'cohort',
  'major',
  'academic_program',
  'phase',
  'semester',
  'instructor',
  'is_user_added',
].join(', ');

const ADMIN_LIST_PAGE_SIZE = 10;

const SYNCABLE_COURSE_FIELDS: { key: keyof Course; label: string }[] = [
  { key: 'course_code', label: 'Mã học phần' },
  { key: 'subject_name', label: 'Tên môn học' },
  { key: 'credits', label: 'Tín chỉ' },
  { key: 'instructor', label: 'Giảng viên' },
  { key: 'day_of_week', label: 'Thứ' },
  { key: 'shift', label: 'Ca / Tiết' },
  { key: 'room', label: 'Phòng' },
  { key: 'weeks', label: 'Tuần học' },
  { key: 'phase', label: 'Đợt' },
  { key: 'exam_date', label: 'Ngày thi' },
  { key: 'exam_shift', label: 'Ca thi' },
  { key: 'exam_room', label: 'Phòng thi' },
  { key: 'campus', label: 'Cơ sở' },
  { key: 'cohort', label: 'Khóa' },
  { key: 'major', label: 'Ngành' },
  { key: 'academic_program', label: 'Chương trình' },
  { key: 'semester', label: 'Học kỳ' },
];

const normalizeDiffValue = (value: any) => value === undefined || value === null ? '' : String(value).trim();

const sortChangedUserScheduleCourses = (courses: Course[]) => {
  return [...courses].sort((a, b) => {
    const codeCompare = normalizeDiffValue(a.course_code).localeCompare(normalizeDiffValue(b.course_code), 'vi', { numeric: true, sensitivity: 'base' });
    if (codeCompare !== 0) return codeCompare;
    return normalizeDiffValue(a.user?.full_name || a.user?.student_code).localeCompare(normalizeDiffValue(b.user?.full_name || b.user?.student_code), 'vi', { numeric: true, sensitivity: 'base' });
  });
};

const sortCourseRequestsNewestFirst = (requests: CourseRequest[]) => {
  return [...requests].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
};

const getCourseRequestStudentCode = (request: CourseRequest) => {
  const profileCode = request.user?.student_code?.trim();
  if (profileCode) return profileCode;
  const email = request.user?.email?.trim();
  if (email) return email.split('@')[0];
  return request.user_id || '-';
};

const HK_START_DATE = new Date('2026-02-02T00:00:00');
const HOLIDAY_WEEKS = [2, 3, 4];

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
// HỆ THỐNG HELPER
// =======================================================================
const formatDateStr = (date: Date) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
};

const getWeekDatesFull = (weekNum: number, sem: string) => {
    if (weekNum === 0) return ['', '', '', '', '', '', ''];
    const dates = [];
    const startDate = sem === 'HK1_2025_2026' ? new Date('2025-08-11T00:00:00') : new Date('2026-02-02T00:00:00');
    for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + (weekNum - 1) * 7 + i);
        dates.push(formatDateStr(d));
    }
    return dates;
};

const getDayMonth = (dateStr?: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length >= 2) return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
  return dateStr;
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
        const parsedWks = parseWeeks(cWeekStr);
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

const getLabelsForDate = (course: Course, dateStr?: string) => {
  if (!dateStr) return course.labels || [];
  return (course.labels || []).filter(label => label.date === dateStr || getDayMonth(label.date) === getDayMonth(dateStr));
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

// --- Mobile Drag Handle ---
const DragHandle = () => (
    <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-3 mb-2 shrink-0" />
);

// =======================================================================
// MAIN COMPONENT
// =======================================================================
export const MobileSchedule: React.FC<MobileScheduleProps> = ({ viewUserId, managementOnly = false }) => {
  useEffect(() => { document.title = "Thời khóa biểu | HUB Planner"; }, []);

  const { session, isAdmin, isAuditor, loading } = useUserRole();
  const isAuthenticated = session !== null;
  const canManageSchedule = isAdmin || isAuditor;
  const forceManagementView = managementOnly && canManageSchedule;

  const [searchTerm, setSearchTerm] = useState('');
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [mySchedule, setMySchedule] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [selectedSemester, setSelectedSemester] = useState<string>('HK2_2025_2026');
  const [selectedPhase, setSelectedPhase] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedWeek, setSelectedWeek] = useState<number>(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(new Date().getMonth());

  const [isWeekDropdownOpen, setIsWeekDropdownOpen] = useState(false);
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);

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

  const [isPdfGuideOpen, setIsPdfGuideOpen] = useState(false);
  const [scheduleImportTurnstileToken, setScheduleImportTurnstileToken] = useState('');
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States Admin View
  const [isAdminView, setIsAdminView] = useState(false);
  const effectiveAdminView = forceManagementView || isAdminView;
  const [adminTab, setAdminTab] = useState<'system' | 'user' | 'requested' | 'user_changed' | 'student_schedules'>('system');
  const [isAdminEditModalOpen, setIsAdminEditModalOpen] = useState(false);
  const [adminEditData, setAdminEditData] = useState<Partial<Course>>({});
  const [isSavingAdminCourse, setIsSavingAdminCourse] = useState(false);
  const [courseRequests, setCourseRequests] = useState<CourseRequest[]>([]);
  const [courseRequestsPage, setCourseRequestsPage] = useState(0);
  const [hasMoreCourseRequests, setHasMoreCourseRequests] = useState(false);
  const [courseRequestsTotal, setCourseRequestsTotal] = useState(0);
  const [activeCourseRequest, setActiveCourseRequest] = useState<CourseRequest | null>(null);
  const [changedUserScheduleCourses, setChangedUserScheduleCourses] = useState<Course[]>([]);
  const [changedCoursesPage, setChangedCoursesPage] = useState(0);
  const [hasMoreChangedCourses, setHasMoreChangedCourses] = useState(false);
  const [changedCoursesTotal, setChangedCoursesTotal] = useState(0);
  const [selectedChangedCourse, setSelectedChangedCourse] = useState<Course | null>(null);
  const [isSyncingChangedCourse, setIsSyncingChangedCourse] = useState(false);
  const [studentScheduleSummaries, setStudentScheduleSummaries] = useState<StudentScheduleSummary[]>([]);
  const [studentSchedulesPage, setStudentSchedulesPage] = useState(0);
  const [hasMoreStudentSchedules, setHasMoreStudentSchedules] = useState(false);
  const [studentSchedulesTotal, setStudentSchedulesTotal] = useState(0);
  const [selectedStudentSchedule, setSelectedStudentSchedule] = useState<StudentScheduleSummary | null>(null);
  const [selectedStudentCourses, setSelectedStudentCourses] = useState<Course[]>([]);
  const [selectedStudentCoursesPage, setSelectedStudentCoursesPage] = useState(0);
  const [hasMoreSelectedStudentCourses, setHasMoreSelectedStudentCourses] = useState(false);
  const [selectedStudentCoursesTotal, setSelectedStudentCoursesTotal] = useState(0);
  const [adminCoursesPage, setAdminCoursesPage] = useState(0);
  const [hasMoreAdminCourses, setHasMoreAdminCourses] = useState(false);
  const [adminCoursesTotal, setAdminCoursesTotal] = useState(0);
  const [adminScheduleError, setAdminScheduleError] = useState('');
  const [quickTagCourse, setQuickTagCourse] = useState<Course | null>(null);
  const [quickTagData, setQuickTagData] = useState(createInitialTagData());
  const [isSavingQuickTag, setIsSavingQuickTag] = useState(false);
  const [isStudentEditModalOpen, setIsStudentEditModalOpen] = useState(false);
  const [studentEditData, setStudentEditData] = useState<Partial<Course>>({});
  const [isSavingStudentCourse, setIsSavingStudentCourse] = useState(false);

  const today = new Date();
  const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}`;

  useEffect(() => {
    const closeDropdowns = () => {
        setIsWeekDropdownOpen(false);
        setIsMonthDropdownOpen(false);
    };
    document.addEventListener('click', closeDropdowns);
    return () => document.removeEventListener('click', closeDropdowns);
  }, []);

  const fetchCourses = async (options: { page?: number } = {}) => {
    const page = options.page ?? 0;
    setIsLoading(true);
    try {
        const params = new URLSearchParams({
            semester: selectedSemester,
            limit: String(effectiveAdminView ? ADMIN_LIST_PAGE_SIZE : 100),
            offset: String(effectiveAdminView ? page * ADMIN_LIST_PAGE_SIZE : 0),
        });
        if (selectedPhase !== 'all') params.set('phase', selectedPhase);
        if (effectiveAdminView && (adminTab === 'system' || adminTab === 'user')) {
          params.set('isUserAdded', adminTab === 'user' ? 'true' : 'false');
        }
        const term = searchTerm.trim();
        if (term) params.set('search', term);

        const response = await fetch(apiUrl(`/courses?${params.toString()}`), {
            headers: apiHeaders(),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Không tải được danh sách môn.');
        setAvailableCourses(payload.data || []);
        if (effectiveAdminView) {
          setHasMoreAdminCourses(Boolean(payload.hasMore));
          setAdminCoursesTotal(Number(payload.total || 0));
          setAdminCoursesPage(page);
        }
    } catch (error) {
        console.error("Lỗi tải danh sách môn:", error);
    } finally {
        setIsLoading(false);
    }
  };

  const fetchAdminUserSchedules = async (mode: 'changed' | 'summaries' | 'courses', extraParams: Record<string, string> = {}) => {
    const token = session?.access_token;
    if (!token) throw new Error('Admin session is missing');
    const params = new URLSearchParams({ resource: 'user-schedules', mode, semester: selectedSemester, ...extraParams });
    const response = await fetch(apiUrl(`/courses?${params.toString()}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Không tải được TKB sinh viên.');
    return payload;
  };

  const fetchChangedUserScheduleCourses = async (options: { page?: number } = {}) => {
    if (!canManageSchedule) return;
    const page = options.page ?? 0;
    setIsLoading(true);
    setAdminScheduleError('');
    try {
      const payload = await fetchAdminUserSchedules('changed', {
        phase: selectedPhase,
        search: searchTerm.trim(),
        limit: String(ADMIN_LIST_PAGE_SIZE),
        offset: String(page * ADMIN_LIST_PAGE_SIZE),
      });
      const data = sortChangedUserScheduleCourses(payload.data || []);
      setChangedUserScheduleCourses(data);
      setHasMoreChangedCourses(Boolean(payload.hasMore));
      setChangedCoursesTotal(Number(payload.total || 0));
      setChangedCoursesPage(page);
    } catch (error: any) {
      console.error(error);
      setAdminScheduleError(error?.message || 'Không tải được môn sinh viên đã chỉnh.');
      setChangedUserScheduleCourses([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStudentScheduleSummaries = async (options: { page?: number } = {}) => {
    if (!canManageSchedule) return;
    const page = options.page ?? 0;
    setIsLoading(true);
    setAdminScheduleError('');
    try {
      const payload = await fetchAdminUserSchedules('summaries', {
        limit: String(ADMIN_LIST_PAGE_SIZE),
        offset: String(page * ADMIN_LIST_PAGE_SIZE),
      });
      const summaries = payload.data || [];
      setStudentScheduleSummaries(summaries);
      setHasMoreStudentSchedules(Boolean(payload.hasMore));
      setStudentSchedulesTotal(Number(payload.total || 0));
      setStudentSchedulesPage(page);
    } catch (error: any) {
      console.error(error);
      setAdminScheduleError(error?.message || 'Không tải được danh sách TKB sinh viên.');
      setStudentScheduleSummaries([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStudentScheduleCourses = async (student: StudentScheduleSummary, options: { page?: number } = {}) => {
    if (!student?.user_id) return;
    const page = options.page ?? 0;
    setIsLoading(true);
    setAdminScheduleError('');
    try {
      const payload = await fetchAdminUserSchedules('courses', {
        userId: student.user_id,
        limit: String(ADMIN_LIST_PAGE_SIZE),
        offset: String(page * ADMIN_LIST_PAGE_SIZE),
      });
      const courses = payload.data || [];
      setSelectedStudentCourses(courses);
      setHasMoreSelectedStudentCourses(Boolean(payload.hasMore));
      setSelectedStudentCoursesTotal(Number(payload.total || 0));
      setSelectedStudentCoursesPage(page);
    } catch (error: any) {
      console.error(error);
      setAdminScheduleError(error?.message || 'Không tải được TKB sinh viên.');
      setSelectedStudentCourses([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCourseRequests = async (options: { page?: number } = {}) => {
    if (!canManageSchedule) return;
    const token = session?.access_token;
    if (!token) return;
    const page = options.page ?? 0;
    setIsLoading(true);
    setAdminScheduleError('');
    try {
      const params = new URLSearchParams({
        resource: 'course-requests',
        status: 'pending',
        search: searchTerm.trim(),
        limit: String(ADMIN_LIST_PAGE_SIZE),
        offset: String(page * ADMIN_LIST_PAGE_SIZE),
      });
      const response = await fetch(apiUrl(`/courses?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Không tải được yêu cầu thêm môn.');
      const data = sortCourseRequestsNewestFirst(payload.data || []);
      setCourseRequests(data);
      setHasMoreCourseRequests(Boolean(payload.hasMore));
      setCourseRequestsTotal(Number(payload.total || 0));
      setCourseRequestsPage(page);
    } catch (error: any) {
      console.error(error);
      setAdminScheduleError(error?.message || 'Không tải được yêu cầu thêm môn.');
      setCourseRequests([]);
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
        changedValue: (course.custom_data as any)?.[field.key],
      }))
      .filter(diff => normalizeDiffValue(diff.originalValue) !== normalizeDiffValue(diff.changedValue));
  };

  const handleSyncChangedField = async (fieldKey: string, fieldLabel: string) => {
    if (!selectedChangedCourse?.user_schedule_id || isAuditor) return;
    if (!window.confirm(`Đồng bộ trường "${fieldLabel}" của môn ${selectedChangedCourse.course_code}?`)) return;
    setIsSyncingChangedCourse(true);
    try {
      const token = session?.access_token;
      if (!token) throw new Error('Admin session is missing');
      const response = await fetch(apiUrl('/courses?resource=user-schedules'), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userScheduleId: selectedChangedCourse.user_schedule_id, fieldKeys: [fieldKey] }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Không đồng bộ được dữ liệu.');
      await fetchChangedUserScheduleCourses();
      setSelectedChangedCourse(null);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Có lỗi xảy ra khi đồng bộ dữ liệu.');
    } finally {
      setIsSyncingChangedCourse(false);
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
    if (isAuditor) {
      alert('Tính năng này bị khóa đối với tài khoản Auditor.');
      return;
    }
    if (!window.confirm(`Từ chối yêu cầu thêm môn "${request.subject_name}"?`)) return;
    const token = session?.access_token;
    if (!token) return;
    try {
      const response = await fetch(apiUrl('/courses?resource=course-requests'), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, status: 'rejected' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Không thể từ chối yêu cầu.');
      setCourseRequests(prev => prev.filter(item => item.id !== request.id));
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Có lỗi xảy ra khi từ chối yêu cầu.');
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    if (effectiveAdminView && adminTab !== 'system' && adminTab !== 'user') return;
    const timeoutId = window.setTimeout(() => {
      fetchCourses();
    }, 400);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm, selectedSemester, selectedPhase, isAuthenticated, effectiveAdminView, adminTab]);

  useEffect(() => {
    if (!isAuthenticated || !effectiveAdminView || adminTab !== 'requested') return;
    const timeoutId = window.setTimeout(fetchCourseRequests, 400);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm, selectedSemester, isAuthenticated, effectiveAdminView, adminTab]);

  useEffect(() => {
    if (!isAuthenticated || !effectiveAdminView || adminTab !== 'user_changed') return;
    const timeoutId = window.setTimeout(fetchChangedUserScheduleCourses, 400);
    return () => window.clearTimeout(timeoutId);
  }, [searchTerm, selectedSemester, selectedPhase, isAuthenticated, effectiveAdminView, adminTab]);

  useEffect(() => {
    if (!isAuthenticated || !effectiveAdminView || adminTab !== 'student_schedules') return;
    fetchStudentScheduleSummaries();
  }, [selectedSemester, isAuthenticated, effectiveAdminView, adminTab]);

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
    } catch (error) { console.error("Lỗi kéo TKB:", error); }
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

  const addToSchedule = async (course: Course) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("Vui lòng đăng nhập!"); return; }
    if (mySchedule.some(c => c.id === course.id)) { alert("Môn học đã có sẵn!"); return; }

    for (const existingCourse of currentSemesterSchedule) {
      let isConflict = false; let conflictDay = null; let conflictShiftStr = "";
      for (let w = 1; w <= 24; w++) {
        for (let d = 2; d <= 8; d++) {
          ['S', 'C'].forEach(testShift => {
             const slot1 = getCourseDetailsForSlot(course, d, w, testShift);
             const slot2 = getCourseDetailsForSlot(existingCourse, d, w, testShift);
             if (slot1 && slot2) { isConflict = true; conflictDay = d; conflictShiftStr = slot1.shift; }
          });
        }
        if (isConflict) break;
      }
      if (isConflict) {
        alert(`CẢNH BÁO TRÙNG LỊCH HỌC!\n\nMôn [${course.subject_name}] bị trùng giờ với [${existingCourse.subject_name}].\n(Thứ ${conflictDay} - ${getShiftDisplay(conflictShiftStr)}).`);
        return;
      }
      if (course.exam_date && existingCourse.exam_date && course.exam_date.trim() === existingCourse.exam_date.trim()) {
        const newIsMorning = isExamInShift(course.exam_shift, 'S'); const existIsMorning = isExamInShift(existingCourse.exam_shift, 'S');
        const newIsAfternoon = isExamInShift(course.exam_shift, 'C'); const existIsAfternoon = isExamInShift(existingCourse.exam_shift, 'C');
        if ((newIsMorning && existIsMorning) || (newIsAfternoon && existIsAfternoon)) {
          alert(`CẢNH BÁO TRÙNG LỊCH THI!\n\nCùng thi ngày ${course.exam_date} - ${newIsMorning ? 'Buổi Sáng' : 'Buổi Chiều'}.`);
          return;
        }
      }
    }

    setMySchedule([...mySchedule, course]);
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('user_schedules').insert({ user_id: user.id, course_id: course.id, semester: selectedSemester });
      if (error) setMySchedule(mySchedule.filter(c => c.id !== course.id));
    } catch (err) {} finally { setIsSyncing(false); }
  };

  const removeFromSchedule = async (courseId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const backup = [...mySchedule];
    setMySchedule(mySchedule.filter(c => c.id !== courseId));
    try {
      const { error } = await supabase.from('user_schedules').delete().eq('user_id', user.id).eq('course_id', courseId);
      if (error) setMySchedule(backup);
    } catch (err) { setMySchedule(backup); }
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
          await fetchMySchedule();
      } catch (err) {
          console.error(err);
          alert("Lỗi khi gắn nhãn nhanh.");
      } finally {
          setIsSavingQuickTag(false);
      }
  };

  const openStudentEditModal = (course: Course) => {
      if (!course.user_schedule_id) return;
      playClick();
      setStudentEditData(course);
      setSelectedCourseInfo(null);
      setIsMyScheduleModalOpen(false);
      setIsStudentEditModalOpen(true);
  };

  const handleStudentSaveCourse = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!studentEditData.user_schedule_id) return;
      if (!studentEditData.subject_name || !studentEditData.course_code) {
          alert('Vui lòng nhập tên môn học và mã học phần.');
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
          await fetchMySchedule();
          setIsStudentEditModalOpen(false);
      } catch (err: any) {
          console.error(err);
          alert('Không thể lưu chỉnh sửa: ' + (err.message || 'Lỗi không xác định'));
      } finally {
          setIsSavingStudentCourse(false);
      }
  };

  const handleAdminSaveCourse = async (event: React.FormEvent) => {
      event.preventDefault();
      if (!adminEditData.subject_name || !adminEditData.course_code) {
          alert('Vui lòng nhập tên môn và mã học phần.');
          return;
      }
      if (isAuditor) {
          alert('Tính năng này bị khóa đối với tài khoản Auditor.');
          return;
      }

      setIsSavingAdminCourse(true);
      try {
          const payload = {
              ...adminEditData,
              semester: selectedSemester,
              is_user_added: activeCourseRequest ? false : (adminEditData.is_user_added ?? (adminTab === 'user')),
          };

          if (activeCourseRequest) {
              const token = session?.access_token;
              if (!token) throw new Error('Admin session is missing');
              const response = await fetch(apiUrl('/courses?resource=course-requests'), {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ requestId: activeCourseRequest.id, course: payload }),
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result?.error || 'Không thể thêm môn chính thức.');
              setCourseRequests(prev => prev.filter(item => item.id !== activeCourseRequest.id));
              setActiveCourseRequest(null);
              setAdminTab('system');
          } else if (payload.id) {
              const { error } = await supabase.from('course_schedules').update(payload).eq('id', payload.id);
              if (error) throw error;
          } else {
              const { error } = await supabase.from('course_schedules').insert(payload);
              if (error) throw error;
          }

          setIsAdminEditModalOpen(false);
          setAdminEditData({});
          fetchCourses();
      } catch (error: any) {
          console.error(error);
          alert(error?.message || 'Có lỗi xảy ra khi lưu môn học.');
      } finally {
          setIsSavingAdminCourse(false);
      }
  };

  const handleAdminDeleteCourse = async (id: string) => {
      if (isAuditor) {
          alert('Tính năng này bị khóa đối với tài khoản Auditor.');
          return;
      }
      if (!window.confirm('Bạn có chắc chắn muốn xóa môn học này khỏi hệ thống?')) return;
      try {
          const { error } = await supabase.from('course_schedules').delete().eq('id', id);
          if (error) throw error;
          fetchCourses();
      } catch (error) {
          console.error(error);
          alert('Lỗi khi xóa môn học.');
      }
  };

  const getWeekDates = (weekNum: number) => {
    if (weekNum === 0) return ['', '', '', '', '', '', ''];
    const dates = [];
    const startDate = selectedSemester === 'HK1_2025_2026' ? new Date('2025-08-11T00:00:00') : HK_START_DATE;
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + (weekNum - 1) * 7 + i);
      dates.push(`${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`);
    }
    return dates;
  };

  const getExamDayMonth = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split('/');
    if (parts.length >= 2) return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}`;
    return dateStr;
  }

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("Vui lòng đăng nhập!"); return; }

    setIsPdfGuideOpen(false); setIsProcessingPdf(true);
    try {
        await verifyTurnstileOnly(scheduleImportTurnstileToken);
        setScheduleImportTurnstileToken('');
        const aiData = await parseSchedulePdf(file);
        if (!aiData || !aiData.courses || aiData.courses.length === 0) {
            alert(aiData?.error ? `Không nhập được TKB.\n\n${aiData.error}\n\nDebug đã lưu ở localStorage: hub_last_schedule_import_debug` : "Không thể đọc được dữ liệu. Vui lòng đảm bảo file PDF gốc.");
            setIsProcessingPdf(false); if (fileInputRef.current) fileInputRef.current.value = '';
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
                if (creditNum === 2) finalWeeks = phaseStr === "1" ? "1, 5-9" : "15-20";
                else finalWeeks = phaseStr === "1" ? "1, 5-12" : "15-23";
            }

            const codeParts = cleanCode.split('_');
            const baseCode = codeParts[0];
            const tailCode = codeParts[codeParts.length - 1];

            const { data: existingCourses } = await supabase.from('course_schedules')
                .select('id, course_code').ilike('course_code', `${baseCode}%`).ilike('course_code', `%${tailCode}`);

            let targetCourseId = null;
            if (existingCourses && existingCourses.length > 0) targetCourseId = existingCourses[0].id;

            if (!targetCourseId) {
                const { data: newCourse, error: insertErr } = await supabase.from('course_schedules')
                    .insert({
                        course_code: cleanCode, subject_name: course.subject_name, credits: course.credits,
                        instructor: course.instructor, day_of_week: course.day_of_week, shift: course.shift,
                        room: course.room, campus: course.campus || 'TD', weeks: finalWeeks, semester: currentSem,
                        phase: phaseStr, is_user_added: true
                    }).select('id').single();
                if (!insertErr && newCourse) targetCourseId = newCourse.id;
            }

            if (targetCourseId) {
                const { data: checkLink } = await supabase.from('user_schedules').select('id')
                    .eq('user_id', user.id).eq('course_id', targetCourseId).single();
                if (!checkLink) {
                    await supabase.from('user_schedules').insert({ user_id: user.id, course_id: targetCourseId, semester: currentSem });
                    addedCount++;
                }
            }
        }

        if (addedCount > 0) {
            alert(`Đã đồng bộ thành công ${addedCount} môn học vào Thời khóa biểu!`);
            fetchMySchedule(); setSelectedSemester(currentSem);
        } else {
            alert(`Các môn học trong file đã có sẵn trong Thời khóa biểu của bạn rồi!`);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : '';
        alert(message ? `Không nhập được TKB.\n\n${message}` : "Lỗi khi đọc PDF.");
    }
    finally { setIsProcessingPdf(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const getCoursesForDate = (targetDate: Date, schedule: Course[]) => {
    const dayOfWeek = targetDate.getDay() === 0 ? 8 : targetDate.getDay() + 1;
    const targetDateStr = formatDateStr(targetDate);
    return schedule.map(course => {
      let startDate = new Date('2026-02-02T00:00:00');
      if (course.semester === 'HK1_2025_2026') startDate = new Date('2025-08-11T00:00:00');

      const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      const diffTime = target.getTime() - start.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weekNum = Math.floor(diffDays / 7) + 1;

      if (weekNum < 1 || weekNum > 24) return [];

      const sDetails = getCourseDetailsForSlot(course, dayOfWeek, weekNum, 'S');
      const cDetails = getCourseDetailsForSlot(course, dayOfWeek, weekNum, 'C');

      const results = [];
      if (sDetails) results.push({ course, details: sDetails, shiftType: 'S' });
      if (cDetails) results.push({ course, details: cDetails, shiftType: 'C' });
      (course.makeup_schedules || [])
        .filter(item => item.date === targetDateStr || getDayMonth(item.date) === getDayMonth(targetDateStr))
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
    const year = 2026;
    const firstDay = new Date(year, selectedMonthIndex, 1);
    const startingDayOfWeek = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
    const daysInMonth = new Date(year, selectedMonthIndex + 1, 0).getDate();

    const days: (Date | null)[] = [];
    for(let i = 1; i < startingDayOfWeek; i++) days.push(null);
    for(let i = 1; i <= daysInMonth; i++) days.push(new Date(year, selectedMonthIndex, i));
    return days;
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("Bạn cần đăng nhập để gửi báo cáo!"); return; }

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
      alert("Gửi báo cáo thành công! Cảm ơn bạn.");
      setIsReportModalOpen(false);
      setReportData({ course_code: '', subject_name: '', description: '', suggested_correction: '' });
    } catch (error) { alert("Đã xảy ra lỗi khi gửi báo cáo."); }
    finally { setIsSubmittingReport(false); }
  };

  const handleCreateCourseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseData.subject_name.trim() || !newCourseData.course_code.trim()) { alert("Vui lòng điền tối thiểu Tên môn học và Mã học phần!"); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { alert("Bạn cần đăng nhập để gửi yêu cầu!"); return; }

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
      alert("Gửi yêu cầu thành công!");
      setIsCreateCourseModalOpen(false);
      setNewCourseData({ subject_name: '', course_code: '', instructor: '' });
    } catch (error) { alert("Đã xảy ra lỗi khi gửi yêu cầu."); }
    finally { setIsSubmittingCourse(false); }
  };

  const currentWeekDates = getWeekDates(selectedWeek);
  const currentWeekDatesFull = getWeekDatesFull(selectedWeek, selectedSemester);
  const weekStartStr = currentWeekDates[0];
  const weekEndStr = currentWeekDates[6];

  const prevWeek = () => setSelectedWeek(prev => prev > 0 ? prev - 1 : 0);
  const nextWeek = () => setSelectedWeek(prev => prev < 24 ? prev + 1 : 24);
  const prevMonth = () => setSelectedMonthIndex(prev => prev > 0 ? prev - 1 : 0);
  const nextMonth = () => setSelectedMonthIndex(prev => prev < 11 ? prev + 1 : 11);
  const goToToday = () => {
    playClick();
    const now = new Date();
    let startDate = new Date('2026-02-02T00:00:00');
    if (selectedSemester === 'HK1_2025_2026') startDate = new Date('2025-08-11T00:00:00');

    const diffTime = now.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    let weekNum = Math.floor(diffDays / 7) + 1;

    if (weekNum < 1) weekNum = 1;
    if (weekNum > 24) weekNum = 24;

    setSelectedWeek(weekNum);
    setSelectedMonthIndex(now.getMonth());
    setSelectedDayIndex(Math.max(0, Math.min(6, now.getDay() === 0 ? 6 : now.getDay() - 1)));
  };

  const studentEditInputClass = "w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-gray-50";
  const renderStudentEditField = (label: string, field: React.ReactNode) => (
    <label className="block space-y-1">
      <span className="block text-[11px] font-black uppercase tracking-wide text-gray-500">{label}</span>
      {field}
    </label>
  );

  const parseDisplayDate = (value?: string) => {
    if (!value) return null;
    const [day, month, year] = value.split('/').map(Number);
    if (!day || !month) return null;
    return new Date(year || 2026, month - 1, day);
  };

  const weekDayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const selectedDateFull = currentWeekDatesFull[selectedDayIndex];
  const selectedDate = parseDisplayDate(selectedDateFull);
  const selectedDayCourses = selectedDate ? getCoursesForDate(selectedDate, currentSemesterSchedule) : [];
  const selectedDayExams = selectedDate ? getExamsForDate(selectedDate, currentSemesterSchedule) : [];
  const selectedMorningCourses = selectedDayCourses.filter((item: any) => item.shiftType === 'S');
  const selectedAfternoonCourses = selectedDayCourses.filter((item: any) => item.shiftType === 'C');
  const todayCourses = getCoursesForDate(today, currentSemesterSchedule);
  const todayExamCount = getExamsForDate(today, currentSemesterSchedule).length;
  const todayScheduleCount = todayCourses.length + todayExamCount;
  const nextClass = (() => {
    for (let offset = 0; offset < 30; offset++) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      const courses = getCoursesForDate(date, currentSemesterSchedule);
      if (courses.length > 0) return { ...courses[0] as any, date };
    }
    return null;
  })();
  const getAdminTotalPages = (total: number) => Math.max(1, Math.ceil((Number(total) || 0) / ADMIN_LIST_PAGE_SIZE));
  const renderAdminPager = (
    page: number,
    total: number,
    onPageChange: (page: number) => void,
  ) => {
    const totalPages = getAdminTotalPages(total);
    if (totalPages <= 1) return null;
    const currentPage = Math.min(page + 1, totalPages);
    const goToPage = (value: number) => {
      const nextPage = Math.min(totalPages - 1, Math.max(0, value - 1));
      if (nextPage !== page) onPageChange(nextPage);
    };

    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded-2xl bg-[#F8FAFD] p-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page <= 0 || isLoading}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#1A56FF] shadow-sm disabled:opacity-40"
          aria-label="Trang trước"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[11px] font-black text-[#7B8AB0]">
          <span>Trang</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(event) => goToPage(Number(event.target.value) || 1)}
            className="h-9 w-14 rounded-xl border border-[#E5EAF4] bg-white text-center text-[12px] font-black text-[#0D1B3E] outline-none"
          />
          <span>/ {totalPages}</span>
        </div>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1 || isLoading}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#1A56FF] shadow-sm disabled:opacity-40"
          aria-label="Trang sau"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  };
  // Chinh khoang cach 2 ben rieng cho MobileSchedule tai day.
  // mx-0 = khop padding cua MobileDashboardNative; mx-1/mx-2 = hep hon; -mx-1/-mx-2 = sat mep hon.
  const scheduleSideSpacingClass = 'mx-0';
  const nextClassCard = isAuthenticated ? (
    <div className="mb-3 rounded-[22px] bg-gradient-to-br from-[#1A56FF] to-[#597DFF] p-4 text-white shadow-[0_10px_24px_rgba(26,86,255,0.24)]">
        <div className="mb-3 flex items-start justify-between">
            <div>
                <div className="text-[15px] font-black">Ca học tiếp theo</div>
                <div className="mt-1 text-[11px] font-semibold opacity-80">{nextClass ? formatDateStr(nextClass.date) : 'Chưa có lịch sắp tới'}</div>
            </div>
            <div className="rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-[10px] font-black">
                {nextClass ? getCourseTimeLabel(nextClass.details?.shift)?.split(' - ')[0] || 'Sắp tới' : 'Trống'}
            </div>
        </div>
        {nextClass ? (
            <div onClick={() => setSelectedCourseInfo({ course: nextClass.course, details: nextClass.details, dateStr: formatDateStr(nextClass.date) })} className="rounded-2xl border border-white/25 bg-white/15 p-3">
                <div className="text-[13px] font-black leading-snug">{nextClass.course.subject_name}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold"><Clock size={11} className="mr-1 inline" />{getCourseTimeLabel(nextClass.details?.shift) || getShiftDisplay(nextClass.details?.shift)}</span>
                    <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold"><MapPin size={11} className="mr-1 inline" />{nextClass.details?.room}</span>
                </div>
            </div>
        ) : (
            <div className="rounded-2xl border border-white/25 bg-white/15 p-3 text-[12px] font-bold opacity-90">Bạn chưa có môn nào trong học kỳ này.</div>
        )}
    </div>
  ) : null;

  return (
    <div className="mobile-page mobile-schedule-page w-full bg-[#F2F4F8] pb-0 pt-2 animate-fadeIn">
        <div className="hidden">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-[30px] font-black leading-none tracking-normal text-[#0D1B3E]">Học tập</h1>
                    <p className="mt-1 text-[13px] font-medium text-[#7B8AB0]">Lịch học & Thi</p>
                </div>
                <button onClick={fetchMySchedule} className="relative flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-white text-[#0D1B3E] shadow-[0_2px_10px_rgba(0,0,0,0.07)]">
                    <Bell size={20} strokeWidth={2.2} />
                    {todayScheduleCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-[#F2F4F8] bg-[#FF3B5C]" />}
                </button>
            </div>
        </div>

        <div className="hidden">
            <button className="flex items-center justify-center gap-1.5 rounded-xl py-3 text-[12px] font-extrabold text-[#9AA5C0]">
                <BarChart3 size={14} /> Điểm số & Lộ trình
            </button>
            <button className="flex items-center justify-center gap-1.5 rounded-xl bg-[#1A56FF] py-3 text-[12px] font-extrabold text-white shadow-[0_4px_14px_rgba(26,86,255,0.35)]">
                <CalendarDays size={14} /> Lịch học & Thi
            </button>
        </div>

        <div className={scheduleSideSpacingClass}>
        {canManageSchedule && !forceManagementView && (
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-white p-1 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
                <button onClick={() => { playClick(); setIsAdminView(false); }} className={`rounded-xl py-2 text-xs font-black transition-all ${!isAdminView ? 'bg-[#EEF2FF] text-[#1A56FF]' : 'text-[#7B8AB0]'}`}>Giao diện SV</button>
                <button onClick={() => { playClick(); setIsAdminView(true); }} className={`rounded-xl py-2 text-xs font-black transition-all ${isAdminView ? 'bg-[#EEF2FF] text-[#1A56FF]' : 'text-[#7B8AB0]'}`}>Quản lý</button>
            </div>
        )}

        <div className="hidden">
            <NotificationNudge variant="schedule" compact />
        </div>

        {forceManagementView && (
            <div className="mb-3 rounded-[20px] bg-white p-3.5 shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#1A56FF]">
                        <Settings size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-black text-[#0D1B3E]">Quản lý lịch học & thi</div>
                        <div className="mt-0.5 text-[11px] font-semibold text-[#7B8AB0]">Danh sách học phần hệ thống theo học kỳ và đợt.</div>
                    </div>
                </div>
            </div>
        )}

        {!forceManagementView && (
        <>
        <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.8px] text-[#9AA5C0]">Lịch học hôm nay</div>

        {nextClassCard}

        <div className="mb-3 grid grid-cols-2 gap-3">
            <div onClick={() => isAuthenticated && setIsMyScheduleModalOpen(true)} className="cursor-pointer rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(0,0,0,0.05)] active:scale-[0.98]">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#7B8AB0]">
                    Môn đã lưu
                    <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-[#EEF2FF] text-[#1A56FF]"><BookPlus size={13} /></span>
                </div>
                <div className="mt-3 text-2xl font-black tracking-normal text-[#1A56FF]">{currentSemesterSchedule.length}</div>
            </div>
            <div className="rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between text-[11px] font-bold text-[#7B8AB0]">
                    Lịch hôm nay
                    <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-[#EDFAF3] text-[#00C07F]"><Clock size={13} /></span>
                </div>
                <div className="mt-3 text-2xl font-black tracking-normal text-[#00C07F]">{todayScheduleCount} ca</div>
            </div>
        </div>

        <div>
            <NotificationNudge variant="schedule" compact />
        </div>
        </>
        )}

        <div className="mb-3 rounded-[20px] bg-white p-3.5 shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
            <div className="mb-2.5 flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-[13.5px] font-black text-[#0D1B3E]">
                    <Search size={16} className="text-[#1A56FF]" /> Tìm kiếm & Lọc
                </h2>
                <button onClick={fetchCourses} className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-[#EEF2FF] text-[#1A56FF]">
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>
            <div className="mb-2 grid grid-cols-[1fr_0.7fr] gap-2">
                <select disabled={!isAuthenticated} value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="h-[38px] rounded-xl border border-[#E5EAF4] bg-[#F8FAFD] px-3 text-xs font-bold text-[#0D1B3E] outline-none disabled:cursor-not-allowed">
                    <option value="HK2_2025_2026">HK2 (2025-2026)</option>
                    <option value="HK1_2025_2026">HK1 (2025-2026)</option>
                </select>
                <select disabled={!isAuthenticated} value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)} className="h-[38px] rounded-xl border border-[#E5EAF4] bg-[#F8FAFD] px-3 text-xs font-bold text-[#0D1B3E] outline-none disabled:cursor-not-allowed">
                    <option value="all">Mọi đợt</option>
                    <option value="1">Đợt 1</option>
                    <option value="2">Đợt 2</option>
                </select>
            </div>
            <div className="relative mb-2.5">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8B2C8]" />
                <input disabled={!isAuthenticated} type="text" placeholder="Tên môn + mã (VD: Toán cao cấp D01)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-[38px] w-full rounded-xl border border-[#E5EAF4] bg-[#F8FAFD] pl-8 pr-3 text-xs font-semibold text-[#5B6478] outline-none disabled:cursor-not-allowed" />
            </div>
            {!forceManagementView && (
            <div className="grid grid-cols-3 gap-2">
                <button disabled={!isAuthenticated} onClick={() => { setReportData({ course_code: '', subject_name: '', description: '', suggested_correction: '' }); setIsReportModalOpen(true); }} className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[13px] border border-[#FFE0E8] bg-[#FFF0F3] text-[10px] font-black text-[#E11D48] disabled:opacity-50">
                    <AlertTriangle size={16} /> Báo lỗi
                </button>
                <button disabled={!isAuthenticated} onClick={() => setIsCreateCourseModalOpen(true)} className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[13px] border border-[#D1FAE5] bg-[#ECFDF5] text-[10px] font-black text-[#059669] disabled:opacity-50">
                    <Plus size={16} /> Thêm môn
                </button>
                <button disabled={!isAuthenticated || isProcessingPdf} onClick={() => setIsPdfGuideOpen(true)} className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[13px] border border-[#E5EAF4] bg-[#F4F6FA] text-[10px] font-black text-[#5D687E] disabled:opacity-50">
                    {isProcessingPdf ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} Nhập PDF
                </button>
                <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handlePdfUpload} />
            </div>
            )}
        </div>

        {isAuthenticated && effectiveAdminView && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {[
                    { id: 'system' as const, label: 'Hệ thống' },
                    { id: 'user' as const, label: 'SV thêm' },
                    { id: 'requested' as const, label: 'Yêu cầu' },
                    { id: 'user_changed' as const, label: 'SV sửa' },
                    { id: 'student_schedules' as const, label: 'TKB SV' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                            playClick();
                            setAdminTab(tab.id);
                            setSelectedStudentSchedule(null);
                            setSelectedStudentCourses([]);
                        }}
                        className={`shrink-0 rounded-full px-3.5 py-2 text-[10.5px] font-black ${adminTab === tab.id ? 'bg-[#1A56FF] text-white shadow-[0_6px_14px_rgba(26,86,255,0.25)]' : 'bg-white text-[#7B8AB0] shadow-[0_2px_10px_rgba(0,0,0,0.05)]'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
        )}

        {isAuthenticated && effectiveAdminView && adminScheduleError && (
            <div className="mb-3 rounded-[18px] border border-red-100 bg-red-50 p-3 text-[11px] font-bold text-red-600">
                {adminScheduleError}
            </div>
        )}

        {isAuthenticated && effectiveAdminView && adminTab !== 'requested' && adminTab !== 'user_changed' && adminTab !== 'student_schedules' && !isAuditor && (
            <button
                type="button"
                onClick={() => {
                    setActiveCourseRequest(null);
                    setAdminEditData({ is_user_added: adminTab === 'user', phase: selectedPhase === 'all' ? '1' : selectedPhase, semester: selectedSemester });
                    setIsAdminEditModalOpen(true);
                }}
                className="mb-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#1A56FF] text-[12px] font-black text-white shadow-[0_8px_20px_rgba(26,86,255,0.22)]"
            >
                <Plus size={16} /> Thêm môn {adminTab === 'user' ? 'sinh viên' : 'hệ thống'}
            </button>
        )}

        {isAuthenticated && (searchTerm || effectiveAdminView) && availableCourses.length > 0 && (!effectiveAdminView || adminTab === 'system' || adminTab === 'user') && (
            <div className="mb-0 space-y-2 overflow-visible rounded-[20px] bg-white p-3 shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
                <p className="px-1 text-[11px] font-bold text-[#7B8AB0]">{effectiveAdminView ? 'Danh sách môn học' : 'Kết quả'} ({effectiveAdminView ? adminCoursesTotal : availableCourses.length})</p>
                {availableCourses
                    .filter(course => !effectiveAdminView || (adminTab === 'system' ? !course.is_user_added : course.is_user_added))
                    .map((course) => {
                    const color = getColorForCourse(course.id);
                    return (
                        <div key={course.id} onClick={() => setSelectedCourseInfo({ course })} className={`relative rounded-[18px] border-l-4 ${color.border} bg-[#F8FAFD] p-3`}>
                            {!forceManagementView && <button onClick={(e) => { e.stopPropagation(); addToSchedule(course); }} disabled={isSyncing} className="absolute right-3 top-3 rounded-full bg-[#1A56FF] p-1.5 text-white"><Plus size={14} /></button>}
                            <h3 className="pr-9 text-[12.5px] font-black leading-snug text-[#0D1B3E]">{course.subject_name}</h3>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">{course.course_code}</span>
                                <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">T{course.day_of_week} • {course.shift}</span>
                                <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">P.{course.room}</span>
                            </div>
                            {effectiveAdminView && (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setActiveCourseRequest(null);
                                            setAdminEditData(course);
                                            setIsAdminEditModalOpen(true);
                                        }}
                                        className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#EEF2FF] text-[11px] font-black text-[#1A56FF]"
                                    >
                                        <Edit size={14} /> Chỉnh sửa
                                    </button>
                                    {!isAuditor && (
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleAdminDeleteCourse(course.id);
                                            }}
                                            className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-red-50 text-[11px] font-black text-red-600"
                                        >
                                            <Trash2 size={14} /> Xóa
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
                {effectiveAdminView && renderAdminPager(adminCoursesPage, adminCoursesTotal, page => fetchCourses({ page }))}
            </div>
        )}

        {isAuthenticated && effectiveAdminView && adminTab === 'requested' && (
            <div className="mb-0 space-y-2 rounded-[20px] bg-white p-3 shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
                <p className="px-1 text-[11px] font-bold text-[#7B8AB0]">Yêu cầu thêm môn ({courseRequestsTotal})</p>
                {isLoading ? (
                    <div className="py-6 text-center text-xs font-bold text-[#7B8AB0]"><Loader2 className="mx-auto mb-2 animate-spin text-[#1A56FF]" size={20} />Đang tải yêu cầu...</div>
                ) : courseRequests.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#DDE3F0] p-5 text-center text-xs font-bold text-[#7B8AB0]">Không có yêu cầu đang chờ.</div>
                ) : courseRequests.map(request => (
                    <div key={request.id} className="rounded-[18px] bg-[#F8FAFD] p-3">
                        <h3 className="text-[12.5px] font-black leading-snug text-[#0D1B3E]">{request.subject_name}</h3>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">{request.course_code}</span>
                            <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">SV {getCourseRequestStudentCode(request)}</span>
                            {request.instructor && <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">{request.instructor}</span>}
                        </div>
                        {!isAuditor && (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => openCourseRequestEditor(request)} className="h-9 rounded-xl bg-[#1A56FF] text-[11px] font-black text-white">Sửa & thêm</button>
                                <button type="button" onClick={() => rejectCourseRequest(request)} className="h-9 rounded-xl bg-red-50 text-[11px] font-black text-red-600">Từ chối</button>
                            </div>
                        )}
                    </div>
                ))}
                {renderAdminPager(courseRequestsPage, courseRequestsTotal, page => fetchCourseRequests({ page }))}
            </div>
        )}

        {isAuthenticated && effectiveAdminView && adminTab === 'user_changed' && (
            <div className="mb-0 space-y-2 rounded-[20px] bg-white p-3 shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
                <p className="px-1 text-[11px] font-bold text-[#7B8AB0]">Môn sinh viên đã chỉnh ({changedCoursesTotal})</p>
                {isLoading ? (
                    <div className="py-6 text-center text-xs font-bold text-[#7B8AB0]"><Loader2 className="mx-auto mb-2 animate-spin text-[#1A56FF]" size={20} />Đang tải dữ liệu...</div>
                ) : changedUserScheduleCourses.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#DDE3F0] p-5 text-center text-xs font-bold text-[#7B8AB0]">Không có môn sinh viên tự chỉnh.</div>
                ) : changedUserScheduleCourses.map(course => {
                    const diffs = getChangedCourseDiffs(course);
                    return (
                        <button key={`${course.user_schedule_id}-${course.id}`} type="button" onClick={() => setSelectedChangedCourse(course)} className="w-full rounded-[18px] bg-[#F8FAFD] p-3 text-left">
                            <h3 className="line-clamp-2 text-[12.5px] font-black leading-snug text-[#0D1B3E]">{course.subject_name}</h3>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">{course.course_code}</span>
                                <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">{course.user?.full_name || course.user?.student_code || 'Sinh viên'}</span>
                                <span className="rounded-full bg-blue-50 px-2 py-1 text-[9.5px] font-black text-[#1A56FF]">{diffs.length} trường khác</span>
                            </div>
                        </button>
                    );
                })}
                {renderAdminPager(changedCoursesPage, changedCoursesTotal, page => fetchChangedUserScheduleCourses({ page }))}
            </div>
        )}

        {isAuthenticated && effectiveAdminView && adminTab === 'student_schedules' && (
            <div className="mb-0 space-y-2 rounded-[20px] bg-white p-3 shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
                {selectedStudentSchedule ? (
                    <>
                        <button type="button" onClick={() => { setSelectedStudentSchedule(null); setSelectedStudentCourses([]); }} className="mb-1 flex items-center gap-1 text-[11px] font-black text-[#1A56FF]"><ChevronLeft size={14} /> Quay lại danh sách</button>
                        <div className="rounded-[18px] bg-emerald-50 p-3">
                            <h3 className="text-[13px] font-black text-[#0D1B3E]">{selectedStudentSchedule.full_name || 'Sinh viên'}</h3>
                            <p className="mt-1 text-[10.5px] font-bold text-[#7B8AB0]">{selectedStudentSchedule.student_code || selectedStudentSchedule.email}</p>
                        </div>
                        {isLoading ? (
                            <div className="py-6 text-center text-xs font-bold text-[#7B8AB0]"><Loader2 className="mx-auto mb-2 animate-spin text-[#1A56FF]" size={20} />Đang tải TKB...</div>
                        ) : selectedStudentCourses.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-[#DDE3F0] p-5 text-center text-xs font-bold text-[#7B8AB0]">Sinh viên chưa lưu môn trong học kỳ này.</div>
                        ) : selectedStudentCourses.map(course => (
                            <div key={`${course.user_schedule_id}-${course.id}`} className="rounded-[18px] bg-[#F8FAFD] p-3">
                                <h3 className="line-clamp-2 text-[12.5px] font-black leading-snug text-[#0D1B3E]">{course.subject_name}</h3>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">{course.course_code}</span>
                                    <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">T{course.day_of_week} • {course.shift}</span>
                                    <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">P.{course.room}</span>
                                </div>
                            </div>
                        ))}
                        {selectedStudentSchedule && renderAdminPager(
                            selectedStudentCoursesPage,
                            selectedStudentCoursesTotal,
                            page => fetchStudentScheduleCourses(selectedStudentSchedule, { page }),
                        )}
                    </>
                ) : (
                    <>
                        <p className="px-1 text-[11px] font-bold text-[#7B8AB0]">Quản lý TKB sinh viên ({studentSchedulesTotal})</p>
                        {isLoading ? (
                            <div className="py-6 text-center text-xs font-bold text-[#7B8AB0]"><Loader2 className="mx-auto mb-2 animate-spin text-[#1A56FF]" size={20} />Đang tải sinh viên...</div>
                        ) : studentScheduleSummaries.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-[#DDE3F0] p-5 text-center text-xs font-bold text-[#7B8AB0]">Chưa có sinh viên lưu TKB trong học kỳ này.</div>
                        ) : studentScheduleSummaries
                            .filter(student => {
                                const term = searchTerm.trim().toLowerCase();
                                if (!term) return true;
                                return [student.full_name, student.student_code, student.email].some(value => (value || '').toLowerCase().includes(term));
                            })
                            .map(student => (
                                <button key={student.user_id} type="button" onClick={() => { setSelectedStudentSchedule(student); fetchStudentScheduleCourses(student); }} className="w-full rounded-[18px] bg-[#F8FAFD] p-3 text-left">
                                    <h3 className="text-[12.5px] font-black leading-snug text-[#0D1B3E]">{student.full_name || 'Sinh viên'}</h3>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-bold text-[#56627B]">{student.student_code || student.email}</span>
                                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9.5px] font-black text-emerald-700">{student.course_count || 0} môn</span>
                                    </div>
                                </button>
                            ))}
                        {renderAdminPager(studentSchedulesPage, studentSchedulesTotal, page => fetchStudentScheduleSummaries({ page }))}
                    </>
                )}
            </div>
        )}

        {isAuthenticated && effectiveAdminView && !isLoading && availableCourses.length === 0 && (adminTab === 'system' || adminTab === 'user') && (
            <div className="mb-0 flex items-start justify-center rounded-[20px] bg-white p-3 shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
                <div className="w-full rounded-2xl border border-dashed border-[#DDE3F0] bg-[#F8FAFD] p-5 text-center text-xs font-bold text-[#7B8AB0]">
                    Không có học phần phù hợp với bộ lọc hiện tại.
                </div>
            </div>
        )}

        {!isAuthenticated ? (
            <div className="rounded-[22px] bg-white p-8 text-center shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#1A56FF]"><Lock size={24} /></div>
                <p className="text-xs font-medium leading-relaxed text-[#7B8AB0]">Đăng nhập bằng tài khoản sinh viên để xem lịch học.</p>
            </div>
        ) : forceManagementView ? null : (
            <>
                <div className="mb-4 overflow-hidden rounded-[22px] bg-white shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
                    <div className="border-b border-[#EEF2FF] p-3.5">
                        <div className="flex items-center justify-between">
                            <h2 className="flex items-center gap-1.5 text-[15px] font-black text-[#0D1B3E]"><Calendar size={18} className="text-[#1A56FF]" /> Lịch cá nhân</h2>
                            <div className="flex rounded-xl bg-[#F2F4F8] p-1">
                                <button onClick={() => setViewMode('week')} className={`rounded-lg px-3 py-1.5 text-[10.5px] font-black ${viewMode === 'week' ? 'bg-white text-[#1A56FF] shadow-sm' : 'text-[#7B8AB0]'}`}>Tuần</button>
                                <button onClick={() => setViewMode('month')} className={`rounded-lg px-3 py-1.5 text-[10.5px] font-black ${viewMode === 'month' ? 'bg-white text-[#1A56FF] shadow-sm' : 'text-[#7B8AB0]'}`}>Tháng</button>
                            </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                            <button onClick={viewMode === 'week' ? prevWeek : prevMonth} className="flex h-[31px] w-[31px] items-center justify-center rounded-[11px] border border-[#E5EAF4] text-[#7B8AB0]"><ChevronLeft size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); viewMode === 'week' ? setIsWeekDropdownOpen(!isWeekDropdownOpen) : setIsMonthDropdownOpen(!isMonthDropdownOpen); }} className="relative flex h-[31px] flex-1 items-center justify-center rounded-[11px] bg-[#EEF2FF] text-[11px] font-black text-[#1A56FF]">
                                {viewMode === 'week' ? (selectedWeek === 0 ? 'Tổng quát' : `Tuần ${selectedWeek}`) : `Tháng ${selectedMonthIndex + 1}`}
                            </button>
                            <button onClick={viewMode === 'week' ? nextWeek : nextMonth} className="flex h-[31px] w-[31px] items-center justify-center rounded-[11px] border border-[#E5EAF4] text-[#7B8AB0]"><ChevronRight size={14} /></button>
                        </div>
                        <div className="mt-2 text-center text-[10px] font-bold text-[#9AA5C0]">{viewMode === 'week' && selectedWeek !== 0 ? `${weekStartStr} - ${weekEndStr}` : selectedWeek === 0 ? 'Chọn tuần để xem lịch chi tiết' : ''}</div>
                    </div>

                    {viewMode === 'week' ? (
                        <>
                            <div className="grid grid-cols-7 gap-1.5 p-3">
                                {weekDayLabels.map((label, index) => (
                                    <button key={label} onClick={() => setSelectedDayIndex(index)} disabled={selectedWeek === 0} className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[15px] ${selectedDayIndex === index && selectedWeek !== 0 ? 'bg-[#1A56FF] text-white shadow-[0_8px_16px_rgba(26,86,255,0.26)]' : 'bg-[#F8FAFD] text-[#7B8AB0]'}`}>
                                        <span className="text-[9px] font-black uppercase">{label}</span>
                                        <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black">{currentWeekDates[index]?.slice(0, 2) || '--'}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="space-y-2 px-3.5 pb-3.5">
                                {HOLIDAY_WEEKS.includes(selectedWeek) ? (
                                    <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-center text-xs font-black text-red-600"><Zap className="mx-auto mb-2 fill-current" size={22} />Tuần nghỉ Lễ/Tết, không có lịch học.</div>
                                ) : selectedWeek === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-[#DDE3F0] bg-[#F6F8FC] p-5 text-center text-xs font-bold text-[#7B8AB0]">Chọn một tuần học để xem lịch theo ngày.</div>
                                ) : (
                                    <>
                                        {[
                                            { label: 'Buổi sáng', items: selectedMorningCourses },
                                            { label: 'Buổi chiều', items: selectedAfternoonCourses },
                                        ].map(group => (
                                            <div key={group.label}>
                                                <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.4px] text-[#9AA5C0]"><span>{group.label}</span><span className="h-px flex-1 bg-[#EEF2FF]" /></div>
                                                {group.items.length > 0 ? group.items.map((item: any) => {
                                                    const color = getColorForCourse(item.course.id);
                                                    const itemLabels = getLabelsForDate(item.course, selectedDateFull);
                                                    return (
                                                        <div key={`${item.course.id}-${item.details?.id || item.details?.shift || group.label}`} onClick={() => setSelectedCourseInfo({ course: item.course, details: item.details, dateStr: selectedDateFull })} className={`mb-2 rounded-[18px] border-l-4 ${color.border} ${color.bg} p-3`}>
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="text-[12.5px] font-black leading-snug text-[#0D1B3E]">{item.details?.isMakeup ? 'Bù: ' : ''}{item.course.subject_name}</div>
                                                                <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[9.5px] font-black text-[#1A56FF]">{getShiftDisplay(item.details?.shift)}</span>
                                                            </div>
                                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                                <span className="rounded-full bg-white/75 px-2 py-1 text-[9.5px] font-bold text-[#56627B]"><Clock size={10} className="mr-1 inline" />{getCourseTimeLabel(item.details?.shift) || item.details?.shift}</span>
                                                                <span className="rounded-full bg-white/75 px-2 py-1 text-[9.5px] font-bold text-[#56627B]"><MapPin size={10} className="mr-1 inline" />{item.details?.room}</span>
                                                                {itemLabels.slice(0, 2).map(label => <span key={label.id} className={`rounded-full border px-2 py-1 text-[9px] font-bold ${getLabelStyle(label.color)}`}>{label.type === 'Khác' ? label.text : label.type}</span>)}
                                                            </div>
                                                        </div>
                                                    );
                                                }) : <div className="mb-2 rounded-2xl bg-[#F8FAFD] p-3 text-[11px] font-semibold text-[#9AA5C0]">Không có ca học.</div>}
                                            </div>
                                        ))}
                                        {selectedDayExams.map(exam => (
                                            <div key={`exam-${exam.id}`} onClick={() => setSelectedCourseInfo({ course: exam, dateStr: selectedDateFull })} className="rounded-[18px] border-l-4 border-l-[#FF3B5C] bg-[#FFF0F3] p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="text-[12.5px] font-black leading-snug text-[#0D1B3E]">Lịch thi: {exam.subject_name}</div>
                                                    <span className="rounded-full bg-white px-2 py-1 text-[9.5px] font-black text-[#E11D48]">{exam.exam_shift}</span>
                                                </div>
                                                <div className="mt-2 flex gap-1.5 text-[9.5px] font-bold text-[#56627B]"><span className="rounded-full bg-white/75 px-2 py-1">{getExamTime(exam.exam_shift)}</span><span className="rounded-full bg-white/75 px-2 py-1">Phòng {exam.exam_room || exam.room}</span></div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-7 gap-px bg-[#EEF2FF] p-px">
                            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => <div key={d} className="bg-[#F8FAFD] py-2 text-center text-[9px] font-black uppercase text-[#1A56FF]">{d}</div>)}
                            {renderMonthDays().map((date, idx) => {
                                if (!date) return <div key={`empty-${idx}`} className="min-h-[70px] bg-[#F8FAFD]" />;
                                const dayCourses = getCoursesForDate(date, mySchedule);
                                const dayExams = getExamsForDate(date, mySchedule);
                                const isToday = new Date().toDateString() === date.toDateString();
                                const dateStr = formatDateStr(date);
                                return (
                                    <div key={date.toISOString()} className="min-h-[72px] bg-white p-1">
                                        <div className={`mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black ${isToday ? 'bg-[#1A56FF] text-white' : 'text-[#56627B]'}`}>{date.getDate()}</div>
                                        {[...dayCourses.slice(0, 2), ...dayExams.slice(0, 1).map(exam => ({ course: exam, details: null }))].map((item: any, i) => (
                                            <div key={i} onClick={() => setSelectedCourseInfo({ course: item.course, details: item.details, dateStr })} className="mb-0.5 truncate rounded bg-[#EEF2FF] px-1 py-0.5 text-[7px] font-bold text-[#1A56FF]">{item.course.subject_name}</div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {false && currentSemesterSchedule.length > 0 && (
                    <div className="mx-6 mb-4 rounded-[20px] bg-white p-3.5 shadow-[0_2px_14px_rgba(0,0,0,0.05)]">
                        <div className="mb-2.5 flex items-center justify-between">
                            <h2 className="flex items-center gap-1.5 text-sm font-black text-[#0D1B3E]"><List size={16} className="text-[#1A56FF]" /> Môn dã luu</h2>
                            <button onClick={() => setIsMyScheduleModalOpen(true)} className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[10px] font-black text-[#1A56FF]">{currentSemesterSchedule.length} môn</button>
                        </div>
                        <div className="space-y-2">
                            {currentSemesterSchedule.slice(0, 3).map((course, index) => (
                                <div key={course.id} onClick={() => setSelectedCourseInfo({ course })} className="flex items-center gap-2.5 border-t border-[#EEF2FF] pt-2 first:border-t-0 first:pt-0">
                                    <span className={`h-9 w-2.5 rounded-full ${index % 2 === 0 ? 'bg-[#1A56FF]' : 'bg-[#00C07F]'}`} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-xs font-black text-[#0D1B3E]">{course.subject_name}</div>
                                        <div className="mt-0.5 truncate text-[10px] font-semibold text-[#9AA5C0]">{course.course_code} • T{course.day_of_week} • Tiết {course.shift} • {course.room}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </>
        )}

        </div>

        <div className="hidden">
        {/* --- HEADER TKB --- */}
        <div className="relative top-0 z-40 bg-[#F8FAFC] px-0.3 pt-5.5 pb-2 mb-2 space-y-3">
            <div>
                <h1 className="text-2xl sm:text-[28px] font-black text-[#003375] mb-1">
                    Thời khóa biểu
                </h1>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span>Quản lý học tập</span><span>•</span><span className="font-bold text-gray-700">Lịch học & Thi</span>
                </div>
            </div>

            {canManageSchedule && (
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1 border border-gray-200">
                    <button onClick={() => { playClick(); setIsAdminView(false); }} className={`py-2 rounded-xl text-xs font-black transition-all ${!isAdminView ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500'}`}>Giao diện SV</button>
                    <button onClick={() => { playClick(); setIsAdminView(true); }} className={`py-2 rounded-xl text-xs font-black transition-all ${isAdminView ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500'}`}>Quản lý</button>
                </div>
            )}
        </div>

        <NotificationNudge variant="schedule" compact />

        {/* --- KHUNG TÌM KIẾM & LỌC --- */}
        <div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 space-y-2.5">
                <div className="flex justify-between items-center mb-1">
                    <h2 className="text-sm font-bold text-[#003375] flex items-center gap-1.5">
                        <Search size={16} className="text-[#990000]" /> Tìm kiếm & Lọc
                    </h2>
                    <button onClick={fetchCourses} className="p-1.5 bg-gray-50 text-[#003375] rounded-lg active:bg-gray-100 border border-gray-200 shadow-sm" title="Làm mới">
                        <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                    </button>
                </div>

                {/* Dòng 1: Dropdown học kỳ & đợt */}
                <div className="flex gap-2">
                    <div className="flex-1">
                        <select disabled={!isAuthenticated} value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-[13px] font-bold text-[#003375] bg-gray-50 disabled:cursor-not-allowed appearance-none">
                            <option value="HK2_2025_2026">HK2 (2025-2026)</option>
                            <option value="HK1_2025_2026">HK1 (2025-2026)</option>
                        </select>
                    </div>
                    <div className="w-[35%]">
                        <select disabled={!isAuthenticated} value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-200 outline-none text-[13px] font-bold text-gray-700 bg-gray-50 disabled:cursor-not-allowed appearance-none">
                            <option value="all">Mọi đợt</option>
                            <option value="1">Đợt 1</option>
                            <option value="2">Đợt 2</option>
                        </select>
                    </div>
                </div>

                {/* Dòng 2: Ô nhập tìm kiếm gọn gàng */}
                <div className="relative">
                    <input disabled={!isAuthenticated} type="text" placeholder="Tên môn + mã (VD: Toán cao cấp D01)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 outline-none text-[13px] bg-gray-50 focus:ring-1 focus:ring-[#003375] disabled:cursor-not-allowed"/>
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                </div>

                {/* Dòng 3: Cụm nút action gọn gàng bằng icon */}
                <div className="flex gap-2 pt-1">
                    <button disabled={!isAuthenticated} onClick={() => { setReportData({ course_code: '', subject_name: '', description: '', suggested_correction: '' }); setIsReportModalOpen(true); }} className="flex-1 py-1.5 bg-red-50 text-red-600 rounded-lg flex flex-col items-center justify-center gap-1 active:bg-red-100 border border-red-100 disabled:opacity-50 transition-colors shadow-sm">
                        <AlertTriangle size={16}/> <span className="text-[10px] font-bold">Báo lỗi</span>
                    </button>
                    <button disabled={!isAuthenticated} onClick={() => setIsCreateCourseModalOpen(true)} className="flex-1 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg flex flex-col items-center justify-center gap-1 active:bg-emerald-100 border border-emerald-100 disabled:opacity-50 transition-colors shadow-sm">
                        <BookPlus size={16}/> <span className="text-[10px] font-bold">Thêm môn</span>
                    </button>
                    <button disabled={!isAuthenticated || isProcessingPdf} onClick={() => setIsPdfGuideOpen(true)} className="flex-[1.2] py-1.5 bg-gray-100 text-gray-700 rounded-lg flex flex-col items-center justify-center gap-1 active:bg-gray-200 border border-gray-200 disabled:opacity-50 transition-colors shadow-sm relative">
                        {isProcessingPdf ? <Loader2 size={16} className="animate-spin text-blue-600"/> : <FileUp size={16}/>}
                        <span className="text-[10px] font-bold">{isProcessingPdf ? 'Đang xử lý...' : 'Nhập từ PDF'}</span>
                    </button>
                    <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handlePdfUpload} />
                </div>
            </div>

            {/* DANH SÁCH MÔN HỌC TÌM KIẾM ĐƯỢC */}
            {isAuthenticated && (searchTerm || isAdminView) && availableCourses.length > 0 && (
                <div className="mt-3 flex flex-col gap-2.5 max-h-[300px] overflow-y-auto custom-scrollbar bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-[11px] text-gray-500 font-bold px-1">{isAdminView ? 'Danh sách môn học' : 'Kết quả'} ({availableCourses.length})</p>
                    {availableCourses.map((course) => {
                        const color = getColorForCourse(course.id);
                        return (
                            <div key={course.id} className={`bg-gray-50 border border-gray-200 border-l-4 ${color.border} rounded-lg p-2.5 relative`} onClick={() => setSelectedCourseInfo({ course })}>
                                <div className="flex justify-between items-start">
                                    <div className="pr-8">
                                        <h3 className={`font-bold text-[13px] leading-tight line-clamp-2 ${color.text}`}>{course.subject_name}</h3>
                                        <p className="text-[10px] text-gray-500 font-medium mt-1">{course.course_code} • Đợt {course.phase || '1'}</p>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); addToSchedule(course); }} disabled={isSyncing} className="absolute top-2 right-2 text-white bg-[#003375] p-1.5 rounded active:scale-95"><Plus size={14}/></button>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    <div className="text-[9px] font-medium text-gray-600 bg-white px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1"><Clock size={10}/> T{course.day_of_week} ({course.shift})</div>
                                    <div className="text-[9px] font-medium text-gray-600 bg-white px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1"><MapPin size={10}/> P. {course.room}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* --- KHUNG LỊCH CÁ NHÂN --- */}
        <div>
            {!isAuthenticated ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center p-8 h-[250px] mb-6">
                    <div className="w-14 h-14 bg-blue-50 text-[#003375] rounded-full flex items-center justify-center mb-4 shadow-sm border border-blue-100">
                        <Lock size={24} />
                    </div>
                    <p className="text-xs text-gray-500 font-medium leading-relaxed">Đăng nhập bằng tài khoản sinh viên để xem lịch học.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col mb-6">
                    <div className="p-3 border-b border-gray-100 bg-white">
                        <h2 className="text-base font-extrabold text-[#003375] flex items-center justify-center gap-1.5 mb-3">
                            <Calendar size={18} className="text-[#990000]" /> Lịch cá nhân
                        </h2>

                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1 shrink-0">
                                <button onClick={() => setViewMode('week')} className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${viewMode === 'week' ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500'}`}>Tuần</button>
                                <button onClick={() => setViewMode('month')} className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${viewMode === 'month' ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500'}`}>Tháng</button>
                            </div>

                            {/* Nút Hôm nay */}
                            <button onClick={goToToday} className="px-2.5 py-1 text-[11px] font-bold bg-blue-50 text-[#003375] rounded-md hover:bg-blue-100 transition-colors border border-blue-200 shadow-sm shrink-0 active:scale-95">
                                Hôm nay
                            </button>

                            {viewMode === 'week' ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                        <button onClick={prevWeek} className="p-1.5 active:bg-gray-50 text-gray-600 border-r border-gray-200"><ChevronLeft size={14}/></button>
                                        <button onClick={nextWeek} className="p-1.5 active:bg-gray-50 text-gray-600"><ChevronRight size={14}/></button>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); setIsWeekDropdownOpen(!isWeekDropdownOpen); setIsMonthDropdownOpen(false); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-bold text-[#003375] shadow-sm relative">
                                        {selectedWeek === 0 ? 'Tổng quát' : `Tuần ${selectedWeek}`}
                                        <ChevronDown size={12} className="text-gray-400"/>
                                        {isWeekDropdownOpen && (
                                            <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-gray-200 shadow-xl rounded-lg max-h-[200px] overflow-y-auto z-50 py-1 text-left">
                                                <div onClick={() => { setSelectedWeek(0); setIsWeekDropdownOpen(false); }} className="px-3 py-2 text-xs active:bg-gray-50 font-bold text-gray-700 border-b border-gray-100">Tổng quát</div>
                                                {Array.from({length: 24}, (_, i) => i + 1).map(w => (
                                                    <div key={w} onClick={() => { setSelectedWeek(w); setIsWeekDropdownOpen(false); }} className={`px-3 py-2 text-xs active:bg-gray-50 ${selectedWeek === w ? 'bg-blue-50 text-[#003375] font-bold' : 'text-gray-600 font-medium'}`}>
                                                        Tuần {w} <span className="text-[9px] text-gray-400 ml-1 font-normal block">({getWeekDates(w)[0]} - {getWeekDates(w)[6]})</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                        <button onClick={prevMonth} className="p-1.5 active:bg-gray-50 text-gray-600 border-r border-gray-200"><ChevronLeft size={14}/></button>
                                        <button onClick={nextMonth} className="p-1.5 active:bg-gray-50 text-gray-600"><ChevronRight size={14}/></button>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); setIsMonthDropdownOpen(!isMonthDropdownOpen); setIsWeekDropdownOpen(false); }} className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] font-bold text-[#003375] shadow-sm relative">
                                        Tháng {selectedMonthIndex + 1}
                                        <ChevronDown size={12} className="text-gray-400"/>
                                        {isMonthDropdownOpen && (
                                            <div className="absolute top-full left-0 mt-1 w-28 bg-white border border-gray-200 shadow-xl rounded-lg max-h-[200px] overflow-y-auto z-50 py-1 text-left">
                                                {Array.from({length: 12}, (_, i) => i).map(m => (
                                                    <div key={m} onClick={() => { setSelectedMonthIndex(m); setIsMonthDropdownOpen(false); }} className={`px-3 py-2 text-xs active:bg-gray-50 ${selectedMonthIndex === m ? 'bg-blue-50 text-[#003375] font-bold' : 'text-gray-600 font-medium'}`}>
                                                        Tháng {m + 1}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                        {selectedWeek !== 0 && viewMode === 'week' && (
                            <div className="text-center mt-2"><span className="text-[9px] font-semibold text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full">{weekStartStr} - {weekEndStr}</span></div>
                        )}
                    </div>

                    <div className="flex-1 overflow-x-auto custom-scrollbar bg-white relative">
                        {HOLIDAY_WEEKS.includes(selectedWeek) && viewMode === 'week' && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 px-4 text-center">
                                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl font-bold text-xs border border-red-200 shadow-sm flex flex-col items-center gap-2">
                                    <Zap size={24} className="fill-current"/> Tuần nghỉ Lễ/Tết, không có lịch học!
                                </div>
                            </div>
                        )}

                        {viewMode === 'week' ? (
                            <table className="w-full min-w-[700px] border-collapse table-fixed">
                                <thead>
                                    <tr>
                                        <th className="w-[40px] border-b-2 border-r border-gray-200 bg-[#f8fafc]"></th>
                                        {[2, 3, 4, 5, 6, 7, 8].map((day, index) => {
                                            const isTodayCol = selectedWeek !== 0 && currentWeekDates[index] === todayStr;
                                            return (
                                            <th key={day} className={`py-2 border-b-2 border-r border-gray-200 ${isTodayCol ? 'bg-[#F0F9FF]' : 'bg-[#f8fafc]'}`}>
                                                <div className={`flex flex-col items-center gap-1 ${isTodayCol ? 'text-[#003375]' : 'text-gray-700'}`}>
                                                    <span className="font-extrabold text-[11px] uppercase">T{day === 8 ? 'CN' : day}</span>
                                                    {selectedWeek !== 0 && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isTodayCol ? 'bg-[#003375] text-white font-bold' : 'text-gray-500'}`}>{currentWeekDates[index]}</span>}
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
                                                <span className={`block text-[9px] font-black uppercase ${shift === 'S' ? 'text-orange-500' : 'text-indigo-500'}`}>{shift === 'S' ? 'Sáng' : 'Chiều'}</span>
                                            </td>
                                            {[2, 3, 4, 5, 6, 7, 8].map((day, index) => {
                                                const isTodayCol = selectedWeek !== 0 && currentWeekDates[index] === todayStr;
                                                const cellDateShort = currentWeekDates[index];
                                                const cellDateFull = currentWeekDatesFull[index];
                                                const slotCourses = currentSemesterSchedule.map(c => {
                                                    const details = getCourseDetailsForSlot(c, day, selectedWeek, shift);
                                                    return details ? { course: c, slotDetails: details } : null;
                                                }).filter(Boolean);
                                                const makeupSlotCourses = currentSemesterSchedule.flatMap(c => (c.makeup_schedules || [])
                                                    .filter(item => (item.date === cellDateFull || getDayMonth(item.date) === cellDateShort) && (getMainShiftType(item.shift) || 'S') === shift)
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

                                                const slotExams = currentSemesterSchedule.filter(c => {
                                                    if (!c.exam_date || !c.exam_shift || selectedWeek === 0) return false;
                                                    const examDM = getExamDayMonth(c.exam_date);
                                                    return examDM === cellDateShort && isExamInShift(c.exam_shift, shift);
                                                });

                                                return (
                                                    <td key={`${shift}-${day}`} className={`border-r border-b border-gray-100 align-top p-1 h-[120px] ${isTodayCol ? 'bg-[#F0F9FF]' : 'bg-white active:bg-gray-50'}`}>
                                                        <div className="flex flex-col gap-1.5 w-full h-full">
                                                            {displaySlotCourses.map(({course, slotDetails}: any) => {
                                                                const color = getColorForCourse(course.id);
                                                                const cellLabels = getLabelsForDate(course, cellDateFull);
                                                                return (
                                                                <div key={`${course.id}-${slotDetails.isMakeup ? slotDetails.id : 'regular'}`} onClick={() => setSelectedCourseInfo({ course, details: slotDetails, dateStr: cellDateFull })} className={`border-l-4 ${color.border} ${color.bg} rounded-lg p-1.5 cursor-pointer w-full shrink-0 shadow-sm relative`}>
                                                                    <button onClick={(e) => { e.stopPropagation(); setQuickTagCourse({ ...course, dateStr: cellDateFull }); }} className="absolute top-1 right-1 bg-white/90 text-blue-600 rounded p-0.5 shadow-sm border border-blue-100 active:scale-95" title="Gắn nhãn">
                                                                        <Tag size={9}/>
                                                                    </button>
                                                                    {cellLabels.length > 0 && (
                                                                        <div className="flex flex-wrap gap-0.5 mb-1 pr-5">
                                                                            {cellLabels.slice(0, 2).map(label => (
                                                                                <span key={label.id} className={`text-[7px] px-1 py-0.5 rounded border font-bold ${getLabelStyle(label.color)}`}>
                                                                                    {label.type === 'Khác' ? label.text : label.type}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <h4 className={`font-bold ${color.text} text-[9px] leading-tight line-clamp-2 mb-1 pr-4`}>{course.subject_name}</h4>
                                                                    {slotDetails.isMakeup && (
                                                                        <div className={`text-[8px] ${color.label} font-bold mb-0.5`}>Học bù {slotDetails.originalDate?.substring(0, 5)}</div>
                                                                    )}
                                                                    <div className={`text-[8px] ${color.label} font-semibold flex items-center gap-0.5`}><MapPin size={8}/> P.{slotDetails.room}</div>
                                                                </div>
                                                                );
                                                            })}
                                                            {slotExams.map(exam => (
                                                                <div key={`exam-${exam.id}`} onClick={() => setSelectedCourseInfo({ course: exam, dateStr: cellDateFull })} className="border-l-2 border-l-red-500 bg-red-50 rounded-md p-1.5 cursor-pointer w-full shrink-0 shadow-sm">
                                                                    <div className="text-[7px] font-black text-white uppercase mb-0.5 bg-red-500 px-1 py-0.5 rounded w-fit">Lịch thi</div>
                                                                    <h4 className="font-bold text-red-900 text-[9px] leading-tight line-clamp-2">{exam.subject_name}</h4>
                                                                    {exam.exam_room && <div className="text-[8px] text-red-700 font-semibold flex items-center gap-0.5 mt-0.5"><MapPin size={8}/> P.{exam.exam_room}</div>}
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
                            <div className="grid grid-cols-7 gap-px bg-gray-200 border-t border-gray-200 min-h-[300px]">
                                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                                    <div key={d} className="bg-[#f8fafc] text-center text-[9px] font-bold py-1.5 text-[#003375] uppercase">{d}</div>
                                ))}
                                {renderMonthDays().map((date, idx) => {
                                    if (!date) return <div key={`empty-${idx}`} className="bg-gray-50/50 min-h-[70px]" />;
                                    const dayCourses = getCoursesForDate(date, mySchedule);
                                    const dayExams = getExamsForDate(date, mySchedule);
                                    const isToday = new Date().toDateString() === date.toDateString();
                                    const dateStr = formatDateStr(date);

                                    return (
                                        <div key={date.toISOString()} className={`bg-white min-h-[70px] p-1 ${isToday ? 'bg-[#F0F9FF]' : ''}`}>
                                            <div className={`text-[9px] font-bold text-center mb-1 ${isToday ? 'bg-[#003375] text-white rounded-full w-4 h-4 mx-auto flex items-center justify-center' : 'text-gray-600'}`}>
                                                {date.getDate()}
                                            </div>
                                            <div className="flex flex-col gap-0.5 px-0.5">
                                                {dayCourses.map((item: any, i: number) => {
                                                    const color = getColorForCourse(item.course.id);
                                                    const itemLabels = getLabelsForDate(item.course, dateStr);
                                                    return (
                                                        <div key={i} onClick={() => setSelectedCourseInfo({course: item.course, details: item.details, dateStr})} className={`text-[7px] px-1 py-0.5 rounded truncate font-semibold ${color.bg} ${color.text} border-l-2 ${color.border}`}>
                                                            {item.details?.isMakeup ? 'Bù: ' : ''}{item.course.subject_name}
                                                            {itemLabels.length > 0 && <span className="ml-1 font-black">•</span>}
                                                        </div>
                                                    );
                                                })}
                                                {dayExams.map((exam: any, i: number) => (
                                                    <div key={`exam-${i}`} onClick={() => setSelectedCourseInfo({course: exam, dateStr})} className="text-[7px] px-1 py-0.5 rounded truncate bg-red-50 text-red-700 border-l-2 border-l-red-500 font-bold">
                                                        Thi: {exam.subject_name}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* NÚT DANH SÁCH ĐÃ LƯU (FAB) */}
        {isAuthenticated && currentSemesterSchedule.length > 0 && (
            <div className="fixed bottom-24 right-4 z-50">
                <button onClick={() => setIsMyScheduleModalOpen(true)} className="bg-[#003375] text-white px-4 py-3 rounded-full font-bold text-sm shadow-[0_8px_30px_rgb(0,0,0,0.15)] flex items-center gap-2 active:scale-95 border-2 border-white/20">
                    <List size={18}/> Môn dã luu ({currentSemesterSchedule.length})
                </button>
            </div>
        )}

        </div>

        {/* ============================================================== */}
        {/* CÁC MODAL DẠNG BOTTOM SHEET CHO MOBILE */}
        {/* ============================================================== */}

        {isAdminEditModalOpen && createPortal(
            <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => { setIsAdminEditModalOpen(false); setActiveCourseRequest(null); }}>
                <div className="bg-white rounded-t-3xl w-full flex flex-col max-h-[90vh] shadow-2xl animate-slideUp relative overflow-hidden" onClick={e => e.stopPropagation()}>
                    <DragHandle />
                    <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-gray-100 shrink-0">
                        <div className="min-w-0">
                            <h2 className="font-bold text-[#003375] text-base flex items-center gap-2"><Edit size={18}/> {adminEditData.id ? 'Chỉnh sửa môn' : activeCourseRequest ? 'Duyệt yêu cầu thêm môn' : 'Thêm môn mới'}</h2>
                            <p className="mt-0.5 text-[10.5px] font-semibold text-gray-500">{adminTab === 'user' ? 'Môn sinh viên thêm' : 'Dữ liệu học phần hệ thống'}</p>
                        </div>
                        <button onClick={() => { setIsAdminEditModalOpen(false); setActiveCourseRequest(null); }} className="bg-gray-100 p-2 rounded-full text-gray-500 active:scale-95"><X size={16}/></button>
                    </div>
                    <form onSubmit={handleAdminSaveCourse} className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3 pb-safe">
                        {renderStudentEditField('Tên môn học', <input required placeholder="Tên môn học" value={adminEditData.subject_name || ''} onChange={e => setAdminEditData({...adminEditData, subject_name: e.target.value})} className={studentEditInputClass} />)}
                        <div className="grid grid-cols-2 gap-3">
                            {renderStudentEditField('Mã học phần', <input required placeholder="Mã học phần" value={adminEditData.course_code || ''} onChange={e => setAdminEditData({...adminEditData, course_code: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Tín chỉ', <input type="number" min="0" placeholder="Tín chỉ" value={adminEditData.credits ?? ''} onChange={e => setAdminEditData({...adminEditData, credits: Number(e.target.value)})} className={studentEditInputClass} />)}
                        </div>
                        {renderStudentEditField('Giảng viên', <input placeholder="Giảng viên" value={adminEditData.instructor || ''} onChange={e => setAdminEditData({...adminEditData, instructor: e.target.value})} className={studentEditInputClass} />)}
                        <div className="grid grid-cols-2 gap-3">
                            {renderStudentEditField('Thứ', <input placeholder="VD: 2 hoặc 2 4" value={adminEditData.day_of_week || ''} onChange={e => setAdminEditData({...adminEditData, day_of_week: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Ca / Tiết', <input placeholder="VD: S, C, 1-3" value={adminEditData.shift || ''} onChange={e => setAdminEditData({...adminEditData, shift: e.target.value})} className={studentEditInputClass} />)}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {renderStudentEditField('Phòng', <input placeholder="VD: A207" value={adminEditData.room || ''} onChange={e => setAdminEditData({...adminEditData, room: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Tuần học', <input placeholder="VD: 1-12" value={adminEditData.weeks || ''} onChange={e => setAdminEditData({...adminEditData, weeks: e.target.value})} className={studentEditInputClass} />)}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {renderStudentEditField('Đợt', <input placeholder="Đợt" value={adminEditData.phase || ''} onChange={e => setAdminEditData({...adminEditData, phase: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Ngày thi', <input placeholder="dd/mm/yyyy" value={adminEditData.exam_date || ''} onChange={e => setAdminEditData({...adminEditData, exam_date: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Ca thi', <input placeholder="VD: Ca 4" value={adminEditData.exam_shift || ''} onChange={e => setAdminEditData({...adminEditData, exam_shift: e.target.value})} className={studentEditInputClass} />)}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {renderStudentEditField('Phòng thi', <input placeholder="Phòng thi" value={adminEditData.exam_room || ''} onChange={e => setAdminEditData({...adminEditData, exam_room: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Cơ sở', <input placeholder="TD" value={adminEditData.campus || ''} onChange={e => setAdminEditData({...adminEditData, campus: e.target.value})} className={studentEditInputClass} />)}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {renderStudentEditField('Khóa', <input placeholder="VD: K48" value={adminEditData.cohort || ''} onChange={e => setAdminEditData({...adminEditData, cohort: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Ngành', <input placeholder="Ngành" value={adminEditData.major || ''} onChange={e => setAdminEditData({...adminEditData, major: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('CTĐT', <input placeholder="Chuẩn" value={adminEditData.academic_program || ''} onChange={e => setAdminEditData({...adminEditData, academic_program: e.target.value})} className={studentEditInputClass} />)}
                        </div>
                        <button type="submit" disabled={isSavingAdminCourse || isAuditor} className="w-full py-3 rounded-xl bg-[#003375] text-white text-sm font-bold active:bg-[#002855] disabled:opacity-50 flex items-center justify-center gap-2">
                            {isSavingAdminCourse ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} {isAuditor ? 'Auditor chỉ được xem' : 'Lưu học phần'}
                        </button>
                    </form>
                </div>
            </div>, document.body
        )}

        {selectedChangedCourse && createPortal(
            <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setSelectedChangedCourse(null)}>
                <div className="bg-white rounded-t-3xl w-full flex flex-col max-h-[88vh] shadow-2xl animate-slideUp relative overflow-hidden" onClick={e => e.stopPropagation()}>
                    <DragHandle />
                    <div className="px-4 pt-2 pb-3 flex items-start justify-between border-b border-gray-100 shrink-0">
                        <div className="min-w-0 pr-3">
                            <h2 className="text-base font-black leading-tight text-[#003375]">{selectedChangedCourse.subject_name}</h2>
                            <p className="mt-1 text-[11px] font-bold text-gray-500">{selectedChangedCourse.course_code} • {selectedChangedCourse.user?.full_name || selectedChangedCourse.user?.student_code || 'Sinh viên'}</p>
                        </div>
                        <button onClick={() => setSelectedChangedCourse(null)} className="bg-gray-100 p-2 rounded-full text-gray-500 active:scale-95"><X size={16}/></button>
                    </div>
                    <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-2 pb-safe">
                        {getChangedCourseDiffs(selectedChangedCourse).length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-[#DDE3F0] p-5 text-center text-xs font-bold text-[#7B8AB0]">Không còn trường khác biệt.</div>
                        ) : getChangedCourseDiffs(selectedChangedCourse).map(diff => (
                            <div key={String(diff.key)} className="rounded-2xl border border-[#EEF2FF] bg-[#F8FAFD] p-3">
                                <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-[#7B8AB0]">{diff.label}</div>
                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                    <div className="rounded-xl bg-white p-2">
                                        <div className="mb-1 font-black text-gray-400">Gốc</div>
                                        <div className="font-bold text-gray-700">{normalizeDiffValue(diff.originalValue) || 'Trống'}</div>
                                    </div>
                                    <div className="rounded-xl bg-blue-50 p-2">
                                        <div className="mb-1 font-black text-[#1A56FF]">Sinh viên sửa</div>
                                        <div className="font-bold text-[#003375]">{normalizeDiffValue(diff.changedValue) || 'Trống'}</div>
                                    </div>
                                </div>
                                {!isAuditor && (
                                    <button type="button" onClick={() => handleSyncChangedField(String(diff.key), diff.label)} disabled={isSyncingChangedCourse} className="mt-2 h-9 w-full rounded-xl bg-[#1A56FF] text-[11px] font-black text-white disabled:opacity-50">
                                        {isSyncingChangedCourse ? 'Đang đồng bộ...' : 'Đồng bộ trường này'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>, document.body
        )}

        {/* MODAL CHI TIẾT MÔN HỌC */}
        {selectedCourseInfo && (() => {
            const baseCourse = selectedCourseInfo.course;
            const course = currentSemesterSchedule.find(c => c.id === baseCourse.id) || baseCourse;
            const details = selectedCourseInfo.details;
            const selectedDateStr = selectedCourseInfo.dateStr;
            const modalLabels = getLabelsForDate(course, selectedDateStr);
            let timeDisplayValue = '';
            if (details) {
                timeDisplayValue = [`Thứ ${details.day}`, getShiftDisplay(details.shift), getCourseTimeLabel(details.shift)].filter(Boolean).join('\n');
                if (details.isMakeup && details.originalDate) {
                    timeDisplayValue += `\nHọc bù cho ngày ${details.originalDate}`;
                }
            } else {
                const dayArr = splitData(course.day_of_week);
                const shiftArr = splitData(course.shift);
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
            const modalRoom = details ? details.room : course.room?.replace(/\n/g, ' / ');
            const modalWeeks = details ? details.weeks : course.weeks?.replace(/\n/g, ' / ');

            return createPortal(
                <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setSelectedCourseInfo(null)}>
                    <div className="bg-white rounded-t-3xl w-full flex flex-col overflow-hidden animate-slideUp shadow-2xl relative max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <DragHandle />
                        <div className="p-4 border-b border-gray-100 flex justify-between items-start shrink-0">
                            <div className="pr-4">
                                <h2 className="text-lg font-bold text-[#003375] leading-tight mb-1">{course.subject_name}</h2>
                                <p className="text-gray-500 text-xs font-medium">{course.course_code} {course.phase && `• Đợt ${course.phase}`}</p>
                                {modalLabels.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {modalLabels.map(label => (
                                            <span key={label.id} className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${getLabelStyle(label.color)}`}>
                                                {label.type === 'Khác' ? label.text : label.type}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setSelectedCourseInfo(null)} className="bg-gray-100 p-2 rounded-full text-gray-500 active:scale-95 shrink-0"><X size={16}/></button>
                        </div>

                        <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-4 pb-safe">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Clock size={18} /></div>
                                <div>
                                    <p className="text-sm font-bold text-gray-900 whitespace-pre-line leading-relaxed">{timeDisplayValue}</p>
                                    <p className="text-[11px] text-gray-500 mt-1 font-medium">Tuần học: {modalWeeks}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0"><MapPin size={18} /></div>
                                <div>
                                    <p className="text-sm font-bold text-gray-900">Phòng {modalRoom}</p>
                                    <p className="text-[11px] text-gray-500 mt-1 font-medium">{course.campus || 'Cơ sở đang cập nhật'}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><User size={18} /></div>
                                <div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Giảng viên</p>
                                    <p className="text-sm font-bold text-gray-900">{course.instructor || 'Đang cập nhật...'}</p>
                                </div>
                            </div>
                            {(course.exam_date || course.exam_shift) && (
                                <div className="flex items-start gap-3 mt-2 bg-purple-50/50 p-3 rounded-xl border border-purple-100">
                                    <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center shrink-0"><CalendarDays size={18} /></div>
                                    <div>
                                        <p className="text-[10px] text-purple-500 font-bold uppercase tracking-wide mb-0.5">Lịch thi dự kiến</p>
                                        <p className="text-sm font-bold text-purple-900">{course.exam_date || 'Đang cập nhật...'}</p>
                                        {course.exam_shift && <p className="text-[11px] text-purple-700 mt-1 font-medium">Ca thi: {course.exam_shift} {getExamTime(course.exam_shift) ? `(${getExamTime(course.exam_shift)})` : ''}</p>}
                                        {course.exam_room && <p className="text-[11px] text-purple-700 mt-1 font-medium">Phòng thi: {course.exam_room}</p>}
                                    </div>
                                </div>
                            )}

                            {!forceManagementView && (
                            <div className="flex gap-2 pt-3 mt-3 border-t border-gray-100">
                                <button onClick={() => { setReportData({ course_code: course.course_code, subject_name: course.subject_name, description: '', suggested_correction: '' }); setIsReportModalOpen(true); setSelectedCourseInfo(null); }} className="p-3.5 rounded-xl border border-gray-200 text-gray-500 active:bg-gray-100 shrink-0" title="Báo lỗi">
                                    <AlertTriangle size={18} />
                                </button>
                                {selectedDateStr && course.user_schedule_id && (
                                    <button onClick={() => { setQuickTagCourse({ ...course, dateStr: selectedDateStr }); setSelectedCourseInfo(null); }} className="p-3.5 rounded-xl border border-blue-100 bg-blue-50 text-blue-600 active:bg-blue-100 shrink-0" title="Gắn nhãn">
                                        <Tag size={18} />
                                    </button>
                                )}
                                {course.user_schedule_id && (
                                    <button onClick={() => openStudentEditModal(course)} className="p-3.5 rounded-xl border border-blue-100 bg-blue-50 text-blue-600 active:bg-blue-100 shrink-0" title="Chỉnh sửa">
                                        <Edit size={18} />
                                    </button>
                                )}
                                {forceManagementView ? null : !currentSemesterSchedule.some(c => c.id === course.id) ? (
                                    <button onClick={() => { addToSchedule(course); setSelectedCourseInfo(null); }} className="flex-1 py-3 rounded-xl bg-[#003375] text-white text-sm font-bold active:bg-[#002855] transition-colors shadow-md flex items-center justify-center gap-2"><Plus size={16}/> Thêm vào Lịch</button>
                                ) : (
                                    <button onClick={() => { removeFromSchedule(course.id); setSelectedCourseInfo(null); }} className="flex-1 py-3 rounded-xl bg-red-50 text-red-600 border border-red-200 text-sm font-bold active:bg-red-100 transition-colors flex items-center justify-center gap-2"><Trash2 size={16}/> Xóa khỏi Lịch</button>
                                )}
                            </div>
                            )}
                        </div>
                    </div>
                </div>, document.body
            );
        })()}

        {/* MODAL GẮN NHÃN NHANH */}
        {quickTagCourse && createPortal(
            <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setQuickTagCourse(null)}>
                <div className="bg-white rounded-t-3xl w-full flex flex-col max-h-[88vh] shadow-2xl animate-slideUp relative overflow-hidden" onClick={e => e.stopPropagation()}>
                    <DragHandle />
                    <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-gray-100 shrink-0">
                        <h2 className="font-bold text-[#003375] text-base flex items-center gap-2"><Tag size={18}/> Gắn nhãn nhanh</h2>
                        <button onClick={() => setQuickTagCourse(null)} className="bg-gray-100 p-2 rounded-full text-gray-500 active:scale-95"><X size={16}/></button>
                    </div>
                    <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-4 pb-safe">
                        <div>
                            <p className="text-[11px] font-bold text-gray-500 mb-1">Môn học ngày {quickTagCourse.dateStr}:</p>
                            <p className="text-sm font-bold text-[#003375] leading-tight">{quickTagCourse.subject_name}</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-600">Chọn loại nhãn</label>
                            <select value={quickTagData.type} onChange={(e) => setQuickTagData({...quickTagData, type: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-gray-50">
                                {LABEL_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                        </div>

                        {quickTagData.type === 'Khác' && (
                            <div className="space-y-3">
                                <input type="text" placeholder="Nhập tên nhãn" value={quickTagData.text} onChange={(e) => setQuickTagData({...quickTagData, text: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-gray-50" />
                                <div className="flex flex-wrap gap-2">
                                    {LABEL_COLORS.map(color => (
                                        <button key={color.value} type="button" title={color.name} onClick={() => setQuickTagData({...quickTagData, color: color.value})} className={`w-8 h-8 rounded-full ${getLabelDotColor(color.value)} ${quickTagData.color === color.value ? 'ring-2 ring-offset-2 ring-[#003375]' : 'ring-1 ring-white'} shadow-sm`} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {quickTagData.type === 'Nghỉ' && (
                            <div className="rounded-2xl border border-red-100 bg-red-50/70 p-3 space-y-3">
                                <div className="flex items-center gap-2 text-red-700">
                                    <CalendarDays size={15} />
                                    <p className="text-xs font-bold">Lịch học bù</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-600">Ngày học bù</label>
                                    <input type="date" value={quickTagData.makeupDate} onChange={e => setQuickTagData({...quickTagData, makeupDate: e.target.value})} className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-white" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-600">Thời gian</label>
                                        <select value={quickTagData.makeupShift} onChange={e => setQuickTagData({...quickTagData, makeupShift: e.target.value})} className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-white">
                                            <option value="S">Sáng</option>
                                            <option value="C">Chiều</option>
                                            <option value="1-3">Tiết 1-3</option>
                                            <option value="4-5">Tiết 4-5</option>
                                            <option value="6-8">Tiết 6-8</option>
                                            <option value="9-10">Tiết 9-10</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-600">Phòng học</label>
                                        <input type="text" value={quickTagData.makeupRoom} onChange={e => setQuickTagData({...quickTagData, makeupRoom: e.target.value})} placeholder="B1.303" className="w-full px-3 py-2.5 border border-red-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-white" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-4 border-t border-gray-100 flex gap-2 shrink-0 bg-white">
                        <button type="button" onClick={() => setQuickTagCourse(null)} className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold active:bg-gray-200">Hủy</button>
                        <button type="button" onClick={handleQuickSaveLabel} disabled={isSavingQuickTag} className="flex-[1.4] py-3 rounded-xl bg-[#003375] text-white text-sm font-bold active:bg-[#002855] disabled:opacity-50 flex items-center justify-center gap-2">
                            {isSavingQuickTag ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} Gắn nhãn
                        </button>
                    </div>
                </div>
            </div>, document.body
        )}

        {/* MODAL MÔN ĐÃ LƯU */}
        {isMyScheduleModalOpen && createPortal(
            <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setIsMyScheduleModalOpen(false)}>
                <div className="bg-white rounded-t-3xl w-full flex flex-col h-[75vh] shadow-2xl animate-slideUp relative overflow-hidden" onClick={e => e.stopPropagation()}>
                    <DragHandle />
                    <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-gray-100 shrink-0">
                        <h2 className="font-bold text-[#003375] text-base flex items-center gap-2"><List size={18}/> Môn dã luu ({currentSemesterSchedule.length})</h2>
                        <button onClick={() => setIsMyScheduleModalOpen(false)} className="bg-gray-100 p-2 rounded-full text-gray-500 active:scale-95"><X size={16}/></button>
                    </div>
                    <div className="p-4 overflow-y-auto custom-scrollbar flex-1 pb-safe space-y-2.5">
                        {currentSemesterSchedule.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">
                                <Search size={40} className="mx-auto text-gray-200 mb-3"/>
                                <p className="font-medium text-sm">Chưa có môn học nào.</p>
                            </div>
                        ) : (
                            currentSemesterSchedule.map(course => (
                                <div key={course.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between gap-3 active:bg-gray-50 transition-colors" onClick={() => { setIsMyScheduleModalOpen(false); setSelectedCourseInfo({ course }); }}>
                                    <div className="flex-1 min-w-0 pr-2">
                                        <h4 className="font-bold text-gray-800 text-[13px] leading-tight mb-1">{course.subject_name}</h4>
                                        <p className="text-[10px] text-gray-500 font-medium">{course.course_code} <span className="mx-1">•</span> Đợt {course.phase || '1'}</p>
                                    </div>
                                    {course.user_schedule_id && (
                                        <button onClick={(e) => { e.stopPropagation(); openStudentEditModal(course); }} className="text-blue-600 bg-blue-50 p-2 rounded-lg active:bg-blue-100 shrink-0" title="Chỉnh sửa"><Edit size={16}/></button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); removeFromSchedule(course.id); }} className="text-red-500 bg-red-50 p-2 rounded-lg active:bg-red-100 shrink-0"><Trash2 size={16}/></button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>, document.body
        )}

        {/* MODAL BÁO LỖI */}
        {isStudentEditModalOpen && createPortal(
            <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setIsStudentEditModalOpen(false)}>
                <div className="bg-white rounded-t-3xl w-full flex flex-col max-h-[90vh] shadow-2xl animate-slideUp relative overflow-hidden" onClick={e => e.stopPropagation()}>
                    <DragHandle />
                    <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-gray-100 shrink-0">
                        <h2 className="font-bold text-[#003375] text-base flex items-center gap-2"><Edit size={18}/> Chỉnh sửa môn học</h2>
                        <button onClick={() => setIsStudentEditModalOpen(false)} className="bg-gray-100 p-2 rounded-full text-gray-500 active:scale-95"><X size={16}/></button>
                    </div>
                    <form onSubmit={handleStudentSaveCourse} className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3 pb-safe">
                        {renderStudentEditField('Tên môn học', <input required placeholder="Tên môn học" value={studentEditData.subject_name || ''} onChange={e => setStudentEditData({...studentEditData, subject_name: e.target.value})} className={studentEditInputClass} />)}
                        <div className="grid grid-cols-2 gap-3">
                            {renderStudentEditField('Mã học phần', <input required placeholder="Mã học phần" value={studentEditData.course_code || ''} onChange={e => setStudentEditData({...studentEditData, course_code: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Tín chỉ', <input type="number" min="0" placeholder="Tín chỉ" value={studentEditData.credits ?? ''} onChange={e => setStudentEditData({...studentEditData, credits: Number(e.target.value)})} className={studentEditInputClass} />)}
                        </div>
                        {renderStudentEditField('Giảng viên', <input placeholder="Giảng viên" value={studentEditData.instructor || ''} onChange={e => setStudentEditData({...studentEditData, instructor: e.target.value})} className={studentEditInputClass} />)}
                        <div className="grid grid-cols-2 gap-3">
                            {renderStudentEditField('Thứ', <input placeholder="VD: 2 hoặc 2 4" value={studentEditData.day_of_week || ''} onChange={e => setStudentEditData({...studentEditData, day_of_week: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Ca / Tiết', <input placeholder="VD: S, C, 1-3" value={studentEditData.shift || ''} onChange={e => setStudentEditData({...studentEditData, shift: e.target.value})} className={studentEditInputClass} />)}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {renderStudentEditField('Phòng', <input placeholder="VD: A207" value={studentEditData.room || ''} onChange={e => setStudentEditData({...studentEditData, room: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Tuần học', <input placeholder="VD: 1-12" value={studentEditData.weeks || ''} onChange={e => setStudentEditData({...studentEditData, weeks: e.target.value})} className={studentEditInputClass} />)}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            {renderStudentEditField('Đợt', <input placeholder="Đợt" value={studentEditData.phase || ''} onChange={e => setStudentEditData({...studentEditData, phase: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Ngày thi', <input placeholder="dd/mm/yyyy" value={studentEditData.exam_date || ''} onChange={e => setStudentEditData({...studentEditData, exam_date: e.target.value})} className={studentEditInputClass} />)}
                            {renderStudentEditField('Ca thi', <input placeholder="VD: Ca 4" value={studentEditData.exam_shift || ''} onChange={e => setStudentEditData({...studentEditData, exam_shift: e.target.value})} className={studentEditInputClass} />)}
                        </div>
                        <button type="submit" disabled={isSavingStudentCourse} className="w-full py-3 rounded-xl bg-[#003375] text-white text-sm font-bold active:bg-[#002855] disabled:opacity-50 flex items-center justify-center gap-2">
                            {isSavingStudentCourse ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} Lưu chỉnh sửa
                        </button>
                    </form>
                </div>
            </div>, document.body
        )}

        {isReportModalOpen && createPortal(
            <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setIsReportModalOpen(false)}>
                <div className="bg-white rounded-t-3xl w-full shadow-2xl animate-slideUp flex flex-col relative" onClick={e => e.stopPropagation()}>
                    <DragHandle />
                    <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-gray-100 shrink-0">
                        <h2 className="font-bold text-red-600 text-base flex items-center gap-2"><AlertTriangle size={18}/> Báo lỗi môn học</h2>
                        <button onClick={() => setIsReportModalOpen(false)} className="bg-gray-100 p-2 rounded-full text-gray-500 active:scale-95"><X size={16}/></button>
                    </div>
                    <form onSubmit={handleReportSubmit} className="p-4 space-y-3 pb-safe">
                        <div className="text-[11px] text-gray-500 mb-1">Giúp Admin khắc phục lỗi sai thông tin (giờ, phòng, ngày thi...)</div>
                        <input required placeholder="Mã học phần (VD: ACC...)" value={reportData.course_code} onChange={e => setReportData({...reportData, course_code: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none text-[13px] focus:border-red-500 bg-gray-50"/>
                        <input required placeholder="Tên môn học" value={reportData.subject_name} onChange={e => setReportData({...reportData, subject_name: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none text-[13px] focus:border-red-500 bg-gray-50"/>
                        <textarea required rows={4} placeholder="Mô tả lỗi chi tiết..." value={reportData.description} onChange={e => setReportData({...reportData, description: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none text-[13px] focus:border-red-500 resize-none bg-gray-50"></textarea>
                        <textarea rows={3} placeholder="Sửa lại như nào cho đúng? (VD: Phòng đúng là B2.904, giờ đúng là 13:00...)" value={reportData.suggested_correction} onChange={e => setReportData({...reportData, suggested_correction: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none text-[13px] focus:border-red-500 resize-none bg-gray-50"></textarea>
                        <TurnstileBox token={reportTurnstileToken} onTokenChange={setReportTurnstileToken} />
                        <button type="submit" disabled={isSubmittingReport || !reportTurnstileToken} className="w-full py-3 rounded-xl bg-red-600 text-white text-[13px] font-bold active:bg-red-700 transition-colors shadow-md mt-2 flex items-center justify-center gap-2">{isSubmittingReport ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} Gửi báo cáo</button>
                    </form>
                </div>
            </div>, document.body
        )}

        {/* MODAL YÊU CẦU THÊM MÔN */}
        {isCreateCourseModalOpen && createPortal(
            <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setIsCreateCourseModalOpen(false)}>
                <div className="bg-white rounded-t-3xl w-full shadow-2xl animate-slideUp flex flex-col relative" onClick={e => e.stopPropagation()}>
                    <DragHandle />
                    <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-gray-100 shrink-0">
                        <h2 className="font-bold text-emerald-700 text-base flex items-center gap-2"><BookPlus size={18}/> Yêu cầu thêm môn</h2>
                        <button onClick={() => setIsCreateCourseModalOpen(false)} className="bg-gray-100 p-2 rounded-full text-gray-500 active:scale-95"><X size={16}/></button>
                    </div>
                    <form onSubmit={handleCreateCourseSubmit} className="p-4 space-y-3 pb-safe">
                        <div className="text-[11px] text-gray-500 mb-1">Hệ thống chưa có môn này? Gửi thông tin để Admin thêm nhé!</div>
                        <input required placeholder="Tên môn học *" value={newCourseData.subject_name} onChange={e => setNewCourseData({...newCourseData, subject_name: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none text-[13px] focus:border-emerald-500 bg-gray-50"/>
                        <input required placeholder="Mã học phần *" value={newCourseData.course_code} onChange={e => setNewCourseData({...newCourseData, course_code: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none text-[13px] focus:border-emerald-500 bg-gray-50"/>
                        <input placeholder="Giảng viên (Tùy chọn)" value={newCourseData.instructor} onChange={e => setNewCourseData({...newCourseData, instructor: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl outline-none text-[13px] focus:border-emerald-500 bg-gray-50"/>
                        <button type="submit" disabled={isSubmittingCourse} className="w-full py-3 rounded-xl bg-emerald-600 text-white text-[13px] font-bold active:bg-emerald-700 transition-colors shadow-md mt-2 flex items-center justify-center gap-2">{isSubmittingCourse ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} Gửi yêu cầu</button>
                    </form>
                </div>
            </div>, document.body
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
};



