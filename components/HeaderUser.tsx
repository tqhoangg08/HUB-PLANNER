import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Session } from '@supabase/supabase-js';
import { LogOut, User, ChevronDown, Loader2, LogIn, Mail } from 'lucide-react';
import { playClick } from '../utils/audio';

interface HeaderUserProps {
  session: Session | null;
}

export const HeaderUser: React.FC<HeaderUserProps> = ({ session }) => {
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogin = async () => {
    playClick();
    if (!supabase) {
        alert("Chưa cấu hình kết nối Supabase (VITE_SUPABASE_URL & KEY).");
        return;
    }
    
    setLoading(true);
    try {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            }
        });
        if (error) throw error;
    } catch (err: any) {
        alert("Lỗi đăng nhập: " + err.message);
        setLoading(false);
    }
  };

  const handleLogout = async () => {
    playClick();
    if (!supabase) return;
    
    setLoading(true);
    await supabase.auth.signOut();
    // State updates will be handled by the parent listening to auth changes
    setLoading(false);
    setShowMenu(false);
  };

  // --- STATE: NOT LOGGED IN ---
  if (!session) {
    return (
      <button
        onClick={handleLogin}
        disabled={loading}
        className="flex items-center gap-2 bg-[#003375] hover:bg-[#002855] text-white px-4 py-2 rounded-full font-bold text-sm shadow-md transition-all active:scale-95 disabled:opacity-70 border border-transparent hover:shadow-lg"
      >
        {loading ? (
            <Loader2 size={18} className="animate-spin" />
        ) : (
            <div className="bg-white/20 p-1 rounded-full">
                <LogIn size={14} />
            </div>
        )}
        <span className="hidden sm:inline">Đăng nhập</span>
        <span className="sm:hidden">Đăng nhập</span>
      </button>
    );
  }

  // --- STATE: LOGGED IN ---
  const user = session.user;
  const metadata = user.user_metadata || {};
  const avatarUrl = metadata.avatar_url;
  const fullName = metadata.full_name || metadata.name || user.email?.split('@')[0] || 'Sinh viên';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => { playClick(); setShowMenu(!showMenu); }}
        className={`flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border transition-all duration-200 active:scale-95 group ${showMenu ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-100' : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'}`}
      >
        {avatarUrl ? (
            <img 
                src={avatarUrl} 
                alt="Avatar" 
                className="w-8 h-8 rounded-full object-cover border border-gray-100 shadow-sm"
                onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement?.querySelector('.fallback-avatar')?.classList.remove('hidden');
                }} 
            />
        ) : null}
        
        {/* Fallback Avatar (Hidden by default if url exists) */}
        <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 text-[#003375] flex items-center justify-center shadow-inner fallback-avatar ${avatarUrl ? 'hidden' : ''}`}>
            <User size={16} />
        </div>

        <div className="text-left hidden md:block">
            <p className="text-xs font-bold text-[#003375] max-w-[120px] truncate leading-tight">
                {fullName}
            </p>
        </div>

        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ${showMenu ? 'rotate-180 text-[#003375]' : 'group-hover:text-gray-600'}`} />
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-scaleIn origin-top-right">
            {/* User Info Header */}
            <div className="px-4 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                <p className="text-sm font-bold text-[#003375] truncate">{fullName}</p>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1 truncate" title={user.email}>
                    <Mail size={12} className="shrink-0" />
                    {user.email}
                </div>
            </div>

            {/* Menu Items */}
            <div className="p-2">
                <button
                    onClick={handleLogout}
                    disabled={loading}
                    className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg font-medium flex items-center gap-3 transition-colors group"
                >
                    {loading ? (
                        <Loader2 size={18} className="animate-spin text-red-500"/>
                    ) : (
                        <div className="p-1.5 bg-red-100 text-red-600 rounded-md group-hover:bg-red-200 transition-colors">
                            <LogOut size={16} />
                        </div>
                    )}
                    Đăng xuất
                </button>
            </div>
        </div>
      )}
    </div>
  );
};
