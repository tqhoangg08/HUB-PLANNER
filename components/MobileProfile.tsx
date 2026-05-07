import React, { useState, useEffect } from 'react';
import { 
    User, History, Trash2, Moon, Bell, RefreshCw, 
    Info, HelpCircle, Coffee, FileText, Lock, 
    ChevronRight, LogOut, CheckCircle2, ChevronLeft,
    Calendar, MapPin, Clock, Loader2,
    Download, Share, PlusSquare, X
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { fetchProfilePrivate } from '../utils/profilePrivate';
import { playClick } from '../utils/audio';
import { showConfirm } from '../utils/appNotifications';
import { useNavigate } from 'react-router-dom';

interface MobileProfileProps {
    setShowAccountSettings?: (v: boolean) => void;
    handleRequestReset?: () => void;
}

export const MobileProfile: React.FC<MobileProfileProps> = ({ setShowAccountSettings, handleRequestReset }) => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<any>(null);
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);
    const [showIOSInstructions, setShowIOSInstructions] = useState(false);

    useEffect(() => {
        // Kiểm tra xem máy có phải iOS không (iPhone, iPad, iPod)
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
        setIsIOS(isIOSDevice);

        // Kiểm tra xem app đã được cài ra màn hình chính chưa
        const isAppInstalled = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
        setIsStandalone(isAppInstalled);

        // Bắt sự kiện cài đặt tự động (Chỉ chạy trên Android / PC Chrome)
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault(); // Chặn bảng cài đặt mặc định của trình duyệt
            setDeferredPrompt(e); // Lưu lại sự kiện để dùng khi bấm nút
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = async () => {
        playClick();
        if (isIOS) {
            // Nếu là iOS -> Bật bảng hướng dẫn bằng tay
            setShowIOSInstructions(true);
        } else if (deferredPrompt) {
            // Nếu là Android/PC -> Kích hoạt bảng cài đặt tự động
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                setDeferredPrompt(null);
            }
        } else {
            alert("Trình duyệt của bạn không hỗ trợ cài đặt hoặc bạn đã cài app rồi.");
        }
    };
    const [showEvents, setShowEvents] = useState(false);
    const [joinedEvents, setJoinedEvents] = useState<any[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

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

    useEffect(() => {
        if (showEvents && session?.user) fetchJoinedEvents();
    }, [showEvents, session]);

    const fetchJoinedEvents = async () => {
        setLoadingEvents(true);
        const { data, error } = await supabase
            .from('user_participations')
            .select('*, events(*)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });
        
        if (!error && data) {
            const events = data.map(d => d.events).filter(e => e != null);
            setJoinedEvents(events);
        }
        setLoadingEvents(false);
    };

    const handleLogout = async () => {
        playClick();
        if (await showConfirm("Bạn có chắc chắn muốn đăng xuất?")) {
            await supabase.auth.signOut();
            localStorage.clear();
            sessionStorage.clear();
            navigate('/login', { replace: true }); 
        }
    };

    const handleComingSoon = () => {
        playClick();
        alert("Tính năng đang được cập nhật, bạn quay lại sau nhé!");
    };

    const handleClearCache = async () => {
        playClick();
        if (await showConfirm("Bạn muốn xóa bộ nhớ đệm cục bộ? (Không làm đăng xuất tài khoản)")) {
            Object.keys(localStorage).forEach(key => {
                if (!key.startsWith('sb-')) localStorage.removeItem(key);
            });
            alert("Đã xóa bộ nhớ đệm thành công!");
            window.location.reload();
        }
    };

    const isGuest = !session;
    const displayName = isGuest ? "Khách (Ẩn danh)" : (profile?.full_name || profile?.data?.studentName || session?.user?.user_metadata?.full_name || "Sinh viên HUB");
    const displaySub = isGuest ? "Đăng nhập để lưu trữ dữ liệu" : (profile?.email || session?.user?.email || "Sinh viên chính quy");
    const avatarUrl = profile?.avatar_url || session?.user?.user_metadata?.avatar_url;
    const isColorAvatar = avatarUrl?.startsWith('#');
    const avatarSeed = displayName.charAt(0).toUpperCase();

    const MenuItem = ({ icon: Icon, iconColor, iconBg, title, rightText, onClick, isDestructive = false }: any) => (
        <button onClick={() => { playClick(); onClick?.(); }} className="w-full flex items-center justify-between p-4 border-b border-gray-50 last:border-0 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors">
            <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg} ${iconColor}`}>
                    <Icon size={20} strokeWidth={2.5} />
                </div>
                <span className={`text-[15px] font-bold ${isDestructive ? 'text-red-600' : 'text-gray-800'}`}>{title}</span>
            </div>
            <div className="flex items-center gap-2">
                {rightText && <span className="text-xs text-gray-400 font-medium">{rightText}</span>}
                <ChevronRight size={18} className="text-gray-300" />
            </div>
        </button>
    );

    // MÀN HÌNH LỊCH SỬ SỰ KIỆN (Giữ nguyên dạng trượt lên)
    if (showEvents) {
        return (
            <div className="mobile-profile-page mobile-profile-history fixed inset-0 bg-[#F8FAFC] z-[100] flex flex-col animate-slideInRight pb-safe">
                <div className="bg-[#003375] px-4 py-4 flex items-center gap-3 shadow-md shrink-0">
                    <button onClick={() => { playClick(); setShowEvents(false); }} className="p-1.5 text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors active:scale-95">
                        <ChevronLeft size={24} />
                    </button>
                    <h2 className="text-lg font-bold text-white tracking-tight">Lịch sử tham gia</h2>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                    {isGuest ? (
                        <div className="text-center py-12 px-4 bg-white rounded-xl border border-dashed border-gray-300">
                            <Lock size={32} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-sm font-medium text-gray-500">Đăng nhập để xem lịch sử tham gia sự kiện của bạn.</p>
                        </div>
                    ) : loadingEvents ? (
                        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#003375]" size={24} /></div>
                    ) : joinedEvents.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                            <Calendar size={32} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-sm font-medium text-gray-500">Bạn chưa nhấn tham gia sự kiện nào.</p>
                        </div>
                    ) : (
                        joinedEvents.map((ev, idx) => (
                            <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex gap-3">
                                <div className="w-12 h-12 bg-blue-50 text-[#003375] rounded-xl flex items-center justify-center shrink-0">
                                    <Calendar size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm mb-1 leading-snug line-clamp-2">{ev.title}</h3>
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-0.5">
                                        <Clock size={12} /> {ev.date ? new Date(ev.date).toLocaleDateString('vi-VN') : 'Đang cập nhật'}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                        <MapPin size={12} /> {ev.location || 'Đang cập nhật'}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="mobile-page mobile-profile-page min-h-[100dvh] bg-[#F8FAFC] pb-24 animate-fadeIn">
            <div 
    className="bg-[#003375] rounded-b-[40px] px-6 pb-[100px] relative"
    style={{ paddingTop: 'calc(env(safe-area-inset-top) + 40px)' }}
>
    <h1 className="text-[26px] font-extrabold text-white tracking-tight">Hồ sơ cá nhân</h1>
</div>

            <div className="-mt-16 mx-4 bg-white rounded-[24px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex items-center gap-4 relative z-10">
                <div className="shrink-0">
                    {avatarUrl && !isColorAvatar ? (
                        <img src={avatarUrl} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-gray-100 shadow-sm" />
                    ) : (
                        <div 
                            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-extrabold shadow-sm border border-gray-100"
                            style={{ backgroundColor: isColorAvatar ? avatarUrl : '#F3F4F6', color: isColorAvatar ? '#FFF' : '#9CA3AF' }}
                        >
                            {!avatarUrl ? <User size={32} strokeWidth={1.5} /> : avatarSeed}
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-[17px] font-extrabold text-gray-900 leading-tight truncate">{displayName}</h2>
                    <p className="text-[11px] text-gray-500 mt-1 mb-2 font-medium truncate">{displaySub}</p>
                    {!isGuest && (
                        <div className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            <CheckCircle2 size={12} /> Sinh viên HUB
                        </div>
                    )}
                </div>
            </div>

            <div className="mx-4 mt-6">
                <h3 className="text-[13px] font-extrabold text-gray-500 mb-3 px-1">Tài khoản</h3>
                <div className="bg-white rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                    <MenuItem icon={User} iconColor="text-orange-500" iconBg="bg-orange-50" title="Cập nhật thông tin" onClick={() => { playClick(); setShowAccountSettings?.(true); }} />
                    <MenuItem icon={History} iconColor="text-blue-500" iconBg="bg-blue-50" title="Lịch sử tham gia sự kiện" onClick={() => { playClick(); setShowEvents(true); }} />
                    <MenuItem icon={Trash2} iconColor="text-red-500" iconBg="bg-red-50" title="Xóa dữ liệu" isDestructive={true} onClick={() => { playClick(); handleRequestReset?.(); }} />
                </div>
            </div>

            {/* DANH SÁCH MENU HỆ THỐNG */}
            <div className="mx-4 mt-6">
                <h3 className="text-[13px] font-extrabold text-gray-500 mb-3 px-1">Hệ thống</h3>
                <div className="bg-white rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                    
                    {/* ✨ THÊM MỚI: NÚT TẢI APP (Chỉ hiện khi chưa cài đặt) */}
                    {!isStandalone && (
                        <MenuItem 
                            icon={Download} iconColor="text-green-600" iconBg="bg-green-50" 
                            title="Cài đặt App (Tải xuống)" rightText="Nhanh & Mượt hơn"
                            onClick={handleInstallClick}
                        />
                    )}

                    <MenuItem icon={Moon} iconColor="text-rose-500" iconBg="bg-rose-50" title="Giao diện" rightText="Mặc định" onClick={handleComingSoon} />
                    <MenuItem icon={Bell} iconColor="text-rose-500" iconBg="bg-rose-50" title="Cài đặt thông báo" onClick={handleComingSoon} />
                    <MenuItem icon={RefreshCw} iconColor="text-rose-500" iconBg="bg-rose-50" title="Xóa bộ nhớ đệm" onClick={handleClearCache} />
                </div>
            </div>

            {/* ✨ THÊM MỚI: BẢNG HƯỚNG DẪN DÀNH RIÊNG CHO IOS */}
            {showIOSInstructions && (
                <div className="fixed inset-0 z-[200] bg-black/60 flex items-end justify-center sm:items-center p-4 animate-fadeIn" onClick={() => setShowIOSInstructions(false)}>
                    <div className="bg-white w-full max-w-sm rounded-3xl p-6 relative animate-slideUp sm:animate-scaleIn shadow-2xl" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setShowIOSInstructions(false)} className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200">
                            <X size={20} />
                        </button>
                        
                        <div className="w-16 h-16 bg-blue-50 text-[#003375] rounded-full flex items-center justify-center mx-auto mb-4">
                            <Download size={32} />
                        </div>
                        
                        <h3 className="text-xl font-black text-center text-[#003375] mb-2">Cài đặt HUB Planner</h3>
                        <p className="text-sm text-gray-600 text-center mb-6 leading-relaxed">
                            Apple iOS không cho phép cài đặt tự động. Bạn vui lòng làm theo 2 bước cực nhanh sau nhé:
                        </p>
                        
                        <div className="space-y-4">
                            <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 text-blue-500">
                                    <Share size={20} />
                                </div>
                                <p className="text-sm font-medium text-gray-700">
                                    <strong>Bước 1:</strong> Nhấn vào biểu tượng <span className="text-blue-500 font-bold">Chia sẻ (Share)</span> ở thanh công cụ Safari (dưới cùng màn hình).
                                </p>
                            </div>
                            
                            <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center shrink-0 text-gray-800">
                                    <PlusSquare size={20} />
                                </div>
                                <p className="text-sm font-medium text-gray-700">
                                    <strong>Bước 2:</strong> Cuộn xuống và chọn <span className="font-bold text-gray-900">Thêm vào MH chính</span> (Add to Home Screen).
                                </p>
                            </div>
                        </div>

                        <button onClick={() => setShowIOSInstructions(false)} className="w-full bg-[#003375] text-white font-bold py-4 rounded-2xl mt-6 active:scale-95 transition-transform">
                            Đã hiểu
                        </button>
                        
                        {/* Mũi tên chỉ xuống đáy màn hình cho iOS */}
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-white rotate-45"></div>
                    </div>
                </div>
            )}

            {/* ✨ TẤT CẢ CÁC NÚT DƯỚI ĐÂY ĐỀU ĐƯỢC CHUYỂN HƯỚNG RA TRANG ĐỘC LẬP */}
            <div className="mx-4 mt-6 mb-6">
                <h3 className="text-[13px] font-extrabold text-gray-500 mb-3 px-1">Về HUB Planner</h3>
                <div className="bg-white rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                    <MenuItem icon={Info} iconColor="text-gray-500" iconBg="bg-gray-50" title="Giới thiệu" rightText="Về chúng mình" onClick={() => { playClick(); navigate('/handbook/about'); }} />
                    <MenuItem icon={HelpCircle} iconColor="text-gray-500" iconBg="bg-gray-50" title="Gửi phản hồi & Góp ý" onClick={() => { playClick(); navigate('/handbook/feedback'); }} />
                    <MenuItem icon={Coffee} iconColor="text-gray-500" iconBg="bg-gray-50" title="Ủng hộ (Donate)" onClick={() => { playClick(); navigate('/handbook/donate'); }} />
                    <MenuItem icon={FileText} iconColor="text-gray-500" iconBg="bg-gray-50" title="Điều khoản dịch vụ" onClick={() => { playClick(); navigate('/terms'); }} />
                    <MenuItem icon={Lock} iconColor="text-gray-500" iconBg="bg-gray-50" title="Chính sách bảo mật" onClick={() => { playClick(); navigate('/privacy'); }} />
                </div>
            </div>

            <div className="mx-4 pb-8">
                {!isGuest ? (
                    <button onClick={handleLogout} className="w-full bg-white text-red-600 font-bold py-4 rounded-2xl border border-red-100 shadow-sm flex items-center justify-center gap-2 active:bg-red-50 transition-colors">
                        <LogOut size={20} /> Đăng xuất
                    </button>
                ) : (
                    <button onClick={() => { playClick(); navigate('/login'); }} className="w-full bg-[#003375] text-white font-bold py-4 rounded-2xl shadow-md flex items-center justify-center gap-2 active:bg-[#002855] transition-colors">
                        <User size={20} /> Đăng nhập
                    </button>
                )}
            </div>
        </div>
    );
};
