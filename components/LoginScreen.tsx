import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { User, Key, ArrowLeft, Loader2, Shield, AlertCircle, GraduationCap, Mail, Lock, CheckCircle2, ShieldCheck } from 'lucide-react';
import { playClick } from '../utils/audio';

import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";

const SCHOOL_DOMAIN = 'st.buh.edu.vn';

export const LoginScreen: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'student' | 'admin'>('student');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agreed, setAgreed] = useState(false); // Thêm state quản lý checkbox

    const particlesInit = useCallback(async (engine: Engine) => {
        await loadSlim(engine);
    }, []);

    const particlesOptions = useMemo((): ISourceOptions => ({
        fullScreen: { enable: false },
        fpsLimit: 60,
        particles: {
            number: { value: 20, density: { enable: true, area: 800 } },
            color: { value: ["#003375", "#93C5FD", "#E2E8F0"] },
            shape: { type: "circle" },
            opacity: {
                value: { min: 0.1, max: 0.4 },
                animation: { enable: true, speed: 0.5, minimumValue: 0.1, sync: false }
            },
            size: { value: { min: 2, max: 5 } },
            move: { enable: true, speed: { min: 0.5, max: 1.5 }, direction: "top", random: true, outModes: { default: "out" } },
        },
        detectRetina: true,
    }), []);

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreed) return; // Bảo mật 2 lớp
        if (!supabase) return setError("Chưa cấu hình kết nối Database.");
        setLoading(true); setError(null); playClick();

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError("Thông tin đăng nhập không chính xác.");
        else navigate('/');
        
        setLoading(false);
    };

const handleGoogleLogin = async () => {
        if (!agreed) return; 
        if (!supabase) return setError("Chưa cấu hình kết nối Database.");
        setLoading(true); setError(null); playClick();

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                // 👇 Chỉ thẳng vào trang dashboard để không bị chuyển hướng làm rớt token
                redirectTo: `${window.location.origin}/dashboard`,
                queryParams: { hd: SCHOOL_DOMAIN, prompt: 'select_account' },
            },
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        }
    };

    return (
        <div className="h-[100dvh] w-full relative flex flex-col items-center justify-center p-4 bg-[#F8FAFC] overflow-hidden">
            
            {/* Background Decor */}
            <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-30 animate-blob"></div>
            <div className="absolute top-[20%] right-[-10%] w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-[100px] opacity-20 animate-blob animation-delay-2000"></div>
            <div className="absolute bottom-[-10%] left-[20%] w-72 h-72 bg-[#003375] rounded-full mix-blend-multiply filter blur-[100px] opacity-20 animate-blob animation-delay-4000"></div>

            <Particles id="tsparticles-login" init={particlesInit} options={particlesOptions} className="absolute inset-0 z-0 pointer-events-none" />

            {/* Nút quay lại */}
            <button onClick={() => { playClick(); navigate('/'); }} className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-[#003375] font-bold transition-all z-30 bg-white/80 backdrop-blur-md p-2.5 sm:px-4 sm:py-2 rounded-xl shadow-sm border border-gray-200/50 hover:shadow-md hover:-translate-y-0.5">
                <ArrowLeft size={18} /> <span className="hidden sm:inline text-sm">Trở về</span>
            </button>

            {/* Khung Đăng Nhập Chính */}
            <div className="relative z-30 bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.08)] w-full max-w-[420px] border border-white p-6 sm:p-8 animate-scaleIn flex flex-col">
                
                {/* Header & Logo */}
                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center bg-white p-3 rounded-2xl shadow-sm mb-3 border border-gray-100">
                        <img src="logo.png" alt="HUB Logo" className="h-10 w-10 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<div class="h-10 w-10 bg-[#003375] rounded-xl flex items-center justify-center text-white font-black text-sm">HUB</div>'; }} />
                    </div>
                    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Chào mừng trở lại</h2>
                    <p className="text-sm text-gray-500 font-medium mt-1">Vui lòng đăng nhập để tiếp tục</p>
                </div>

                {/* Tab Switcher */}
                <div className="flex p-1 bg-gray-100/80 rounded-xl mb-6 relative">
                    <button 
                        onClick={() => { setActiveTab('student'); setError(null); playClick(); }} 
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative z-10 ${activeTab === 'student' ? 'text-[#003375] shadow-sm bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <GraduationCap size={18} /> Sinh viên
                    </button>
                    <button 
                        onClick={() => { setActiveTab('admin'); setError(null); playClick(); }} 
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative z-10 ${activeTab === 'admin' ? 'text-[#990000] shadow-sm bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <ShieldCheck size={18} /> Quản trị
                    </button>
                </div>

                {/* Nội dung Form */}
                <div className="w-full">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm flex items-start gap-2 border border-red-100 mb-5 animate-shake">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" /> 
                            <span className="leading-snug font-semibold">{error}</span>
                        </div>
                    )}

                    {activeTab === 'admin' ? (
                        <form onSubmit={handleAdminLogin} className="space-y-4 animate-fadeIn">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider ml-1">Email quản trị</label>
                                <div className="relative group">
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#990000] transition-colors" size={18} />
                                    <input 
                                        type="email" required 
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#990000]/20 focus:border-[#990000] outline-none transition-all text-sm text-gray-900 font-medium placeholder-gray-400" 
                                        placeholder="admin@domain.com" 
                                        value={email} onChange={e => setEmail(e.target.value)} 
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-bold text-gray-600 uppercase tracking-wider ml-1">Mật khẩu</label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#990000] transition-colors" size={18} />
                                    <input 
                                        type="password" required 
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#990000]/20 focus:border-[#990000] outline-none transition-all text-sm text-gray-900 font-medium placeholder-gray-400" 
                                        placeholder="••••••••" 
                                        value={password} onChange={e => setPassword(e.target.value)} 
                                    />
                                </div>
                            </div>

                            {/* Checkbox Đồng ý Admin */}
                            <label className="flex items-start gap-2.5 cursor-pointer group px-1 pt-1">
                                <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                                    <input 
                                        type="checkbox" 
                                        className="peer sr-only" 
                                        checked={agreed} 
                                        onChange={(e) => { playClick(); setAgreed(e.target.checked); }} 
                                    />
                                    <div className="w-4 h-4 rounded border-2 border-gray-300 peer-checked:bg-[#990000] peer-checked:border-[#990000] transition-all flex items-center justify-center bg-white group-hover:border-[#990000]/50">
                                        <svg className={`w-3 h-3 text-white transition-transform duration-200 ${agreed ? 'scale-100' : 'scale-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                                <span className="text-[11px] text-gray-500 leading-snug select-none">
                                    Tôi đồng ý với các <Link to="/terms" onClick={(e) => e.stopPropagation()} className="text-[#990000] font-bold hover:underline">Điều khoản sử dụng</Link> và <Link to="/privacy" onClick={(e) => e.stopPropagation()} className="text-[#990000] font-bold hover:underline">Chính sách bảo mật</Link>
                                </span>
                            </label>

                            <button 
                                type="submit" 
                                disabled={loading || !agreed} 
                                className="w-full bg-gradient-to-r from-[#990000] to-[#7a0000] text-white font-bold py-3 rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex justify-center items-center gap-2 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed disabled:shadow-none mt-1"
                            >
                                {loading ? <Loader2 className="animate-spin" size={18} /> : 'Đăng nhập'}
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-4 animate-fadeIn">
                            <div className="bg-blue-50/70 p-3.5 rounded-xl border border-blue-100 flex gap-2.5 items-start">
                                <CheckCircle2 className="text-[#003375] shrink-0 mt-0.5" size={16} />
                                <div className="text-[11px] text-gray-600 leading-relaxed">
                                    <p className="font-bold text-[#003375] mb-0.5">Dành cho sinh viên HUB</p>
                                    Chỉ hỗ trợ tài khoản email có đuôi <strong className="text-[#003375]">@{SCHOOL_DOMAIN}</strong>.
                                </div>
                            </div>

                            {/* Checkbox Đồng ý Sinh viên */}
                            <label className="flex items-start gap-2.5 cursor-pointer group px-1">
                                <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                                    <input 
                                        type="checkbox" 
                                        className="peer sr-only" 
                                        checked={agreed} 
                                        onChange={(e) => { playClick(); setAgreed(e.target.checked); }} 
                                    />
                                    <div className="w-4 h-4 rounded border-2 border-gray-300 peer-checked:bg-[#003375] peer-checked:border-[#003375] transition-all flex items-center justify-center bg-white group-hover:border-[#003375]/50">
                                        <svg className={`w-3 h-3 text-white transition-transform duration-200 ${agreed ? 'scale-100' : 'scale-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                                <span className="text-[11px] text-gray-500 leading-snug select-none">
                                    Tôi đồng ý với các <Link to="/terms" onClick={(e) => e.stopPropagation()} className="text-[#003375] font-bold hover:underline">Điều khoản sử dụng</Link> và <Link to="/privacy" onClick={(e) => e.stopPropagation()} className="text-[#003375] font-bold hover:underline">Chính sách bảo mật</Link>
                                </span>
                            </label>

                            <button 
                                type="button" 
                                onClick={handleGoogleLogin} 
                                disabled={loading || !agreed} 
                                className="w-full bg-white border-2 border-gray-200 text-gray-800 font-bold py-3.5 rounded-xl hover:bg-gray-50 hover:border-blue-300 hover:shadow-md transition-all duration-200 flex justify-center items-center gap-3 group disabled:opacity-50 disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:shadow-none disabled:cursor-not-allowed"
                            >
                                <svg className={`w-5 h-5 transition-transform ${(!loading && agreed) ? 'group-hover:scale-110' : ''}`} viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.24.81-.6z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                                <span className="text-sm">{loading ? 'Đang kết nối...' : 'Tiếp tục với Google'}</span>
                                {loading && <Loader2 className="animate-spin text-gray-500 absolute right-6" size={18} />}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Footer Links - Dành riêng nếu cần, nhưng mình đã đưa links vào checkbox cho tinh gọn */}
            <div className="absolute bottom-6 flex flex-col items-center gap-1.5 w-full z-10">
                <p className="text-[10px] text-gray-400">© {new Date().getFullYear()} HUB Planner. All rights reserved.</p>
            </div>
        </div>
    );
};