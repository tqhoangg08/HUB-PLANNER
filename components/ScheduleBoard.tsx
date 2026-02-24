import React, { useState, useEffect } from 'react';
import { Search, Info, Plus, Calendar, MapPin, Clock, X, CheckCircle, Zap } from 'lucide-react';
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
}

const HK_START_DATE = new Date('2026-02-02T00:00:00');
const HOLIDAY_WEEKS = [2, 3, 4]; 

export default function ScheduleBoard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [mySchedule, setMySchedule] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false); // Trạng thái đang lưu lên DB
  const [selectedWeek, setSelectedWeek] = useState<number>(1);

  // 1. TẢI DỮ LIỆU KHI VỪA MỞ TRANG
  useEffect(() => {
    fetchCourses();     // Tải danh sách môn học chung
    fetchMySchedule();  // Tải TKB của riêng mình
  }, [searchTerm]);

  // Hàm tải danh sách môn từ Excel
  const fetchCourses = async () => {
    setIsLoading(true);
    try {
      let query = supabase.from('course_schedules').select('*').limit(30);
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

  // ĐÃ THÊM: Hàm kéo TKB từ Supabase về
  const fetchMySchedule = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // Nếu chưa đăng nhập thì thôi

    try {
      // Kéo từ bảng user_schedules, dùng cú pháp join (*) để lấy chi tiết môn học
      const { data, error } = await supabase
        .from('user_schedules')
        .select(`
          course_id,
          course_schedules (*)
        `)
        .eq('user_id', user.id);

      if (!error && data) {
        // Bóc tách dữ liệu trả về và đưa vào State
        const savedCourses = data.map((item: any) => item.course_schedules).filter(Boolean);
        setMySchedule(savedCourses);
      }
    } catch (error) {
      console.error("Lỗi kéo TKB:", error);
    }
  };

  // ĐÃ SỬA: Hàm Thêm môn học (Lưu lên DB)
  const addToSchedule = async (course: Course) => {
    // Kiểm tra đăng nhập
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("⚠️ Vui lòng đăng nhập bằng tài khoản sinh viên HUB để tạo Thời khóa biểu!");
      return;
    }

    if (mySchedule.some(c => c.id === course.id)) {
      alert("Môn học này đã có trong thời khóa biểu!");
      return;
    }

    // Cập nhật giao diện ngay lập tức cho mượt (Optimistic UI)
    setMySchedule([...mySchedule, course]);
    setIsSyncing(true);

    try {
      // Đẩy lên Supabase
      const { error } = await supabase
        .from('user_schedules')
        .insert({
          user_id: user.id,
          course_id: course.id,
          semester: 'HK2_2025_2026'
        });

      if (error) {
        console.error("Lỗi lưu DB:", error);
        alert("Lỗi khi lưu lên máy chủ. Đang hoàn tác...");
        // Nếu lỗi DB, thu hồi lại giao diện
        setMySchedule(mySchedule.filter(c => c.id !== course.id));
      }
    } catch (err) {
       console.error("Lỗi mạng:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // ĐÃ SỬA: Hàm Xóa môn học (Xóa trên DB)
  const removeFromSchedule = async (courseId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Lưu tạm TKB hiện tại để phòng trường hợp lỗi
    const backupSchedule = [...mySchedule];
    
    // Xóa khỏi giao diện ngay lập tức
    setMySchedule(mySchedule.filter(c => c.id !== courseId));

    try {
      // Xóa khỏi Supabase
      const { error } = await supabase
        .from('user_schedules')
        .delete()
        .eq('user_id', user.id)
        .eq('course_id', courseId);

      if (error) {
        console.error("Lỗi xóa DB:", error);
        alert("Không thể xóa khỏi máy chủ. Vui lòng thử lại.");
        setMySchedule(backupSchedule); // Hoàn tác
      }
    } catch (err) {
       console.error("Lỗi mạng:", err);
       setMySchedule(backupSchedule); // Hoàn tác
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

  const isExamInShift = (examShift: string, currentShift: string) => {
    if (!examShift) return false;
    const normalized = examShift.replace(/\s/g, '').toUpperCase();
    const morningShifts = ['CA1', 'CA2', 'CAS1', 'CAS2', 'CAS3', '1', '2', 'S1', 'S2', 'S3'];
    const afternoonShifts = ['CA3', 'CA4', 'CA5', 'CAC1', 'CAC2', 'CAC3', '3', '4', '5', 'C1', 'C2', 'C3'];

    if (currentShift === 'S') {
      return morningShifts.includes(normalized);
    } else {
      return afternoonShifts.includes(normalized);
    }
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
      
      {/* CỘT TRÁI: TÌM KIẾM & CHỌN MÔN */}
      <div className="w-full lg:w-[35%] flex flex-col bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-blue-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-white/50 relative">
          <h2 className="text-xl font-bold text-[#003375] mb-4 flex items-center gap-2">
            <Search size={22} className="text-[#990000]" /> Tìm kiếm môn học
          </h2>
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

          {/* Dòng chữ nhỏ báo hiệu đang lưu lên cloud */}
          {isSyncing && <p className="absolute top-5 right-5 text-[10px] text-blue-600 font-bold flex items-center gap-1 animate-pulse">Đang đồng bộ Cloud...</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/30">
          {isLoading ? (
            <p className="text-center text-gray-500 font-medium mt-10 animate-pulse">Đang tải dữ liệu môn học...</p>
          ) : availableCourses.length === 0 ? (
            <p className="text-center text-gray-500 font-medium mt-10">Không tìm thấy môn học nào.</p>
          ) : (
            availableCourses.map((course) => (
              <div key={course.id} className="p-4 bg-white border-2 border-transparent hover:border-blue-200 rounded-xl shadow-sm hover:shadow-md transition-all group">
                <h3 className="font-bold text-[#003375] text-[15px] leading-tight mb-1">{course.subject_name}</h3>
                <p className="text-xs text-[#990000] font-bold mb-3">{course.course_code}</p>
                
                <div className="grid grid-cols-2 gap-y-2 text-xs text-gray-600 mb-4 bg-gray-50 p-2 rounded-lg">
                  <div className="flex items-center gap-1.5 font-medium"><Clock size={14} className="text-blue-500"/> Thứ {course.day_of_week} ({course.shift})</div>
                  <div className="flex items-center gap-1.5 font-medium"><MapPin size={14} className="text-orange-500"/> P. {course.room}</div>
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
            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-200 shadow-sm">
              {mySchedule.length} môn đã lưu
            </span>
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
        
        <div className="flex-1 overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-inner relative">
          <table className="w-full min-w-[700px] border-collapse h-full">
            <thead>
              <tr>
                <th className="w-20 p-2 border-b-2 border-r border-gray-200 bg-[#f8fafc] text-xs font-bold text-gray-500 uppercase tracking-wider">Ca học</th>
                {[2, 3, 4, 5, 6, 7, 8].map((day, index) => (
                  <th key={day} className="p-2 border-b-2 border-gray-200 bg-[#f8fafc] text-center w-[14%]">
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
                  <td className="p-2 border-r border-b border-gray-200 text-center bg-[#f8fafc]">
                    <span className={`block text-sm font-extrabold ${shift === 'S' ? 'text-orange-500' : 'text-indigo-500'}`}>
                      {shift === 'S' ? 'SÁNG' : 'CHIỀU'}
                    </span>
                    <span className="text-[11px] font-medium text-gray-500 mt-1 block">
                      {shift === 'S' ? '07:00\n11:05' : '13:00\n17:05'}
                    </span>
                  </td>
                  
                  {[2, 3, 4, 5, 6, 7, 8].map((day, index) => {
                    const slotCourses = mySchedule.filter(c => {
                      const isSameDay = c.day_of_week?.includes(day.toString());
                      const isSameShift = c.shift === shift;
                      const isSameWeek = parseWeeks(c.weeks).includes(selectedWeek);
                      return isSameDay && isSameShift && isSameWeek;
                    });

                    const slotExams = mySchedule.filter(c => {
                      if (!c.exam_date || !c.exam_shift) return false;
                      const examDM = getExamDayMonth(c.exam_date);
                      const isSameDate = examDM === currentWeekDates[index];
                      const isSameShift = isExamInShift(c.exam_shift, shift);
                      return isSameDate && isSameShift;
                    });
                    
                    return (
                      <td key={`${shift}-${day}`} className="p-1.5 border border-gray-200 relative h-auto min-h-[100px] align-top bg-white hover:bg-gray-50/50 transition-colors">
                        
                        {/* Lịch Học */}
                        {slotCourses.map(course => (
                          <div 
                            key={course.id} 
                            onClick={() => setSelectedCourse(course)}
                            className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-2 mb-1.5 relative group cursor-pointer shadow-sm hover:shadow-md hover:ring-2 hover:ring-blue-300 transition-all"
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
                              <span className="inline-block px-1.5 py-0.5 bg-[#990000]/10 text-[#990000] rounded text-[9px] font-bold border border-[#990000]/20">P. {course.room}</span>
                            </div>
                          </div>
                        ))}

                        {/* Lịch Thi */}
                        {slotExams.map(exam => (
                           <div 
                           key={`exam-${exam.id}`} 
                           onClick={() => setSelectedCourse(exam)}
                           className="bg-gradient-to-br from-orange-50 to-red-50 border border-orange-300 rounded-lg p-2 mb-1.5 relative group cursor-pointer shadow-sm hover:shadow-md hover:ring-2 hover:ring-orange-400 transition-all"
                         >
                           <div className="flex items-center gap-1 mb-1 text-orange-600">
                             <Zap size={12} fill="currentColor" />
                             <span className="text-[10px] font-black uppercase tracking-wider">Lịch Thi</span>
                           </div>
                           <h4 className="font-bold text-orange-900 text-[11px] leading-snug mb-1.5 line-clamp-2">{exam.subject_name}</h4>
                           <span className="inline-block px-1.5 py-0.5 bg-white text-orange-700 rounded text-[9px] font-bold border border-orange-200">{exam.exam_shift}</span>
                         </div>
                        ))}

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
              <h2 className="text-lg font-bold pr-8 leading-tight">{selectedCourse.subject_name}</h2>
              <p className="text-blue-200 mt-1.5 text-sm font-medium">{selectedCourse.course_code}</p>
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