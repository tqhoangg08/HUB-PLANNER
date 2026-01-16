import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import { Loader2 } from 'lucide-react';

interface GoogleLoginButtonProps {
    className?: string;
    text?: string;
}

export const GoogleLoginButton: React.FC<GoogleLoginButtonProps> = ({ className = "", text = "Đăng nhập bằng Email Sinh viên" }) => {
    const [loading, setLoading] = useState(false);

    // Khi deploy (Vercel/production), luôn redirect về domain chính thức để tránh bị quay về localhost
    // (Supabase sẽ fallback về Site URL nếu redirectTo không hợp lệ / không được allow-list).
    const PROD_REDIRECT_URL = 'https://hotrosinhvienhub.id.vn';
    const redirectTo = import.meta.env.PROD ? PROD_REDIRECT_URL : window.location.origin;

    const handleLogin = async () => {
        if (!supabase) {
            alert("Chưa cấu hình Supabase!");
            return;
        }
        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    queryParams: {
                        hd: 'st.buh.edu.vn', // BẮT BUỘC: Chỉ cho phép email trường
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                    redirectTo
                },
            });
            if (error) throw error;
        } catch (err: any) {
            console.error("Login Error:", err);
            alert("Lỗi đăng nhập: " + err.message);
            setLoading(false);
        }
    };

    return (
        <button
            onClick={handleLogin}
            disabled={loading}
            className={`flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-3 px-6 rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-70 ${className}`}
        >
            {loading ? (
                <Loader2 size={20} className="animate-spin text-[#003375]" />
            ) : (
                <img 
                    src="https://www.svgrepo.com/show/475656/google-color.svg" 
                    alt="Google Logo" 
                    className="w-5 h-5" 
                />
            )}
            <span>{loading ? "Đang chuyển hướng..." : text}</span>
        </button>
    );
};
