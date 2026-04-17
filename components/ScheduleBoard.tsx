import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Search, Info, Plus, Calendar, MapPin, Clock, X, CheckCircle, Zap, User, AlertTriangle, Send, BookPlus, List, Trash2, CalendarDays, Lock, FileUp, Loader2, ChevronLeft, ChevronRight, ChevronDown, RefreshCw, Settings, Edit } from 'lucide-react';
import { supabase } from '../utils/supabase'; 
import { parseWeeks } from '../utils/scheduleLogic'; 
import { ScheduleImportGuideModal } from './ScheduleImportGuideModal';
import { parseSchedulePdf } from '../utils/schedulePdfImport';
import { useUserRole } from '../hooks/useUserRole';
import { playClick } from '../utils/audio';
import { AdsBanner } from './AdsBanner';

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
  cohort: string;
  major: string;
  academic_program: string;
  phase: string;      
  semester: string;   
  instructor?: string; 
  is_user_added?: boolean;
  user_schedule_id?: string; // ID dùng để cập nhật lịch cá nhân
}

const HK_START_DATE = new Date('2026-02-02T00:00:00');
const HOLIDAY_WEEKS = [2, 3, 4]; 

// =======================================================================
// HỆ THỐNG HELPER
// =======================================================================
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
    details?: { day: number, shift: string, room: string, weeks: string };
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

  // ==========================================
  // STATE CHO TÍNH NĂNG ADMIN & STUDENT EDIT
  // ==========================================
  const [isAdminView, setIsAdminView] = useState(isAdmin);
  const [adminTab, setAdminTab] = useState<'system' | 'user'>('system');
  const [isAdminEditModalOpen, setIsAdminEditModalOpen] = useState(false);
  const [adminEditData, setAdminEditData] = useState<Partial<Course>>({});
  const [isSavingAdminCourse, setIsSavingAdminCourse] = useState(false);

  const [isStudentEditModalOpen, setIsStudentEditModalOpen] = useState(false);
  const [studentEditData, setStudentEditData] = useState<Partial<Course> & { user_schedule_id?: string }>({});
  const [isSavingStudentCourse, setIsSavingStudentCourse] = useState(false);

  useEffect(() => {
    if (!loading) {
        setIsAdminView(isAdmin || isAuditor);
    }
  }, [isAdmin, isAuditor, loading]);

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

  const today = new Date();
  const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}`;

  const fetchCourses = async () => {
    setIsLoading(true);
    try {
        let query = supabase.from('course_schedules').select('*').eq('semester', selectedSemester);
        
        if (selectedPhase !== 'all') {
            query = query.eq('phase', selectedPhase);
        }
        
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
      // Kéo thêm cột custom_data để đè lên dữ liệu gốc
      const { data, error } = await supabase.from('user_schedules').select(`id, course_id, semester, custom_data, course_schedules (*)`).eq('user_id', targetId);
      if (!error && data) {
        setMySchedule(data.map((item: any) => {
            if (!item.course_schedules) return null;
            return {
                ...item.course_schedules,
                ...(item.custom_data || {}), // Đè dữ liệu cá nhân lên (nếu có)
                id: item.course_schedules.id, // Bắt buộc giữ ID gốc để tránh lỗi xóa môn
                user_schedule_id: item.id // ID của bản ghi trong bảng user_schedules
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
      let isConflict = false;
      let conflictDay = null;
      let conflictShiftStr = "";

      for (let w = 1; w <= 24; w++) {
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
        alert(`⛔ CẢNH BÁO TRÙNG LỊCH HỌC!\n\nMôn [${course.subject_name}] bị trùng giờ học với môn [${existingCourse.subject_name}].\n(Bị trùng lặp vào Thứ ${conflictDay} - ${getShiftDisplay(conflictShiftStr)}).\n\nHệ thống đã chặn thao tác này. Vui lòng chọn Lớp học phần khác!`);
        return; 
      }

      if (course.exam_date && existingCourse.exam_date && course.exam_date.trim() === existingCourse.exam_date.trim()) { 
        const newIsMorning = isExamInShift(course.exam_shift, 'S');
        const existIsMorning = isExamInShift(existingCourse.exam_shift, 'S');
        const newIsAfternoon = isExamInShift(course.exam_shift, 'C');
        const existIsAfternoon = isExamInShift(existingCourse.exam_shift, 'C');

        if ((newIsMorning && existIsMorning) || (newIsAfternoon && existIsAfternoon)) { 
          alert(`⛔ CẢNH BÁO TRÙNG LỊCH THI!\n\nMôn [${course.subject_name}] bị trùng buổi thi với môn [${existingCourse.subject_name}].\n(Cùng thi ngày ${course.exam_date} - ${newIsMorning ? 'Buổi Sáng' : 'Buổi Chiều'}).\n\nHệ thống đã chặn thao tác này để tránh việc bạn phải bỏ thi!`);
          return; 
        }
      }
    }

    setMySchedule([...mySchedule, course]);
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('user_schedules').insert({ user_id: user.id, course_id: course.id, semester: selectedSemester });
      if (error) throw error;
      fetchMySchedule(); // Fetch lại để lấy user_schedule_id
    } catch (err) {
        setMySchedule(mySchedule.filter(c => c.id !== course.id));
    } finally { setIsSyncing(false); }
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

  // ==========================================
  // HÀM SỬA MÔN HỌC (CHO SINH VIÊN)
  // ==========================================
  const handleStudentSaveCourse = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!studentEditData.subject_name || !studentEditData.course_code) {
          alert("Vui lòng nhập Tên môn và Mã môn!");
          return;
      }

      setIsSavingStudentCourse(true);
      try {
          // Bóc tách những trường gốc ra, chỉ đẩy vào custom_data những gì liên quan đến môn học
          const { id, user_schedule_id, is_user_added, ...overrideData } = studentEditData;

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

  // ==========================================
  // HÀM XỬ LÝ CHUẨN ADMIN
  // ==========================================
  const handleAdminSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEditData.subject_name || !adminEditData.course_code) {
        alert("Vui lòng nhập Tên môn và Mã môn!");
        return;
    }

    setIsSavingAdminCourse(true);
    try {
        const payload = {
            ...adminEditData,
            semester: selectedSemester,
            is_user_added: adminEditData.is_user_added ?? (adminTab === 'user')
        };

        if (payload.id) {
            const { error } = await supabase.from('course_schedules').update(payload).eq('id', payload.id);
            if (error) throw error;
            alert("Cập nhật môn học thành công!");
        } else {
            const { error } = await supabase.from('course_schedules').insert(payload);
            if (error) throw error;
            alert("Thêm môn mới thành công!");
        }
        setIsAdminEditModalOpen(false);
        fetchCourses();
    } catch (err) {
        console.error(err);
        alert("Có lỗi xảy ra khi lưu môn học.");
    } finally {
        setIsSavingAdminCourse(false);
    }
  };

  const handleAdminDeleteCourse = async (id: string) => {
    if (isAuditor) {
        alert("⚠️ Tính năng này bị khóa đối với tài khoản Auditor.");
        return;
    }
      if (!window.confirm("BẠN CÓ CHẮC CHẮN MUỐN XÓA?\nHành động này sẽ xóa môn học khỏi cơ sở dữ liệu và tự động xóa khỏi Thời khóa biểu của tất cả sinh viên đang lưu môn này!")) return;
      
      try {
          const { error } = await supabase.from('course_schedules').delete().eq('id', id);
          if (error) throw error;
          fetchCourses();
      } catch (err) {
          console.error(err);
          alert("Lỗi khi xóa môn học.");
      }
  };

  const getWeekDates = (weekNum: number) => {
    if (weekNum === 0) return ['', '', '', '', '', '', '']; 
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(HK_START_DATE);
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
            alert("❌ Không thể đọc được dữ liệu. Vui lòng đảm bảo file PDF là file gốc xuất từ trang trường.");
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

            if (existingCourses && existingCourses.length > 0) {
                targetCourseId = existingCourses[0].id;
            }

            if (!targetCourseId) {
                const { data: newCourse, error: insertErr } = await supabase
                    .from('course_schedules')
                    .insert({
                        course_code: cleanCode, 
                        subject_name: course.subject_name,
                        credits: course.credits,
                        instructor: course.instructor,
                        day_of_week: course.day_of_week,
                        shift: course.shift,
                        room: course.room,
                        campus: course.campus || 'TD', 
                        weeks: finalWeeks, 
                        semester: currentSem,
                        phase: phaseStr, 
                        is_user_added: false // Ghi chú: Có thể để mặc định là hệ thống sinh ra
                    })
                    .select('id')
                    .single();
                if (!insertErr && newCourse) {
                    targetCourseId = newCourse.id;
                } else {
                    console.error("Lỗi thêm môn mới:", insertErr);
                }
            }

            if (targetCourseId) {
                const { data: checkLink } = await supabase
                    .from('user_schedules')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('course_id', targetCourseId)
                    .single();

                if (!checkLink) {
                    await supabase.from('user_schedules').insert({
                        user_id: user.id,
                        course_id: targetCourseId,
                        semester: currentSem
                    });
                    addedCount++;
                }
            }
        }
        
        if (addedCount > 0) {
            alert(`✅ Đã đồng bộ thành công ${addedCount} môn học vào Thời khóa biểu!`);
            fetchMySchedule(); 
            setSelectedSemester(currentSem); 
        } else {
            alert(`Các môn học trong file đã có sẵn trong Thời khóa biểu của bạn rồi!`);
        }

    } catch (err) {
        console.error(err);
        alert("Lỗi khi đọc PDF.");
    } finally {
        setIsProcessingPdf(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getCoursesForDate = (targetDate: Date, schedule: Course[]) => {
    const dayOfWeek = targetDate.getDay() === 0 ? 8 : targetDate.getDay() + 1; 

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
      const { error } = await supabase.from('course_reports').insert({ 
        course_code: reportData.course_code, 
        subject_name: reportData.subject_name, 
        error_description: reportData.description,
        user_id: user.id
      });
      if (error) throw error;
      alert("✅ Gửi báo cáo thành công! Cảm ơn bạn đã đóng góp.");
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
      const { error } = await supabase.from('user_course_requests').insert({ 
        subject_name: newCourseData.subject_name, 
        course_code: newCourseData.course_code, 
        instructor: newCourseData.instructor || 'Chưa rõ',
        user_id: user.id
      });
      if (error) throw error;
      alert("✅ Gửi yêu cầu thành công! Admin sẽ kiểm tra và cập nhật môn này.");
      setIsCreateCourseModalOpen(false);
      setNewCourseData({ subject_name: '', course_code: '', instructor: '' });
    } catch (error) { alert("Đã xảy ra lỗi khi gửi yêu cầu."); } 
    finally { setIsSubmittingCourse(false); }
  };

  const currentWeekDates = getWeekDates(selectedWeek);
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
  
  const filteredAdminCourses = availableCourses.filter(c => adminTab === 'system' ? !c.is_user_added : c.is_user_added);

    // ✨ NGĂN CHẶN RENDER NẾU CHƯA LOAD QUYỀN XONG
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
        {!isAdmin && <AdsBanner />}

        {/* HEADER CHUẨN DASHBOARD */}
        <div className="relative md:sticky top-0 z-40 bg-[#F8FAFC] pt-2 pb-1 sm:pb-4 -mt-2 mb-1 sm:mb-4 border-b border-transparent md:border-gray-200/60 md:shadow-[0_8px_10px_-10px_rgba(0,0,0,0.05)]">
            <div className="flex flex-row justify-between items-end px-1 overflow-hidden shrink-0">
                <div className="flex flex-col">
                    <h1 className="text-[24px] sm:text-[26px] font-extrabold text-[#003375] tracking-tight leading-none">
                        Thời khóa biểu
                    </h1>
                    <div className="flex items-center gap-1.5 mt-1 sm:mt-2 text-[12px] sm:text-[13px] text-gray-500 overflow-x-auto whitespace-nowrap custom-scrollbar pb-1">
                        <span className="shrink-0">Quản lý học tập</span>
                        <span className="text-gray-300 shrink-0">•</span>
                        <span className="font-bold text-gray-700 shrink-0">Lịch học & Thi</span>
                    </div>
                </div>
                {/* NÚT TOGGLE ADMIN MODE */}
                {(isAdmin || isAuditor) && (
                    <button 
                        onClick={() => { playClick(); setIsAdminView(!isAdminView); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-purple-100 text-purple-700 font-bold rounded-lg hover:bg-purple-200 transition-colors shadow-sm text-xs sm:text-sm active:scale-95"
                    >
                        <Settings size={16}/> 
                        <span className="hidden sm:inline">{isAdminView ? 'Về giao diện Sinh viên' : 'Quản lý Môn học'}</span>
                        <span className="sm:hidden">Admin</span>
                    </button>
                )}
            </div>
        </div>

        {/* LAYOUT CHÍNH HOẶC ADMIN VIEW */}
        {isAdminView ? (
            <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-150px)]">
                {/* THANH CÔNG CỤ ADMIN */}
                <div className="p-4 border-b border-gray-100 bg-[#f8fafc] flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex items-center gap-3">
                        <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm font-bold text-[#003375] bg-white hover:border-gray-300 transition-colors cursor-pointer">
                            <option value="HK2_2025_2026">HK2 (2025-2026)</option>
                            <option value="HK1_2025_2026">HK1 (2025-2026)</option>
                        </select>
                        <select value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 outline-none text-sm font-bold text-gray-700 bg-white hover:border-gray-300 transition-colors cursor-pointer">
                            <option value="all">Mọi đợt</option>
                            <option value="1">Đợt 1</option>
                            <option value="2">Đợt 2</option>
                        </select>
                    </div>
                    
                    <div className="flex flex-1 max-w-md items-center gap-2">
                        <div className="relative flex-1">
                            <input type="text" placeholder="Tìm môn học, mã HP, GV..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 outline-none text-sm transition-all hover:border-gray-300 focus:border-[#003375] focus:ring-1 focus:ring-[#003375]"/>
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        </div>
                        <button onClick={fetchCourses} className="p-2.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors" title="Làm mới">
                            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
                        </button>
                        <button 
                            onClick={() => { setAdminEditData({ is_user_added: adminTab === 'user' }); setIsAdminEditModalOpen(true); }}
                            className="flex items-center gap-1.5 px-4 py-2 bg-[#003375] text-white font-bold rounded-lg hover:bg-[#002855] shadow-sm transition-colors text-sm whitespace-nowrap"
                        >
                            <Plus size={16}/> Thêm môn
                        </button>
                    </div>
                </div>

                {/* TABS ADMIN */}
                <div className="px-4 pt-4 border-b border-gray-200 flex gap-6 bg-white shrink-0">
                    <button onClick={() => setAdminTab('system')} className={`pb-3 text-sm font-bold transition-colors ${adminTab === 'system' ? 'border-b-2 border-[#003375] text-[#003375]' : 'text-gray-500 hover:text-gray-800'}`}>
                        Môn hệ thống gốc
                    </button>
                    <button onClick={() => setAdminTab('user')} className={`pb-3 text-sm font-bold transition-colors ${adminTab === 'user' ? 'border-b-2 border-purple-600 text-purple-700' : 'text-gray-500 hover:text-gray-800'}`}>
                        Môn sinh viên thêm
                    </button>
                </div>

                {/* BẢNG DỮ LIỆU ADMIN */}
                <div className="flex-1 overflow-auto custom-scrollbar bg-white">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full text-gray-500 gap-2"><Loader2 className="animate-spin" size={20}/> Đang tải dữ liệu...</div>
                    ) : filteredAdminCourses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Search size={40} className="mb-3 text-gray-300"/>
                            <p>Không có dữ liệu trong mục này.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse text-sm min-w-[900px]">
                            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-3 border-b font-bold whitespace-nowrap">Mã Học Phần</th>
                                    <th className="p-3 border-b font-bold">Tên Môn Học</th>
                                    <th className="p-3 border-b font-bold text-center">TC</th>
                                    <th className="p-3 border-b font-bold text-center">Đợt</th>
                                    <th className="p-3 border-b font-bold">Giảng Viên</th>
                                    <th className="p-3 border-b font-bold">Lịch Học & Phòng</th>
                                    <th className="p-3 border-b font-bold text-center w-28">Thao tác</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredAdminCourses.map(c => (
                                    <tr key={c.id} className="border-b hover:bg-blue-50/30 transition-colors group">
                                        <td className="p-3 font-semibold text-[#003375] whitespace-nowrap">{c.course_code}</td>
                                        <td className="p-3 font-bold text-gray-800">{c.subject_name}</td>
                                        <td className="p-3 text-center font-medium">{c.credits}</td>
                                        <td className="p-3 text-center"><span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-bold text-gray-600">{c.phase || '1'}</span></td>
                                        <td className="p-3 text-gray-600 font-medium">{c.instructor || '-'}</td>
                                        <td className="p-3 text-xs text-gray-600 leading-relaxed">
                                            <span className="font-bold text-gray-800">Thứ {c.day_of_week} ({c.shift})</span> • P.{c.room}<br/>
                                            Tuần: {c.weeks}
                                        </td>
                                        <td className="p-3 text-center">
                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
    <button onClick={() => { setAdminEditData(c); setIsAdminEditModalOpen(true); }} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Chỉnh sửa"><Edit size={16}/></button>
    {!isAuditor && (
        <button onClick={() => handleAdminDeleteCourse(c.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-colors" title="Xóa vĩnh viễn"><Trash2 size={16}/></button>
    )}
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
            <div className="flex flex-col lg:flex-row gap-3 sm:gap-6 lg:h-[calc(100vh-150px)] items-start">
            
                {/* CỘT TRÁI: SIDEBAR FILTER */}
                <div className={`w-full lg:w-[300px] bg-white rounded-xl border border-gray-300 flex flex-col shrink-0 overflow-hidden shadow-sm transition-all ${searchTerm.trim() ? 'h-[450px]' : 'h-auto'} lg:h-full`}>
                    <div className="p-3 sm:p-4 border-b border-gray-100 flex justify-between items-center bg-[#f8fafc]">
                        <h2 className="text-base font-bold text-[#003375] flex items-center gap-2">
                            <Search size={18} className="text-[#990000]" /> Tìm kiếm & Lọc
                        </h2>
                        {isSyncing ? (
                            <Loader2 size={16} className="text-blue-500 animate-spin" />
                        ) : (
                            <button onClick={fetchCourses} className="text-gray-400 hover:text-[#003375] transition-colors" title="Làm mới"><RefreshCw size={14}/></button>
                        )}
                    </div>
                    
                    <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 border-b border-gray-100">
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <select disabled={!isAuthenticated} value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className="w-full px-3 py-2 sm:py-2.5 rounded-lg border border-gray-200 outline-none text-sm font-bold text-[#003375] bg-white hover:border-gray-300 transition-colors cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed">
                                    <option value="HK2_2025_2026">HK2 (2025-2026)</option>
                                    <option value="HK1_2025_2026">HK1 (2025-2026)</option>
                                </select>
                            </div>
                            <div className="w-[35%]">
                                <select disabled={!isAuthenticated} value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)} className="w-full px-3 py-2 sm:py-2.5 rounded-lg border border-gray-200 outline-none text-sm font-bold text-gray-700 bg-white hover:border-gray-300 transition-colors cursor-pointer disabled:bg-gray-50 disabled:cursor-not-allowed">
                                    <option value="all">Mọi đợt</option>
                                    <option value="1">Đợt 1</option>
                                    <option value="2">Đợt 2</option>
                                </select>
                            </div>
                        </div>

                        <div className="relative">
                            <input disabled={!isAuthenticated} type="text" placeholder="Tên môn + mã (VD: Toán cao cấp D01)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 sm:py-2.5 rounded-lg border border-gray-200 outline-none text-sm transition-all hover:border-gray-300 focus:border-[#003375] focus:ring-1 focus:ring-[#003375] disabled:bg-gray-50 disabled:cursor-not-allowed"/>
                            <Search className="absolute left-3 top-2.5 sm:top-3 text-gray-400" size={16} />
                        </div>

                        <div className="flex gap-2">
                            <button disabled={!isAuthenticated} onClick={() => { setReportData({ course_code: '', subject_name: '', description: '' }); setIsReportModalOpen(true); }} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] sm:text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <AlertTriangle size={14} /> Báo lỗi môn
                            </button>
                            <button disabled={!isAuthenticated} onClick={() => setIsCreateCourseModalOpen(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] sm:text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <BookPlus size={14} /> Yêu cầu thêm
                            </button>
                        </div>

                        <button 
                            disabled={!isAuthenticated || isProcessingPdf} 
                            onClick={() => setIsPdfGuideOpen(true)} 
                            className="w-full flex items-center justify-center gap-2 p-2.5 mt-2 rounded-lg bg-[#003375] text-white hover:bg-[#002855] shadow-md hover:shadow-lg font-bold text-sm transition-all active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none disabled:cursor-not-allowed"
                        >
                            {isProcessingPdf ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />}
                            {isProcessingPdf ? 'Đang phân tích PDF...' : 'Nhập TKB từ PDF'}
                        </button>
                        <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handlePdfUpload} />
                    </div>

                    {/* Danh sách môn học gợi ý */}
                    <div className={`flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 bg-gray-50/50 custom-scrollbar relative ${searchTerm.trim() ? 'block' : 'hidden lg:block'}`}>
                        {!isAuthenticated ? (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 bg-white/80 backdrop-blur-sm animate-fadeIn">
                                <div className="w-14 h-14 bg-blue-50 text-[#003375] rounded-full flex items-center justify-center mb-3 shadow-sm border border-blue-100">
                                    <Lock size={24} />
                                </div>
                                <p className="text-xs text-gray-600 font-medium leading-relaxed">Đăng nhập bằng tài khoản sinh viên để xem lịch học.</p>
                            </div>
                        ) : isLoading ? (
                            <p className="text-center text-xs text-gray-400 mt-10 animate-pulse font-medium">Đang tải dữ liệu...</p>
                        ) : availableCourses.length === 0 ? (
                            <div className="text-center mt-8">
                                <p className="text-gray-500 text-xs mb-3 font-medium">Không tìm thấy môn học.</p>
                            </div>
                        ) : (
                            availableCourses.map((course) => {
                                const color = getColorForCourse(course.id);
                                return (
                                    <div 
                                        key={course.id} 
                                        className={`bg-white border border-gray-200 border-l-4 ${color.border} rounded-lg p-3 relative group hover:shadow-md transition-all cursor-pointer`}
                                        onClick={() => setSelectedCourseInfo({ course })}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className={`font-bold text-xs leading-tight pr-6 line-clamp-2 ${color.text}`}>{course.subject_name}</h3>
                                                <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                                    {course.course_code} • Đợt {course.phase || '1'}
                                                </p>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); addToSchedule(course); }} disabled={isSyncing} className="text-gray-300 hover:text-[#003375] p-1 bg-gray-50 hover:bg-blue-50 rounded-md transition-colors"><Plus size={14}/></button>
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-2 flex items-center gap-1 font-medium"><Clock size={10} className="text-gray-400"/> Thứ {course.day_of_week} ({getShiftDisplay(course.shift)})</div>
                                        <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1 font-medium"><MapPin size={10} className="text-gray-400"/> P. {course.room}</div>
                                        <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-1 font-medium"><User size={10} className="text-gray-400"/> {course.instructor || 'Chưa cập nhật'}</div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* CỘT PHẢI: KHUNG HIỂN THỊ TKB */}
                <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden min-h-[600px] lg:min-h-0 lg:h-full w-full shadow-sm relative">
                    {/* TOOLBAR LỊCH */}
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between p-3 sm:p-4 border-b border-gray-100 gap-3 bg-white shrink-0">
                        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <h2 className="text-lg font-extrabold text-[#003375] flex items-center gap-2">
                                <Calendar size={20} className="text-[#990000]" /> Lịch cá nhân
                            </h2>

                            {/* ✨ BADGE THÔNG BÁO TÍNH NĂNG MỚI (Đã sửa dài và rõ nghĩa hơn) ✨ */}
                            <div 
                                className="flex items-center gap-1.5 px-3 py-1 bg-blue-50/80 border border-blue-200 text-[#003375] rounded-full text-[10px] sm:text-xs font-bold shadow-sm cursor-help hover:bg-blue-100 transition-colors"
                                title="Mở danh sách Môn đã lưu và nhấn vào biểu tượng Sửa (Cây bút) để bắt đầu!"
                            >
                                <Zap size={14} className="fill-yellow-500 text-yellow-500 animate-pulse shrink-0" />
                                {/* Màn hình Laptop/PC: Hiển thị đầy đủ câu chữ */}
                                <span className="hidden md:inline">✨ Mới: Bạn đã có thể tự chỉnh sửa giờ, phòng học cá nhân!</span>
                                {/* Màn hình Tablet: Thu gọn một chút */}
                                <span className="hidden sm:inline md:hidden">✨ Mới: Đã có thể tự sửa lịch học!</span>
                                {/* Màn hình Điện thoại: Cực ngắn gọn để không rớt dòng */}
                                <span className="sm:hidden">✨ Tự sửa lịch!</span>
                            </div>

                            {selectedWeek !== 0 && viewMode === 'week' && (
                                <span className="hidden md:flex text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-md items-center gap-1.5">
                                    <CalendarDays size={12}/>
                                    {weekStartStr} - {weekEndStr}
                                </span>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg p-1">
                                <button onClick={() => setViewMode('week')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewMode === 'week' ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>Tuần</button>
                                <button onClick={() => setViewMode('month')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${viewMode === 'month' ? 'bg-white text-[#003375] shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>Tháng</button>
                            </div>
                            
                            {/* Nút Hôm Nay */}
                            <button onClick={goToToday} className="px-3 py-1.5 text-xs font-bold bg-blue-50 text-[#003375] rounded-lg hover:bg-blue-100 transition-colors border border-blue-200 shadow-sm mr-2 active:scale-95">
                                Hôm nay
                            </button>
                            
                            {viewMode === 'week' ? (
                                <div className="flex items-center gap-1.5">
                                    <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                        <button onClick={prevWeek} className="p-1.5 hover:bg-gray-50 text-gray-600 transition-colors border-r border-gray-200"><ChevronLeft size={16}/></button>
                                        <button onClick={nextWeek} className="p-1.5 hover:bg-gray-50 text-gray-600 transition-colors"><ChevronRight size={16}/></button>
                                    </div>
                                    
                                    <div className="relative">
                                        <button onClick={(e) => { e.stopPropagation(); setIsWeekDropdownOpen(!isWeekDropdownOpen); setIsMonthDropdownOpen(false); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-[#003375] hover:bg-gray-50 shadow-sm">
                                            {selectedWeek === 0 ? 'Tổng quát' : `Tuần ${selectedWeek}`}
                                            <ChevronDown size={14} className="text-gray-400"/>
                                        </button>
                                        {isWeekDropdownOpen && (
                                            <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 shadow-xl rounded-xl max-h-[300px] overflow-y-auto z-50 py-1">
                                                <button onClick={() => { setSelectedWeek(0); setIsWeekDropdownOpen(false); }} className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 font-bold text-gray-700 border-b border-gray-100">Hiển thị Tổng quát</button>
                                                {Array.from({length: 24}, (_, i) => i + 1).map(w => {
                                                    const wDates = getWeekDates(w);
                                                    return (
                                                        <button key={w} onClick={() => { setSelectedWeek(w); setIsWeekDropdownOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selectedWeek === w ? 'bg-blue-50 text-[#003375] font-bold' : 'text-gray-600 font-medium'}`}>
                                                            Tuần {w} <span className="text-xs text-gray-400 ml-1 font-normal">({wDates[0]} - {wDates[6]})</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5">
                                    <div className="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                        <button onClick={prevMonth} className="p-1.5 hover:bg-gray-50 text-gray-600 transition-colors border-r border-gray-200"><ChevronLeft size={16}/></button>
                                        <button onClick={nextMonth} className="p-1.5 hover:bg-gray-50 text-gray-600 transition-colors"><ChevronRight size={16}/></button>
                                    </div>
                                    <div className="relative">
                                        <button onClick={(e) => { e.stopPropagation(); setIsMonthDropdownOpen(!isMonthDropdownOpen); setIsWeekDropdownOpen(false); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-[#003375] hover:bg-gray-50 shadow-sm">
                                            Tháng {selectedMonthIndex + 1}
                                            <ChevronDown size={14} className="text-gray-400"/>
                                        </button>
                                        {isMonthDropdownOpen && (
                                            <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 shadow-xl rounded-xl max-h-[300px] overflow-y-auto z-50 py-1">
                                                {Array.from({length: 12}, (_, i) => i).map(m => (
                                                    <button key={m} onClick={() => { setSelectedMonthIndex(m); setIsMonthDropdownOpen(false); }} className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${selectedMonthIndex === m ? 'bg-blue-50 text-[#003375] font-bold' : 'text-gray-600 font-medium'}`}>
                                                        Tháng {m + 1}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* LƯỚI LỊCH (GRID) */}
                    <div className="flex-1 overflow-auto custom-scrollbar relative bg-white">
                        {HOLIDAY_WEEKS.includes(selectedWeek) && viewMode === 'week' && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                                <div className="bg-red-50 text-red-600 px-6 py-3 rounded-full font-bold text-sm border border-red-200 shadow-lg flex items-center gap-2 animate-bounce">
                                    <Zap size={18} className="fill-current"/> Tuần nghỉ Lễ/Tết, không có lịch học!
                                </div>
                            </div>
                        )}
                        
                        {viewMode === 'week' ? (
                            <table className="w-full min-w-[700px] border-collapse table-fixed h-full">
                                <thead>
                                    <tr>
                                        <th className="w-[60px] border-b-2 border-r border-gray-200 bg-[#f8fafc]"></th>
                                        {[2, 3, 4, 5, 6, 7, 8].map((day, index) => {
                                            const isTodayCol = selectedWeek !== 0 && currentWeekDates[index] === todayStr;

                                            return (
                                            <th key={day} className={`py-2 border-b-2 border-r border-gray-200 transition-colors ${isTodayCol ? 'bg-[#F0F9FF]' : 'bg-[#f8fafc]'}`}>
                                                <div className={`flex flex-col items-center gap-0.5 ${isTodayCol ? 'text-[#003375]' : 'text-gray-700'}`}>
                                                    <span className="font-extrabold text-xs uppercase tracking-wide">Thứ {day === 8 ? 'CN' : day}</span>
                                                    {selectedWeek !== 0 && (
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${isTodayCol ? 'bg-[#003375] text-white font-bold shadow-sm' : 'text-gray-500 font-medium'}`}>
                                                            {currentWeekDates[index]}
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

                                                const slotCourses = currentSemesterSchedule.map(c => {
                                                    const details = getCourseDetailsForSlot(c, day, selectedWeek, shift);
                                                    return details ? { course: c, slotDetails: details } : null;
                                                }).filter(Boolean);

                                                const slotExams = currentSemesterSchedule.filter(c => {
                                                    if (!c.exam_date || !c.exam_shift || selectedWeek === 0) return false; 
                                                    const examDM = getExamDayMonth(c.exam_date);
                                                    return examDM === currentWeekDates[index] && isExamInShift(c.exam_shift, shift);
                                                });
                                                
                                                return (
                                                    <td key={`${shift}-${day}`} className={`border-r border-b border-gray-100 align-top p-1.5 h-[160px] transition-colors ${isTodayCol ? 'bg-[#F0F9FF]' : 'bg-white hover:bg-gray-50/30'}`}>
                                                        <div className="flex flex-col gap-2 w-full h-full">
                                                            {slotCourses.map(({course, slotDetails}: any) => {
                                                                const color = getColorForCourse(course.id);
                                                                return (
                                                                <div key={course.id} onClick={() => setSelectedCourseInfo({ course, details: slotDetails })} className={`border-l-4 ${color.border} ${color.bg} rounded-r-lg p-2.5 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 relative group w-full shrink-0`}>
                                                                    <button onClick={(e) => { e.stopPropagation(); removeFromSchedule(course.id); }} className="absolute top-1.5 right-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white/50 rounded p-0.5"><X size={14}/></button>
                                                                    <h4 className={`font-bold ${color.text} text-[11px] sm:text-xs leading-snug line-clamp-2 pr-4 mb-0.5`}>{course.subject_name}</h4>
                                                                    <div className={`text-[9px] ${color.text} opacity-80 font-medium mb-1.5 truncate`}>{course.course_code} • Đợt {course.phase || '1'}</div>
                                                                    
                                                                    <div className={`text-[10px] ${color.label} font-semibold flex items-center gap-1`}><MapPin size={10}/> P. {slotDetails.room}</div>
                                                                    <div className={`text-[10px] ${color.label} font-medium flex items-center gap-1 mt-0.5`}><Clock size={10}/> {getCourseTimeLabel(slotDetails.shift)}</div>
                                                                </div>
                                                                );
                                                            })}

                                                            {slotExams.map(exam => (
                                                                <div key={`exam-${exam.id}`} onClick={() => setSelectedCourseInfo({ course: exam })} className="border-l-4 border-l-red-500 bg-red-50 rounded-r-lg p-2.5 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 relative group w-full shrink-0">
                                                                    <div className="text-[9px] font-black text-red-600 uppercase mb-1 tracking-wider flex items-center gap-1 bg-red-100 w-fit px-1.5 py-0.5 rounded"><Zap size={10} className="fill-current"/> Lịch thi</div>
                                                                    <h4 className="font-bold text-red-900 text-[11px] sm:text-xs leading-snug line-clamp-2 mb-1">{exam.subject_name}</h4>
                                                                    <div className="text-[10px] text-red-700 font-bold flex items-center gap-1"><Clock size={10}/> {exam.exam_shift} {getExamTime(exam.exam_shift) ? `(${getExamTime(exam.exam_shift)})` : ''}</div>
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
                                    <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-xl border border-gray-200 shadow-sm min-h-full">
                                        {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map(d => (
                                            <div key={d} className="bg-[#f8fafc] text-center text-[11px] font-bold py-2.5 text-[#003375] uppercase border-b border-gray-200">{d}</div>
                                        ))}
                                        
                                        {renderMonthDays().map((date, idx) => {
                                            if (!date) return <div key={`empty-${idx}`} className="bg-gray-50/30 min-h-[90px]" />;
                                            
                                            const dayCourses = getCoursesForDate(date, mySchedule);
                                            const dayExams = getExamsForDate(date, mySchedule);
                                            const isToday = new Date().toDateString() === date.toDateString();
                                            
                                            return (
                                                <div key={date.toISOString()} className={`bg-white min-h-[90px] p-1.5 transition-colors hover:bg-gray-50/50 ${isToday ? 'bg-[#F0F9FF]' : ''}`}>
                                                    <div className={`text-[11px] font-bold text-center mb-1.5 ${isToday ? 'bg-[#003375] text-white rounded-full w-5 h-5 mx-auto flex items-center justify-center shadow-sm' : 'text-gray-600'}`}>
                                                        {date.getDate()}
                                                    </div>
                                                    <div className="flex flex-col gap-1 overflow-hidden px-0.5">
                                                        {dayCourses.map((item: any, i: number) => {
                                                            const color = getColorForCourse(item.course.id);
                                                            return (
                                                                <div key={i} onClick={() => setSelectedCourseInfo({course: item.course, details: item.details})} className={`text-[9px] px-1.5 py-1 rounded truncate cursor-pointer font-semibold ${color.bg} ${color.text} border-l-2 ${color.border} hover:opacity-80 transition-opacity`}>
                                                                    {item.course.subject_name}
                                                                </div>
                                                            );
                                                        })}
                                                        {dayExams.map((exam: any, i: number) => (
                                                            <div key={`exam-${i}`} onClick={() => setSelectedCourseInfo({course: exam})} className="text-[9px] px-1.5 py-1 rounded truncate cursor-pointer bg-red-50 text-red-700 border-l-2 border-l-red-500 font-bold hover:bg-red-100 flex items-center gap-1">
                                                                <Zap size={8}/> Thi: {exam.subject_name}
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
                    
                    {/* NÚT THÊM MÔN (FAB Nằm trong khung lịch) */}
                    <div className="absolute bottom-4 right-4 flex gap-2">
                        <button onClick={() => setIsMyScheduleModalOpen(true)} className="bg-white border border-gray-200 text-gray-700 hover:text-[#003375] hover:bg-gray-50 px-4 py-2.5 rounded-full font-bold text-sm shadow-lg flex items-center gap-2 transition-transform active:scale-95">
                            <List size={16}/> Đã lưu ({currentSemesterSchedule.length})
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL CHI TIẾT MÔN HỌC */}
        {selectedCourseInfo && (() => {
            const course = selectedCourseInfo.course;
            const details = selectedCourseInfo.details;
            let timeDisplayValue = '';
            if (details) {
                timeDisplayValue = [`Thứ ${details.day}`, getShiftDisplay(details.shift), getCourseTimeLabel(details.shift)].filter(Boolean).join('\n');
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

            return (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setSelectedCourseInfo(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-scaleIn border border-gray-100 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 relative bg-gray-50">
                            <button onClick={() => setSelectedCourseInfo(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-800 bg-white rounded-full p-1 shadow-sm border border-gray-200"><X size={16}/></button>
                            <h2 className="text-lg font-bold text-[#003375] pr-8 leading-tight">{course.subject_name}</h2>
                            <p className="text-gray-500 mt-1 text-sm font-medium">{course.course_code}</p>
                            {course.phase && <span className="mt-2 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 inline-block">Đợt {course.phase}</span>}
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="flex items-start gap-3">
                                <div className="bg-blue-50 p-2 rounded-lg text-blue-600"><Clock size={16} /></div>
                                <div>
                                    <p className="text-sm font-bold text-gray-900 whitespace-pre-line leading-snug">{timeDisplayValue}</p>
                                    <p className="text-xs text-gray-500 mt-1 font-medium">Tuần: {modalWeeks}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-orange-50 p-2 rounded-lg text-orange-600"><MapPin size={16} /></div>
                                <div>
                                    <p className="text-sm font-bold text-gray-900">Phòng {modalRoom}</p>
                                    <p className="text-xs text-gray-500 mt-1 font-medium">{course.campus || 'Cơ sở: Đang cập nhật'}</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-3">
                                <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600"><User size={16} /></div>
                                <div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Giảng viên</p>
                                    <p className="text-sm font-bold text-gray-900">{course.instructor || 'Đang cập nhật...'}</p>
                                </div>
                            </div>

                            {/* ✨ THÊM LỊCH THI VÀO ĐÂY ✨ */}
                            {(course.exam_date || course.exam_shift) && (
                                <div className="flex items-start gap-3">
                                    <div className="bg-purple-50 p-2 rounded-lg text-purple-600"><CalendarDays size={16} /></div>
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-0.5">Lịch thi dự kiến</p>
                                        <p className="text-sm font-bold text-gray-900">{course.exam_date || 'Đang cập nhật...'}</p>
                                        {course.exam_shift && (
                                            <p className="text-xs text-gray-500 mt-1 font-medium">Ca thi: {course.exam_shift} {getExamTime(course.exam_shift) ? `(${getExamTime(course.exam_shift)})` : ''}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                        </div>
                        <div className="p-4 bg-white border-t border-gray-100 flex gap-2">
                            <button onClick={() => { setReportData({ course_code: course.course_code, subject_name: course.subject_name, description: '' }); setIsReportModalOpen(true); setSelectedCourseInfo(null); }} className="px-3 py-2.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors" title="Báo lỗi thông tin">
                                <AlertTriangle size={18} />
                            </button>
                            {!currentSemesterSchedule.some(c => c.id === course.id) ? (
                                <button onClick={() => { addToSchedule(course); setSelectedCourseInfo(null); }} className="flex-1 py-2.5 rounded-lg bg-[#003375] text-white text-sm font-bold hover:bg-[#002855] transition-all shadow-md">Thêm vào Lịch</button>
                            ) : (
                                <>
                                    <button onClick={() => {
                                        const scheduleItem = currentSemesterSchedule.find(c => c.id === course.id);
                                        setStudentEditData(scheduleItem || course);
                                        setIsStudentEditModalOpen(true);
                                        setSelectedCourseInfo(null);
                                    }} className="px-3 py-2.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors" title="Sửa thông tin cá nhân">
                                        <Edit size={18} />
                                    </button>
                                    <button onClick={() => { removeFromSchedule(course.id); setSelectedCourseInfo(null); }} className="flex-1 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-sm font-bold hover:bg-red-100 transition-all">Xóa khỏi Lịch</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            );
        })()}

        {/* MODAL DANH SÁCH MÔN ĐÃ LƯU */}
        {isMyScheduleModalOpen && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" onClick={() => setIsMyScheduleModalOpen(false)}>
                <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scaleIn border border-gray-100 flex flex-col max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-gray-50 border-b border-gray-100 p-4 flex items-center justify-between shrink-0">
                        <h2 className="font-bold text-[#003375] text-base flex items-center gap-2"><List size={18}/> Môn học đã lưu ({currentSemesterSchedule.length})</h2>
                        <button onClick={() => setIsMyScheduleModalOpen(false)} className="text-gray-400 hover:text-gray-800 bg-white rounded-full p-1 shadow-sm border border-gray-200"><X size={16}/></button>
                    </div>
                    <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-2 bg-white">
                        {currentSemesterSchedule.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">
                                <Search size={40} className="mx-auto text-gray-200 mb-3"/>
                                <p className="font-medium text-sm">Chưa có môn học nào trong lịch.</p>
                            </div>
                        ) : (
                            currentSemesterSchedule.map(course => (
                                <div key={course.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between gap-3 hover:border-blue-300 transition-colors cursor-pointer" onClick={() => { setIsMyScheduleModalOpen(false); setSelectedCourseInfo({ course }); }}>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-gray-800 text-sm truncate">{course.subject_name}</h4>
                                        <p className="text-[10px] text-gray-500 mt-0.5 font-medium">{course.course_code} <span className="mx-1">•</span> Đợt {course.phase || '1'}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button onClick={(e) => { e.stopPropagation(); setStudentEditData(course); setIsStudentEditModalOpen(true); setIsMyScheduleModalOpen(false); }} className="text-gray-400 hover:text-blue-600 p-2 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100" title="Sửa lịch cá nhân"><Edit size={16}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); removeFromSchedule(course.id); }} className="text-gray-400 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors border border-transparent hover:border-red-100" title="Xóa môn khỏi lịch"><Trash2 size={16}/></button>
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
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" onClick={() => setIsReportModalOpen(false)}>
                <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-scaleIn border border-gray-100 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="p-4 flex items-center justify-between border-b border-gray-100 bg-red-50 text-red-700">
                        <h2 className="font-bold text-base flex items-center gap-2"><AlertTriangle size={18}/> Báo lỗi môn học</h2>
                        <button onClick={() => setIsReportModalOpen(false)} className="text-red-400 hover:text-red-800"><X size={20}/></button>
                    </div>
                    <form onSubmit={handleReportSubmit} className="p-5 space-y-4 bg-white">
                        <div><input required placeholder="Mã học phần (VD: ACC718_2521_L04)" value={reportData.course_code} onChange={e => setReportData({...reportData, course_code: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"/></div>
                        <div><input required placeholder="Tên môn học" value={reportData.subject_name} onChange={e => setReportData({...reportData, subject_name: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-colors"/></div>
                        <div><textarea required rows={3} placeholder="Chi tiết lỗi (VD: Đổi phòng, đổi giờ)..." value={reportData.description} onChange={e => setReportData({...reportData, description: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-red-500 focus:ring-1 focus:ring-red-500 resize-none transition-colors"></textarea></div>
                        <button type="submit" disabled={isSubmittingReport} className="w-full py-2.5 rounded-lg bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors shadow-md">{isSubmittingReport ? 'Đang gửi...' : 'Gửi báo cáo'}</button>
                    </form>
                </div>
            </div>
        )}

        {/* MODAL THÊM MÔN MỚI DÀNH CHO USER */}
        {isCreateCourseModalOpen && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" onClick={() => setIsCreateCourseModalOpen(false)}>
                <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-scaleIn border border-gray-100 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                    <div className="p-4 flex items-center justify-between border-b border-gray-100 bg-[#f8fafc]">
                        <h2 className="font-bold text-[#003375] text-base flex items-center gap-2"><BookPlus size={18}/> Yêu cầu thêm môn</h2>
                        <button onClick={() => setIsCreateCourseModalOpen(false)} className="text-gray-400 hover:text-gray-800"><X size={20}/></button>
                    </div>
                    <form onSubmit={handleCreateCourseSubmit} className="p-5 space-y-4 bg-white">
                        <div className="text-xs text-gray-500 mb-2">Hệ thống chưa có môn này? Gửi thông tin để Admin cập nhật nhé.</div>
                        <div><input type="text" required placeholder="Tên môn học *" value={newCourseData.subject_name} onChange={e => setNewCourseData({...newCourseData, subject_name: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-[#003375] focus:ring-1 focus:ring-[#003375] transition-colors"/></div>
                        <div><input type="text" required placeholder="Mã học phần *" value={newCourseData.course_code} onChange={e => setNewCourseData({...newCourseData, course_code: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-[#003375] focus:ring-1 focus:ring-[#003375] transition-colors"/></div>
                        <div><input type="text" placeholder="Giảng viên (Tùy chọn)" value={newCourseData.instructor} onChange={e => setNewCourseData({...newCourseData, instructor: e.target.value})} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm focus:border-[#003375] focus:ring-1 focus:ring-[#003375] transition-colors"/></div>
                        <button type="submit" disabled={isSubmittingCourse} className="w-full py-2.5 rounded-lg bg-[#003375] text-white text-sm font-bold hover:bg-[#002855] transition-colors shadow-md">{isSubmittingCourse ? 'Đang gửi...' : 'Gửi yêu cầu'}</button>
                    </form>
                </div>
            </div>
        )}

        {/* MODAL SINH VIÊN SỬA MÔN CÁ NHÂN */}
       {isStudentEditModalOpen && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 sm:p-6" onClick={() => setIsStudentEditModalOpen(false)}>
                <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl animate-scaleIn border border-gray-100 flex flex-col max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="p-4 sm:p-5 bg-[#003375] text-white flex justify-between items-center shrink-0">
                        <h2 className="font-bold text-lg flex items-center gap-2"><Edit size={18} /> Sửa thông tin môn học (Lịch cá nhân)</h2>
                        <button onClick={() => setIsStudentEditModalOpen(false)} className="hover:bg-white/20 p-1.5 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                    
                    <div className="p-5 overflow-y-auto custom-scrollbar flex-1 bg-gray-50">
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
                        </form>
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0 rounded-b-xl">
                        <button type="button" onClick={() => setIsStudentEditModalOpen(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors text-sm">Hủy bỏ</button>
                        <button type="submit" form="studentCourseForm" disabled={isSavingStudentCourse} className="px-6 py-2 bg-[#003375] hover:bg-[#003d99] text-white font-bold rounded-lg shadow-md transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                            {isSavingStudentCourse ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} Lưu Thông Tin Cá Nhân
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL ADMIN: THÊM / SỬA MÔN HỌC */}
        {isAdminEditModalOpen && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[99999] flex items-center justify-center p-4" onClick={() => setIsAdminEditModalOpen(false)}>
                <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl animate-scaleIn border border-gray-100 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                    <div className="p-4 border-b border-gray-100 bg-[#003375] text-white flex justify-between items-center rounded-t-xl shrink-0">
                        <h2 className="font-bold text-lg flex items-center gap-2"><Edit size={18} /> {adminEditData.id ? 'Sửa thông tin môn học' : 'Thêm môn học mới'}</h2>
                        <button onClick={() => setIsAdminEditModalOpen(false)} className="hover:bg-white/20 p-1.5 rounded-full transition-colors"><X size={20}/></button>
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
                        </form>
                    </div>
                    <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0 rounded-b-xl">
                        <button type="button" onClick={() => setIsAdminEditModalOpen(false)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors text-sm">Hủy bỏ</button>
                        <button type="submit" form="adminCourseForm" disabled={isSavingAdminCourse} className="px-6 py-2 bg-[#003375] hover:bg-[#002855] text-white font-bold rounded-lg shadow-md transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                            {isSavingAdminCourse ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle size={16}/>} Lưu Thông Tin
                        </button>
                    </div>
                </div>
            </div>
        )}

        {isPdfGuideOpen && (
            <ScheduleImportGuideModal 
                onClose={() => setIsPdfGuideOpen(false)} 
                onFileClick={() => fileInputRef.current?.click()} 
            />
        )}
    </div>
  );  
}