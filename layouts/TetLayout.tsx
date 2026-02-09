import React, { useCallback, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";

const TetLayout: React.FC = () => {
    // --- CẤU HÌNH HOA RƠI (Giữ nguyên từ RoleSelection) ---
    const particlesInit = useCallback(async (engine: Engine) => {
        await loadSlim(engine);
    }, []);

    const particlesOptions = useMemo((): ISourceOptions => ({
        fullScreen: { enable: false }, // Chỉ gói gọn trong layout này
        fpsLimit: 60, // Giảm xuống 60 cho nhẹ máy khi vào trang nội dung
        particles: {
            number: { value: 30, density: { enable: true, area: 800 } },
            color: { value: ["#FFC0CB", "#FF69B4", "#FFD700", "#FFFF00"] },
            shape: { type: "circle" },
            opacity: { value: { min: 0.3, max: 0.7 }, animation: { enable: true, speed: 0.5 } },
            size: { value: { min: 3, max: 5 } },
            move: { enable: true, speed: { min: 1, max: 2 }, direction: "bottom-right", random: true, straight: false, outModes: "out" },
            wobble: { enable: true, distance: 5, speed: 5 }
        },
        detectRetina: true,
    }), []);

    return (
        <div className="relative min-h-screen w-full overflow-x-hidden bg-[#FFF9F2] text-gray-800 font-sans">
            
            {/* 1. HIỆU ỨNG HOA RƠI (Lớp dưới cùng) */}
            <Particles
                id="tet-particles"
                init={particlesInit}
                options={particlesOptions}
                className="absolute inset-0 z-0 pointer-events-none"
            />

            {/* 2. BACKGROUND HÌNH CON NGỰA */}
            {/* Mobile: Ảnh dọc */}
            <div className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none md:hidden opacity-40"
                 style={{ backgroundImage: "url('/backgroundrole-mobile.png')" }}>
            </div>
            {/* Laptop: Ảnh ngang */}
            <div className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat pointer-events-none hidden md:block opacity-40"
                 style={{ backgroundImage: "url('/backgroundrole.png')" }}>
            </div>

            {/* 3. NỘI DUNG TRANG WEB (Dashboard, Cẩm nang...) */}
            {/* z-10 để nội dung nổi lên trên hình nền */}
            <div className="relative z-10 w-full min-h-screen">
                <Outlet />
            </div>
        </div>
    );
};

export default TetLayout;