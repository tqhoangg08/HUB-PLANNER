import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, ShieldCheck, ArrowRight, Mail } from 'lucide-react';
import { playClick } from '../utils/audio';

interface RoleSelectionProps {
  onSelect: (role: 'student' | 'admin' | 'school') => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8f9fa] to-[#e9ecef] flex flex-col items-center justify-center p-4 animate-fadeIn">
      
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl animate-scaleIn delay-100">
        
        {/* Student Card */}
        <button
          onClick={() => { playClick(); onSelect('student'); navigate('/guest'); }}
          className="group relative cursor-pointer bg-white rounded-2xl p-8 shadow-md border-2 border-transparent hover:border-[#003375] hover:shadow-2xl transition-all duration-300 text-left flex flex-col items-center md:items-start"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-[#003375] rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#003375] transition-colors duration-300">
            <GraduationCap size={40} className="text-[#003375] group-hover:text-white transition-colors" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-[#003375]">
            Ẩn danh
          </h2>
          <p className="text-gray-500 mb-6 text-center md:text-left">
            Truy cập bảng điểm, tính GPA, xem sự kiện rèn luyện và tìm đồ thất lạc. Không cần đăng nhập. Không lưu dữ liệu.
          </p>
          
          <div className="mt-auto flex items-center gap-2 text-[#003375] font-bold group-hover:translate-x-2 transition-transform">
            Truy cập ngay <ArrowRight size={20} />
          </div>
        </button>

        {/* School Google Card */}
        <button
          onClick={() => { playClick(); onSelect('school'); navigate('/login?role=student'); }}
          className="group relative cursor-pointer bg-white rounded-2xl p-8 shadow-md border-2 border-transparent hover:border-[#0f172a] hover:shadow-2xl transition-all duration-300 text-left flex flex-col items-center md:items-start"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-slate-400 to-[#0f172a] rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-[#0f172a] transition-colors duration-300">
            <Mail size={40} className="text-[#0f172a] group-hover:text-white transition-colors" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-800 mb-2 group-hover:text-[#0f172a]">
            Tài khoản HUB
          </h2>
          <p className="text-gray-500 mb-6 text-center md:text-left">
            Đăng nhập bằng tài khoản trường (@st.buh.edu.vn) để sử dụng đầy đủ tính năng.
          </p>
          
          <div className="mt-auto flex items-center gap-2 text-[#0f172a] font-bold group-hover:translate-x-2 transition-transform">
            Đăng nhập <ArrowRight size={20} />
          </div>
        </button>

        {/* Admin Card */}
        <button
          onClick={() => { playClick(); onSelect('admin'); navigate('/login?role=admin'); }}
          className="group relative cursor-pointer bg-white rounded-2xl p-8 shadow-md border-2 border-transparent hover:border-[#990000] hover:shadow-2xl transition-all duration-300 text-left flex flex-col items-center md:items-start"
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
        <footer className="mt-8 text-center text-xs text-gray-500">
          <Link to="/privacy" className="hover:underline">Chính sách bảo mật</Link>
          <span className="mx-2">|</span>
          <Link to="/terms" className="hover:underline">Điều khoản sử dụng</Link>
        </footer>
      </div>
    </div>
  );
};
