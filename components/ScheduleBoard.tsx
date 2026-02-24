import React, { useState, useEffect } from 'react';
import { Search, Info, Plus, Calendar, MapPin, Clock, X, CheckCircle, Zap, Filter } from 'lucide-react';
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
}

const HK_START_DATE = new Date('2026-02-02T00:00:00');
const HOLIDAY_WEEKS = [2, 3, 4]; 

export default function ScheduleBoard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [mySchedule, setMySchedule] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  const [selectedSemester, setSelectedSemester] = useState<string>('HK2_2025_2026');
  const [selectedPhase, setSelectedPhase] = useState<string>('all');

  useEffect(() => {
    fetchCourses();     
  }, [searchTerm, selectedSemester, selectedPhase]);

  useEffect(() => {
    fetchMySchedule();  
  }, [selectedSemester]);

  const fetchCourses = async () => {
    setIsLoading(true);
    try {
      let query = supabase.from('course_schedules').select('*').eq('semester', selectedSemester).limit(50);
      
      if (selectedPhase !== 'all') {
        query = query.eq('phase', selectedPhase);
      }

      if (searchTerm) {
        query = query.or(`subject_name.ilike.%${searchTerm}%,course_code.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (!error && data) setAvailableCourses(data);
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
      const { data, error } = await supabase
        .from('user_schedules')
        .select(`
          course_id,
          semester,
          course_schedules (*)
        `)
        .eq('user_id', user.id)
        .eq('semester', selectedSemester); 

      if (!error && data) {
        const savedCourses = data.map((item: any) => item.course_schedules).filter(Boolean);
        setMySchedule(savedCourses);
      }
    } catch (error) {
      console.error("Lỗi kéo TKB:", error);
    }
  };

  const checkIsCourseInSlot = (course: Course, currentDay: number, currentWeek: number, currentShift: string) => {
    if (course.shift !== currentShift) return false;
    if (!course.day_of_week || !course.weeks) return false;

    const dayLines = course.day_of_week.toString().trim().split(/\r?\n/);
    const weekLines = course.weeks.toString().trim().split(/\r?\n/);

    if (dayLines.length > 1 && dayLines.length === weekLines.length) {
      for (let i = 0; i < dayLines.length; i++) {
        const daysInLine = dayLines[i].replace(/,/g, ' ').trim().split(/\s+/).map(Number);
        const weeksInLine = parseWeeks(weekLines[i]); 
        
        if (daysInLine.includes(currentDay) && weeksInLine.includes(currentWeek)) {
          return true; 
        }
      }
      return false;
    }

    const allDays = course.day_of_week.toString().replace(/,/g, ' ').replace(/\n/g, ' ').trim().split(/\s+/).map(Number);
    const safeWeeksString = course.weeks.toString().replace(/\n/g, ','); 
    const allWeeks = parseWeeks(safeWeeksString);

    return allDays.includes(currentDay) && allWeeks.includes(currentWeek);
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
    if (!user) {
      alert("⚠️ Vui lòng đăng nhập bằng tài khoản sinh viên HUB để tạo Thời khóa biểu!");
      return;
    }

    if (mySchedule.some(c => c.id === course.id)) {
      alert("Môn học này đã có sẵn trong thời khóa biểu của bạn!");
      return;
    }

    for (const existingCourse of mySchedule) {
      
      if (course.shift === existingCourse.shift) {
        let isConflict = false;
        let conflictDay = null;

        for (let w = 1; w <= 24; w++) {
          for (let d = 2; d <= 8; d++) {
            if (checkIsCourseInSlot(course, d, w, course.shift) && checkIsCourseInSlot(existingCourse, d, w, existingCourse.shift)) {
              isConflict = true;
              conflictDay = d;
              break;
            }
          }
          if (isConflict) break;
        }

        if (isConflict) {
          alert(`⛔ CẢNH BÁO TRÙNG LỊCH HỌC!\n\nMôn [${course.subject_name}] bị trùng giờ học với môn [${existingCourse.subject_name}].\n(Bị trùng lặp vào Thứ ${conflictDay} - Ca ${course.shift === 'S' ? 'Sáng' : 'Chiều'}).\n\nHệ thống đã chặn thao tác này. Vui lòng chọn Lớp học phần khác!`);
          return; 
        }
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
      const { error } = await supabase
        .from('user_schedules')
        .insert({
          user_id: user.id,
          course_id: course.id,
          semester: selectedSemester 
        });

      if (error) {
        console.error("Lỗi lưu DB:", error);
        alert("Lỗi khi lưu lên máy chủ. Đang hoàn tác...");
        setMySchedule(mySchedule.filter(c => c.id !== course.id));
      }
    } catch (err) {
       console.error("Lỗi mạng:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const removeFromSchedule = async (courseId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const backupSchedule = [...mySchedule];
    setMySchedule(mySchedule.filter(c => c.id !== courseId));

    try {
      const { error } = await supabase
        .from('user_schedules')
        .delete()
        .eq('user_id', user.id)
        .eq('course_id', courseId);

      if (error) {
        console.error("Lỗi xóa DB:", error);
        alert("Không thể xóa khỏi máy chủ. Vui lòng thử lại.");
        setMySchedule(backupSchedule); 
      }
    } catch (err) {
       console.error("Lỗi mạng:", err);
       setMySchedule(backupSchedule); 
    }
  };

  const getWeekDates = (weekNum: number) => {
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

  const currentWeekDates = getWeekDates(selectedWeek);

  return (
    <div className="relative z-20 flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
      
      {/* CỘT TRÁI: TÌM KIẾM & LỌC MÔN */}
      <div className="w-full lg:w-[35%] flex flex-col bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-blue-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-white/50 relative">
          <h2 className="text-xl font-bold text-[#003375] mb-4 flex items-center gap-2">
            <Search size={22} className="text-[#990000]" /> Tìm kiếm & Bộ lọc
          </h2>
          
          <div className="space-y-3">
            <div className="flex gap-2">
              <select 
                value={selectedSemester}
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-[#003375] outline-none text-sm font-bold text-[#003375] bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <option value="HK2_2025_2026">HK2 (2025 - 2026)</option>
                <option value="HK1_2025_2026">HK1 (2025 - 2026)</option>
              </select>

              <select 
                value={selectedPhase}
                onChange={(e) => setSelectedPhase(e.target.value)}
                className="w-1/3 px-3 py-2 rounded-xl border border-gray-200 focus:border-[#003375] outline-none text-sm font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <option value="all">Mọi đợt</option>
                <option value="1">Đợt 1</option>
                <option value="2">Đợt 2</option>
              </select>
            </div>

            <div className="relative">
              <input 
                type="text" 
                placeholder="Nhập tên môn hoặc mã lớp HP..." 
                className="w-full pl-11 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#003375] focus:ring-4 focus:ring-blue-500/10 outline-none text-sm font-medium transition-all bg-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search className="absolute left-4 top-3.5 text-gray-400" size={18} />
            </div>
          </div>

          {isSyncing && <p className="absolute top-5 right-5 text-[10px] text-blue-600 font-bold flex items-center gap-1 animate-pulse">Đang đồng bộ...</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/30">
          {isLoading ? (
            <p className="text-center text-gray-500 font-medium mt-10 animate-pulse">Đang tải dữ liệu môn học...</p>
          ) : availableCourses.length === 0 ? (
            <div className="text-center mt-10">
              <Filter size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Không tìm thấy môn học nào phù hợp.</p>
            </div>
          ) : (
            availableCourses.map((course) => (
              <div key={course.id} className="p-4 bg-white border-2 border-transparent hover:border-blue-200 rounded-xl shadow-sm hover:shadow-md transition-all group relative">
                
                {course.phase && (
                  <span className="absolute top-3 right-3 bg-gray-100 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-md">
                    Đợt {course.phase}
                  </span>
                )}

                <h3 className="font-bold text-[#003375] text-[15px] leading-tight mb-1 pr-12">{course.subject_name}</h3>
                <p className="text-xs text-[#990000] font-bold mb-3">{course.course_code}</p>
                
                <div className="grid grid-cols-2 gap-y-2 text-xs text-gray-600 mb-4 bg-gray-50 p-2 rounded-lg whitespace-pre-line">
                  <div className="flex items-start gap-1.5 font-medium"><Clock size={14} className="text-blue-500 mt-0.5"/> Thứ {course.day_of_week} ({course.shift})</div>
                  <div className="flex items-start gap-1.5 font-medium"><MapPin size={14} className="text-orange-500 mt-0.5"/> P. {course.room}</div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedCourse(course)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs font-bold transition-colors"
                  >
                    <Info size={16}/> Chi tiết
                  </button>
                  <button 
                    onClick={() => addToSchedule(course)}
                    disabled={isSyncing}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#003375] text-white hover:bg-[#002855] shadow-md shadow-blue-900/20 text-xs font-bold transition-all active:scale-95 disabled:opacity-50"
                  >
                    <Plus size={16}/> Thêm vào TKB
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* CỘT PHẢI: LƯỚI THỜI KHÓA BIỂU */}
      <div className="w-full lg:w-[65%] bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-blue-100 p-6 flex flex-col">
        
        <div className="mb-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-[#003375] flex items-center gap-2">
              <Calendar size={22} className="text-[#990000]" /> Lịch học theo tuần
            </h2>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-blue-50 text-[#003375] text-xs font-bold rounded-full border border-blue-200">
                {selectedSemester}
              </span>
              <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-200 shadow-sm">
                {mySchedule.length} môn đã lưu
              </span>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar" style={{ scrollbarWidth: 'none' }}>
            {Array.from({length: 24}, (_, i) => i + 1).map(w => (
              <button
                key={w}
                onClick={() => setSelectedWeek(w)}
                className={`min-w-[80px] py-1.5 rounded-lg text-sm font-bold transition-all border ${
                  selectedWeek === w 
                    ? 'bg-[#003375] text-white border-[#003375] shadow-md' 
                    : HOLIDAY_WEEKS.includes(w) 
                      ? 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100' 
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                Tuần {w}
              </button>
            ))}
          </div>
        </div>

        {HOLIDAY_WEEKS.includes(selectedWeek) && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-bold flex items-center justify-center gap-2 animate-pulse">
            <Zap size={18} /> Tuần {selectedWeek} là tuần Nghỉ Tết Nguyên Đán, không có lịch học!
          </div>
        )}
        
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-inner overflow-hidden flex flex-col">
          {/* ĐÃ SỬA: Giữ nguyên table-fixed để cố định bề ngang */}
          <table className="w-full min-w-[700px] border-collapse table-fixed flex-1">
            <thead>
              <tr>
                <th className="w-[70px] p-2 border-b-2 border-r border-gray-200 bg-[#f8fafc] text-xs font-bold text-gray-500 uppercase tracking-wider">Ca</th>
                {[2, 3, 4, 5, 6, 7, 8].map((day, index) => (
                  <th key={day} className="p-2 border-b-2 border-gray-200 bg-[#f8fafc] text-center">
                    <span className="block text-sm font-bold text-[#003375] uppercase mb-0.5">
                      Thứ {day === 8 ? 'CN' : day}
                    </span>
                    <span className="block text-[11px] font-semibold text-[#990000] bg-red-50 rounded-md mx-auto w-fit px-1.5 border border-red-100">
                      {currentWeekDates[index]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['S', 'C'].map((shift) => (
                <tr key={shift}>
                  <td className="p-2 border-r border-b border-gray-200 text-center bg-[#f8fafc] align-middle">
                    <span className={`block text-sm font-extrabold ${shift === 'S' ? 'text-orange-500' : 'text-indigo-500'}`}>
                      {shift === 'S' ? 'SÁNG' : 'CHIỀU'}
                    </span>
                    <span className="text-[10px] font-medium text-gray-500 mt-1 block leading-tight">
                      {shift === 'S' ? '07:00\n11:05' : '13:00\n17:05'}
                    </span>
                  </td>
                  
                  {[2, 3, 4, 5, 6, 7, 8].map((day, index) => {
                    const slotCourses = mySchedule.filter(c => checkIsCourseInSlot(c, day, selectedWeek, shift));

                    const slotExams = mySchedule.filter(c => {
                      if (!c.exam_date || !c.exam_shift) return false;
                      const examDM = getExamDayMonth(c.exam_date);
                      const isSameDate = examDM === currentWeekDates[index];
                      const isSameShift = isExamInShift(c.exam_shift, shift);
                      return isSameDate && isSameShift;
                    });
                    
                    return (
                      // ĐÃ SỬA: Bỏ cố định chiều cao, dùng h-auto và p-1.5 để co dãn tự động theo nội dung
                      <td key={`${shift}-${day}`} className="border border-gray-200 align-top bg-white hover:bg-gray-50/50 transition-colors p-1.5 h-auto">
                        {/* ĐÃ SỬA: Bỏ absolute, dùng flex column bình thường để dãn khung */}
                        <div className="flex flex-col gap-1.5">
                          
                          {/* Lịch Học */}
                          {slotCourses.map(course => (
                            <div 
                              key={course.id} 
                              onClick={() => setSelectedCourse(course)}
                              className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-2 relative group cursor-pointer shadow-sm hover:shadow-md hover:ring-2 hover:ring-blue-300 transition-all shrink-0"
                            >
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation(); 
                                  removeFromSchedule(course.id);
                                }}
                                className="absolute -top-2 -right-2 bg-white border border-red-200 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:scale-110 z-10 shadow-sm"
                                title="Xóa môn này"
                              >
                                <X size={14} strokeWidth={3}/>
                              </button>
                              <h4 className="font-bold text-[#003375] text-[11px] leading-snug mb-1.5 line-clamp-3">{course.subject_name}</h4>
                              <div className="flex flex-wrap gap-1">
                                <span className="inline-block px-1.5 py-0.5 bg-white border border-gray-200 text-gray-600 rounded text-[9px] font-bold">{course.course_code}</span>
                                <span className="inline-block px-1.5 py-0.5 bg-[#990000]/10 text-[#990000] rounded text-[9px] font-bold border border-[#990000]/20 whitespace-pre-line">P. {course.room}</span>
                              </div>
                            </div>
                          ))}

                          {/* Lịch Thi */}
                          {slotExams.map(exam => (
                            <div 
                            key={`exam-${exam.id}`} 
                            onClick={() => setSelectedCourse(exam)}
                            className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-300 rounded-lg p-2 relative group cursor-pointer shadow-sm hover:shadow-md hover:ring-2 hover:ring-orange-400 transition-all shrink-0"
                          >
                            <div className="flex items-center gap-1 mb-1 text-orange-600">
                              <Zap size={12} fill="currentColor" />
                              <span className="text-[10px] font-black uppercase tracking-wider">Lịch Thi</span>
                            </div>
                            <h4 className="font-bold text-orange-900 text-[11px] leading-snug mb-1.5 line-clamp-2">{exam.subject_name}</h4>
                            <span className="inline-block px-1.5 py-0.5 bg-white text-orange-700 rounded text-[9px] font-bold border border-orange-200">{exam.exam_shift}</span>
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

      {/* MODAL CHI TIẾT MÔN HỌC */}
      {selectedCourse && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={() => setSelectedCourse(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-scaleIn border border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#003375] to-[#00509d] p-5 text-white relative">
              <button onClick={() => setSelectedCourse(null)} className="absolute top-4 right-4 text-white/70 hover:text-white hover:rotate-90 transition-transform"><X size={24}/></button>
              
              {selectedCourse.phase && (
                <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-md mb-2 inline-block">Đợt {selectedCourse.phase}</span>
              )}
              
              <h2 className="text-lg font-bold pr-8 leading-tight">{selectedCourse.subject_name}</h2>
              <p className="text-blue-200 mt-1 text-sm font-medium">{selectedCourse.course_code}</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <DetailItem icon={<Clock />} label="Thời gian học" value={`Thứ ${selectedCourse.day_of_week}\nCa ${selectedCourse.shift === 'S' ? 'Sáng' : 'Chiều'}`} />
                <DetailItem icon={<MapPin />} label="Địa điểm" value={`Phòng ${selectedCourse.room}\n${selectedCourse.campus || 'Chưa cập nhật'}`} />
                <DetailItem icon={<Calendar />} label="Tuần học" value={`Tuần: ${selectedCourse.weeks}`} />
                <DetailItem icon={<CheckCircle />} label="Tín chỉ" value={`${selectedCourse.credits} tín chỉ`} />
              </div>

              <div className="p-4 bg-orange-50/80 border border-orange-100 rounded-xl mt-2">
                <h3 className="text-orange-800 font-bold text-sm mb-1.5 flex items-center gap-2">
                  <Zap size={16} /> Lịch thi dự kiến
                </h3>
                <p className="text-orange-700 text-sm font-medium">Ngày thi: {selectedCourse.exam_date || 'Chưa công bố'} • {selectedCourse.exam_shift || ''}</p>
              </div>

              <div className="pt-4 border-t border-gray-100 space-y-1.5 bg-gray-50 p-3 rounded-xl">
                <p className="text-sm text-gray-700"><span className="font-bold text-gray-900">Chương trình:</span> {selectedCourse.academic_program || 'Đại trà'}</p>
                <p className="text-sm text-gray-700"><span className="font-bold text-gray-900">Ngành:</span> {selectedCourse.major || 'Chung'} • Khóa {selectedCourse.cohort || '39'}</p>
              </div>
            </div>
            
            <div className="p-5 border-t border-gray-100 bg-white flex gap-3">
              <button onClick={() => setSelectedCourse(null)} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors">Đóng</button>
              
              {!mySchedule.some(c => c.id === selectedCourse.id) && (
                <button 
                  onClick={() => { addToSchedule(selectedCourse); setSelectedCourse(null); }}
                  disabled={isSyncing}
                  className="flex-1 py-2.5 rounded-xl bg-[#003375] text-white font-bold hover:bg-[#002855] shadow-lg shadow-blue-900/20 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Plus size={18} /> Thêm vào TKB
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="text-[#003375] bg-blue-50 p-2 rounded-lg mt-0.5">{React.cloneElement(icon as React.ReactElement, { size: 16, strokeWidth: 2.5 })}</div>
      <div>
        <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-gray-900 whitespace-pre-line leading-snug mt-0.5">{value}</p>
      </div>
    </div>
  );
}