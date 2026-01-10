import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import { User, Key, ArrowLeft, Loader2, Shield, AlertCircle } from 'lucide-react';
import { playClick } from '../utils/audio';

interface LoginScreenProps {
    onBack: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onBack }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) { 
            setError("Chưa cấu hình kết nối Database."); 
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
            setLoading(false);
        } else {
            // Success - App.tsx will detect session change via useUserRole hook
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
            <button 
                onClick={() => { playClick(); onBack(); }}
                className="absolute top-6 left-6 flex items-center gap-2 text-gray-500 hover:text-[#003375] font-bold transition-colors z-10"
            >
                <ArrowLeft size={20} /> Quay lại
            </button>

            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-200 animate-scaleIn">
                <div className="bg-[#003375] p-6 text-center">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                        <Shield className="text-white" size={32} />
                    </div>
                    <h2 className="text-2xl font-bold text-white">Cổng Quản Trị</h2>
                    <p className="text-blue-200 text-sm mt-1">Đăng nhập để quản lý Sự kiện & Tìm đồ</p>
                </div>
                
                <div className="p-8 space-y-6">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-100">
                            <AlertCircle size={16} className="shrink-0"/> {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                                <input 
                                    type="email" required 
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none transition-all"
                                    placeholder="name@hub.edu.vn"
                                    value={email} onChange={e => setEmail(e.target.value)}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Mật khẩu</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18}/>
                                <input 
                                    type="password" required 
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none transition-all"
                                    placeholder="••••••••"
                                    value={password} onChange={e => setPassword(e.target.value)}
                                />
                            </div>
                        </div>
                        <button type="submit" disabled={loading} className="w-full bg-[#003375] text-white font-bold py-3 rounded-lg hover:bg-[#002855] transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md">
                            {loading ? <Loader2 className="animate-spin"/> : 'Đăng nhập'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};