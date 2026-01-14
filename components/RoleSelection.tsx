import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import { GraduationCap, ShieldCheck, ArrowRight, X, HardDrive, Loader2, LogIn } from 'lucide-react';
import { playClick } from '../utils/audio';

interface RoleSelectionProps {
  onSelect: (role: 'student' | 'admin') => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect }) => {
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleStudentClick = () => {
      playClick();
      setShowStudentModal(true);
  };

  const handleAnonymousLogin = () => {
      playClick();
      onSelect('student');
  };

  const handleGoogleLogin = async () => {
      playClick();
      if (!supabase) {
          alert("Chưa cấu hình kết nối Supabase.");
          return;
      }

      setIsLoggingIn(true);
      try {
          const { error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                  redirectTo: window.location.origin,
                  queryParams: {
                      access_type: 'offline',
                      prompt: 'consent',
                  },
              }
          });
          if (error) throw error;
      } catch (err: any) {
          alert("Lỗi đăng nhập: " + err.message);
          setIsLoggingIn(false);
      }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8f9fa] to-[#e9ecef] flex flex-col items-center justify-center p-4 animate-fadeIn relative">
      
      {/* Logo & Header */}
      <div className="text-center mb-12 animate-slideUp">
        <div className="inline-flex items-center justify-center bg-white p-4 rounded-full shadow-lg mb-6">
            <img 
                src="https://upload.wikimedia.org/wikipedia/vi/1/1a/Logo_HUB.png" 
                alt="HUB Logo" 
                className="h-16 w-16 object-contain"
                onError={(e) => {
                    e.currentTarget.style.display = 'none';
                }}
            />
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-[#003375] uppercase tracking-tight mb-2">
          HUB Planner
        </h1>
        <p className="text-gray-500 font-medium text-lg">
          Chọn vai trò để tiếp tục
        </p>
      </div>

      {/* Cards Container */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl animate-scaleIn delay-100">
        
        {/* Student Card */}
        <button
          onClick={handleStudentClick}
          className="group relative bg-white rounded-2xl p-8 shadow-md border-2 border-transparent hover:border-[#003375] hover:shadow-2xl transition-all duration-300 text-left flex flex-col items-center md:items-start"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-[#003375] rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#003375] transition-colors duration-300">
            <GraduationCap size={40} className="text-[#003375] group-hover:text-white transition-colors" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-[#003375]">
            Tôi là Sinh viên
          </h2>
          <p className="text-gray-500 mb-6 text-center md:text-left">
            Truy cập bảng điểm, tính GPA, xem sự kiện rèn luyện và tìm đồ thất lạc.
          </p>
          
          <div className="mt-auto flex items-center gap-2 text-[#003375] font-bold group-hover:translate-x-2 transition-transform">
            Truy cập ngay <ArrowRight size={20} />
          </div>
        </button>

        {/* Admin Card */}
        <button
          onClick={() => { playClick(); onSelect('admin'); }}
          className="group relative bg-white rounded-2xl p-8 shadow-md border-2 border-transparent hover:border-[#990000] hover:shadow-2xl transition-all duration-300 text-left flex flex-col items-center md:items-start"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-400 to-[#990000] rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#990000] transition-colors duration-300">
            <ShieldCheck size={40} className="text-[#990000] group-hover:text-white transition-colors" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-[#990000]">
            Quản trị viên
          </h2>
          <p className="text-gray-500 mb-6 text-center md:text-left">
            Dành cho Cộng tác viên và quản lý hệ thống. Cần tài khoản.
          </p>
          
          <div className="mt-auto flex items-center gap-2 text-[#990000] font-bold group-hover:translate-x-2 transition-transform">
            Đăng nhập <ArrowRight size={20} />
          </div>
        </button>

      </div>

      <div className="mt-16 text-center space-y-3 max-w-2xl px-4 animate-fadeIn delay-200">
        <p className="text-sm text-gray-400 font-medium">
          © 2026 HUB Planner - Hỗ trợ sinh viên HUB
        </p>
        <div className="text-[11px] text-gray-500 bg-white/60 border border-gray-200 rounded-lg p-3 shadow-sm backdrop-blur-sm">
            <span className="font-bold text-[#990000]">Lưu ý:</span> Đây là dự án hỗ trợ sinh viên được phát triển bởi nhóm sinh viên, <strong>KHÔNG PHẢI</strong> là website chính thức của Trường Đại học Ngân hàng TP.HCM (HUB).
        </div>
      </div>

      {/* --- STUDENT LOGIN METHOD MODAL --- */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => setShowStudentModal(false)}>
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-scaleIn" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-800 text-lg">Chọn phương thức truy cập</h3>
                    <button 
                        onClick={() => setShowStudentModal(false)}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Option 1: Anonymous */}
                    <button 
                        onClick={handleAnonymousLogin}
                        className="w-full p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all flex items-center gap-4 group text-left active:scale-[0.98]"
                    >
                        <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center group-hover:bg-blue-200 group-hover:text-[#003375] transition-colors shrink-0">
                            <HardDrive size={24} />
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-800 group-hover:text-[#003375]">Dùng Ẩn danh</h4>
                            <p className="text-xs text-gray-500">Dữ liệu được lưu trên thiết bị này (LocalStorage). Không cần đăng nhập.</p>
                        </div>
                    </button>

                    <div className="flex items-center gap-4">
                        <div className="h-[1px] flex-1 bg-gray-200"></div>
                        <span className="text-xs text-gray-400 font-medium">HOẶC</span>
                        <div className="h-[1px] flex-1 bg-gray-200"></div>
                    </div>

                    {/* Option 2: Google Login */}
                    <button 
                        onClick={handleGoogleLogin}
                        disabled={isLoggingIn}
                        className="w-full p-4 rounded-xl border border-gray-200 hover:border-red-200 hover:bg-red-50 transition-all flex items-center gap-4 group text-left active:scale-[0.98] relative overflow-hidden"
                    >
                        {isLoggingIn && (
                            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                                <Loader2 className="animate-spin text-[#003375]" size={24} />
                            </div>
                        )}
                        <div className="w-12 h-12 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm shrink-0">
                            {/* Google Icon SVG */}
                            <svg className="w-6 h-6" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-800 group-hover:text-red-700">Đăng nhập Gmail trường</h4>
                            <p className="text-xs text-gray-500">Đồng bộ dữ liệu trên nhiều thiết bị. Dùng Email @hub.edu.vn.</p>
                        </div>
                    </button>
                </div>
                
                {/* Footer Note */}
                <div className="px-6 py-4 bg-gray-50 text-[10px] text-gray-500 text-center border-t border-gray-100">
                    Dữ liệu ẩn danh sẽ mất nếu bạn xóa cache hoặc đổi trình duyệt. <br/>
                    Khuyên dùng <span className="font-bold text-[#003375]">Đăng nhập Gmail</span> để bảo toàn dữ liệu.
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
