import React, { useState, useEffect } from 'react';
import { Search, Info, Plus, Calendar, MapPin, Clock, X, CheckCircle, Zap } from 'lucide-react';
import { supabase } from '../utils/supabase'; // CHÚ Ý: Đã đổi lại đường dẫn cho khớp với project của bạn
import { getShiftTime } from '../utils/scheduleLogic'; 

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

export default function ScheduleBoard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
  const [mySchedule, setMySchedule] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchCourses();
  }, [searchTerm]);

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
      console.error("Lỗi:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const addToSchedule = (course: Course) => {
    const isConflict = mySchedule.some(c => c.day_of_week === course.day_of_week && c.shift === course.shift);
    if (isConflict) {
      alert("⚠️ Trùng lịch! Bạn đã có môn học vào khung giờ này.");
      return;
    }
    setMySchedule([...mySchedule, course]);
  };

  const removeFromSchedule = (courseId: string) => {
    setMySchedule(mySchedule.filter(c => c.id !== courseId));
  };

  return (
    // ĐÃ SỬA: Thêm relative và z-20 để nổi hẳn lên trên hoa rơi và hình nền
    <div className="relative z-20 flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)]">
      
      {/* CỘT TRÁI: TÌM KIẾM & CHỌN MÔN */}
      {/* ĐÃ SỬA: Nền trắng 95% + kính mờ + viền xanh nhạt + đổ bóng */}
      <div className="w-full lg:w-[35%] flex flex-col bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-blue-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100 bg-white/50">
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
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#003375] text-white hover:bg-[#002855] shadow-md shadow-blue-900/20 text-xs font-bold transition-all active:scale-95"
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
      {/* ĐÃ SỬA: Nền trắng 95% + kính mờ + đổ bóng */}
      <div className="w-full lg:w-[65%] bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl border border-blue-100 p-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-[#003375] flex items-center gap-2">
            <Calendar size={22} className="text-[#990000]" /> Thời khóa biểu của tôi
          </h2>
          <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-200">
            {mySchedule.length} môn đã lưu
          </span>
        </div>
        
        <div className="flex-1 overflow-x-auto bg-white rounded-xl border border-gray-200 shadow-inner">
          <table className="w-full min-w-[700px] border-collapse h-full">
            <thead>
              <tr>
                <th className="w-20 p-3 border-b-2 border-r border-gray-200 bg-[#f8fafc] text-xs font-bold text-gray-500 uppercase tracking-wider">Ca học</th>
                {[2, 3, 4, 5, 6, 7, 8].map(day => (
                  <th key={day} className="p-3 border-b-2 border-gray-200 bg-[#f8fafc] text-sm font-bold text-[#003375] text-center w-[14%] uppercase">
                    Thứ {day === 8 ? 'CN' : day}
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
                  
                  {[2, 3, 4, 5, 6, 7, 8].map(day => {
                    const slotCourses = mySchedule.filter(c => c.day_of_week?.includes(day.toString()) && c.shift === shift);
                    
                    return (
                      <td key={`${shift}-${day}`} className="p-2 border border-gray-200 relative h-[180px] align-top bg-white hover:bg-gray-50/50 transition-colors">
                        {slotCourses.map(course => (
                          <div key={course.id} className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-2.5 mb-2 relative group cursor-pointer shadow-sm hover:shadow-md transition-all">
                            <button 
                              onClick={() => removeFromSchedule(course.id)}
                              className="absolute -top-2 -right-2 bg-white border border-red-200 text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:scale-110"
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
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CHI TIẾT MÔN HỌC (Giữ nguyên cấu trúc, làm đẹp CSS) */}
      {selectedCourse && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-scaleIn border border-gray-100">
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
              <button 
                onClick={() => { addToSchedule(selectedCourse); setSelectedCourse(null); }}
                className="flex-1 py-2.5 rounded-xl bg-[#003375] text-white font-bold hover:bg-[#002855] shadow-lg shadow-blue-900/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Plus size={18} /> Thêm vào TKB
              </button>
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