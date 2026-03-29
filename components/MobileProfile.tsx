import React, { useState, useEffect } from 'react';
import { 
    User, History, Trash2, Moon, Bell, RefreshCw, 
    Info, HelpCircle, Coffee, FileText, Lock, 
    ChevronRight, LogOut, CheckCircle2, ChevronLeft,
    Heart, MessageSquarePlus, ExternalLink, Mail, Phone,
    Facebook, Crown, Calendar, MapPin, Clock, Loader2, Check
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { playClick } from '../utils/audio';
import { useNavigate, Link } from 'react-router-dom';

interface MobileProfileProps {
    setShowAccountSettings?: (v: boolean) => void;
    handleRequestReset?: () => void;
}

type SubScreen = 'main' | 'events' | 'feedback' | 'donate' | 'about';

export const MobileProfile: React.FC<MobileProfileProps> = ({ setShowAccountSettings, handleRequestReset }) => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<any>(null);
    const [session, setSession] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // --- STATES CHO CÁC MÀN HÌNH PHỤ (SUB-SCREENS) ---
    const [activeScreen, setActiveScreen] = useState<SubScreen>('main');
    
    // States cho Lịch sử sự kiện
    const [joinedEvents, setJoinedEvents] = useState<any[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

    // States cho Feedback
    const [feedbackType, setFeedbackType] = useState<'bug' | 'idea'>('idea');
    const [feedbackContent, setFeedbackContent] = useState('');
    const [contactInfo, setContactInfo] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

    // States cho Donate
    const [donateForm, setDonateForm] = useState({ name: '', mssv: '', amount: '', message: '' });
    const [isDonating, setIsDonating] = useState(false);
    const [donors, setDonors] = useState<any[]>([]);
    const [loadingDonors, setLoadingDonors] = useState(false);

    // --- FETCH DATA CƠ BẢN ---
    useEffect(() => {
        const fetchUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setSession(session);

            if (session?.user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                
                if (data) setProfile(data);
            }
            setLoading(false);
        };
        fetchUser();
    }, []);

    // --- FETCH DATA KHI MỞ MÀN HÌNH PHỤ ---
    useEffect(() => {
        if (activeScreen === 'events' && session?.user) {
            fetchJoinedEvents();
        } else if (activeScreen === 'donate') {
            fetchDonors();
        }
    }, [activeScreen, session]);

    const fetchJoinedEvents = async () => {
        setLoadingEvents(true);
        const { data, error } = await supabase
            .from('user_participations')
            .select('*, events(*)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });
        
        if (!error && data) {
            // Lấy ra danh sách các event từ join table
            const events = data.map(d => d.events).filter(e => e != null);
            setJoinedEvents(events);
        }
        setLoadingEvents(false);
    };

    const fetchDonors = async () => {
        setLoadingDonors(true);
        const { data, error } = await supabase
            .from('donations')
            .select('*')
            .order('amount', { ascending: false }); 
        
        if (!error && data) setDonors(data);
        setLoadingDonors(false);
    };

    // --- HÀM XỬ LÝ CHỨC NĂNG ---
    const handleLogout = async () => {
        playClick();
        if (window.confirm("Bạn có chắc chắn muốn đăng xuất?")) {
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

    const handleClearCache = () => {
        playClick();
        if (window.confirm("Bạn muốn xóa bộ nhớ đệm cục bộ? (Không làm đăng xuất tài khoản)")) {
            Object.keys(localStorage).forEach(key => {
                if (!key.startsWith('sb-')) localStorage.removeItem(key);
            });
            alert("Đã xóa bộ nhớ đệm thành công!");
            window.location.reload();
        }
    };

    const handleDonateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!donateForm.name || !donateForm.amount) return;
        setIsDonating(true);
        try {
            const cleanAmount = parseInt(donateForm.amount.replace(/\D/g, '')) || 0;
            const { error } = await supabase.from('donations').insert([{
                name: donateForm.name, student_id: donateForm.mssv, message: donateForm.message, amount: cleanAmount
            }]);
            if (error) throw error;
            alert("Cảm ơn tấm lòng vàng của bạn! ❤️");
            setDonateForm({ name: '', mssv: '', amount: '', message: '' }); 
            fetchDonors(); 
        } catch (error) {
            alert("Có lỗi xảy ra, vui lòng thử lại.");
        } finally {
            setIsDonating(false);
        }
    };

    const handleSubmitFeedback = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!feedbackContent.trim()) return;
        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('feedback').insert([{ type: feedbackType, content: feedbackContent, contact: contactInfo }]);
            if (error) throw error;
            setSubmitStatus('success');
            setFeedbackContent('');
            setContactInfo('');
            setTimeout(() => setSubmitStatus('idle'), 5000);
        } catch (error) {
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    // --- BIẾN HIỂN THỊ CƠ BẢN ---
    const isGuest = !session;
    const displayName = isGuest ? "Khách (Ẩn danh)" : (profile?.full_name || profile?.data?.studentName || session?.user?.user_metadata?.full_name || "Sinh viên HUB");
    const displaySub = isGuest ? "Đăng nhập để lưu trữ dữ liệu" : (profile?.email || session?.user?.email || "Sinh viên chính quy");
    const avatarUrl = profile?.avatar_url || session?.user?.user_metadata?.avatar_url;
    const isColorAvatar = avatarUrl?.startsWith('#');
    const avatarSeed = displayName.charAt(0).toUpperCase();

    // COMPONENT RENDER MENU
    const MenuItem = ({ icon: Icon, iconColor, iconBg, title, rightText, onClick, isDestructive = false }: any) => (
        <button 
            onClick={() => { playClick(); onClick?.(); }} 
            className="w-full flex items-center justify-between p-4 border-b border-gray-50 last:border-0 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
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

    // =========================================================
    // RENDER: MÀN HÌNH PHỤ (SUB-SCREENS)
    // =========================================================
    if (activeScreen !== 'main') {
        let screenTitle = "";
        if (activeScreen === 'events') screenTitle = "Lịch sử tham gia";
        if (activeScreen === 'feedback') screenTitle = "Góp ý & Phản hồi";
        if (activeScreen === 'donate') screenTitle = "Ủng hộ (Donate)";
        if (activeScreen === 'about') screenTitle = "Giới thiệu";

        return (
            <div className="fixed inset-0 bg-[#F8FAFC] z-[100] flex flex-col animate-slideInRight pb-safe">
                {/* Header Màn hình phụ */}
                <div className="bg-[#003375] px-4 py-4 flex items-center gap-3 shadow-md shrink-0">
                    <button onClick={() => { playClick(); setActiveScreen('main'); }} className="p-1.5 text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors active:scale-95">
                        <ChevronLeft size={24} />
                    </button>
                    <h2 className="text-lg font-bold text-white tracking-tight">{screenTitle}</h2>
                </div>

                {/* Nội dung màn hình phụ */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    
                    {/* 1. LỊCH SỬ SỰ KIỆN */}
                    {activeScreen === 'events' && (
                        <div className="p-4 space-y-3">
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
                    )}

                    {/* 2. GIỚI THIỆU (ABOUT) */}
                    {activeScreen === 'about' && (
                        <div className="p-4">
                            <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center mb-6 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full blur-2xl -translate-y-1/2 translate-x-1/3"></div>
                                <img src="/logo.png" alt="Logo" className="w-20 h-20 mx-auto object-contain mb-4 relative z-10" />
                                <h2 className="text-2xl font-black text-[#003375] mb-2 relative z-10">HUB PLANNER</h2>
                                <p className="text-sm text-gray-600 leading-relaxed relative z-10">
                                    Dự án phi lợi nhuận phát triển bởi sinh viên HUB. Sứ mệnh của chúng mình là đơn giản hóa đời sống sinh viên, từ quản lý điểm số đến kết nối cộng đồng.
                                </p>
                                <div className="mt-4 flex items-center justify-center gap-1.5 text-[#990000] font-bold text-xs">
                                    <Heart className="fill-current animate-pulse" size={14} /> Made with love
                                </div>
                            </div>

                            <h3 className="font-extrabold text-gray-500 text-sm uppercase tracking-wider mb-3 px-1 text-center">Đội ngũ phát triển</h3>
                            <div className="space-y-3">
                                {/* Founder */}
                                <div className="bg-gradient-to-r from-[#003375] to-[#00509d] rounded-xl p-5 text-white flex items-center gap-4 shadow-md">
                                    <div className="w-14 h-14 bg-white rounded-full text-[#003375] flex items-center justify-center font-bold text-2xl shrink-0">H</div>
                                    <div>
                                        <h4 className="font-bold text-lg leading-tight">Trần Quốc Hoàng</h4>
                                        <p className="text-blue-200 text-xs uppercase tracking-wider font-semibold mb-2">Founder</p>
                                        <div className="flex items-center gap-3">
                                            <a href="https://facebook.com/tqhoangg.05" target="_blank" className="p-1.5 bg-white/20 rounded-full hover:bg-white hover:text-[#003375] transition-colors"><Facebook size={14}/></a>
                                            <a href="mailto:contact@hotrosinhvienhub.id.vn" className="p-1.5 bg-white/20 rounded-full hover:bg-white hover:text-red-500 transition-colors"><Mail size={14}/></a>
                                        </div>
                                    </div>
                                </div>
                                {/* Cộng tác viên */}
                                <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-50 text-[#003375] rounded-full flex items-center justify-center"><User size={18}/></div>
                                    <div>
                                        <h4 className="font-bold text-sm text-gray-800">Nguyễn Hoàng Khiêm</h4>
                                        <p className="text-[11px] text-gray-500 font-medium">Cộng tác viên</p>
                                    </div>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-50 text-[#003375] rounded-full flex items-center justify-center"><User size={18}/></div>
                                    <div>
                                        <h4 className="font-bold text-sm text-gray-800">Nguyễn Thùy Thương</h4>
                                        <p className="text-[11px] text-gray-500 font-medium">Cộng tác viên</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 3. ĐÓNG GÓP PHẢN HỒI (FEEDBACK) */}
                    {activeScreen === 'feedback' && (
                        <div className="p-4 space-y-5">
                            <div className="bg-teal-50 border border-teal-100 p-4 rounded-xl flex items-start gap-3">
                                <MessageSquarePlus className="text-teal-600 shrink-0" size={24} />
                                <p className="text-xs text-teal-800 leading-relaxed font-medium mt-0.5">Mọi ý kiến đóng góp hoặc báo lỗi của bạn đều giúp ứng dụng hoàn thiện hơn mỗi ngày.</p>
                            </div>

                            {submitStatus === 'success' ? (
                                <div className="text-center py-10 bg-white border border-gray-200 rounded-xl">
                                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4"><Check size={32} /></div>
                                    <h4 className="text-lg font-bold text-gray-800 mb-1">Đã gửi thành công!</h4>
                                    <p className="text-xs text-gray-500 px-4">Cảm ơn bạn đã đóng góp ý kiến.</p>
                                    <button onClick={() => setSubmitStatus('idle')} className="mt-4 text-[#003375] font-bold text-sm hover:underline">Gửi phản hồi khác</button>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmitFeedback} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Bạn muốn gửi gì?</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button type="button" onClick={() => setFeedbackType('bug')} className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${feedbackType === 'bug' ? 'bg-red-50 border-red-500 text-red-700 ring-1 ring-red-500' : 'bg-white border-gray-200 text-gray-500'}`}>
                                                <Mail size={20} /> <span className="font-bold text-[11px]">Báo lỗi</span>
                                            </button>
                                            <button type="button" onClick={() => setFeedbackType('idea')} className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${feedbackType === 'idea' ? 'bg-blue-50 border-blue-500 text-[#003375] ring-1 ring-blue-500' : 'bg-white border-gray-200 text-gray-500'}`}>
                                                <ExternalLink size={20} /> <span className="font-bold text-[11px]">Ý tưởng mới</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Nội dung <span className="text-red-500">*</span></label>
                                        <textarea required rows={4} className="w-full p-3 text-sm rounded-xl border border-gray-300 focus:border-[#003375] outline-none" value={feedbackContent} onChange={e => setFeedbackContent(e.target.value)} placeholder="Nhập mô tả chi tiết..."></textarea>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">Liên hệ (Tùy chọn)</label>
                                        <input type="text" className="w-full p-3 text-sm rounded-xl border border-gray-300 focus:border-[#003375] outline-none" value={contactInfo} onChange={e => setContactInfo(e.target.value)} placeholder="Email hoặc SĐT..." />
                                    </div>
                                    <button type="submit" disabled={isSubmitting || !feedbackContent.trim()} className="w-full bg-[#003375] text-white font-bold py-3.5 rounded-xl active:scale-95 disabled:opacity-50 flex justify-center items-center gap-2 shadow-md">
                                        {isSubmitting ? 'Đang gửi...' : 'Gửi phản hồi'}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}

                    {/* 4. ỦNG HỘ (DONATE) */}
                    {activeScreen === 'donate' && (
                        <div className="pb-8">
                            <div className="bg-gradient-to-br from-pink-500 to-rose-500 p-6 text-white text-center">
                                <h2 className="text-xl font-black mb-2">Chung tay phát triển HUB Planner</h2>
                                <p className="text-pink-100 text-xs leading-relaxed max-w-[280px] mx-auto mb-5">Dự án phi lợi nhuận cần sự hỗ trợ của bạn để duy trì Server. Mọi đóng góp dù nhỏ nhất đều là động lực to lớn!</p>
                                <div className="bg-white p-3 rounded-2xl w-48 h-48 mx-auto shadow-lg">
                                    <img src="/qr-code.png" alt="QR" className="w-full h-full object-cover rounded-xl" />
                                </div>
                            </div>

                            <div className="p-4 space-y-6 -mt-4 relative z-10">
                                {/* Form báo Donate */}
                                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                    <h3 className="font-bold text-gray-800 text-sm mb-3 uppercase tracking-wide">Xác nhận ủng hộ</h3>
                                    <form onSubmit={handleDonateSubmit} className="space-y-3">
                                        <input type="text" required placeholder="Họ tên *" className="w-full p-3 bg-gray-50 rounded-xl text-sm border-transparent focus:border-pink-500 focus:bg-white outline-none border" value={donateForm.name} onChange={e => setDonateForm({...donateForm, name: e.target.value})} />
                                        <input type="text" required placeholder="Số tiền (VD: 20.000) *" className="w-full p-3 bg-gray-50 rounded-xl text-sm border-transparent focus:border-pink-500 focus:bg-white outline-none border" value={donateForm.amount} onChange={e => setDonateForm({...donateForm, amount: e.target.value})} />
                                        <input type="text" placeholder="MSSV (Tùy chọn)" className="w-full p-3 bg-gray-50 rounded-xl text-sm border-transparent focus:border-pink-500 focus:bg-white outline-none border" value={donateForm.mssv} onChange={e => setDonateForm({...donateForm, mssv: e.target.value})} />
                                        <textarea rows={2} placeholder="Lời nhắn gửi..." className="w-full p-3 bg-gray-50 rounded-xl text-sm border-transparent focus:border-pink-500 focus:bg-white outline-none border resize-none" value={donateForm.message} onChange={e => setDonateForm({...donateForm, message: e.target.value})}></textarea>
                                        <button type="submit" disabled={isDonating} className="w-full bg-pink-600 text-white font-bold py-3 rounded-xl shadow-md active:scale-95 disabled:opacity-50">
                                            {isDonating ? 'Đang gửi...' : 'Gửi thông tin xác nhận'}
                                        </button>
                                    </form>
                                </div>

                                {/* Bảng vàng */}
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                    <div className="bg-yellow-50 p-4 border-b border-yellow-100 flex items-center justify-between">
                                        <h3 className="font-black text-yellow-800 flex items-center gap-1.5 uppercase text-sm"><Crown size={16} className="fill-yellow-500 text-yellow-600"/> Bảng vàng tri ân</h3>
                                        <span className="bg-white px-2 py-0.5 rounded-full text-[10px] font-bold text-yellow-700 border border-yellow-200">{donors.length} lượt</span>
                                    </div>
                                    <div className="p-3 space-y-2 max-h-[300px] overflow-y-auto">
                                        {loadingDonors ? (
                                            <div className="text-center py-6 text-gray-400 text-xs">Đang tải...</div>
                                        ) : donors.length === 0 ? (
                                            <div className="text-center py-6 text-gray-400 text-xs italic">Chưa có ai, hãy là người đầu tiên!</div>
                                        ) : donors.map((donor, idx) => (
                                            <div key={idx} className="flex gap-3 bg-gray-50 p-3 rounded-xl">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${idx === 0 ? 'bg-yellow-400 text-white' : idx === 1 ? 'bg-gray-300 text-white' : idx === 2 ? 'bg-orange-300 text-white' : 'bg-blue-100 text-blue-700'}`}>{idx + 1}</div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between">
                                                        <h4 className="font-bold text-gray-800 text-[13px] truncate pr-2">{donor.name}</h4>
                                                        <span className="text-green-600 font-bold text-xs shrink-0">{formatCurrency(donor.amount)}</span>
                                                    </div>
                                                    {donor.message && <p className="text-[11px] text-gray-500 italic mt-0.5 line-clamp-2">"{donor.message}"</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // =========================================================
    // RENDER: MÀN HÌNH CHÍNH (MAIN PROFILE)
    // =========================================================
    return (
        <div className="min-h-[100dvh] bg-[#F8FAFC] pb-24 animate-fadeIn">
            
            {/* PHẦN HEADER */}
            <div className="bg-[#003375] h-[170px] rounded-b-[40px] px-6 pt-10 relative">
                <h1 className="text-[26px] font-extrabold text-white tracking-tight">Hồ sơ cá nhân</h1>
            </div>

            {/* THẺ THÔNG TIN */}
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
                            <CheckCircle2 size={12} />
                            Sinh viên HUB
                        </div>
                    )}
                </div>
            </div>

            {/* DANH SÁCH MENU TÀI KHOẢN */}
            <div className="mx-4 mt-6">
                <h3 className="text-[13px] font-extrabold text-gray-500 mb-3 px-1">Tài khoản</h3>
                <div className="bg-white rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                    <MenuItem 
                        icon={User} iconColor="text-orange-500" iconBg="bg-orange-50" 
                        title="Cập nhật thông tin" 
                        onClick={() => { playClick(); setShowAccountSettings?.(true); }} 
                    />
                    <MenuItem 
                        icon={History} iconColor="text-blue-500" iconBg="bg-blue-50" 
                        title="Lịch sử tham gia sự kiện" 
                        onClick={() => { playClick(); setActiveScreen('events'); }} 
                    />
                    <MenuItem 
                        icon={Trash2} iconColor="text-red-500" iconBg="bg-red-50" 
                        title="Xóa dữ liệu" 
                        isDestructive={true} 
                        onClick={() => { playClick(); handleRequestReset?.(); }} 
                    />
                </div>
            </div>

            {/* DANH SÁCH MENU HỆ THỐNG */}
            <div className="mx-4 mt-6">
                <h3 className="text-[13px] font-extrabold text-gray-500 mb-3 px-1">Hệ thống</h3>
                <div className="bg-white rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                    <MenuItem 
                        icon={Moon} iconColor="text-rose-500" iconBg="bg-rose-50" 
                        title="Giao diện" rightText="Hệ thống mặc định" 
                        onClick={handleComingSoon}
                    />
                    <MenuItem 
                        icon={Bell} iconColor="text-rose-500" iconBg="bg-rose-50" 
                        title="Cài đặt thông báo" 
                        onClick={handleComingSoon}
                    />
                    <MenuItem 
                        icon={RefreshCw} iconColor="text-rose-500" iconBg="bg-rose-50" 
                        title="Xóa bộ nhớ đệm" 
                        onClick={handleClearCache}
                    />
                </div>
            </div>

            {/* DANH SÁCH MENU VỀ HUB PLANNER */}
            <div className="mx-4 mt-6 mb-6">
                <h3 className="text-[13px] font-extrabold text-gray-500 mb-3 px-1">Về HUB Planner</h3>
                <div className="bg-white rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                    {/* ✨ ĐÃ THAY "PHIÊN BẢN ỨNG DỤNG" THÀNH "GIỚI THIỆU" */}
                    <MenuItem 
                        icon={Info} iconColor="text-gray-500" iconBg="bg-gray-50" 
                        title="Giới thiệu" rightText="Về chúng mình" 
                        onClick={() => { playClick(); setActiveScreen('about'); }}
                    />
                    <MenuItem 
                        icon={HelpCircle} iconColor="text-gray-500" iconBg="bg-gray-50" 
                        title="Gửi phản hồi & Góp ý" onClick={() => { playClick(); setActiveScreen('feedback'); }}
                    />
                    <MenuItem 
                        icon={Coffee} iconColor="text-gray-500" iconBg="bg-gray-50" 
                        title="Ủng hộ (Donate)" onClick={() => { playClick(); setActiveScreen('donate'); }}
                    />
                    <MenuItem 
                        icon={FileText} iconColor="text-gray-500" iconBg="bg-gray-50" 
                        title="Điều khoản dịch vụ" onClick={() => { playClick(); navigate('/terms'); }}
                    />
                    <MenuItem 
                        icon={Lock} iconColor="text-gray-500" iconBg="bg-gray-50" 
                        title="Chính sách bảo mật" onClick={() => { playClick(); navigate('/privacy'); }}
                    />
                </div>
            </div>

            {/* NÚT ĐĂNG XUẤT */}
            <div className="mx-4 pb-8">
                {!isGuest ? (
                    <button 
                        onClick={handleLogout} 
                        className="w-full bg-white text-red-600 font-bold py-4 rounded-2xl border border-red-100 shadow-sm flex items-center justify-center gap-2 active:bg-red-50 transition-colors"
                    >
                        <LogOut size={20} /> Đăng xuất
                    </button>
                ) : (
                    <button 
                        onClick={() => { playClick(); navigate('/login'); }} 
                        className="w-full bg-[#003375] text-white font-bold py-4 rounded-2xl shadow-md flex items-center justify-center gap-2 active:bg-[#002855] transition-colors"
                    >
                        <User size={20} /> Đăng nhập
                    </button>
                )}
            </div>

        </div>
    );
};