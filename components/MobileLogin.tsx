import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { Mail, Lock, Loader2, AlertCircle, GraduationCap, ShieldCheck, ChevronLeft } from 'lucide-react';
import { playClick } from '../utils/audio';

import Particles from "react-particles";
import { loadSlim } from "tsparticles-slim";
import type { Engine, ISourceOptions } from "tsparticles-engine";

const SCHOOL_DOMAIN = 'st.buh.edu.vn';

export const MobileLogin: React.FC = () => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'student' | 'admin'>('student');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agreed, setAgreed] = useState(false);

    // ==========================================
    // ĐĂNG NHẬP GOOGLE CHUẨN (HIỆN TẤT CẢ GMAIL NHƯ SPOTIFY)
    // ==========================================
    const handleGoogleLogin = async () => {
        if (!agreed) return; 
        if (!supabase) return setError("Chưa cấu hình kết nối Database.");
        setLoading(true); setError(null); playClick();

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/dashboard`,
                // ✨ ĐÃ SỬA: Xóa 'hd' đi, chỉ dùng prompt để bung ra tất cả tài khoản trong máy
                queryParams: { prompt: 'select_account' }, 
            },
        });

        if (error) {
            setError(error.message);
            setLoading(false);
        }
    };

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreed) return; 
        if (!supabase) return setError("Chưa cấu hình kết nối Database.");
        setLoading(true); setError(null); playClick();

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError("Thông tin đăng nhập không chính xác.");
        else navigate('/');
        
        setLoading(false);
    };

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
            opacity: { value: { min: 0.1, max: 0.4 }, animation: { enable: true, speed: 0.5, minimumValue: 0.1, sync: false } },
            size: { value: { min: 2, max: 5 } },
            move: { enable: true, speed: { min: 0.5, max: 1.5 }, direction: "top", random: true, outModes: { default: "out" } },
        },
        detectRetina: true,
    }), []);

    return (
        <div className="min-h-[100dvh] bg-[#003375] flex flex-col font-sans animate-fadeIn relative overflow-hidden">
            
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
            <Particles id="tsparticles-mobile-login" init={particlesInit} options={particlesOptions} className="absolute inset-0 z-0 pointer-events-none" />

            {/* HEADER NỬA TRÊN */}
            <div className="flex-1 flex flex-col items-center justify-center relative z-10 px-6 pb-8 pt-12">
                <button onClick={() => { playClick(); navigate('/'); }} className="absolute top-12 left-6 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-colors active:scale-90">
                    <ChevronLeft size={24} />
                </button>

                <div className="w-20 h-20 bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] flex items-center justify-center mb-6 border-2 border-white/20 animate-bounce" style={{ animationDuration: '3s' }}>
                    <img src="logo.png" alt="HUB" className="w-14 h-14 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-2xl font-black text-[#003375]">HUB</span>'; }} />
                </div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2 text-center drop-shadow-md">HUB Planner</h1>
                <p className="text-blue-100/80 text-sm font-medium text-center px-4">Đồng hành cùng bạn trên chặng đường chinh phục điểm số.</p>
            </div>

            {/* BOTTOM SHEET - FORM ĐĂNG NHẬP */}
            <div className="bg-white w-full rounded-t-[32px] px-6 pt-8 pb-safe shadow-[0_-10px_40px_rgba(0,0,0,0.1)] relative z-20 animate-slideUp flex flex-col min-h-[55vh]">
                <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto absolute top-3 left-1/2 -translate-x-1/2"></div>

                {/* Chuyển Tab */}
                <div className="flex p-1 bg-gray-100 rounded-xl mb-6 relative">
                    <button 
                        type="button" 
                        onClick={() => { setActiveTab('student'); setError(null); playClick(); }} 
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative z-10 ${activeTab === 'student' ? 'text-[#003375] shadow-sm bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <GraduationCap size={18} /> Sinh viên
                    </button>
                    <button 
                        type="button" 
                        onClick={() => { setActiveTab('admin'); setError(null); playClick(); }} 
                        className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 relative z-10 ${activeTab === 'admin' ? 'text-[#990000] shadow-sm bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <ShieldCheck size={18} /> Quản trị
                    </button>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3.5 rounded-xl text-[13px] flex items-start gap-2.5 border border-red-100 mb-5 animate-shake font-medium">
                        <AlertCircle size={18} className="shrink-0 mt-0.5" /> 
                        <span className="leading-snug">{error}</span>
                    </div>
                )}

                <div className="flex-1 flex flex-col">
                    {activeTab === 'admin' ? (
                        <form onSubmit={handleAdminLogin} className="space-y-4 animate-fadeIn flex-1 flex flex-col">
                            <div className="space-y-1.5">
                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Email quản trị</label>
                                <div className="relative group">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#990000] transition-colors" size={18} />
                                    <input 
                                        type="email" required 
                                        className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#990000]/20 focus:border-[#990000] outline-none transition-all text-[15px] text-gray-900 font-medium placeholder-gray-400" 
                                        placeholder="admin@domain.com" 
                                        value={email} onChange={e => setEmail(e.target.value)} 
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider ml-1">Mật khẩu</label>
                                <div className="relative group">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#990000] transition-colors" size={18} />
                                    <input 
                                        type="password" required 
                                        className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#990000]/20 focus:border-[#990000] outline-none transition-all text-[15px] text-gray-900 font-medium placeholder-gray-400" 
                                        placeholder="••••••••" 
                                        value={password} onChange={e => setPassword(e.target.value)} 
                                    />
                                </div>
                            </div>

                            <div className="flex-1"></div>

                            <div className="mt-6 mb-4">
                                {/* Checkbox Đồng ý */}
                                <label className="flex items-start gap-3 cursor-pointer group px-1 mb-4">
                                    <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                                        <input type="checkbox" className="peer sr-only" checked={agreed} onChange={(e) => { playClick(); setAgreed(e.target.checked); }} />
                                        <div className="w-5 h-5 rounded border-2 border-gray-300 peer-checked:bg-[#990000] peer-checked:border-[#990000] transition-all flex items-center justify-center bg-white">
                                            <svg className={`w-3.5 h-3.5 text-white transition-transform duration-200 ${agreed ? 'scale-100' : 'scale-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                    </div>
                                    <span className="text-[12px] text-gray-500 leading-snug select-none">
                                        Tôi đồng ý với các <Link to="/terms" onClick={(e) => e.stopPropagation()} className="text-[#990000] font-bold hover:underline">Điều khoản</Link> và <Link to="/privacy" onClick={(e) => e.stopPropagation()} className="text-[#990000] font-bold hover:underline">Chính sách</Link>
                                    </span>
                                </label>

                                <button 
                                    type="submit" disabled={loading || !agreed} 
                                    className="w-full bg-[#990000] text-white font-bold py-4 rounded-xl active:bg-[#7a0000] transition-colors flex justify-center items-center gap-2 disabled:opacity-50 disabled:active:bg-[#990000] shadow-md text-[15px]"
                                >
                                    {loading ? <Loader2 className="animate-spin" size={20} /> : 'Đăng nhập'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="animate-fadeIn flex-1 flex flex-col">
                            
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 items-start mb-6">
                                <div className="bg-white p-1.5 rounded-lg shadow-sm shrink-0 mt-0.5">
                                    <GraduationCap className="text-[#003375]" size={20} />
                                </div>
                                <div className="text-[12px] text-gray-600 leading-relaxed">
                                    <p className="font-extrabold text-[#003375] mb-1 text-[13px]">Dành cho sinh viên HUB</p>
                                    Chỉ hỗ trợ đăng nhập bằng tài khoản email trường có đuôi <strong className="text-[#003375] bg-white px-1.5 py-0.5 rounded border border-blue-100 shadow-sm ml-0.5">@{SCHOOL_DOMAIN}</strong>
                                </div>
                            </div>

                            <div className="flex-1"></div>

                            <div className="mt-auto mb-4">
                                {/* Checkbox Đồng ý */}
                                <label className="flex items-start gap-3 cursor-pointer group px-1 mb-4">
                                    <div className="relative flex items-center justify-center mt-0.5 shrink-0">
                                        <input type="checkbox" className="peer sr-only" checked={agreed} onChange={(e) => { playClick(); setAgreed(e.target.checked); }} />
                                        <div className="w-5 h-5 rounded border-2 border-gray-300 peer-checked:bg-[#003375] peer-checked:border-[#003375] transition-all flex items-center justify-center bg-white">
                                            <svg className={`w-3.5 h-3.5 text-white transition-transform duration-200 ${agreed ? 'scale-100' : 'scale-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                    </div>
                                    <span className="text-[12px] text-gray-500 leading-snug select-none">
                                        Tôi đồng ý với các <Link to="/terms" onClick={(e) => e.stopPropagation()} className="text-[#003375] font-bold hover:underline">Điều khoản</Link> và <Link to="/privacy" onClick={(e) => e.stopPropagation()} className="text-[#003375] font-bold hover:underline">Chính sách</Link>
                                    </span>
                                </label>

                                <button 
                                    type="button" onClick={handleGoogleLogin} disabled={loading || !agreed} 
                                    className="w-full bg-white border-2 border-gray-200 text-gray-800 font-bold py-3.5 rounded-xl active:bg-gray-50 transition-colors flex justify-center items-center gap-3 disabled:opacity-50 disabled:active:bg-white shadow-sm text-[15px]"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.24.81-.6z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                    <span>{loading ? 'Đang kết nối...' : 'Tiếp tục với Google'}</span>
                                    {loading && <Loader2 className="animate-spin text-gray-500 absolute right-6" size={18} />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};