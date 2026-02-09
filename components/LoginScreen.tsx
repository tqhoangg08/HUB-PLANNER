import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { User, Key, ArrowLeft, Loader2, Shield, AlertCircle } from 'lucide-react';
import { playClick } from '../utils/audio';

// --- Imports cho hiệu ứng hạt (Particles) ---
import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";

const SCHOOL_DOMAIN = 'st.buh.edu.vn';

export const LoginScreen: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const role = searchParams.get('role');
    const isAdmin = role === 'admin';
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- Cấu hình hiệu ứng hoa rơi ---
    const particlesInit = useCallback(async (engine: Engine) => {
        await loadSlim(engine);
    }, []);

    const particlesOptions = useMemo((): ISourceOptions => ({
        fullScreen: { enable: false },
        fpsLimit: 120,
        particles: {
            number: { value: 30, density: { enable: true, area: 800 } },
            color: { value: ["#FFC0CB", "#FF69B4", "#FFD700", "#FFFF00"] },
            shape: { type: "circle" },
            opacity: {
                value: { min: 0.3, max: 0.8 },
                animation: { enable: true, speed: 0.5, minimumValue: 0.1, sync: false }
            },
            size: { value: { min: 3, max: 5 } },
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

    const titleContent = useMemo(() => {
        if (!isAdmin) {
            return {
                title: 'Đăng nhập HUB',
                subtitle: `Chỉ chấp nhận tài khoản @${SCHOOL_DOMAIN}`,
            };
        }
        return {
            title: 'Cổng Quản Trị (Admin)',
            subtitle: 'Đăng nhập để quản lý hệ thống',
        };
    }, [isAdmin]);

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) {
            const message = "Chưa cấu hình kết nối Database.";
            setError(message);
            alert(message);
            return;
        }

        setLoading(true);
        setError(null);
        playClick();

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError(error.message);
            alert(error.message);
        }

        setLoading(false);

        if (!error) {
            navigate('/');
        }
    };

    const handleGoogleLogin = async () => {
        if (!supabase) {
            setError("Chưa cấu hình kết nối Database.");
            return;
        }

        setLoading(true);
        setError(null);
        playClick();

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
                queryParams: {
                    hd: SCHOOL_DOMAIN,
                    prompt: 'select_account',
                },
            },
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full relative overflow-hidden flex items-center justify-center p-4">
            {/* 1. Hiệu ứng hạt */}
            <Particles
                id="tsparticles-login"
                init={particlesInit}
                options={particlesOptions}
                className="absolute inset-0 z-1 pointer-events-none"
            />

            {/* 2. Ảnh nền Mobile */}
            <div 
                className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat md:hidden"
                style={{ backgroundImage: "url('/backgroundrole-mobile.png')" }}
            />

            {/* 3. Ảnh nền Laptop */}
            <div 
                className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat hidden md:block"
                style={{ backgroundImage: "url('/backgroundrole.png')" }}
            />
            
            {/* Lớp phủ tối (Overlay) - ĐÃ BỎ BLUR VÀ GIẢM ĐỘ PHỦ TRẮNG */}
            <div className="fixed inset-0 z-0 bg-white/10" />

            {/* Nút quay lại */}
            <button
                onClick={() => { playClick(); navigate('/'); }}
                className="absolute top-6 left-6 flex items-center gap-2 text-[#990000] hover:text-red-700 font-bold transition-colors z-30 bg-white/60 p-2 rounded-xl backdrop-blur-sm shadow-sm"
            >
                <ArrowLeft size={20} /> <span className="hidden sm:inline">Quay lại</span>
            </button>

            {/* Card đăng nhập */}
            <div className="relative z-30 bg-white/80 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-white/60 animate-scaleIn">
                {/* Header Gradient Đỏ */}
                <div className="bg-gradient-to-r from-[#D32F2F] to-[#FF5722] p-6 text-center relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm border border-white/30 shadow-inner">
                            <Shield className="text-yellow-300 drop-shadow-sm" size={32} />
                        </div>
                        <h2 className="text-2xl font-bold text-white drop-shadow-md">{titleContent.title}</h2>
                        <p className="text-red-100 text-sm mt-1">{titleContent.subtitle}</p>
                    </div>
                </div>

                <div className="p-8 space-y-6">
                    {error && (
                        <div className="bg-red-50/90 text-red-700 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-200 animate-shake">
                            <AlertCircle size={16} className="shrink-0" /> {error}
                        </div>
                    )}

                    {isAdmin ? (
                        <form onSubmit={handleAdminLogin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-800 mb-1">Email</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500" size={18} />
                                    <input
                                        type="email" required
                                        className="w-full pl-10 pr-4 py-2.5 bg-white/60 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all placeholder-gray-500"
                                        placeholder="name@hub.edu.vn"
                                        value={email} onChange={e => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-800 mb-1">Mật khẩu</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500" size={18} />
                                    <input
                                        type="password" required
                                        className="w-full pl-10 pr-4 py-2.5 bg-white/60 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all placeholder-gray-500"
                                        placeholder="••••••••"
                                        value={password} onChange={e => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-[#D32F2F] to-[#C2185B] text-white font-bold py-3 rounded-lg hover:from-[#B71C1C] hover:to-[#AD1457] transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md hover:shadow-lg">
                                {loading ? <Loader2 className="animate-spin text-yellow-300" /> : <><Key size={18} className="text-yellow-300"/> Đăng nhập Admin</>}
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-4">
                            <button
                                type="button"
                                onClick={handleGoogleLogin}
                                disabled={loading}
                                className="w-full bg-white/90 border-2 border-red-100 text-gray-800 font-bold py-3 rounded-lg hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm relative overflow-hidden group"
                            >
                                <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.24.81-.6z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                {loading ? <Loader2 className="animate-spin" /> : 'Đăng nhập bằng Google HUB'}
                            </button>
                            <p className="text-xs text-gray-600 text-center bg-white/50 p-2 rounded-lg">
                                Vui lòng sử dụng tài khoản sinh viên <strong className="text-red-700">@{SCHOOL_DOMAIN}</strong>.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="absolute bottom-4 text-center px-4 max-w-md animate-fadeIn delay-100 z-30">
                <p className="text-[10px] text-gray-800 italic leading-relaxed bg-white/40 p-2 rounded-lg backdrop-blur-sm border border-white/40">
                    Chúc mừng năm mới! Đây là dự án hỗ trợ sinh viên, <strong>KHÔNG PHẢI</strong> website chính thức của HUB.
                </p>
            </div>
        </div>
    );
};