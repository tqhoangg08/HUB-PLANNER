import React, { useEffect, useState } from 'react';
import {
    Bell,
    Book,
    BookOpen,
    Calculator,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Clock,
    GraduationCap,
    Loader2,
    MessageSquare,
    Newspaper,
    Package,
    Search,
    Shield,
    Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { UserData } from '../types';
import { playClick } from '../utils/audio';
import { fetchBetterAuthSession } from '../utils/privateApi';
import { fetchSchoolAnnouncements } from '../utils/announcementsApi';
import NotificationBell from './NotificationBell';
import PushNotificationPrompt from '../components/PushNotificationPrompt';
import { getAvatarColorClass, isAllowedAvatarColor, isAvatarImageUrl } from '../utils/avatarColors';

const ALL_NEWS_LIMIT = 60;

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
    data,
    displayName,
    avatarUrl,
    avatarSeed,
    isGuest,
    showSecurityNotice,
    onRequireOnboarding,
}) => {
    const [activeScreen, setActiveScreen] = useState<'main' | 'all-news'>('main');
    const [realNews, setRealNews] = useState<any[]>([]);
    const [loadingNews, setLoadingNews] = useState(true);
    const [allNews, setAllNews] = useState<any[]>([]);
    const [loadingAllNews, setLoadingAllNews] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    useEffect(() => {
        const fetchRealData = async () => {
            try {
                const session = await fetchBetterAuthSession();
                if (session?.user) {
                    setCurrentUserId(session.user.id);
                }

                const response = await fetchSchoolAnnouncements('/events?resource=announcements&limit=4');
                const payload = await response.json();
                if (!response.ok) {
                    console.error('Lỗi truy vấn thông báo:', payload?.error);
                } else if (payload.data) {
                    setRealNews(payload.data);
                }
            } catch (error) {
                console.error('Lỗi tải dữ liệu tin tức:', error);
            } finally {
                setLoadingNews(false);
            }
        };

        fetchRealData();
    }, []);

    const fetchAllNews = async () => {
        if (allNews.length > 0 || loadingAllNews) return;

        setLoadingAllNews(true);
        try {
            const response = await fetchSchoolAnnouncements(
                `/events?resource=announcements&limit=${ALL_NEWS_LIMIT}`
            );
            const payload = await response.json();
            if (response.ok && payload.data) {
                setAllNews(payload.data);
            }
        } catch (error) {
            console.error('Lỗi tải toàn bộ tin tức:', error);
        } finally {
            setLoadingAllNews(false);
        }
    };

    const displayNews = realNews.length > 0 ? realNews : [
        { id: 'empty', title: 'Hiện tại chưa có thông báo hoặc tin tức mới nào từ trường.', created_at: new Date().toISOString(), link: '#' },
    ];

    const displayCohort = data?.cohort || null;
    const displayMajor = data?.majorName || null;
    const isColorAvatar = isAllowedAvatarColor(avatarUrl);
    const needsUpdate = !isGuest && (!displayCohort || !displayMajor);
    const showWarningBox = showSecurityNotice || needsUpdate;

    const renderAvatar = () => {
        if (!avatarUrl) {
            return <span className="grid h-[62px] w-[62px] shrink-0 place-items-center rounded-[21px] border border-white/25 bg-white/20 text-[25px] font-black text-white shadow-[0_12px_28px_rgba(0,0,0,0.12)]">{avatarSeed}</span>;
        }
        if (isColorAvatar) {
            return <span className={`grid h-[62px] w-[62px] shrink-0 place-items-center rounded-[21px] border border-white/25 text-[25px] font-black text-white shadow-[0_12px_28px_rgba(0,0,0,0.12)] ${getAvatarColorClass(avatarUrl)}`}>{avatarSeed}</span>;
        }
        if (isAvatarImageUrl(avatarUrl)) {
            return <img src={avatarUrl} alt="Avatar" className="h-[62px] w-[62px] shrink-0 rounded-[21px] border border-white/25 object-cover shadow-[0_12px_28px_rgba(0,0,0,0.12)]" />;
        }
        return <span className={`grid h-[62px] w-[62px] shrink-0 place-items-center rounded-[21px] border border-white/25 text-[25px] font-black text-white shadow-[0_12px_28px_rgba(0,0,0,0.12)] ${getAvatarColorClass(avatarUrl)}`}>{avatarSeed}</span>;
    };

    const formatNewsDate = (news: any) => {
        const dateObj = new Date(news.date || news.created_at);
        return isNaN(dateObj.getTime()) ? 'Mới cập nhật' : dateObj.toLocaleDateString('vi-VN');
    };

    const featureItems = [
        { to: '/learning?tab=schedule', label: 'TKB & Thi', icon: CalendarDays, color: 'text-[#1A56FF]', bg: 'bg-[#EEF2FF]' },
        { to: '/learning?tab=gpa', label: 'Tính GPA', icon: Calculator, color: 'text-[#00A876]', bg: 'bg-[#EDFAF3]' },
        { to: '/events', label: 'Sự kiện', icon: Clock, color: 'text-[#F59E0B]', bg: 'bg-[#FFF4E5]' },
        { to: '/handbook/clubs', label: 'CLB - Đội', icon: Users, color: 'text-[#7B2FFF]', bg: 'bg-[#F1EAFF]' },
        { to: '/lost-found', label: 'Tìm đồ', icon: Search, color: 'text-[#FF3B5C]', bg: 'bg-[#FFF0F3]' },
        { to: '/lost-found', label: 'Nhặt đồ', icon: Package, color: 'text-[#06B6D4]', bg: 'bg-[#ECFEFF]' },
        { to: '/handbook/feedback', label: 'Góp ý', icon: MessageSquare, color: 'text-[#7B2FFF]', bg: 'bg-[#F1EAFF]' },
        { to: '/handbook/contacts', label: 'Cẩm nang', icon: Book, color: 'text-[#1A56FF]', bg: 'bg-[#EEF2FF]' },
    ];

    if (activeScreen === 'all-news') {
        return (
            <div className="mobile-home-page mobile-home-news fixed inset-0 z-[100] flex flex-col bg-[#F2F4F8] animate-slideInRight">
                <div className="h-[calc(env(safe-area-inset-top)+14px)] shrink-0" aria-hidden="true" />
                <div className="flex items-center gap-3 px-6 pb-4 pt-1">
                    <button
                        type="button"
                        onClick={() => { playClick(); setActiveScreen('main'); }}
                        className="grid h-[42px] w-[42px] place-items-center rounded-[14px] bg-white text-[#0D1B3E] shadow-[0_2px_10px_rgba(13,27,62,0.08)] active:scale-95"
                    >
                        <ChevronLeft size={22} />
                    </button>
                    <div>
                        <h2 className="text-[24px] font-black leading-tight text-[#0D1B3E]">Tin tức HUB</h2>
                        <p className="mt-0.5 text-[12px] font-semibold text-[#7B8AB0]">Thông báo mới nhất từ trường</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-[calc(110px+env(safe-area-inset-bottom))] custom-scrollbar">
                    {loadingAllNews ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-[#1A56FF]" size={28} />
                        </div>
                    ) : allNews.length === 0 ? (
                        <div className="rounded-[22px] border border-dashed border-[#DDE3F0] bg-white py-12 text-center text-sm font-bold text-[#7B8AB0]">Chưa có thông báo nào.</div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {allNews.map((news) => (
                                <a
                                    key={news.id}
                                    href={news.link || '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={playClick}
                                    className="flex items-center gap-3 rounded-[20px] bg-white p-3.5 shadow-[0_2px_14px_rgba(13,27,62,0.06)] active:scale-[0.98]"
                                >
                                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-[#FFF0F3] text-[#E11D48]">
                                        <Newspaper size={21} strokeWidth={2.2} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="line-clamp-2 text-[12.5px] font-black leading-snug text-[#0D1B3E]">{news.title}</span>
                                        <span className="mt-1 block text-[10px] font-bold text-[#9AA5C0]">{formatNewsDate(news)}</span>
                                    </span>
                                    <ChevronRight size={18} className="shrink-0 text-[#B0BCDA]" />
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="mobile-page mobile-home-page w-full min-h-[100dvh] bg-[#E8ECF4] animate-fadeIn">
            <div className="mx-auto min-h-[100dvh] w-full max-w-[430px] bg-[#F2F4F8] pb-[calc(110px+env(safe-area-inset-bottom))] text-[#0D1B3E]">
                <div className="h-[calc(env(safe-area-inset-top)+16px)] shrink-0" aria-hidden="true" />

                <header className="flex items-start justify-between px-6 pb-3 pt-1">
                    <div>
                        <h1 className="text-[30px] font-black leading-[1.08] tracking-normal text-[#0D1B3E]">Trang chủ</h1>
                        <p className="mt-1 text-[13px] font-semibold leading-snug text-[#7B8AB0]">Tất cả tiện ích sinh viên trong một màn hình</p>
                    </div>
                    <div className="flex gap-2">
                        <Link to="/profiles/search" onClick={playClick} className="grid h-[42px] w-[42px] place-items-center rounded-[14px] bg-white text-[#0D1B3E] shadow-[0_2px_10px_rgba(13,27,62,0.08)] active:scale-95">
                            <Search size={19} />
                        </Link>
                        <div className="relative z-[60] grid h-[42px] w-[42px] place-items-center rounded-[14px] bg-[#1A56FF] text-white shadow-[0_8px_18px_rgba(26,86,255,0.26)]">
                            {currentUserId ? (
                                <NotificationBell currentUserId={currentUserId} />
                            ) : (
                                <>
                                    <Bell size={19} />
                                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-[#1A56FF] bg-[#FF3B5C]" />
                                </>
                            )}
                        </div>
                    </div>
                </header>

                <section className="relative mx-6 mb-3 overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1A56FF] to-[#597DFF] p-[18px] text-white shadow-[0_12px_28px_rgba(26,86,255,0.24)]">
                    <div className="absolute -right-14 -top-16 h-[150px] w-[150px] rounded-full bg-white/10" />
                    <div className="relative z-10 flex items-center gap-3.5">
                        {renderAvatar()}
                        <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-bold text-white/80">Xin chào,</div>
                            <div className="mt-1 truncate text-[18px] font-black leading-tight">{displayName}</div>
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                                <span className="inline-flex h-[25px] items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2.5 text-[10px] font-black">
                                    <GraduationCap size={13} strokeWidth={2.3} />
                                    {displayCohort || 'Chưa rõ khóa'}
                                </span>
                                <span className="inline-flex h-[25px] max-w-full items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2.5 text-[10px] font-black">
                                    <BookOpen size={13} strokeWidth={2.3} />
                                    <span className="truncate">{displayMajor || 'Chưa chọn ngành'}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="relative z-10 mt-4 flex items-start justify-between gap-3 rounded-2xl border border-white/25 bg-white/15 p-3">
                        <div className="min-w-0">
                            <div className="text-[13px] font-black leading-snug">{realNews.length > 0 ? 'Có thông báo mới từ HUB' : 'Theo dõi tiện ích học tập của bạn'}</div>
                            <div className="mt-1 text-[10.5px] font-semibold leading-snug text-white/80">Mở lịch, sự kiện và tin tức để cập nhật nhanh trong ngày.</div>
                        </div>
                        {realNews.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => { playClick(); setActiveScreen('all-news'); fetchAllNews(); }}
                                className="flex h-[34px] shrink-0 items-center rounded-xl bg-white px-3 text-[10.5px] font-black text-[#1A56FF] shadow-[0_6px_14px_rgba(13,27,62,0.16)]"
                            >
                                Xem tin
                            </button>
                        ) : (
                            <Link to="/learning?tab=schedule" onClick={playClick} className="flex h-[34px] shrink-0 items-center rounded-xl bg-white px-3 text-[10.5px] font-black text-[#1A56FF] shadow-[0_6px_14px_rgba(13,27,62,0.16)]">
                                Xem TKB
                            </Link>
                        )}
                    </div>
                </section>

                {showWarningBox && (
                    <section className="mx-6 mb-3 flex items-center gap-3 rounded-[20px] border border-[#DAE6FF] bg-gradient-to-br from-white to-[#F3F7FF] p-3.5 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[15px] bg-[#EEF2FF] text-[#1A56FF]">
                            <Shield size={20} strokeWidth={2.3} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="text-[12.5px] font-black leading-snug text-[#0D1B3E]">{isGuest ? 'Đăng nhập để lưu dữ liệu cá nhân' : 'Hoàn tất hồ sơ để tính điểm chuẩn hơn'}</div>
                            <div className="mt-1 text-[10.5px] font-semibold leading-snug text-[#7B8AB0]">{isGuest ? 'Mở khóa đồng bộ GPA, TKB và thông báo học vụ.' : 'Cập nhật khóa, ngành và lớp để đồng bộ GPA, TKB, ĐRL.'}</div>
                        </div>
                        {isGuest ? (
                            <Link to="/login" onClick={playClick} className="flex h-9 shrink-0 items-center rounded-xl bg-[#1A56FF] px-3 text-[10.5px] font-black text-white shadow-[0_6px_14px_rgba(26,86,255,0.20)]">
                                Đăng nhập
                            </Link>
                        ) : (
                            <button onClick={() => { playClick(); onRequireOnboarding?.(); }} className="h-9 shrink-0 rounded-xl bg-[#1A56FF] px-3 text-[10.5px] font-black text-white shadow-[0_6px_14px_rgba(26,86,255,0.20)]">
                                Cập nhật
                            </button>
                        )}
                    </section>
                )}

                <h2 className="mb-3 mt-5 px-6 text-[11px] font-black uppercase tracking-[0.08em] text-[#9AA5C0]">Chức năng nổi bật</h2>
                <section className="grid grid-cols-4 gap-x-2 gap-y-4 px-6">
                    {featureItems.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Link key={`${item.to}-${item.label}`} to={item.to} onClick={playClick} className="flex min-w-0 flex-col items-center gap-2 active:scale-95">
                                <span className={`grid h-[54px] w-[54px] place-items-center rounded-[18px] bg-white shadow-[0_2px_14px_rgba(13,27,62,0.06)] ${item.color}`}>
                                    <span className={`grid h-8 w-8 place-items-center rounded-xl ${item.bg}`}>
                                        <Icon size={22} strokeWidth={2.1} />
                                    </span>
                                </span>
                                <span className="text-center text-[10.5px] font-bold leading-tight text-[#5F6B82]">{item.label}</span>
                            </Link>
                        );
                    })}
                </section>

                <div className="mb-3 mt-6 flex items-center justify-between px-6">
                    <h2 className="text-[11px] font-black uppercase tracking-[0.08em] text-[#9AA5C0]">Tin tức từ trường (HUB)</h2>
                    <button
                        onClick={() => { playClick(); setActiveScreen('all-news'); fetchAllNews(); }}
                        className="py-1 pl-3 text-[11px] font-black text-[#1A56FF]"
                    >
                        Xem tất cả
                    </button>
                </div>

                {loadingNews ? (
                    <div className="mx-6 flex justify-center rounded-[20px] bg-white py-10 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                        <Loader2 className="animate-spin text-[#1A56FF]" size={24} />
                    </div>
                ) : (
                    <section className="flex flex-col gap-3 px-6">
                        {displayNews.map((news) => (
                            <a
                                key={news.id}
                                href={news.link || '#'}
                                target="_blank"
                                rel="noreferrer"
                                onClick={playClick}
                                className="flex items-center gap-3 rounded-[20px] bg-white p-3.5 shadow-[0_2px_14px_rgba(13,27,62,0.06)] active:scale-[0.98]"
                            >
                                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[15px] bg-[#FFF0F3] text-[#E11D48]">
                                    <Newspaper size={21} strokeWidth={2.2} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="line-clamp-2 text-[12.5px] font-black leading-snug text-[#0D1B3E]">{news.title}</span>
                                    <span className="mt-1 block text-[10px] font-bold text-[#9AA5C0]">{formatNewsDate(news)}</span>
                                </span>
                                <ChevronRight size={18} className="shrink-0 text-[#B0BCDA]" />
                            </a>
                        ))}
                    </section>
                )}

                <PushNotificationPrompt />
            </div>
        </div>
    );
};
