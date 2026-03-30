import React, { useState, useEffect } from 'react';
import { Calculator, CalendarDays, Search, Package, MessageSquare, Newspaper, ChevronRight, GraduationCap, BookOpen, Clock, Shield, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { UserData } from '../types';
import { playClick } from '../utils/audio';
import { supabase } from '../utils/supabase';
import NotificationBell from './NotificationBell';

interface MobileHomeProps {
    data: UserData;
    displayName: string;
    avatarUrl: string;
    avatarSeed: string;
    isGuest: boolean;
    showSecurityNotice: boolean;
    onRequireOnboarding?: () => void;
}

export const MobileHome: React.FC<MobileHomeProps> = ({ 
    data, displayName, avatarUrl, avatarSeed, isGuest, showSecurityNotice, onRequireOnboarding 
}) => {
    const [realNews, setRealNews] = useState<any[]>([]);
    const [loadingNews, setLoadingNews] = useState(true);
    
    // ✨ THÊM STATE ĐỂ LƯU ID CỦA NGƯỜI DÙNG
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // Tải Data từ Supabase
    useEffect(() => {
        const fetchRealData = async () => {
            try {
                // 1. Lấy ID người dùng để truyền cho cái Chuông thông báo
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    setCurrentUserId(session.user.id);
                }

                // 2. Lấy thông báo từ bảng school_announcements
                const { data: newsData, error } = await supabase
                    .from('school_announcements') 
                    .select('*')
                    .order('date', { ascending: false })
                    .limit(4);
                    
                if (error) {
                    console.error('Lỗi truy vấn Supabase:', error);
                } else if (newsData) {
                    setRealNews(newsData);
                }

            } catch (error) {
                console.error('Lỗi tải dữ liệu tin tức:', error);
            } finally {
                setLoadingNews(false);
            }
        };

        fetchRealData();
    }, []);

    const displayNews = realNews.length > 0 ? realNews : [
        { id: '1', title: "Hiện tại chưa có thông báo hoặc tin tức mới nào từ trường.", created_at: new Date().toISOString(), link: "#" }
    ];

    const display_Cohort = data?.cohort || null;
    const display_Major = data?.majorName || null;
    const isColorAvatar = avatarUrl?.startsWith('#');
    
    const needsUpdate = !isGuest && (!display_Cohort || !display_Major);
    const showWarningBox = showSecurityNotice || needsUpdate;

    const renderAvatar = () => {
        if (!avatarUrl) {
            return <span className="h-12 w-12 rounded-full bg-white text-[#003375] flex items-center justify-center text-lg font-bold shadow-sm shrink-0">{avatarSeed}</span>;
        }
        if (isColorAvatar) {
            return <span className="h-12 w-12 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm shrink-0" style={{ backgroundColor: avatarUrl }}>{avatarSeed}</span>;
        }
        return <img src={avatarUrl} alt="Avatar" className="h-12 w-12 rounded-full object-cover shadow-sm bg-white p-0.5 shrink-0" />;
    };

    return (
        <div className="min-h-[100dvh] bg-[#F8FAFC] pb-24 font-sans animate-fadeIn">
            {/* HEADER NỀN XANH CẬP NHẬT THÔNG TIN SINH VIÊN */}
            <div className="bg-[#003375] rounded-b-[32px] px-5 pt-12 pb-8 text-white relative shadow-md">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {renderAvatar()}
                        <div className="min-w-0">
                            <p className="text-xs text-blue-100/80 mb-0.5">Xin chào,</p>
                            <p className="text-lg font-bold truncate pr-2">{displayName}</p>
                        </div>
                    </div>
                    
                    <div className="relative z-[60] bg-white/10 hover:bg-white/20 transition-colors rounded-full backdrop-blur-sm flex items-center justify-center">
                        <div className="scale-90 opacity-90 hover:opacity-100">
                            {/* ✨ ĐÃ SỬA: Truyền currentUserId vào NotificationBell */}
                            <NotificationBell currentUserId={currentUserId} />
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-5">
                    <span className="px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-[11px] font-medium flex items-center gap-1.5 border border-white/10 shadow-sm">
                        <GraduationCap size={14} /> {display_Cohort || 'Chưa rõ khóa'}
                    </span>
                    <span className="px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-[11px] font-medium flex items-center gap-1.5 border border-white/10 shadow-sm max-w-full truncate">
                        <BookOpen size={14} className="shrink-0" /> <span className="truncate">{display_Major || 'Chưa chọn ngành'}</span>
                    </span>
                </div>
            </div>

            {/* THÔNG BÁO YÊU CẦU ĐĂNG NHẬP HOẶC CẬP NHẬT THÔNG TIN */}
            {showWarningBox && (
                <div className="px-4 mt-5 animate-slideUp">
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex flex-col gap-3 shadow-sm">
                        <div className="flex items-start gap-3 text-[#003375] text-[13px] font-medium leading-relaxed">
                            <Shield size={20} className="shrink-0 mt-0.5" />
                            {isGuest ? (
                                <p>Bạn đang dùng thử với tư cách khách. <strong>Đăng nhập để lưu dữ liệu và mở khóa toàn bộ tính năng.</strong></p>
                            ) : (
                                <p>Hồ sơ sinh viên của bạn chưa hoàn tất. <strong>Vui lòng cập nhật thông tin để hệ thống xếp hạng và tính điểm chuẩn xác.</strong></p>
                            )}
                        </div>
                        <div className="flex gap-2 w-full mt-1">
                            {isGuest ? (
                                <Link to="/login" onClick={playClick} className="flex-1 px-3 py-2.5 bg-[#003375] text-white text-[13px] font-bold rounded-xl hover:bg-[#002855] transition-colors text-center shadow-sm">
                                    Đăng nhập ngay
                                </Link>
                            ) : (
                                <button onClick={() => { playClick(); onRequireOnboarding && onRequireOnboarding(); }} className="flex-1 px-3 py-2.5 bg-[#003375] text-white text-[13px] font-bold rounded-xl hover:bg-[#002855] transition-colors shadow-sm">
                                    Cập nhật thông tin
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* CHỨC NĂNG NỔI BẬT */}
            <div className="px-5 mt-6">
                <h2 className="text-[17px] font-bold text-gray-800 mb-4 tracking-tight">Chức năng nổi bật</h2>
                <div className="grid grid-cols-4 gap-y-6 gap-x-2">
                    <Link to="/learning?tab=schedule" onClick={playClick} className="flex flex-col items-center gap-2 group active:scale-95 transition-transform">
                        <div className="w-[52px] h-[52px] bg-white rounded-2xl flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-red-500 border border-red-50 group-hover:bg-red-50">
                            <CalendarDays size={24} strokeWidth={1.5} />
                        </div>
                        <span className="text-[11px] text-gray-600 font-medium text-center">TKB & Thi</span>
                    </Link>
                    <Link to="/learning?tab=gpa" onClick={playClick} className="flex flex-col items-center gap-2 group active:scale-95 transition-transform">
                        <div className="w-[52px] h-[52px] bg-white rounded-2xl flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-blue-500 border border-blue-50 group-hover:bg-blue-50">
                            <Calculator size={24} strokeWidth={1.5} />
                        </div>
                        <span className="text-[11px] text-gray-600 font-medium">Tính GPA</span>
                    </Link>
                    <Link to="/events" onClick={playClick} className="flex flex-col items-center gap-2 group active:scale-95 transition-transform">
                        <div className="w-[52px] h-[52px] bg-white rounded-2xl flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-orange-500 border border-orange-50 group-hover:bg-orange-50">
                            <Clock size={24} strokeWidth={1.5} />
                        </div>
                        <span className="text-[11px] text-gray-600 font-medium">Sự kiện</span>
                    </Link>
                    <Link to="/lost-found" onClick={playClick} className="flex flex-col items-center gap-2 group active:scale-95 transition-transform">
                        <div className="w-[52px] h-[52px] bg-white rounded-2xl flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-purple-500 border border-purple-50 group-hover:bg-purple-50">
                            <Search size={24} strokeWidth={1.5} />
                        </div>
                        <span className="text-[11px] text-gray-600 font-medium">Tìm đồ</span>
                    </Link>
                    <Link to="/lost-found" onClick={playClick} className="flex flex-col items-center gap-2 group active:scale-95 transition-transform">
                        <div className="w-[52px] h-[52px] bg-white rounded-2xl flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-green-500 border border-green-50 group-hover:bg-green-50">
                            <Package size={24} strokeWidth={1.5} />
                        </div>
                        <span className="text-[11px] text-gray-600 font-medium">Nhặt đồ</span>
                    </Link>
                    <Link to="/profile/guest" onClick={playClick} className="flex flex-col items-center gap-2 group active:scale-95 transition-transform">
                        <div className="w-[52px] h-[52px] bg-white rounded-2xl flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.04)] text-pink-500 border border-pink-50 group-hover:bg-pink-50">
                            <MessageSquare size={24} strokeWidth={1.5} />
                        </div>
                        <span className="text-[11px] text-gray-600 font-medium">Góp ý</span>
                    </Link>
                </div>
            </div>

            {/* TIN TỨC TỪ TRƯỜNG (DÙNG DỮ LIỆU THẬT) */}
            <div className="px-5 mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[17px] font-bold text-gray-800 tracking-tight">Tin tức từ trường (HUB)</h2>
                    <button className="text-xs font-bold text-red-600 hover:text-red-700 transition-colors">Xem tất cả</button>
                </div>
                
                {loadingNews ? (
                    <div className="flex justify-center items-center py-10 bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <Loader2 className="animate-spin text-[#003375]" size={24} />
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {displayNews.map((news) => {
                            const dateObj = new Date(news.date || news.created_at);
                            const formattedDate = isNaN(dateObj.getTime()) ? 'Mới cập nhật' : dateObj.toLocaleDateString('vi-VN');

                            return (
                                <a 
                                    key={news.id} 
                                    href={news.link || '#'} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="bg-white p-3.5 rounded-2xl flex gap-4 items-center shadow-[0_2px_10px_rgba(0,0,0,0.03)] border border-gray-100 active:scale-[0.98] transition-transform cursor-pointer"
                                >
                                    <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-500 shrink-0">
                                        <Newspaper size={22} strokeWidth={1.5} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-[13px] text-gray-800 line-clamp-2 leading-snug">{news.title}</h3>
                                        <p className="text-[10px] text-gray-400 mt-1.5 font-medium">{formattedDate}</p>
                                    </div>
                                    <ChevronRight size={18} className="text-gray-300 shrink-0" />
                                </a>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};