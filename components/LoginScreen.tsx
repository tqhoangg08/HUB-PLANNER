import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { User, Key, ArrowLeft, Loader2, Shield, AlertCircle } from 'lucide-react';
import { playClick } from '../utils/audio';

// --- Imports cho hiệu ứng hạt ---
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

    // --- Cấu hình hiệu ứng hạt chuẩn (Tone Xanh/Trắng) ---
    const particlesInit = useCallback(async (engine: Engine) => {
        await loadSlim(engine);
    }, []);

    const particlesOptions = useMemo((): ISourceOptions => ({
        fullScreen: { enable: false },
        fpsLimit: 60,
        particles: {
            number: { value: 25, density: { enable: true, area: 800 } },
            color: { value: ["#003375", "#93C5FD", "#E2E8F0"] },
            shape: { type: "circle" },
            opacity: {
                value: { min: 0.1, max: 0.4 },
                animation: { enable: true, speed: 0.5, minimumValue: 0.1, sync: false }
            },
            size: { value: { min: 2, max: 4 } },
            move: {
                enable: true,
                speed: { min: 0.5, max: 1.5 },
                direction: "top-right",
                straight: false,
                outModes: { default: "out" },
                random: true,
            },
        },
        detectRetina: true,
    }), []);

    const titleContent = useMemo(() => {
        if (!isAdmin) {
            return {
                title: 'Đăng nhập sinh viên',
                subtitle: `Sử dụng tài khoản @${SCHOOL_DOMAIN}`,
            };
        }
        return {
            title: 'Cổng Quản Trị (Admin)',
            subtitle: 'Đăng nhập bằng tài khoản nội bộ',
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
            setError("Thông tin đăng nhập không chính xác.");
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
        // 60% Nền Trắng/Xám nhạt
        <div className="min-h-[100dvh] w-full relative overflow-hidden flex flex-col items-center justify-center p-4 bg-[#F8FAFC]">
            
            <Particles
                id="tsparticles-login"
                init={particlesInit}
                options={particlesOptions}
                className="absolute inset-0 z-1 pointer-events-none"
            />

            {/* Nút quay lại */}
            <button
                onClick={() => { playClick(); navigate('/'); }}
                className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-gray-900 font-bold transition-colors z-30 bg-white p-2 sm:px-4 sm:py-2.5 rounded-xl shadow-sm border border-gray-200 hover:bg-gray-50"
            >
                <ArrowLeft size={18} /> <span className="hidden sm:inline text-sm">Trở về</span>
            </button>

            {/* Form đăng nhập chính */}
            <div className="relative z-30 bg-white rounded-[1.5rem] shadow-xl w-full max-w-[420px] overflow-hidden border border-gray-200 animate-scaleIn">
                
                {/* Header Card: Điểm nhấn 10% (Xanh cho SV, Đỏ cho Admin) */}
                <div className={`p-6 text-center border-b border-gray-100 ${isAdmin ? 'bg-red-50/50' : 'bg-blue-50/50'}`}>
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border ${isAdmin ? 'bg-white border-red-100 text-[#990000]' : 'bg-white border-blue-100 text-[#003375]'}`}>
                        <Shield size={28} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">{titleContent.title}</h2>
                    <p className="text-gray-500 text-xs font-medium mt-1">{titleContent.subtitle}</p>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2 border border-red-100 animate-shake">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" /> 
                            <span className="leading-snug font-medium">{error}</span>
                        </div>
                    )}

                    {isAdmin ? (
                        <form onSubmit={handleAdminLogin} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 ml-1">Email quản trị</label>
                                <div className="relative">
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="email" required
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#990000] focus:border-[#990000] outline-none transition-all placeholder-gray-400 font-medium text-gray-900"
                                        placeholder="admin@domain.com"
                                        value={email} onChange={e => setEmail(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 ml-1">Mật khẩu</label>
                                <div className="relative">
                                    <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="password" required
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#990000] focus:border-[#990000] outline-none transition-all placeholder-gray-400 font-medium text-gray-900"
                                        placeholder="••••••••"
                                        value={password} onChange={e => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                            <button type="submit" disabled={loading} className="w-full bg-[#990000] text-white font-bold py-3.5 rounded-xl hover:bg-[#7a0000] transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-70 disabled:active:scale-100">
                                {loading ? <Loader2 className="animate-spin" size={20} /> : 'Đăng nhập hệ thống'}
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-5">
                            <button
                                type="button"
                                onClick={handleGoogleLogin}
                                disabled={loading}
                                className="w-full bg-white border-2 border-gray-200 text-gray-800 font-bold py-3.5 rounded-xl hover:bg-gray-50 hover:border-blue-300 transition-all active:scale-95 flex items-center justify-center gap-3 shadow-sm group"
                            >
                                <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.24.81-.6z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                {loading ? <Loader2 className="animate-spin text-gray-500" /> : 'Tiếp tục với Google'}
                            </button>
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                <p className="text-[13px] text-gray-600 text-center leading-relaxed">
                                    Vui lòng đảm bảo bạn chọn tài khoản email do trường ĐH Ngân Hàng cấp (<strong className="text-[#003375]">@{SCHOOL_DOMAIN}</strong>).
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
{/* Footer Text & Links */}
            <div className="absolute bottom-6 flex flex-col items-center gap-2 text-center px-4 w-full animate-fadeIn delay-200 z-10">
                <p className="text-xs text-gray-400 font-medium">
                    Một sản phẩm hỗ trợ học tập dành riêng cho sinh viên HUB.
                </p>
                <div className="flex items-center justify-center gap-3 text-[10px] sm:text-xs font-semibold tracking-wide text-gray-400">
                    <Link to="/privacy" className="hover:text-[#003375] transition-colors">Chính sách bảo mật</Link>
                    <span>•</span>
                    <Link to="/terms" className="hover:text-[#003375] transition-colors">Điều khoản sử dụng</Link>
                </div>
            </div>
                    
        </div>
    );
};