import React from 'react';
import { GraduationCap, ShieldCheck, ArrowRight, User } from 'lucide-react';
import { playClick } from '../utils/audio';
import { GoogleLoginButton } from './GoogleLoginButton';

interface RoleSelectionProps {
  onSelect: (role: 'student' | 'admin') => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8f9fa] to-[#e9ecef] flex flex-col items-center justify-center p-4 animate-fadeIn">
      
      {/* Logo & Header */}
      <div className="text-center mb-10 animate-slideUp">
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
          Cổng thông tin & Tiện ích sinh viên
        </p>
      </div>

      {/* Main Action Area */}
      <div className="w-full max-w-md space-y-4 animate-scaleIn delay-100 mb-12">
          
          {/* Primary Login */}
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 text-center space-y-4">
                <h2 className="text-xl font-bold text-[#003375]">Dành cho Sinh viên</h2>
                <p className="text-sm text-gray-500">Đăng nhập để đồng bộ dữ liệu cá nhân</p>
                <GoogleLoginButton className="w-full text-base bg-blue-50 border-blue-100 hover:bg-blue-100 text-[#003375]" />
                
                <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-gray-400">Hoặc</span>
                    </div>
                </div>

                <button
                    onClick={() => { playClick(); onSelect('student'); }}
                    className="w-full py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 font-bold hover:border-[#003375] hover:text-[#003375] hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                >
                    <User size={18} />
                    Ẩn danh (Lưu cục bộ)
                </button>
          </div>

          {/* Admin Link */}
          <div className="text-center">
              <button 
                onClick={() => { playClick(); onSelect('admin'); }}
                className="text-sm text-gray-400 hover:text-[#990000] font-medium flex items-center justify-center gap-1 transition-colors mx-auto"
              >
                  <ShieldCheck size={14} /> Quản trị viên
              </button>
          </div>
      </div>

      <div className="text-center space-y-3 max-w-2xl px-4 animate-fadeIn delay-200">
        <p className="text-sm text-gray-400 font-medium">
          © 2026 HUB Planner - Hỗ trợ sinh viên HUB
        </p>
        <div className="text-[11px] text-gray-500 bg-white/60 border border-gray-200 rounded-lg p-3 shadow-sm backdrop-blur-sm">
            <span className="font-bold text-[#990000]">Lưu ý:</span> Đây là dự án hỗ trợ sinh viên được phát triển bởi nhóm sinh viên, <strong>KHÔNG PHẢI</strong> là website chính thức của Trường Đại học Ngân hàng TP.HCM (HUB).
        </div>
      </div>
    </div>
  );
};
