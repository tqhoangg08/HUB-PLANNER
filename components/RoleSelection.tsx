import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ShieldCheck, ArrowRight, Mail, ToggleLeft, ToggleRight } from 'lucide-react';
import { playClick } from '../utils/audio';

// --- 1. IMPORT THƯ VIỆN HIỆU ỨNG HOA RƠI ---
import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";

interface RoleSelectionProps {
    onSelect: (role: 'student' | 'admin' | 'school') => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect }) => {
    const navigate = useNavigate();
    const [isTetMode, setIsTetMode] = useState(true);

    // --- 2. CẤU HÌNH HIỆU ỨNG ---
    const particlesInit = useCallback(async (engine: Engine) => {
        await loadSlim(engine);
    }, []);

    const particlesOptions = useMemo((): ISourceOptions => ({
        fullScreen: { enable: false },
        fpsLimit: 120,
        particles: {
            number: { value: 40, density: { enable: true, area: 800 } },
            color: { value: ["#FFC0CB", "#FF69B4", "#FFD700", "#FFFF00"] },
            shape: { type: "circle" },
            opacity: {
                value: { min: 0.3, max: 0.8 },
                animation: { enable: true, speed: 0.5, minimumValue: 0.1, sync: false }
            },
            size: { value: { min: 3, max: 6 } },
            move: {
                enable: true,
                speed: { min: 1, max: 3 },
                direction: "bottom-right",
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
        <div className={`min-h-[100dvh] flex flex-col items-center justify-center relative overflow-hidden transition-colors duration-500 py-6 md:py-0
            ${isTetMode ? 'bg-[#FFF9F2]' : 'bg-gradient-to-br from-[#f8f9fa] to-[#e9ecef]'}`}
        >
            {/* Hiệu ứng hạt */}
            {isTetMode && (
                <Particles
                    id="tsparticles"
                    init={particlesInit}
                    options={particlesOptions}
                    className="absolute inset-0 z-1 pointer-events-none"
                />
            )}

            {/* --- BACKGROUND HÌNH ẢNH (LOGIC MỚI) --- */}
            
            {/* 1. Ảnh cho MOBILE (Hiện trên mobile, ẩn trên laptop) */}
            <div 
                className={`absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 pointer-events-none md:hidden
                ${isTetMode ? 'opacity-100' : 'opacity-0'}`}
                style={{ 
                    // 👇 Ảnh dọc cho điện thoại
                    backgroundImage: "url('/backgroundrole-mobile.png')" 
                }}
            ></div>

            {/* 2. Ảnh cho LAPTOP (Ẩn trên mobile, hiện trên laptop) */}
            <div 
                className={`absolute inset-0 z-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 pointer-events-none hidden md:block
                ${isTetMode ? 'opacity-100' : 'opacity-0'}`}
                style={{ 
                    // 👇 Ảnh ngang cũ cho laptop
                    backgroundImage: "url('/backgroundrole.png')" 
                }}
            ></div>


            {/* --- NỘI DUNG CHÍNH --- */}
            <div className="relative z-10 w-full max-w-6xl px-4 flex flex-col items-center">
                
                <div className="text-center mb-6 md:mb-10 animate-slideUp">
                    {!isTetMode && (
                        <div className="inline-flex items-center justify-center bg-white p-3 rounded-full shadow-md mb-4">
                            <img src="https://upload.wikimedia.org/wikipedia/vi/1/1a/Logo_HUB.png" alt="HUB Logo" className="h-12 w-12 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        </div>
                    )}

                    <h1 className={`text-3xl md:text-5xl font-black mb-2 tracking-tight transition-colors duration-300 drop-shadow-md
                        ${isTetMode ? 'text-[#990000]' : 'text-[#003375] uppercase'}`}
                    >
                        HUB Planner
                    </h1>
                    <p className={`text-base md:text-lg font-medium transition-colors duration-300 drop-shadow-sm
                        ${isTetMode ? 'text-gray-900' : 'text-gray-500'}`}
                    >
                        Chọn vai trò để tiếp tục
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 w-full animate-scaleIn delay-100">
                    {/* Card 1 */}
                    <RoleCard 
                        title="Ẩn danh" description="Truy cập bảng điểm, tính GPA, xem sự kiện rèn luyện và tìm đồ thất lạc." 
                        icon={<GraduationCap className="w-6 h-6 md:w-7 md:h-7"/>} iconBg="bg-blue-100 text-blue-700" 
                        actionText="Truy cập ngay" onClick={handleGuestClick} isTetMode={isTetMode} 
                    />
                    {/* Card 2 */}
                    <RoleCard 
                        title="Tài khoản HUB" description="Đăng nhập bằng tài khoản trường (@st.buh.edu.vn) để sử dụng đầy đủ tính năng." 
                        icon={<Mail className="w-6 h-6 md:w-7 md:h-7"/>} iconBg="bg-indigo-100 text-indigo-700" 
                        actionText="Đăng nhập" onClick={handleStudentClick} isTetMode={isTetMode} isHighlight={true} 
                    />
                    {/* Card 3 */}
                    <RoleCard 
                        title="Quản trị viên" description="Dành cho Cộng tác viên và quản lý hệ thống. Cần tài khoản cấp riêng." 
                        icon={<ShieldCheck className="w-6 h-6 md:w-7 md:h-7"/>} iconBg="bg-red-100 text-red-700" 
                        actionText="Đăng nhập" onClick={handleAdminClick} isTetMode={isTetMode} 
                    />
                </div>

                <div className="mt-8 md:mt-16 text-center space-y-3 max-w-2xl px-4 animate-fadeIn delay-200">
                    <div className={`text-[10px] md:text-[11px] rounded-lg p-3 shadow-sm backdrop-blur-md border transition-colors duration-300
                        ${isTetMode ? 'bg-white/40 border-red-100 text-gray-800 font-medium' : 'bg-white/60 border-gray-200 text-gray-500'}`}>
                        <span className="font-bold text-[#990000]">Lưu ý:</span> Đây là dự án hỗ trợ sinh viên được phát triển bởi nhóm sinh viên, <strong>KHÔNG PHẢI</strong> là website chính thức của Trường Đại học Ngân hàng TP.HCM (HUB).
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
    isTetMode: boolean;
    isHighlight?: boolean;
}

const RoleCard: React.FC<RoleCardProps> = ({ title, description, icon, iconBg, actionText, onClick, isTetMode, isHighlight }) => {
    return (
        <button 
            onClick={onClick}
            className={`
                group text-left cursor-pointer transition-all duration-300
                flex flex-col h-full 
                rounded-2xl md:rounded-[1.5rem] 
                p-5 md:p-6 
                border relative overflow-hidden
                ${isTetMode 
                    ? 'bg-white/40 backdrop-blur-md shadow-lg hover:shadow-xl border-red-100/50 hover:border-red-300' 
                    : 'bg-white shadow-md hover:shadow-xl border-transparent hover:border-[#003375]'
                }
                active:scale-95 md:hover:-translate-y-1
            `}
        >
            {!isTetMode && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-[#003375] rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>}

            <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center mb-3 md:mb-5 ${iconBg}`}>
                {icon}
            </div>

            <h3 className={`text-lg md:text-xl font-bold mb-1 md:mb-2 transition-colors ${isTetMode ? 'text-gray-900' : 'text-gray-800 group-hover:text-[#003375]'}`}>
                {title}
            </h3>

            <p className={`text-xs md:text-sm leading-relaxed mb-4 md:mb-6 flex-1 ${isTetMode ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                {description}
            </p>

            <div className={`flex items-center gap-2 font-bold text-xs md:text-sm mt-auto transition-transform group-hover:translate-x-1
                ${isTetMode ? 'text-[#c00000]' : 'text-[#003375]'}`}
            >
                {actionText} <ArrowRight size={16} />
            </div>
        </button>
    );
};

export default RoleSelection;