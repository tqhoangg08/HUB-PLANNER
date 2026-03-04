import React, { useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GraduationCap, ShieldCheck, ArrowRight, Mail } from 'lucide-react';
import { playClick } from '../utils/audio';

// --- IMPORT THƯ VIỆN HIỆU ỨNG ---
import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";

interface RoleSelectionProps {
    onSelect: (role: 'student' | 'admin' | 'school') => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect }) => {
    const navigate = useNavigate();

    // --- CẤU HÌNH HIỆU ỨNG HẠT CHUẨN (MÀU XANH/TRẮNG) ---
    const particlesInit = useCallback(async (engine: Engine) => {
        await loadSlim(engine);
    }, []);

    const particlesOptions = useMemo((): ISourceOptions => ({
        fullScreen: { enable: false },
        fpsLimit: 120,
        particles: {
            number: { value: 30, density: { enable: true, area: 800 } },
            color: { value: ["#003375", "#3B82F6", "#93C5FD", "#BFDBFE"] },
            shape: { type: "circle" },
            opacity: {
                value: { min: 0.1, max: 0.5 },
                animation: { enable: true, speed: 0.5, minimumValue: 0.1, sync: false }
            },
            size: { value: { min: 2, max: 5 } },
            move: {
                enable: true,
                speed: { min: 0.5, max: 2 },
                direction: "top-right",
                straight: false,
                outModes: { default: "out" },
                random: true,
            },
            wobble: { enable: true, distance: 5, speed: 5 }
        },
        detectRetina: true,
    }), []);

    const handleGuestClick = () => { playClick(); onSelect('student'); navigate('/guest'); };
    const handleStudentClick = () => { playClick(); onSelect('school'); navigate('/login?role=student'); };
    const handleAdminClick = () => { playClick(); onSelect('admin'); navigate('/login?role=admin'); };

    return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden transition-colors duration-500 py-6 md:py-0 bg-[#F8FAFC]">
            
            {/* Hiệu ứng hạt */}
            <Particles
                id="tsparticles"
                init={particlesInit}
                options={particlesOptions}
                className="absolute inset-0 z-1 pointer-events-none"
            />

            {/* --- NỘI DUNG CHÍNH --- */}
            <div className="relative z-10 w-full max-w-6xl px-4 flex flex-col items-center">
                
                <div className="text-center mb-6 md:mb-10 animate-slideUp">
                    <div className="inline-flex items-center justify-center bg-white p-3 rounded-full shadow-md mb-4 border border-gray-100">
                        <img src="logo.png" alt="HUB Logo" className="h-12 w-12 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<div class="h-12 w-12 bg-[#003375] rounded-full flex items-center justify-center text-white font-bold text-sm">HUB</div>'; }} />
                    </div>

                    <h1 className="text-3xl md:text-5xl font-black mb-2 tracking-tight drop-shadow-sm text-[#003375] uppercase">
                        HUB Planner
                    </h1>
                    <p className="text-base md:text-lg font-medium drop-shadow-sm text-gray-500">
                        Chọn vai trò để tiếp tục
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 w-full animate-scaleIn delay-100">
                    <RoleCard 
                        title="Ẩn danh" description="Truy cập bảng điểm, tính GPA, xem sự kiện rèn luyện và tìm đồ thất lạc." 
                        icon={<GraduationCap className="w-6 h-6 md:w-7 md:h-7"/>} iconBg="bg-blue-50 text-blue-600" 
                        actionText="Truy cập ngay" onClick={handleGuestClick} 
                    />
                    <RoleCard 
                        title="Tài khoản HUB" description="Đăng nhập bằng tài khoản trường (@st.buh.edu.vn) để sử dụng đầy đủ tính năng." 
                        icon={<Mail className="w-6 h-6 md:w-7 md:h-7"/>} iconBg="bg-indigo-50 text-indigo-600" 
                        actionText="Đăng nhập" onClick={handleStudentClick} isHighlight={true} 
                    />
                    <RoleCard 
                        title="Quản trị viên" description="Dành cho Cộng tác viên và quản lý hệ thống. Cần tài khoản cấp riêng." 
                        icon={<ShieldCheck className="w-6 h-6 md:w-7 md:h-7"/>} iconBg="bg-red-50 text-red-600" 
                        actionText="Đăng nhập" onClick={handleAdminClick} 
                    />
                </div>

                <div className="mt-6 md:mt-10 text-center space-y-2 max-w-2xl px-4 animate-fadeIn delay-200">
                    <div className="text-[10px] md:text-[11px] rounded-lg p-3 shadow-sm backdrop-blur-md border bg-white/80 border-gray-200 text-gray-500">
                        <span className="font-bold text-[#003375]">Lưu ý:</span> Đây là dự án hỗ trợ sinh viên được phát triển bởi nhóm sinh viên, <strong>KHÔNG PHẢI</strong> là website chính thức của Trường Đại học Ngân hàng TP.HCM (HUB).
                    </div>

                    <div className="flex items-center justify-center gap-4 text-[10px] md:text-xs font-semibold tracking-wide text-gray-400">
                        <Link to="/privacy" className="hover:underline hover:text-gray-900 transition-colors">Chính sách bảo mật</Link>
                        <span>•</span>
                        <Link to="/terms" className="hover:underline hover:text-gray-900 transition-colors">Điều khoản sử dụng</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- COMPONENT CARD RIÊNG LẺ ---
interface RoleCardProps {
    title: string;
    description: string;
    icon: React.ReactNode;
    iconBg: string;
    actionText: string;
    onClick: () => void;
    isHighlight?: boolean;
}

const RoleCard: React.FC<RoleCardProps> = ({ title, description, icon, iconBg, actionText, onClick, isHighlight }) => {
    return (
        <button 
            onClick={onClick}
            className={`
                group text-left cursor-pointer transition-all duration-300
                flex flex-col h-full 
                rounded-2xl md:rounded-[1.5rem] 
                p-5 md:p-6 
                border relative overflow-hidden
                bg-white shadow-sm hover:shadow-xl border-gray-200 hover:border-[#003375]
                active:scale-95 md:hover:-translate-y-1
            `}
        >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-[#003375] rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>

            <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center mb-3 md:mb-5 ${iconBg}`}>
                {icon}
            </div>

            <h3 className="text-lg md:text-xl font-bold mb-1 md:mb-2 transition-colors text-gray-800 group-hover:text-[#003375]">
                {title}
            </h3>

            <p className="text-xs md:text-sm leading-relaxed mb-4 md:mb-6 flex-1 text-gray-500 font-medium">
                {description}
            </p>

            <div className="flex items-center gap-2 font-bold text-xs md:text-sm mt-auto transition-transform group-hover:translate-x-1 text-[#003375]">
                {actionText} <ArrowRight size={16} />
            </div>
        </button>
    );
};

export default RoleSelection;