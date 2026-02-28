import React, { useState, useEffect, useRef } from 'react';
// ĐÃ THÊM: Import thêm icon Lock cho giao diện chưa đăng nhập
import { Search, Info, Plus, Calendar, MapPin, Clock, X, CheckCircle, Zap, Filter, User, AlertTriangle, Send, BookPlus, List, Trash2, CalendarDays, Lock } from 'lucide-react';
import { supabase } from '../utils/supabase'; 
import { parseWeeks } from '../utils/scheduleLogic'; 

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
}

const HK_START_DATE = new Date('2026-02-02T00:00:00');
const HOLIDAY_WEEKS = [2, 3, 4]; 

// =======================================================================
// HỆ THỐNG HELPER DỊCH "CA" VÀ "TIẾT"
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

// =======================================================================
// THUẬT TOÁN TÁCH DÒNG & LỌC GHI ĐÈ LỊCH (OVERRIDE LOGIC)
// =======================================================================
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

  if (targetWeek === 0) {
    for (let i = 0; i < Math.max(dayArr.length, shiftArr.length); i++) {
      const cDayStr = dayArr[i] !== undefined ? dayArr[i] : (dayArr[dayArr.length - 1] || "");
      const cShiftStr = shiftArr[i] !== undefined ? shiftArr[i] : (shiftArr[0] || "");
      const cRoomStr = roomArr[i] !== undefined ? roomArr[i] : (roomArr[0] || "");
      const cWeekStr = weekArr[i] !== undefined ? weekArr[i] : (weekArr[0] || "");

      const days = cDayStr.replace(/,/g, ' ').trim().split(/\s+/).map(Number);
      const shiftType = getMainShiftType(cShiftStr);

      if (days.includes(targetDay) && shiftType === targetShiftType) {
        return { day: targetDay, shift: cShiftStr, room: cRoomStr, weeks: cWeekStr };
      }
    }
    return null;
  }

  let matchingLines: { index: number, weekStr: string }[] = [];
  for (let i = 0; i < weekArr.length; i++) {
    if (parseWeeks(weekArr[i]).includes(targetWeek)) {
      matchingLines.push({ index: i, weekStr: weekArr[i] });
    }
  }

  let activeLines: number[] = [];
  for (let i = 0; i < matchingLines.length; i++) {
    let isOverridden = false;
    for (let j = i + 1; j < matchingLines.length; j++) {
      if (matchingLines[i].weekStr !== matchingLines[j].weekStr) {
        isOverridden = true;
        break;
      }
    }
    if (!isOverridden) activeLines.push(matchingLines[i].index);
  }

  for (let activeIdx of activeLines) {
    const cDayStr = dayArr[activeIdx] !== undefined ? dayArr[activeIdx] : (dayArr[dayArr.length - 1] || "");
    const cShiftStr = shiftArr[activeIdx] !== undefined ? shiftArr[activeIdx] : (shiftArr[0] || "");
    const cRoomStr = roomArr[activeIdx] !== undefined ? roomArr[activeIdx] : (roomArr[0] || "");
    const cWeekStr = weekArr[activeIdx];

    const days = cDayStr.replace(/,/g, ' ').trim().split(/\s+/).map(Number);
    const shiftType = getMainShiftType(cShiftStr);

    if (days.includes(targetDay) && shiftType === targetShiftType) {
      return { day: targetDay, shift: cShiftStr, room: cRoomStr, weeks: cWeekStr };
    }
  }

  return null;
};

// =======================================================================

export default function ScheduleBoard() {
  useEffect(() => {
    document.title = "Thời khóa biểu | HUB Planner";
  }, []);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

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

  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    if (scrollRef.current) {
        scrollRef.current.classList.add('cursor-grabbing');
        scrollRef.current.classList.remove('cursor-grab');
        startX.current = e.pageX - scrollRef.current.offsetLeft;
        scrollLeft.current = scrollRef.current.scrollLeft;
    }
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
    if (scrollRef.current) {
        scrollRef.current.classList.remove('cursor-grabbing');
        scrollRef.current.classList.add('cursor-grab');
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) {
        scrollRef.current.classList.remove('cursor-grabbing');
        scrollRef.current.classList.add('cursor-grab');
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5; 
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };
    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => { 
    if (isAuthenticated) fetchCourses(); 
  }, [searchTerm, selectedSemester, selectedPhase, isAuthenticated]);

  useEffect(() => { 
    if (isAuthenticated) fetchMySchedule(); 
  }, [isAuthenticated]);

  const fetchCourses = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('semester', selectedSemester);
      if (selectedPhase !== 'all') params.append('phase', selectedPhase);
      if (searchTerm) params.append('search', searchTerm);

      const res = await fetch(`/api/courses?${params.toString()}`);
      const json = await res.json();
      
      if (!res.ok) throw new Error(json.error || 'Lỗi tải danh sách môn');
      
      setAvailableCourses(json.data || []);
    } catch (error) { 
      console.error("Lỗi tải danh sách môn:", error); 
    } finally { 
      setIsLoading(false); 
    }
  };

  const fetchMySchedule = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; 
    setMySchedule([]);
    try {
      const { data, error } = await supabase.from('user_schedules').select(`course_id, semester, course_schedules (*)`).eq('user_id', user.id); 
      if (!error && data) {
        const savedCourses = data.map((item: any) => item.course_schedules).filter(Boolean);
        setMySchedule(savedCourses);
      }
    } catch (error) { console.error("Lỗi kéo TKB:", error); }
  };

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
    if (!user) { alert("⚠️ Vui lòng đăng nhập bằng tài khoản sinh viên HUB để tạo Thời khóa biểu!"); return; }
    if (mySchedule.some(c => c.id === course.id)) { alert("Môn học này đã có sẵn trong thời khóa biểu của bạn!"); return; }

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
      if (error) {
        alert("Lỗi khi lưu lên máy chủ. Đang hoàn tác...");
        setMySchedule(mySchedule.filter(c => c.id !== course.id));
      }
    } catch (err) { console.error("Lỗi mạng:", err); } 
    finally { setIsSyncing(false); }
  };

  const removeFromSchedule = async (courseId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const backupSchedule = [...mySchedule];
    setMySchedule(mySchedule.filter(c => c.id !== courseId));

    try {
      const { error } = await supabase.from('user_schedules').delete().eq('user_id', user.id).eq('course_id', courseId);
      if (error) {
        alert("Không thể xóa khỏi máy chủ. Vui lòng thử lại.");
        setMySchedule(backupSchedule); 
      }
    } catch (err) { setMySchedule(backupSchedule); }
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

  return (
    <div className="relative z-20 flex flex-col lg:flex-row gap-6 lg:h-[calc(100vh-140px)]">
      
      {/* CỘT TRÁI: TÌM KIẾM & LỌC MÔN */}
      <div className="w-full lg:w-[28%] flex flex-col bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-blue-100 overflow-hidden h-[500px] lg:h-full shrink-0">
        <div className="p-4 sm:p-5 border-b border-gray-100 bg-white/50 relative">
          <h2 className="text-xl font-bold text-[#003375] mb-4 flex items-center gap-2">
            <Search size={22} className="text-[#990000]" /> Tìm kiếm & Lọc
          </h2>
          
          <div className="space-y-3">
            <div className="flex gap-2">
              <select disabled={isAuthenticated === false} value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)} className={`flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-[#003375] outline-none text-sm font-bold text-[#003375] bg-gray-50 transition-colors ${isAuthenticated === false ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 cursor-pointer'}`}>
                <option value="HK2_2025_2026">HK2 (2025 - 2026)</option>
                <option value="HK1_2025_2026">HK1 (2025 - 2026)</option>
              </select>
              <select disabled={isAuthenticated === false} value={selectedPhase} onChange={(e) => setSelectedPhase(e.target.value)} className={`w-[35%] px-3 py-2 rounded-xl border border-gray-200 focus:border-[#003375] outline-none text-sm font-bold text-gray-700 bg-gray-50 transition-colors ${isAuthenticated === false ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100 cursor-pointer'}`}>
                <option value="all">Mọi đợt</option>
                <option value="1">Đợt 1</option>
                <option value="2">Đợt 2</option>
              </select>
            </div>

            <div className="relative">
              <input disabled={isAuthenticated === false} type="text" placeholder="Nhập tên môn, mã HP, giảng viên..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`w-full pl-11 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#003375] focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-medium transition-all ${isAuthenticated === false ? 'bg-gray-100 opacity-70 cursor-not-allowed' : 'bg-white'}`}/>
              <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
            </div>

            <div className="flex gap-2 pt-1">
              <button disabled={isAuthenticated === false} onClick={() => { setReportData({ course_code: '', subject_name: '', description: '' }); setIsReportModalOpen(true); }} className={`flex-1 flex items-center justify-center gap-1.5 p-2 rounded-lg text-[10px] sm:text-xs font-bold transition-colors ${isAuthenticated === false ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed' : 'bg-red-50 hover:bg-red-100 border border-red-100 text-red-600'}`}>
                <AlertTriangle size={14} /> Báo lỗi môn
              </button>
              <button disabled={isAuthenticated === false} onClick={() => setIsCreateCourseModalOpen(true)} className={`flex-1 flex items-center justify-center gap-1.5 p-2 rounded-lg text-[10px] sm:text-xs font-bold transition-colors ${isAuthenticated === false ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed' : 'bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700'}`}>
                <BookPlus size={14} /> Gửi yêu cầu môn mới
              </button>
            </div>
          </div>
          {isSyncing && <p className="absolute top-5 right-5 text-[10px] text-blue-600 font-bold flex items-center gap-1 animate-pulse">Đang đồng bộ...</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30 relative">
          {isAuthenticated === false ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-6 bg-white/60 backdrop-blur-sm animate-fadeIn">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 border border-gray-200 shadow-sm">
                <Lock size={28} className="text-gray-400" />
              </div>
              <h3 className="font-bold text-gray-800 text-base mb-2">Thông bảo mật</h3>
              <p className="text-[13px] text-gray-500 mb-6 leading-relaxed max-w-[280px]">
                Dữ liệu về học phần, phòng học và giảng viên là thông tin nội bộ. Vui lòng đăng nhập bằng tài khoản sinh viên để sử dụng tính năng tra cứu.
              </p>
            </div>
          ) : isLoading ? (
            <p className="text-center text-gray-500 font-medium mt-10 animate-pulse">Đang tải dữ liệu môn học...</p>
          ) : availableCourses.length === 0 ? (
            <div className="text-center mt-10 flex flex-col items-center px-4">
              <Filter size={40} className="text-gray-300 mb-3" />
              <p className="text-gray-600 font-bold text-sm mb-1">Không tìm thấy môn học!</p>
              <p className="text-gray-500 text-xs mb-5">Có thể hệ thống chưa cập nhật kịp môn học này. Bạn hãy gửi yêu cầu để Admin thêm vào nhé!</p>
              <button onClick={() => { setNewCourseData({...newCourseData, subject_name: searchTerm}); setIsCreateCourseModalOpen(true); }} className="px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-all flex items-center gap-2 active:scale-95 text-sm">
                <BookPlus size={18} /> Yêu cầu thêm môn ngay
              </button>
            </div>
          ) : (
            availableCourses.map((course) => {
              const displayDay = course.day_of_week ? course.day_of_week.replace(/\n/g, ' - ') : '';
              const displayRoom = course.room ? course.room.replace(/\n/g, ' / ') : '';
              const displayShift = getShiftDisplay(course.shift ? course.shift.split(/\s|\n/)[0] : '');

              return (
                <div key={course.id} className="p-4 bg-white border-2 border-transparent hover:border-blue-200 rounded-xl shadow-sm hover:shadow-md transition-all group relative">
                  {course.phase && <span className="absolute top-3 right-3 bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-md">Đợt {course.phase}</span>}
                  <h3 className="font-bold text-[#003375] text-[14px] leading-tight mb-1 pr-12">{course.subject_name}</h3>
                  <p className="text-xs text-[#990000] font-bold mb-3">{course.course_code}</p>
                  
                  <div className="grid grid-cols-2 gap-y-2 text-xs text-gray-600 mb-4 bg-gray-50 p-2 rounded-lg whitespace-pre-line">
                    <div className="flex items-start gap-1.5 font-medium"><Clock size={14} className="text-blue-500 mt-0.5 shrink-0"/> Thứ {displayDay}<br/>({displayShift})</div>
                    <div className="flex items-start gap-1.5 font-medium"><MapPin size={14} className="text-orange-500 mt-0.5 shrink-0"/> P. {displayRoom}</div>
                    <div className="col-span-2 pt-1.5 mt-0.5 border-t border-gray-200 flex items-start gap-1.5 font-bold text-emerald-700">
                      <User size={14} className="mt-0.5 shrink-0"/> {course.instructor || 'Đang cập nhật...'}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setSelectedCourseInfo({ course })} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-bold transition-colors">
                      <Info size={16}/> Chi tiết
                    </button>
                    <button onClick={() => addToSchedule(course)} disabled={isSyncing} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#003375] text-white hover:bg-[#002855] shadow-md shadow-blue-900/20 text-xs font-bold transition-all active:scale-95 disabled:opacity-50">
                      <Plus size={16}/> Thêm
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* CỘT PHẢI: KHUNG HIỂN THỊ TKB */}
      <div className="w-full lg:w-[72%] bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-blue-100 p-4 sm:p-6 flex flex-col overflow-hidden h-fit lg:h-full">
        <div className="mb-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-[#003375] flex items-center gap-2">
              <Calendar size={22} className="text-[#990000]" /> Lịch học cá nhân
            </h2>
            
            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setViewMode('week')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${viewMode === 'week' ? 'bg-white shadow-sm text-[#003375]' : 'text-gray-500 hover:text-gray-700'}`}>
                 Theo tuần
              </button>
              <button onClick={() => setViewMode('month')} className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${viewMode === 'month' ? 'bg-white shadow-sm text-[#003375]' : 'text-gray-500 hover:text-gray-700'}`}>
                 Theo tháng
              </button>
            </div>
          </div>
          
          <div className="flex justify-between items-center mb-2">
              {viewMode === 'week' ? (
                 <span className="px-3 py-1 bg-blue-50 text-[#003375] text-xs font-bold rounded-full border border-blue-200">{selectedSemester}</span>
              ) : (
                 <span className="px-3 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full border border-purple-200 flex items-center gap-1"><CalendarDays size={14}/> Năm 2026 (Tất cả học kỳ)</span>
              )}
              
              <button 
                onClick={() => setIsMyScheduleModalOpen(true)}
                className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-200 shadow-sm hover:bg-green-200 transition-colors flex items-center gap-1.5 active:scale-95 cursor-pointer"
                title="Xem danh sách môn đã thêm"
              >
                <List size={14} strokeWidth={2.5}/> Đã lưu {currentSemesterSchedule.length} môn
              </button>
          </div>
        </div>

        {/* ======================= HIỂN THỊ LỊCH TUẦN ======================= */}
        {viewMode === 'week' && (
           <>
              <div 
                  ref={scrollRef}
                  onMouseDown={handleMouseDown}
                  onMouseLeave={handleMouseLeave}
                  onMouseUp={handleMouseUp}
                  onMouseMove={handleMouseMove}
                  // 👇 BỎ pb-3 VÀ THÊM no-scrollbar, THÊM STYLE scrollbarWidth 👇
                  className="flex gap-2 overflow-x-auto mb-2 cursor-grab select-none no-scrollbar" 
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <button onClick={() => setSelectedWeek(0)} className={`min-w-[80px] py-1.5 rounded-lg text-sm font-bold transition-all border shrink-0 flex justify-center items-center gap-1 ${selectedWeek === 0 ? 'bg-[#003375] text-white border-[#003375] shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Tổng quát</button>
                {Array.from({length: 24}, (_, i) => i + 1).map(w => (
                  <button key={w} onClick={() => setSelectedWeek(w)} className={`min-w-[80px] py-1.5 rounded-lg text-sm font-bold transition-all border shrink-0 ${selectedWeek === w ? 'bg-[#003375] text-white border-[#003375] shadow-md' : HOLIDAY_WEEKS.includes(w) ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Tuần {w}</button>
                ))}
              </div>

              {HOLIDAY_WEEKS.includes(selectedWeek) && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-bold flex items-center justify-center gap-2 animate-pulse text-center">
                  <Zap size={18} className="shrink-0" /> Tuần {selectedWeek} là tuần Nghỉ Tết, không có lịch học!
                </div>
              )}
              
              <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-inner overflow-hidden flex flex-col relative">
                <div className="overflow-x-auto h-full w-full no-scrollbar">
                  <table className="w-full min-w-[700px] border-collapse table-fixed h-full">
                    <thead>
                      <tr>
                        <th className="w-[60px] sm:w-[70px] p-2 border-b-2 border-r border-gray-200 bg-[#f8fafc] text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-wider">Ca</th>
                        {[2, 3, 4, 5, 6, 7, 8].map((day, index) => (
                          <th key={day} className="p-2 border-b-2 border-gray-200 bg-[#f8fafc] text-center">
                            <span className="block text-xs sm:text-sm font-bold text-[#003375] uppercase mb-0.5">Thứ {day === 8 ? 'CN' : day}</span>
                            {selectedWeek !== 0 && (
                              <span className="block text-[10px] sm:text-[11px] font-semibold text-[#990000] bg-red-50 rounded-md mx-auto w-fit px-1.5 border border-red-100">{currentWeekDates[index]}</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {['S', 'C'].map((shift) => (
                        <tr key={shift}>
                          <td className="p-2 border-r border-b border-gray-200 text-center bg-[#f8fafc] align-middle">
                            <span className={`block text-xs sm:text-sm font-extrabold ${shift === 'S' ? 'text-orange-500' : 'text-indigo-500'}`}>{shift === 'S' ? 'SÁNG' : 'CHIỀU'}</span>
                            <span className="text-[9px] sm:text-[10px] font-medium text-gray-500 mt-1 block leading-tight">{shift === 'S' ? '07:00\n11:05' : '13:00\n17:05'}</span>
                          </td>
                          
                          {[2, 3, 4, 5, 6, 7, 8].map((day, index) => {
                            const slotCourses = currentSemesterSchedule.map(c => {
                              const details = getCourseDetailsForSlot(c, day, selectedWeek, shift);
                              return details ? { course: c, slotDetails: details } : null;
                            }).filter(Boolean);

                            const slotExams = currentSemesterSchedule.filter(c => {
                              if (!c.exam_date || !c.exam_shift) return false;
                              if (selectedWeek === 0) return false; 
                              const examDM = getExamDayMonth(c.exam_date);
                              return examDM === currentWeekDates[index] && isExamInShift(c.exam_shift, shift);
                            });
                            
                            return (
                              <td key={`${shift}-${day}`} className="border border-gray-200 align-top bg-white hover:bg-gray-50/50 transition-colors p-1 sm:p-1.5 h-auto">
                                <div className="flex flex-col gap-1.5 w-full">
                                  {slotCourses.map(({course, slotDetails}: any) => (
                                    <div key={course.id} onClick={() => setSelectedCourseInfo({ course, details: slotDetails })} className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-1.5 sm:p-2 relative group cursor-pointer shadow-sm hover:shadow-md hover:ring-2 hover:ring-blue-300 transition-all shrink-0 w-full">
                                      <button onClick={(e) => { e.stopPropagation(); removeFromSchedule(course.id); }} className="absolute -top-2 -right-2 bg-white border border-red-200 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 z-10 shadow-sm"><X size={14} strokeWidth={3}/></button>
                                      <h4 className="font-bold text-[#003375] text-[10px] sm:text-[11px] leading-snug mb-1.5 line-clamp-3 break-words">{course.subject_name}</h4>
                                      <div className="flex flex-col gap-1 w-full">
                                        <span className="block w-full break-words leading-tight px-1.5 py-0.5 bg-white border border-gray-200 text-gray-600 rounded text-[8px] sm:text-[9px] font-bold">{course.course_code}</span>
                                        <span className="block w-full break-words leading-tight px-1.5 py-0.5 bg-[#990000]/10 text-[#990000] rounded text-[8px] sm:text-[9px] font-bold border border-[#990000]/20">P. {slotDetails.room}</span>
                                      </div>
                                    </div>
                                  ))}

                                  {slotExams.map(exam => (
                                    <div key={`exam-${exam.id}`} onClick={() => setSelectedCourseInfo({ course: exam })} className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-300 rounded-lg p-1.5 sm:p-2 relative group cursor-pointer shadow-sm hover:shadow-md hover:ring-2 hover:ring-orange-400 transition-all shrink-0 w-full">
                                      <div className="flex items-center gap-1 mb-1 text-orange-600"><Zap size={10} fill="currentColor" className="shrink-0"/><span className="text-[9px] font-black uppercase tracking-wider truncate">Lịch Thi</span></div>
                                      <h4 className="font-bold text-orange-900 text-[10px] sm:text-[11px] leading-snug mb-1.5 line-clamp-2 break-words">{exam.subject_name}</h4>
                                      <div className="flex flex-col gap-1 w-full">
                                        <span className="block w-full break-words leading-tight px-1.5 py-0.5 bg-white text-orange-700 rounded text-[8px] sm:text-[9px] font-bold border border-orange-200">{exam.exam_shift}{getExamTime(exam.exam_shift) ? ` - ${getExamTime(exam.exam_shift)}` : ''}</span>
                                      </div>
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
                </div>
              </div>
           </>
        )}

        {/* ======================= HIỂN THỊ LỊCH THÁNG ======================= */}
        {viewMode === 'month' && (
           <>
              <div 
                  ref={scrollRef}
                  onMouseDown={handleMouseDown}
                  onMouseLeave={handleMouseLeave}
                  onMouseUp={handleMouseUp}
                  onMouseMove={handleMouseMove}
                  // 👇 BỎ pb-3 VÀ THÊM no-scrollbar, THÊM STYLE scrollbarWidth 👇
                  className="flex gap-2 overflow-x-auto mb-2 cursor-grab select-none no-scrollbar" 
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {Array.from({length: 12}, (_, i) => i).map(m => (
                  <button key={m} onClick={() => setSelectedMonthIndex(m)} className={`min-w-[80px] py-1.5 rounded-lg text-sm font-bold transition-all border shrink-0 ${selectedMonthIndex === m ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>Tháng {m + 1}</button>
                ))}
              </div>

              <div className="flex-1 rounded-xl border border-gray-200 shadow-inner overflow-hidden flex flex-col relative">
                 <div className="grid grid-cols-7 gap-px bg-gray-200 h-full overflow-y-auto custom-scrollbar">
                    {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'].map(d => (
                       <div key={d} className="bg-[#f8fafc] text-center text-[10px] sm:text-xs font-bold py-2 text-[#003375] uppercase tracking-wider border-b border-gray-200">{d}</div>
                    ))}
                    
                    {renderMonthDays().map((date, idx) => {
                       if (!date) return <div key={`empty-${idx}`} className="bg-gray-50/50 min-h-[90px] sm:min-h-[110px]" />;
                       
                       // Kéo TẤT CẢ các môn học và lịch thi trong năm đổ vào từng ngày
                       const dayCourses = getCoursesForDate(date, mySchedule);
                       const dayExams = getExamsForDate(date, mySchedule);
                       const isToday = new Date().toDateString() === date.toDateString();
                       
                       return (
                          <div key={date.toISOString()} className={`bg-white min-h-[90px] sm:min-h-[110px] p-1 sm:p-1.5 border-t border-gray-100 transition-colors hover:bg-gray-50/50 ${isToday ? 'bg-blue-50/30 ring-1 ring-inset ring-blue-300' : ''}`}>
                             <div className={`text-[10px] sm:text-xs font-bold text-center mb-1 ${isToday ? 'bg-blue-600 text-white rounded-full w-5 h-5 mx-auto flex items-center justify-center shadow-sm' : 'text-gray-500'}`}>
                               {date.getDate()}
                             </div>
                             <div className="flex flex-col gap-1 overflow-hidden">
                                {dayCourses.map((item: any, i: number) => (
                                   <div key={i} onClick={() => setSelectedCourseInfo({course: item.course, details: item.details})} className={`text-[9px] sm:text-[10px] p-1 rounded truncate cursor-pointer font-bold border transition-colors ${item.shiftType === 'S' ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'}`}>
                                      {item.course.subject_name.split(' ')[0]} - {getShiftDisplay(item.details.shift)}
                                   </div>
                                ))}
                                {dayExams.map((exam: any, i: number) => (
                                   <div key={`exam-${i}`} onClick={() => setSelectedCourseInfo({course: exam})} className="bg-red-100 text-red-700 text-[9px] sm:text-[10px] p-1 rounded truncate cursor-pointer font-black border border-red-200 hover:bg-red-200 flex items-center gap-1">
                                      <Zap size={8} /> Thi {exam.subject_name.split(' ')[0]}
                                   </div>
                                ))}
                             </div>
                          </div>
                       )
                    })}
                 </div>
              </div>
           </>
        )}
      </div>

      {/* MODAL CHI TIẾT MÔN */}
      {selectedCourseInfo && (() => {
        const course = selectedCourseInfo.course;
        const details = selectedCourseInfo.details;

        let timeDisplayValue = '';
        if (details) {
          timeDisplayValue = [
            `Thứ ${details.day}`,
            getShiftDisplay(details.shift),
            getCourseTimeLabel(details.shift)
          ].filter(Boolean).join('\n');
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 pt-24" onClick={() => setSelectedCourseInfo(null)}>
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-scaleIn border border-gray-100 flex flex-col max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-[#003375] to-[#00509d] p-4 sm:p-5 text-white relative shrink-0 rounded-t-2xl">
                <button onClick={() => setSelectedCourseInfo(null)} className="absolute top-4 right-4 text-white/70 hover:text-white hover:rotate-90 transition-transform"><X size={24}/></button>
                {course.phase && <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-md mb-2 inline-block">Đợt {course.phase}</span>}
                <h2 className="text-base sm:text-lg font-bold pr-8 leading-tight">{course.subject_name}</h2>
                <p className="text-blue-200 mt-1 text-xs sm:text-sm font-medium">{course.course_code}</p>
              </div>
              
              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <DetailItem icon={<Clock />} label="Thời gian học" value={timeDisplayValue} />
                  <DetailItem icon={<MapPin />} label="Địa điểm" value={`Phòng ${modalRoom}\n${course.campus || 'Chưa cập nhật'}`} />
                  <DetailItem icon={<Calendar />} label="Tuần học" value={`Tuần: ${modalWeeks}`} />
                  <DetailItem icon={<CheckCircle />} label="Tín chỉ" value={`${course.credits} tín chỉ`} />
                </div>

                <div className="mt-4 p-3 sm:p-4 bg-emerald-50/80 border border-emerald-100 rounded-xl flex items-center gap-3">
                  <div className="bg-white p-2 rounded-lg text-emerald-600 shadow-sm shrink-0"><User size={20} strokeWidth={2.5} /></div>
                  <div>
                    <p className="text-[10px] sm:text-[11px] text-emerald-600/80 font-bold uppercase tracking-wide mb-0.5">Giảng viên phụ trách</p>
                    <p className="text-xs sm:text-sm font-bold text-emerald-900">{course.instructor || 'Đang cập nhật...'}</p>
                  </div>
                </div>

                <div className="p-3 sm:p-4 bg-orange-50/80 border border-orange-100 rounded-xl mt-2">
                  <h3 className="text-orange-800 font-bold text-xs sm:text-sm mb-1.5 flex items-center gap-2"><Zap size={16} /> Lịch thi dự kiến</h3>
                  <p className="text-orange-700 text-xs sm:text-sm font-medium">Ngày thi: {course.exam_date || 'Chưa công bố'} • {course.exam_shift || ''}{course.exam_shift && getExamTime(course.exam_shift) ? ` - ${getExamTime(course.exam_shift)}` : ''}</p>
                </div>

                {/* NÚT BẤM BÁO CÁO NHANH TỪ MODAL */}
                <button 
                  onClick={() => {
                    setReportData({ course_code: course.course_code, subject_name: course.subject_name, description: '' });
                    setIsReportModalOpen(true);
                    setSelectedCourseInfo(null);
                  }}
                  className="w-full text-center mt-2 text-[11px] sm:text-xs text-red-500 hover:text-red-700 hover:underline font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <AlertTriangle size={14} /> Báo cáo nếu môn học này sai thông tin
                </button>
              </div>
              
              <div className="p-4 sm:p-5 border-t border-gray-100 bg-white flex gap-3 shrink-0 rounded-b-2xl">
                <button onClick={() => setSelectedCourseInfo(null)} className="flex-1 py-2 sm:py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 text-sm sm:text-base font-bold hover:bg-gray-50 transition-colors">Đóng</button>
                {!currentSemesterSchedule.some(c => c.id === course.id) && (
                  <button onClick={() => { addToSchedule(course); setSelectedCourseInfo(null); }} disabled={isSyncing} className="flex-1 py-2 sm:py-2.5 rounded-xl bg-[#003375] text-white text-sm sm:text-base font-bold hover:bg-[#002855] shadow-lg transition-all active:scale-95 flex justify-center gap-2"><Plus size={18} /> Thêm vào TKB</button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL DANH SÁCH MÔN */}
      {isMyScheduleModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 pt-24" onClick={() => setIsMyScheduleModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-scaleIn border border-gray-100 flex flex-col max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#003375] to-blue-700 p-4 text-white flex items-center gap-2 justify-between rounded-t-2xl shrink-0">
              <div className="flex items-center gap-2">
                <List size={20} strokeWidth={2.5} />
                <h2 className="font-bold text-lg">Môn học đã đăng ký ({currentSemesterSchedule.length})</h2>
              </div>
              <button onClick={() => setIsMyScheduleModalOpen(false)} className="text-white/70 hover:text-white transition-colors"><X size={22}/></button>
            </div>

            <div className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3 bg-gray-50/50 rounded-b-2xl">
              {currentSemesterSchedule.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Filter size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="font-medium text-sm">Chưa có môn học nào trong Thời khóa biểu.</p>
                </div>
              ) : (
                currentSemesterSchedule.map(course => (
                  <div key={course.id} className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between gap-3 hover:border-blue-300 transition-colors group">
                    <div className="flex-1 min-w-0">
                      {course.phase && <span className="bg-blue-50 text-blue-700 text-[9px] font-bold px-1.5 py-0.5 rounded mr-2 align-middle">Đợt {course.phase}</span>}
                      <h4 className="font-bold text-[#003375] text-sm truncate inline align-middle">{course.subject_name}</h4>
                      <p className="text-xs text-[#990000] font-bold mt-1">{course.course_code}</p>
                      <p className="text-[11px] text-gray-500 font-medium mt-1.5 flex items-center gap-1.5"><User size={12} className="text-gray-400"/> {course.instructor || 'Chưa cập nhật'}</p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setSelectedCourseInfo({ course }); setIsMyScheduleModalOpen(false); }} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-bold hover:bg-blue-100 flex items-center justify-center gap-1.5 border border-blue-100 transition-colors"><Info size={14} strokeWidth={2.5}/> Chi tiết</button>
                      <button onClick={() => removeFromSchedule(course.id)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[11px] font-bold hover:bg-red-100 flex items-center justify-center gap-1.5 border border-red-100 transition-colors"><Trash2 size={14} strokeWidth={2.5}/> Xóa môn</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL BÁO CÁO LỖI */}
      {isReportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 pt-24" onClick={() => setIsReportModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scaleIn border border-gray-100 overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-red-600 to-red-500 p-4 text-white flex items-center gap-2 justify-between shrink-0">
              <div className="flex items-center gap-2"><AlertTriangle size={20} /><h2 className="font-bold text-lg">Báo cáo sai sót</h2></div>
              <button onClick={() => setIsReportModalOpen(false)} className="text-white/70 hover:text-white"><X size={20}/></button>
            </div>
            <form onSubmit={handleReportSubmit} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Mã học phần *</label>
                <input required placeholder="VD: ACC718_2521_L04" value={reportData.course_code} onChange={e => setReportData({...reportData, course_code: e.target.value})} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Tên môn học *</label>
                <input required placeholder="VD: Kế toán thuế" value={reportData.subject_name} onChange={e => setReportData({...reportData, subject_name: e.target.value})} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Chi tiết sai sót *</label>
                <textarea required rows={3} placeholder="VD: Môn này phòng học đổi thành B1.101 rồi Admin ơi..." value={reportData.description} onChange={e => setReportData({...reportData, description: e.target.value})} className="w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm"></textarea>
              </div>
              <button type="submit" disabled={isSubmittingReport} className="w-full py-2.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 shadow-lg flex justify-center gap-2">{isSubmittingReport ? 'Đang gửi...' : <><Send size={16} /> Gửi báo cáo</>}</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TẠO MÔN HỌC MỚI */}
      {isCreateCourseModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4 pt-24" onClick={() => setIsCreateCourseModalOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scaleIn border border-gray-100 overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-4 text-white flex items-center gap-2 justify-between shrink-0">
              <div className="flex items-center gap-2"><BookPlus size={20} /><h2 className="font-bold text-lg">Yêu cầu thêm môn học</h2></div>
              <button onClick={() => setIsCreateCourseModalOpen(false)} className="text-white/70 hover:text-white"><X size={20}/></button>
            </div>
            <form onSubmit={handleCreateCourseSubmit} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-xs text-emerald-700 mb-2">Môn học bạn cần chưa có trên hệ thống? Hãy gửi thông tin bên dưới để Admin kiểm tra và cập nhật vào Database nhé!</div>
              <div><label className="block text-xs font-bold text-gray-700 mb-1">Tên môn học *</label><input type="text" required placeholder="VD: Toán cao cấp 2" value={newCourseData.subject_name} onChange={e => setNewCourseData({...newCourseData, subject_name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none text-sm font-medium"/></div>
              <div><label className="block text-xs font-bold text-gray-700 mb-1">Mã học phần *</label><input type="text" required placeholder="VD: AMA302_252_D08 hoặc D08" value={newCourseData.course_code} onChange={e => setNewCourseData({...newCourseData, course_code: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none text-sm font-medium"/></div>
              <div><label className="block text-xs font-bold text-gray-700 mb-1">Tên giảng viên (Nếu biết)</label><input type="text" placeholder="VD: Nguyễn Ngọc Giang" value={newCourseData.instructor} onChange={e => setNewCourseData({...newCourseData, instructor: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-xl outline-none text-sm font-medium"/></div>
              <div className="pt-2 flex gap-3"><button type="button" onClick={() => setIsCreateCourseModalOpen(false)} className="flex-1 py-2.5 rounded-xl border text-gray-600 text-sm font-bold">Hủy</button><button type="submit" disabled={isSubmittingCourse} className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold flex justify-center gap-2">{isSubmittingCourse ? 'Đang gửi...' : <><Send size={16} /> Gửi yêu cầu</>}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex gap-2 sm:gap-3 items-start">
      <div className="text-[#003375] bg-blue-50 p-1.5 sm:p-2 rounded-lg mt-0.5">{React.cloneElement(icon as React.ReactElement, { size: 16, strokeWidth: 2.5 })}</div>
      <div>
        <p className="text-[10px] sm:text-[11px] text-gray-500 font-bold uppercase tracking-wide">{label}</p>
        <p className="text-xs sm:text-sm font-semibold text-gray-900 whitespace-pre-line leading-snug mt-0.5">{value}</p>
      </div>
    </div>
  );
}