import React, { useEffect, useState } from 'react';
import {
    Bell,
    CheckCircle2,
    ChevronRight,
    Coffee,
    FileText,
    GraduationCap,
    Hash,
    HelpCircle,
    Info,
    Lock,
    LogOut,
    Moon,
    RefreshCw,
    Trash2,
    User,
    Users,
    X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { supabase } from '../utils/supabase';
import { fetchProfilePrivate } from '../utils/profilePrivate';
import { playClick } from '../utils/audio';
import { showConfirm } from '../utils/appNotifications';
import { getAvatarColorClass, isAllowedAvatarColor, isAvatarImageUrl } from '../utils/avatarColors';
import { clearLocalStoragePreservingDevicePreferences, removeLocalStorageExceptDevicePreferences } from '../utils/devicePreferences';

interface MobileProfileProps {
    setShowAccountSettings?: (v: boolean) => void;
    handleRequestReset?: () => void;
}

type NotificationPrefs = {
    school: boolean;
    events: boolean;
    lostFound: boolean;
    system: boolean;
};

const NOTIFICATION_STORAGE_KEY = 'hub-notification-prefs';

const DragHandle = () => (
    <div className="mx-auto mb-2 mt-3 h-1.5 w-12 shrink-0 rounded-full bg-gray-300" />
);

export const MobileProfile: React.FC<MobileProfileProps> = ({ setShowAccountSettings, handleRequestReset }) => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<any>(null);
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showNotificationSettings, setShowNotificationSettings] = useState(false);
    const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
        school: true,
        events: true,
        lostFound: true,
        system: true,
    });

    useEffect(() => {
        try {
            const savedPrefs = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
            if (savedPrefs) {
                setNotificationPrefs((current) => ({ ...current, ...JSON.parse(savedPrefs) }));
            }
        } catch {
            // Keep defaults if local preferences cannot be parsed.
        }
    }, []);

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);

            if (session?.user) {
                const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
                const privateProfile = await fetchProfilePrivate(session.user.id).catch(() => null);
                if (data) setProfile({ ...data, data: privateProfile?.data, email: privateProfile?.email });
            }

            setLoading(false);
        };

        fetchUser();
    }, []);

    const handleLogout = async () => {
        playClick();
        if (await showConfirm('Bạn có chắc chắn muốn đăng xuất?')) {
            await supabase.auth.signOut();
            clearLocalStoragePreservingDevicePreferences();
            sessionStorage.clear();
            navigate('/login', { replace: true });
        }
    };

    const handleComingSoon = () => {
        playClick();
        alert('Tính năng đang được cập nhật, bạn quay lại sau nhé!');
    };

    const handleClearCache = async () => {
        playClick();
        if (await showConfirm('Bạn muốn xóa bộ nhớ đệm cục bộ? (Không làm đăng xuất tài khoản)')) {
            removeLocalStorageExceptDevicePreferences((key) => !key.startsWith('sb-'));
            alert('Đã xóa bộ nhớ đệm thành công!');
            window.location.reload();
        }
    };

    const updateNotificationPref = (key: keyof NotificationPrefs) => {
        playClick();
        setNotificationPrefs((current) => {
            const next = { ...current, [key]: !current[key] };
            localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    const isGuest = !session;
    const displayName = isGuest ? 'Khách (ẩn danh)' : (profile?.full_name || profile?.data?.studentName || session?.user?.user_metadata?.full_name || 'Sinh viên HUB');
    const displaySub = isGuest ? 'Đăng nhập để lưu trữ dữ liệu' : (profile?.email || session?.user?.email || 'Sinh viên chính quy');
    const avatarUrl = profile?.avatar_url || session?.user?.user_metadata?.avatar_url;
    const isColorAvatar = isAllowedAvatarColor(avatarUrl);
    const avatarSeed = displayName.charAt(0).toUpperCase();
    const studentCode = profile?.student_code || profile?.data?.studentId || session?.user?.email?.split('@')[0] || 'HUB';
    const cohort = profile?.data?.cohort || (studentCode?.length >= 4 ? `20${String(studentCode).slice(2, 4)}` : '2025');
    const className = profile?.data?.className || profile?.class_name || 'Chưa cập nhật';
    const enabledNotificationCount = Object.values(notificationPrefs).filter(Boolean).length;

    const MenuItem = ({
        icon: Icon,
        iconClassName,
        title,
        subtitle,
        rightText,
        onClick,
        isDestructive = false,
    }: any) => (
        <button
            type="button"
            onClick={() => { playClick(); onClick?.(); }}
            className="flex min-h-[58px] w-full items-center justify-between gap-3 border-b border-[#F0F3F9] bg-white px-3.5 py-2.5 text-left last:border-0 active:bg-[#F8FAFD]"
        >
            <div className="flex min-w-0 items-center gap-3">
                <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[13px] ${iconClassName}`}>
                    <Icon size={20} strokeWidth={2.4} />
                </span>
                <span className="min-w-0">
                    <span className={`block text-[13.2px] font-black leading-tight ${isDestructive ? 'text-[#E11D48]' : 'text-[#0D1B3E]'}`}>{title}</span>
                    {subtitle && <span className="mt-0.5 block truncate text-[10.3px] font-semibold leading-snug text-[#9AA5C0]">{subtitle}</span>}
                </span>
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
                {rightText && <span className="text-[10.5px] font-bold text-[#9AA5C0]">{rightText}</span>}
                <ChevronRight size={18} strokeWidth={2.5} className="text-[#C0CBDF]" />
            </span>
        </button>
    );

    const NotificationToggle = ({
        prefKey,
        title,
        subtitle,
    }: {
        prefKey: keyof NotificationPrefs;
        title: string;
        subtitle: string;
    }) => {
        const enabled = notificationPrefs[prefKey];

        return (
            <button
                type="button"
                onClick={() => updateNotificationPref(prefKey)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#EEF2FF] bg-[#F8FAFD] p-3.5 text-left active:bg-[#EEF2FF]"
            >
                <span className="min-w-0">
                    <span className="block text-[13px] font-black text-[#0D1B3E]">{title}</span>
                    <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-[#7B8AB0]">{subtitle}</span>
                </span>
                <span className={`relative h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors ${enabled ? 'bg-[#1A56FF]' : 'bg-[#DDE3F0]'}`}>
                    <span className={`block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </span>
            </button>
        );
    };

    return (
        <div className="mobile-page mobile-profile-page w-full min-h-[100dvh] bg-[#E8ECF4] animate-fadeIn">
            <div className="mx-auto min-h-[100dvh] w-full max-w-[430px] bg-[#F2F4F8] pb-[calc(110px+env(safe-area-inset-bottom))] text-[#0D1B3E]">
                <div className="h-[calc(env(safe-area-inset-top)+16px)] shrink-0" aria-hidden="true" />

                <div className="px-6 pb-4 pt-1">
                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="text-[30px] font-black leading-[1.08] tracking-normal text-[#0D1B3E]">Cá nhân</h1>
                            <p className="mt-1 text-[13px] font-semibold text-[#7B8AB0]">Tài khoản & cài đặt</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => { playClick(); setShowNotificationSettings(true); }}
                            className="relative flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-white text-[#0D1B3E] shadow-[0_2px_10px_rgba(13,27,62,0.08)] active:scale-95"
                            title="Thông báo"
                        >
                            <Bell size={19} />
                            {enabledNotificationCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-[#FF3B5C]" />}
                        </button>
                    </div>
                </div>

                <div className="px-6 pb-8">
                    <section className="mb-3 rounded-[22px] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                        <div className="flex items-center gap-3.5">
                            <div
                                className={`flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-[22px] border border-[#EEF2FF] text-[28px] font-black ${isColorAvatar ? `${getAvatarColorClass(avatarUrl)} text-white` : 'bg-[#F8FAFD] text-[#1A56FF]'}`}
                            >
                                {isAvatarImageUrl(avatarUrl) ? (
                                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                                ) : (
                                    <span>{avatarUrl ? avatarSeed : <User size={32} strokeWidth={1.8} />}</span>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="truncate text-[18px] font-black leading-tight text-[#0D1B3E]">{loading ? 'Đang tải...' : displayName}</h2>
                                <p className="mt-1 truncate text-[11px] font-semibold text-[#7B8AB0]">{displaySub}</p>
                                {!isGuest && (
                                    <div className="mt-2 inline-flex h-[24px] items-center gap-1 rounded-full border border-[#D6E4FF] bg-[#EEF2FF] px-2.5 text-[10px] font-black text-[#1A56FF]">
                                        <CheckCircle2 size={12} strokeWidth={2.4} />
                                        Sinh viên HUB
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <div className="mb-3 grid grid-cols-[0.82fr_1.28fr_1fr] gap-2.5">
                        <div className="min-h-[82px] rounded-[20px] border border-white bg-white p-3 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                            <div className="flex items-center gap-1.5 text-[10.5px] font-black text-[#7B8AB0]">
                                <span className="grid h-5 w-5 place-items-center rounded-lg bg-[#EEF2FF] text-[#1A56FF]"><GraduationCap size={12} strokeWidth={2.3} /></span>
                                Khóa
                            </div>
                            <div className="mt-3 rounded-xl bg-[#F5F8FF] px-2 py-2 text-center text-[18px] font-black leading-none text-[#1A56FF]">{cohort}</div>
                        </div>
                        <div className="min-h-[82px] rounded-[20px] border border-white bg-white p-3 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                            <div className="flex items-center gap-1.5 text-[10.5px] font-black text-[#7B8AB0]">
                                <span className="grid h-5 w-5 place-items-center rounded-lg bg-[#EDFAF3] text-[#00A876]"><Hash size={12} strokeWidth={2.5} /></span>
                                MSSV
                            </div>
                            <div className="mt-3 rounded-xl bg-[#F2FBF7] px-2 py-2 text-center text-[12.5px] font-black leading-none tracking-normal text-[#00996F]" title={studentCode}>
                                {studentCode}
                            </div>
                        </div>
                        <div className="min-h-[82px] rounded-[20px] border border-white bg-white p-3 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                            <div className="flex items-center gap-1.5 text-[10.5px] font-black text-[#7B8AB0]">
                                <span className="grid h-5 w-5 place-items-center rounded-lg bg-[#F5EEFF] text-[#7B2FFF]"><Users size={12} strokeWidth={2.4} /></span>
                                Lớp
                            </div>
                            <div className="mt-3 truncate rounded-xl bg-[#F8F3FF] px-2 py-2 text-center text-[12.5px] font-black leading-none tracking-normal text-[#7B2FFF]" title={className}>{className}</div>
                        </div>
                    </div>

                    <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#9AA5C0]">Tài khoản</div>
                    <div className="mb-3 overflow-hidden rounded-[22px] bg-white shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                        <MenuItem icon={User} iconClassName="bg-[#FFF4E5] text-[#F59E0B]" title="Cập nhật thông tin" subtitle="Họ tên, MSSV, ngành học" onClick={() => setShowAccountSettings?.(true)} />
                        <MenuItem icon={Trash2} iconClassName="bg-[#FFF0F3] text-[#E11D48]" title="Xóa dữ liệu" subtitle="Làm mới bảng điểm, lịch cá nhân" isDestructive onClick={() => handleRequestReset?.()} />
                    </div>

                    <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#9AA5C0]">Hệ thống</div>
                    <div className="mb-3 overflow-hidden rounded-[22px] bg-white shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                        <MenuItem icon={Moon} iconClassName="bg-[#FFF1F4] text-[#E11D48]" title="Giao diện" subtitle="Chủ đề mặc định" rightText="Mặc định" onClick={handleComingSoon} />
                        <MenuItem icon={Bell} iconClassName="bg-[#F1EAFF] text-[#7B2FFF]" title="Cài đặt thông báo" subtitle="Trường, sự kiện, tìm đồ, hệ thống" rightText={`${enabledNotificationCount}/4 bật`} onClick={() => setShowNotificationSettings(true)} />
                        <MenuItem icon={RefreshCw} iconClassName="bg-[#EEF2FF] text-[#1A56FF]" title="Xóa bộ nhớ đệm" subtitle="Không đăng xuất tài khoản" onClick={handleClearCache} />
                    </div>

                    <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#9AA5C0]">Về HUB Planner</div>
                    <div className="mb-3 overflow-hidden rounded-[22px] bg-white shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                        <MenuItem icon={Info} iconClassName="bg-[#F4F6FA] text-[#64748B]" title="Giới thiệu" subtitle="Về chúng mình" onClick={() => navigate('/handbook/about')} />
                        <MenuItem icon={HelpCircle} iconClassName="bg-[#F4F6FA] text-[#64748B]" title="Gửi phản hồi & góp ý" subtitle="Báo lỗi, đề xuất tính năng" onClick={() => navigate('/handbook/feedback')} />
                        <MenuItem icon={Coffee} iconClassName="bg-[#FFF4E5] text-[#F59E0B]" title="Ủng hộ (Donate)" subtitle="Giúp tụi mình duy trì hệ thống" onClick={() => navigate('/handbook/donate')} />
                        <MenuItem icon={FileText} iconClassName="bg-[#F4F6FA] text-[#64748B]" title="Điều khoản dịch vụ" subtitle="Quy định sử dụng ứng dụng" onClick={() => navigate('/terms')} />
                        <MenuItem icon={Lock} iconClassName="bg-[#F4F6FA] text-[#64748B]" title="Chính sách bảo mật" subtitle="Dữ liệu cá nhân và quyền riêng tư" onClick={() => navigate('/privacy')} />
                    </div>

                    {!isGuest ? (
                        <button type="button" onClick={handleLogout} className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[18px] border border-[#FFE0E8] bg-white text-[13px] font-black text-[#E11D48] shadow-[0_2px_14px_rgba(13,27,62,0.06)] active:bg-[#FFF0F3]">
                            <LogOut size={20} strokeWidth={2.4} /> Đăng xuất
                        </button>
                    ) : (
                        <button type="button" onClick={() => { playClick(); navigate('/login'); }} className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[18px] bg-[#1A56FF] text-[13px] font-black text-white shadow-[0_8px_18px_rgba(26,86,255,0.24)] active:bg-[#174AE0]">
                            <User size={20} strokeWidth={2.4} /> Đăng nhập
                        </button>
                    )}
                </div>
            </div>

            {showNotificationSettings && createPortal(
                <div className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/60 animate-fadeIn" onClick={() => setShowNotificationSettings(false)}>
                    <div className="flex max-h-[78vh] w-full max-w-[430px] flex-col rounded-t-3xl bg-white shadow-2xl animate-slideUp" onClick={(e) => e.stopPropagation()}>
                        <DragHandle />
                        <div className="flex items-center justify-between border-b border-gray-100 px-5 pb-3 pt-2">
                            <div>
                                <h3 className="text-lg font-black text-[#003375]">Cài đặt thông báo</h3>
                                <p className="mt-0.5 text-[11px] font-semibold text-gray-500">Chọn những loại thông báo bạn muốn nhận.</p>
                            </div>
                            <button type="button" onClick={() => setShowNotificationSettings(false)} className="rounded-full bg-gray-100 p-2 text-gray-500 active:scale-95">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto p-5 custom-scrollbar">
                            <NotificationToggle prefKey="school" title="Thông báo từ trường" subtitle="Tin tức và thông báo học vụ từ HUB." />
                            <NotificationToggle prefKey="events" title="Sự kiện" subtitle="Sự kiện mới và cập nhật điểm rèn luyện." />
                            <NotificationToggle prefKey="lostFound" title="Tìm mất đồ" subtitle="Tin báo mất, nhặt được đồ và cập nhật trạng thái." />
                            <NotificationToggle prefKey="system" title="Thông báo hệ thống" subtitle="Bảo trì, bảo mật và các cập nhật quan trọng." />
                        </div>

                        <div className="border-t border-gray-100 bg-white px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
                            <button type="button" onClick={() => { playClick(); setShowNotificationSettings(false); }} className="h-[50px] w-full rounded-2xl bg-[#003375] text-[13px] font-black text-white shadow-[0_8px_18px_rgba(0,51,117,0.18)] active:bg-[#002855]">
                                Lưu lựa chọn
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
