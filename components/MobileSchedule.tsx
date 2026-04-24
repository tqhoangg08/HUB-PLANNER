import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Info, Plus, Calendar, MapPin, Clock, X, CheckCircle, Zap, User, AlertTriangle, Send, BookPlus, List, Trash2, CalendarDays, Lock, FileUp, Loader2, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Settings, Edit, HelpCircle, Tag } from 'lucide-react';
import { supabase } from '../utils/supabase'; 
import { parseWeeks } from '../utils/scheduleLogic'; 
import { ScheduleImportGuideModal } from './ScheduleImportGuideModal';
import { parseSchedulePdf } from '../utils/schedulePdfImport';
import { useUserRole } from '../hooks/useUserRole';
import { playClick } from '../utils/audio';

// --- Types ---
interface UserProfile {
  full_name?: string;
  student_code?: string;
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
}

interface MobileScheduleProps {
    viewUserId?: string;
}

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
export const MobileSchedule: React.FC<MobileScheduleProps> = ({ viewUserId }) => {
  useEffect(() => { document.title = "Thời khóa biểu | HUB Planner"; }, []);

  const { session, isAdmin, isAuditor, loading } = useUserRole();
  const isAuthenticated = session !== null;

  const [searchTerm, setSearchTerm] = useState('');
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [mySchedule, setMySchedule] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [selectedSemester, setSelectedSemester] = useState<string>('HK2_2025_2026');
  const [selectedPhase, setSelectedPhase] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedWeek, setSelectedWeek] = useState<number>(0); 
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
  const [reportData, setReportData] = useState({ course_code: '', subject_name: '', description: '' });
  
  const [isCreateCourseModalOpen, setIsCreateCourseModalOpen] = useState(false);
  const [isSubmittingCourse, setIsSubmittingCourse] = useState(false);
  const [newCourseData, setNewCourseData] = useState({ subject_name: '', course_code: '', instructor: '' });
  const currentSemesterSchedule = mySchedule.filter(c => c.semester === selectedSemester);

  const [isPdfGuideOpen, setIsPdfGuideOpen] = useState(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States Admin View
  const [isAdminView, setIsAdminView] = useState(false);
  const [adminTab, setAdminTab] = useState<'system' | 'user'>('system');
  const [isAdminEditModalOpen, setIsAdminEditModalOpen] = useState(false);
  const [adminEditData, setAdminEditData] = useState<Partial<Course>>({});
  const [isSavingAdminCourse, setIsSavingAdminCourse] = useState(false);
  const [quickTagCourse, setQuickTagCourse] = useState<Course | null>(null);
  const [quickTagData, setQuickTagData] = useState(createInitialTagData());
  const [isSavingQuickTag, setIsSavingQuickTag] = useState(false);

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

  const fetchCourses = async () => {
    setIsLoading(true);
    try {
        let query = supabase.from('course_schedules').select('*').eq('semester', selectedSemester);
        if (selectedPhase !== 'all') query = query.eq('phase', selectedPhase);
        
        const term = searchTerm.trim();
        if (term) {
            const keywords = term.split(/\s+/);
            keywords.forEach(kw => {
                query = query.or(`subject_name.ilike.%${kw}%,course_code.ilike.%${kw}%,instructor.ilike.%${kw}%`);
            });
        }
        
        const { data, error } = await query.limit(isAdminView ? 1000 : 100);
        if (error) throw error;
        setAvailableCourses(data || []);
    } catch (error) { 
        console.error("Lỗi tải danh sách môn:", error); 
    } finally { 
        setIsLoading(false); 
    }
  };

  useEffect(() => { if (isAuthenticated) fetchCourses(); }, [searchTerm, selectedSemester, selectedPhase, isAuthenticated, isAdminView]);

  const fetchMySchedule = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; 
    const targetId = viewUserId || user.id;

    try {
      const { data, error } = await supabase.from('user_schedules').select(`id, course_id, semester, custom_data, course_schedules (*)`).eq('user_id', targetId);
      if (!error && data) {
        setMySchedule(data.map((item: any) => {
            if (!item.course_schedules) return null;
            let cData = item.custom_data;
            if (typeof cData === 'string') {
                try { cData = JSON.parse(cData); } catch(e) { cData = {}; }
            }
            return {
                ...item.course_schedules,
                ...(cData || {}),
                id: item.course_schedules.id,
                semester: item.semester || item.course_schedules.semester,
                user_schedule_id: item.id
            };
        }).filter(Boolean));
      }
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
    if (!user) { alert("⚠️ Vui lòng đăng nhập!"); return; }
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
        alert(`⛔ CẢNH BÁO TRÙNG LỊCH HỌC!\n\nMôn [${course.subject_name}] bị trùng giờ với [${existingCourse.subject_name}].\n(Thứ ${conflictDay} - ${getShiftDisplay(conflictShiftStr)}).`);
        return; 
      }
      if (course.exam_date && existingCourse.exam_date && course.exam_date.trim() === existingCourse.exam_date.trim()) { 
        const newIsMorning = isExamInShift(course.exam_shift, 'S'); const existIsMorning = isExamInShift(existingCourse.exam_shift, 'S');
        const newIsAfternoon = isExamInShift(course.exam_shift, 'C'); const existIsAfternoon = isExamInShift(existingCourse.exam_shift, 'C');
        if ((newIsMorning && existIsMorning) || (newIsAfternoon && existIsAfternoon)) { 
          alert(`⛔ CẢNH BÁO TRÙNG LỊCH THI!\n\nCùng thi ngày ${course.exam_date} - ${newIsMorning ? 'Buổi Sáng' : 'Buổi Chiều'}.`);
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
    if (!user) { alert("⚠️ Vui lòng đăng nhập!"); return; }

    setIsPdfGuideOpen(false); setIsProcessingPdf(true);
    try {
        const aiData = await parseSchedulePdf(file);
        if (!aiData || !aiData.courses || aiData.courses.length === 0) {
            alert("❌ Không thể đọc được dữ liệu. Vui lòng đảm bảo file PDF gốc.");
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
                        phase: phaseStr, is_user_added: false 
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
            alert(`✅ Đã đồng bộ thành công ${addedCount} môn học vào Thời khóa biểu!`);
            fetchMySchedule(); setSelectedSemester(currentSem); 
        } else {
            alert(`Các môn học trong file đã có sẵn trong Thời khóa biểu của bạn rồi!`);
        }
    } catch (err) { alert("Lỗi khi đọc PDF."); } 
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
    if (!user) { alert("⚠️ Bạn cần đăng nhập để gửi báo cáo!"); return; }

    setIsSubmittingReport(true);
    try {
      await supabase.from('course_reports').insert({ 
        course_code: reportData.course_code, subject_name: reportData.subject_name, error_description: reportData.description, user_id: user.id
      });
      alert("✅ Gửi báo cáo thành công! Cảm ơn bạn.");
      setIsReportModalOpen(false);
      setReportData({ course_code: '', subject_name: '', description: '' });
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
      await supabase.from('user_course_requests').insert({ 
        subject_name: newCourseData.subject_name, course_code: newCourseData.course_code, instructor: newCourseData.instructor || 'Chưa rõ', user_id: user.id
      });
      alert("✅ Gửi yêu cầu thành công!");
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
  };
  return (
    <div className="w-full pb-24 space-y-4 pt-1 animate-fadeIn">
        {/* --- HEADER TKB --- */}
        <div className="relative top-0 z-40 bg-[#F8FAFC] px-0.3 pt-5.5 pb-2 mb-2">
            <h1 className="text-[26px] font-extrabold text-[#003375] tracking-tight leading-none mb-1">
                Thời khóa biểu
            </h1>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Quản lý học tập</span><span>•</span><span className="font-bold text-gray-700">Lịch học & Thi</span>
            </div>
        </div>

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
                
                {/* Dòng 1: Dropdown Học kỳ & Đợt */}
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

                {/* Dòng 3: Cụm Nút Action Gọn Gàng Bằng Icon */}
                <div className="flex gap-2 pt-1">
                    <button disabled={!isAuthenticated} onClick={() => { setReportData({ course_code: '', subject_name: '', description: '' }); setIsReportModalOpen(true); }} className="flex-1 py-1.5 bg-red-50 text-red-600 rounded-lg flex flex-col items-center justify-center gap-1 active:bg-red-100 border border-red-100 disabled:opacity-50 transition-colors shadow-sm">
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
            {isAuthenticated && searchTerm && availableCourses.length > 0 && (
                <div className="mt-3 flex flex-col gap-2.5 max-h-[300px] overflow-y-auto custom-scrollbar bg-white p-2.5 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-[11px] text-gray-500 font-bold px-1">Kết quả ({availableCourses.length})</p>
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

                            {/* Nút Hôm Nay */}
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
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm px-4 text-center">
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
                    <List size={18}/> Môn đã lưu ({currentSemesterSchedule.length})
                </button>
            </div>
        )}

        {/* ============================================================== */}
        {/* CÁC MODAL DẠNG BOTTOM SHEET CHO MOBILE */}
        {/* ============================================================== */}

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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setSelectedCourseInfo(null)}>
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

                            <div className="flex gap-2 pt-3 mt-3 border-t border-gray-100">
                                <button onClick={() => { setReportData({ course_code: course.course_code, subject_name: course.subject_name, description: '' }); setIsReportModalOpen(true); setSelectedCourseInfo(null); }} className="p-3.5 rounded-xl border border-gray-200 text-gray-500 active:bg-gray-100 shrink-0" title="Báo lỗi">
                                    <AlertTriangle size={18} />
                                </button>
                                {selectedDateStr && course.user_schedule_id && (
                                    <button onClick={() => { setQuickTagCourse({ ...course, dateStr: selectedDateStr }); setSelectedCourseInfo(null); }} className="p-3.5 rounded-xl border border-blue-100 bg-blue-50 text-blue-600 active:bg-blue-100 shrink-0" title="Gắn nhãn">
                                        <Tag size={18} />
                                    </button>
                                )}
                                {!currentSemesterSchedule.some(c => c.id === course.id) ? (
                                    <button onClick={() => { addToSchedule(course); setSelectedCourseInfo(null); }} className="flex-1 py-3 rounded-xl bg-[#003375] text-white text-sm font-bold active:bg-[#002855] transition-colors shadow-md flex items-center justify-center gap-2"><Plus size={16}/> Thêm vào Lịch</button>
                                ) : (
                                    <button onClick={() => { removeFromSchedule(course.id); setSelectedCourseInfo(null); }} className="flex-1 py-3 rounded-xl bg-red-50 text-red-600 border border-red-200 text-sm font-bold active:bg-red-100 transition-colors flex items-center justify-center gap-2"><Trash2 size={16}/> Xóa khỏi Lịch</button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>, document.body
            );
        })()}

        {/* MODAL GẮN NHÃN NHANH */}
        {quickTagCourse && createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setQuickTagCourse(null)}>
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
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setIsMyScheduleModalOpen(false)}>
                <div className="bg-white rounded-t-3xl w-full flex flex-col h-[75vh] shadow-2xl animate-slideUp relative overflow-hidden" onClick={e => e.stopPropagation()}>
                    <DragHandle />
                    <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-gray-100 shrink-0">
                        <h2 className="font-bold text-[#003375] text-base flex items-center gap-2"><List size={18}/> Môn đã lưu ({currentSemesterSchedule.length})</h2>
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
                                    <button onClick={(e) => { e.stopPropagation(); removeFromSchedule(course.id); }} className="text-red-500 bg-red-50 p-2 rounded-lg active:bg-red-100 shrink-0"><Trash2 size={16}/></button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>, document.body
        )}

        {/* MODAL BÁO LỖI */}
        {isReportModalOpen && createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setIsReportModalOpen(false)}>
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
                        <button type="submit" disabled={isSubmittingReport} className="w-full py-3 rounded-xl bg-red-600 text-white text-[13px] font-bold active:bg-red-700 transition-colors shadow-md mt-2 flex items-center justify-center gap-2">{isSubmittingReport ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} Gửi báo cáo</button>
                    </form>
                </div>
            </div>, document.body
        )}

        {/* MODAL YÊU CẦU THÊM MÔN */}
        {isCreateCourseModalOpen && createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-end justify-center animate-fadeIn" onClick={() => setIsCreateCourseModalOpen(false)}>
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
                onFileClick={() => fileInputRef.current?.click()} 
            />
        )}
    </div>
  );
};
