import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { 
  Search, Calendar, MapPin, Award, Loader2, RefreshCw, Users, Clock, 
  AlertCircle, FileText, X, PlusCircle, Sparkles, GraduationCap, BookOpen, 
  Phone, Send, User, Link as LinkIcon, Type, CheckCircle2, Building2, 
  ChevronDown, Flame, Lock, Circle, Siren, Edit2, Trash2, 
  Save, ToggleLeft, ToggleRight, Settings, Tag, RotateCcw,
  Info, ExternalLink, CalendarClock,
  Bookmark, BookmarkCheck, ArrowDownUp, AlertTriangle, CalendarDays, MoreHorizontal, UserPlus
} from 'lucide-react';
import { playClick } from '../utils/audio';
import { showConfirm } from '../utils/appNotifications';
import { useUserRole } from '../hooks/useUserRole';
import { CTVRegistrationForm } from './CTVRegistrationForm';
import NotificationNudge from './NotificationNudge';
import { notifyModerators } from '../utils/moderatorNotifications';
import { apiHeaders, apiUrl } from '../utils/api';

// --- Types ---
interface HubEvent {
  id: string;
  name: string;      
  category: string;  
  score: string;     
  location: string;  
  time: string;      
  deadlineDate: Date | null;
  deadline_time: string | null; 
  close_on_full: boolean;        
  description: string | null;   
  link: string;
  organizer: string;
  type: string;      
  classification: string; 
  scope: string;     
  status: string;
  is_manually_closed: boolean;
  is_deleted: boolean; 
  created_at: string; 
  event_date: string | null; 
  event_time: string | null;
  registration_start_date: string | null;
  registration_start_time: string | null;
}

interface MobileEventsProps {
    viewUserId?: string;
}

// --- Helper ---
const formatDateString = (isoDate: string): string => {
    if (!isoDate) return 'Chưa cập nhật';
    try {
        const date = new Date(isoDate);
        return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
        return isoDate;
    }
};

const formatTimeString = (timeStr: string | null): string => {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
    return timeStr;
};

const notifyAllUsersAboutEvent = async (event: any) => {
    if (!event || event.status === 'pending') return;
    try {
        const eventTitle = event.title || 'Có một sự kiện mới';
        const criteriaLabel = event.criteria ? ` - Mục ${event.criteria}` : '';
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        await fetch(apiUrl('/push?resource=send'), {
            method: 'POST',
            headers: apiHeaders({
                'Content-Type': 'application/json',
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
            }),
            body: JSON.stringify({
                title: 'Sự kiện mới',
                body: `${eventTitle}${criteriaLabel}`,
                url: event.id ? `/events/${event.id}` : '/events',
                category: 'events'
            })
        });
    } catch (error) {
        console.error('Không gửi được push cho sự kiện mới:', error);
    }
};

const checkIsOverdue = (evt: HubEvent, currentDay: Date) => {
    if (evt.deadlineDate) {
        return evt.deadlineDate < currentDay;
    }
    if (evt.close_on_full && evt.event_date) {
        const evtDate = new Date(evt.event_date);
        evtDate.setHours(0, 0, 0, 0);
        
        const todayStart = new Date(currentDay);
        todayStart.setHours(0, 0, 0, 0);
        
        return todayStart >= evtDate; 
    }
    return false;
};

// --- Mobile Bottom Sheet Drag Handle ---
const DragHandle = () => (
    <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-3 mb-1 shrink-0" />
);

// --- Sub-Components (Modals) ---

const CTVModalWrapper = ({ isOpen, onClose, onShowToast }: { isOpen: boolean; onClose: () => void; onShowToast: (msg: string, type: 'success' | 'error') => void }) => {
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/60 flex items-end justify-center animate-fadeIn sm:p-4" onClick={onClose}>
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl animate-slideUp overflow-hidden" onClick={e => e.stopPropagation()}>
                <DragHandle />
                <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
                    <div className="flex justify-between items-start mb-2">
                        <div className="w-14 h-14 bg-blue-100 text-[#003375] rounded-full flex items-center justify-center shadow-sm border border-blue-200">
                            <UserPlus size={28} />
                        </div>
                        <button onClick={onClose} className="text-gray-400 bg-gray-100 p-2 rounded-full transition-colors active:scale-95">
                            <X size={18} />
                        </button>
                    </div>
                    <h3 className="text-2xl font-black text-[#003375] mb-2 mt-2">Đăng ký CTV</h3>
                    <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                        Gia nhập đội ngũ phát triển nội dung, giúp cập nhật thông tin sự kiện nhanh nhất cho cộng đồng sinh viên HUB!
                    </p>
                    <div className="bg-gray-50 -mx-5 px-5 py-4 border-t border-gray-100">
                        <CTVRegistrationForm 
                            onSuccess={() => {
                                onShowToast("Đã gửi đơn đăng ký CTV thành công!", "success");
                            }}
                            onClose={onClose} 
                        />
                    </div>
                </div>
            </div>
        </div>, document.body
    );
};

const ScoreGuideModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    if (!isOpen) return null;

    const sections = [
        {
            id: 'I', title: 'Đánh giá về ý thức học tập', range: '0 → 20', color: 'blue',
            content: [
                { type: 'header', text: 'Điểm cộng' },
                { text: '- Kết quả học tập xuất sắc/giỏi/khá/TBK/TB', points: '+ 5 đến 15' },
                { text: '- Tham gia/Đạt giải NCKH, cuộc thi học thuật', points: '+ 4 đến 20' },
                { text: '- Là thành viên CLB học thuật', points: '+ 5' },
                { type: 'header', text: 'Điểm trừ', isNegative: true },
                { text: 'Bị cảnh báo học vụ, vi phạm liên quan học tập.', points: '- 5/lần' },
            ]
        },
        {
            id: 'II', title: 'Ý thức chấp hành nội quy', range: '0 → 25', color: 'green',
            content: [
                { type: 'header', text: 'Điểm cộng' },
                { text: '- Không vi phạm nội quy Trường', points: '+ 20' },
                { text: '- Tham gia sinh hoạt lớp, sinh hoạt công dân', points: '+ 5đ/lần' },
                { type: 'header', text: 'Điểm trừ', isNegative: true },
                { text: '- Vi phạm quy chế bị lập biên bản, vắng sinh hoạt lớp', points: '- 3 đến 5/lần' },
            ]
        },
        {
            id: 'III', title: 'Hoạt động chính trị, văn hóa, thể thao', range: '0 → 20', color: 'yellow',
            content: [
                { type: 'header', text: 'Điểm cộng' },
                { text: '- BTC/Tham gia trực tiếp các hoạt động', points: '+ 5 đến 10đ/HĐ' },
                { text: '- Cổ vũ, tham gia công trình thanh niên', points: '+ 3 đến 5đ/HĐ' },
                { type: 'header', text: 'Điểm trừ', isNegative: true },
                { text: 'Vi phạm kỷ luật trong quá trình tham gia', points: '- 5đ/lần' },
            ]
        },
        {
            id: 'IV', title: 'Ý thức công dân, cộng đồng', range: '0 → 25', color: 'orange',
            content: [
                { type: 'header', text: 'Điểm cộng' },
                { text: '- Chấp hành tốt tại nơi cư trú', points: '+ 15' },
                { text: '- Mùa hè xanh, Xuân tình nguyện, Hiến máu', points: '+ 10 đến 15' },
                { text: '- Thành viên CLB khác, CTV Đoàn/Hội', points: '+ 4 đến 5' },
                { type: 'header', text: 'Điểm trừ', isNegative: true },
                { text: 'Vi phạm quy định nơi cư trú, KTX', points: '- 5đ/vi phạm' },
            ]
        },
        {
            id: 'V', title: 'Công tác cán bộ, thành tích đặc biệt', range: '0 → 10', color: 'purple',
            content: [
                { text: '- Ban cán sự lớp, BCH Đoàn/Hội, BCN CLB', points: '+ 5' },
                { text: '- Thành tích đặc biệt xuất sắc (Bằng khen Tỉnh/Thành)', points: '+ 10' },
                { text: '- Đạt danh hiệu Sinh viên 5 tốt các cấp', points: '+ 6 đến 10' },
            ]
        }
    ];

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end sm:items-center justify-center animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-t-3xl sm:rounded-xl w-full h-[90vh] flex flex-col animate-slideUp relative overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                <DragHandle />
                <div className="px-4 pb-4 pt-2 border-b flex justify-between items-center bg-white shrink-0">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-[#003375]"><FileText size={20}/> Phụ lục Điểm Rèn Luyện</h3>
                    <button onClick={onClose} className="text-gray-400 bg-gray-100 p-2 rounded-full active:scale-95"><X size={20} /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-gray-50">
                    <div className="space-y-4">
                        {sections.map((section) => (
                            <div key={section.id} className={`bg-white rounded-xl border-l-4 shadow-sm overflow-hidden ${
                                section.color === 'blue' ? 'border-blue-500' :
                                section.color === 'green' ? 'border-green-500' :
                                section.color === 'yellow' ? 'border-yellow-500' :
                                section.color === 'orange' ? 'border-orange-500' :
                                'border-purple-500'
                            }`}>
                                <div className="px-4 py-3 border-b flex justify-between items-center bg-gray-50/50">
                                    <h4 className="font-bold text-sm text-gray-800 flex flex-1 items-center gap-2 pr-2">
                                        <span className="shrink-0 w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs border border-gray-200">{section.id}</span>
                                        {section.title}
                                    </h4>
                                    <span className="font-bold bg-white px-2 py-1 rounded text-xs shadow-sm border border-gray-200 whitespace-nowrap">{section.range}</span>
                                </div>
                                <div>
                                    <table className="w-full text-xs">
                                        <tbody>
                                            {section.content.map((row: any, idx: number) => {
                                                if (row.type === 'header') {
                                                    return (
                                                        <tr key={idx} className={`${row.isNegative ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'} font-bold`}>
                                                            <td colSpan={2} className="px-4 py-2 uppercase text-[10px] tracking-wider border-b border-gray-100">{row.text}</td>
                                                        </tr>
                                                    )
                                                }
                                                return (
                                                    <tr key={idx} className="border-b border-gray-100 last:border-0">
                                                        <td className="px-4 py-2.5 text-gray-700 leading-relaxed">{row.text}</td>
                                                        <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap align-top">
                                                            {row.points && (
                                                                <span className={`px-1.5 py-0.5 rounded ${row.points.includes('-') ? 'text-red-700 bg-red-50' : 'text-[#003375] bg-blue-50'}`}>
                                                                    {row.points}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>, document.body
    );
};

const DRAFT_KEY = 'event_form_draft';

const ContributeEventModal = ({ isOpen, onClose, onShowToast }: { isOpen: boolean; onClose: () => void; onShowToast: (msg: string, type: 'success' | 'error') => void }) => {
    const predefinedCategories = ["Hoạt động phong trào", "Minigame", "Tình nguyện", "Cuộc thi học thuật", "Cổ vũ", "Talkshow", "Tọa đàm", "Hội thảo", "Sự kiện offline", "Teambuilding", "Hoạt động thể thao"];
    
    const [formData, setFormData] = useState({
        title: '', deadline: '', deadline_time: '', close_on_full: false, event_date: '', event_time: '',
        registration_start_date: '', registration_start_time: '',
        category: 'Hoạt động phong trào', criteria: 'III', points: '5', organizer: '', link: '', format: 'Offline', location_type: 'Trong trường', description: '' 
    });
    const [submitting, setSubmitting] = useState(false);
    const [isDraftLoaded, setIsDraftLoaded] = useState(false);
    const [isCustomCategory, setIsCustomCategory] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const savedDraft = localStorage.getItem(DRAFT_KEY);
            if (savedDraft) {
                try {
                    const parsed = JSON.parse(savedDraft);
                    setFormData(parsed);
                    if (parsed.category && !predefinedCategories.includes(parsed.category)) {
                        setIsCustomCategory(true);
                    }
                    setIsDraftLoaded(true);
                    setTimeout(() => setIsDraftLoaded(false), 3000);
                } catch (e) {
                    console.error("Failed to restore draft", e);
                }
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            const timeoutId = setTimeout(() => {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
            }, 500); 
            return () => clearTimeout(timeoutId);
        }
    }, [formData, isOpen]);

    const handleClearDraft = async () => {
        if (await showConfirm("Bạn có chắc muốn xóa toàn bộ nội dung nháp?")) {
            playClick();
            setFormData({
                title: '', deadline: '', deadline_time: '', close_on_full: false, event_date: '', event_time: '',
                registration_start_date: '', registration_start_time: '',
                category: 'Hoạt động phong trào', criteria: 'III', points: '5', organizer: '', link: '', format: 'Offline', location_type: 'Trong trường', description: ''
            });
            setIsCustomCategory(false);
            localStorage.removeItem(DRAFT_KEY);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.title.trim() || !formData.link.trim()) {
            onShowToast("Vui lòng nhập Tên sự kiện và Link tham gia!", "error");
            return;
        }

        setSubmitting(true);
        playClick();

        try {
            const payload = {
                title: formData.title,
                deadline: formData.close_on_full ? null : (formData.deadline ? formData.deadline : null),
                deadline_time: formData.close_on_full ? null : (formData.deadline_time ? formData.deadline_time : null),
                close_on_full: formData.close_on_full,
                event_date: formData.event_date ? formData.event_date : null,
                event_time: formData.event_time ? formData.event_time : null, 
                registration_start_date: formData.registration_start_date ? formData.registration_start_date : null,
                registration_start_time: formData.registration_start_time ? formData.registration_start_time : null,
                category: formData.category, criteria: formData.criteria, points: formData.points,
                organizer: formData.organizer, link: formData.link, format: formData.format,
                description: formData.description, location_type: formData.location_type,
                status: 'pending', is_manually_closed: false 
            };

            const { data, error } = await supabase.from('events').insert([payload]).select('id').single();
            if (error) throw error;
            void notifyModerators('event_pending', data?.id);

            onShowToast("Đóng góp của bạn đã được gửi. Cảm ơn bạn!", "success");
            localStorage.removeItem(DRAFT_KEY);
            onClose();
        } catch (err: any) {
            onShowToast("Lỗi gửi đóng góp: " + err.message, "error");
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 flex items-end justify-center animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-t-3xl w-full h-[90vh] flex flex-col overflow-hidden animate-slideUp relative shadow-2xl" onClick={e => e.stopPropagation()}>
                <DragHandle />
                <div className="px-5 pb-3 pt-2 flex justify-between items-center bg-white shrink-0 border-b border-gray-100">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-[#003375]">
                        <PlusCircle size={20}/> Đóng góp Sự kiện
                    </h3>
                    <div className="flex items-center gap-2">
                        <button onClick={handleClearDraft} className="p-2 rounded-full bg-gray-100 text-gray-500 active:scale-95"><RotateCcw size={16} /></button>
                        <button onClick={onClose} className="p-2 rounded-full bg-gray-100 text-gray-500 active:scale-95"><X size={16}/></button>
                    </div>
                </div>

                <div className="p-5 overflow-y-auto custom-scrollbar flex-1 pb-safe">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 flex gap-2 text-xs text-blue-800">
                        <Sparkles className="shrink-0 mt-0.5" size={16}/>
                        <p>Dữ liệu đang nhập sẽ tự động lưu nháp.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4 pb-10">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Tên sự kiện <span className="text-red-500">*</span></label>
                            <input type="text" required className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50" placeholder="VD: Cuộc thi Tiếng Anh..." value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                        </div>
                        
                        {/* KHU VỰC THỜI GIAN ĐỘNG */}
                        {formData.category?.toLowerCase().includes('minigame') ? (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Ngày bắt đầu</label>
                                        <input type="date" className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50" value={formData.event_date} onChange={e => setFormData({...formData, event_date: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Giờ bắt đầu</label>
                                        <input type="time" className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50" value={formData.event_time} onChange={e => setFormData({...formData, event_time: e.target.value})} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={`block text-sm font-bold mb-1 ${formData.close_on_full ? 'text-gray-400' : 'text-gray-700'}`}>Ngày kết thúc</label>
                                        <input type="date" disabled={formData.close_on_full} className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50 disabled:bg-gray-200 disabled:text-gray-400" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className={`block text-sm font-bold mb-1 ${formData.close_on_full ? 'text-gray-400' : 'text-gray-700'}`}>Giờ kết thúc</label>
                                        <input type="time" disabled={formData.close_on_full} className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50 disabled:bg-gray-200 disabled:text-gray-400" value={formData.deadline_time || ''} onChange={e => setFormData({...formData, deadline_time: e.target.value})} />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Ngày mở ĐK</label>
                                        <input type="date" className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50" value={formData.registration_start_date} onChange={e => setFormData({...formData, registration_start_date: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Giờ mở ĐK</label>
                                        <input type="time" className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50" value={formData.registration_start_time} onChange={e => setFormData({...formData, registration_start_time: e.target.value})} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={`block text-sm font-bold mb-1 ${formData.close_on_full ? 'text-gray-400' : 'text-gray-700'}`}>Ngày đóng ĐK</label>
                                        <input type="date" disabled={formData.close_on_full} className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50 disabled:bg-gray-200 disabled:text-gray-400" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className={`block text-sm font-bold mb-1 ${formData.close_on_full ? 'text-gray-400' : 'text-gray-700'}`}>Giờ đóng ĐK</label>
                                        <input type="time" disabled={formData.close_on_full} className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50 disabled:bg-gray-200 disabled:text-gray-400" value={formData.deadline_time || ''} onChange={e => setFormData({...formData, deadline_time: e.target.value})} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Ngày diễn ra</label>
                                        <input type="date" className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50" value={formData.event_date} onChange={e => setFormData({...formData, event_date: e.target.value})} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Giờ diễn ra</label>
                                        <input type="time" className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50" value={formData.event_time} onChange={e => setFormData({...formData, event_time: e.target.value})} />
                                    </div>
                                </div>
                            </>
                        )}

                        <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200">
                            <div>
                                <span className="font-bold text-gray-700 text-sm block">Đóng khi đủ số lượng</span>
                                <span className="text-[10px] text-gray-500">Form tự khóa trước thời hạn</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={formData.close_on_full} onChange={e => setFormData({...formData, close_on_full: e.target.checked})} />
                                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#003375]"></div>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Loại hình</label>
                            <select 
                                className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-white"
                                value={isCustomCategory ? "Khác" : formData.category}
                                onChange={e => {
                                    if (e.target.value === "Khác") {
                                        setIsCustomCategory(true);
                                        setFormData({...formData, category: ''});
                                    } else {
                                        setIsCustomCategory(false);
                                        setFormData({...formData, category: e.target.value});
                                    }
                                }}
                            >
                                {predefinedCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                                <option value="Khác">Khác (Tự nhập)</option>
                            </select>
                            
                            {isCustomCategory && (
                                <input 
                                    type="text" 
                                    autoFocus
                                    className="w-full border border-gray-300 rounded-xl p-3 mt-2 outline-none focus:ring-2 focus:ring-[#003375] bg-white animate-fadeIn"
                                    placeholder="Nhập loại hình khác..."
                                    value={formData.category} 
                                    onChange={e => setFormData({...formData, category: e.target.value})} 
                                />
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Mục ĐRL</label>
                                <select className="w-full border border-gray-300 rounded-xl p-3 bg-gray-50" value={formData.criteria} onChange={e => setFormData({...formData, criteria: e.target.value})}>
                                    <option value="I">Mục I</option><option value="II">Mục II</option><option value="III">Mục III</option><option value="IV">Mục IV</option><option value="V">Mục V</option><option value="Chưa biết">Chưa biết</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Điểm cộng</label>
                                <input type="text" className="w-full border border-gray-300 rounded-xl p-3 text-center font-bold text-[#990000] bg-gray-50" value={formData.points} onChange={e => setFormData({...formData, points: e.target.value})} />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Ban Tổ Chức</label>
                            <input type="text" className="w-full border border-gray-300 rounded-xl p-3 bg-gray-50" value={formData.organizer} onChange={e => setFormData({...formData, organizer: e.target.value})} />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Link tham gia <span className="text-red-500">*</span></label>
                            <input type="text" required className="w-full border border-gray-300 rounded-xl p-3 bg-gray-50" value={formData.link} onChange={e => setFormData({...formData, link: e.target.value})} />
                        </div>

                        <button type="submit" disabled={submitting} className="w-full py-4 bg-[#003375] active:bg-[#002855] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md mt-4">
                            {submitting ? <Loader2 className="animate-spin"/> : <Send size={18}/>} 
                            {submitting ? 'Đang gửi...' : 'Gửi đóng góp'}
                        </button>
                    </form>
                </div>
            </div>
        </div>, document.body
    );
};

const ReportEventModal = ({ isOpen, onClose, event, onShowToast }: { isOpen: boolean; onClose: () => void; event: HubEvent | null; onShowToast: (msg: string, type: 'success' | 'error') => void }) => {
    const { session } = useUserRole(); 
    const [issue, setIssue] = useState('');
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen || !event) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!issue.trim()) {
            onShowToast("Vui lòng nhập chi tiết lỗi sai!", "error");
            return;
        }
        setSubmitting(true);
        playClick();

        try {
            const payload = {
                event_id: parseInt(event.id) || null, user_id: session?.user?.id || null, 
                event_name: event.name, organizer: event.organizer, issue_description: issue, status: 'pending' 
            };
            const { data, error } = await supabase.from('event_reports').insert([payload]).select('id').single();
            if (error) throw error;
            void notifyModerators('event_report', data?.id);

            onShowToast("Đã gửi báo cáo thành công!", "success");
            setIssue('');
            onClose();
        } catch (err: any) {
            onShowToast("Lỗi: " + err.message, "error");
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/60 flex items-end justify-center animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-t-3xl w-full flex flex-col shadow-2xl animate-slideUp overflow-hidden" onClick={e => e.stopPropagation()}>
                <DragHandle />
                <div className="px-5 pt-2 pb-3 flex justify-between items-center bg-white shrink-0 border-b border-gray-100">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-red-600">
                        <AlertTriangle size={20}/> Báo cáo sai sót
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-full bg-gray-100 active:scale-95 text-gray-500"><X size={18}/></button>
                </div>

                <div className="p-5 pb-8">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="w-full bg-gray-100 rounded-xl p-3 text-sm font-medium text-gray-600 line-clamp-2">
                            {event.name}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-800 mb-2">Chi tiết sai sót <span className="text-red-500">*</span></label>
                            <textarea 
                                rows={4} required autoFocus
                                className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-red-500 resize-none text-sm bg-gray-50"
                                placeholder="VD: Sai tên chương trình, sai số điểm ĐRL..."
                                value={issue} onChange={e => setIssue(e.target.value)}
                            ></textarea>
                        </div>

                        <button type="submit" disabled={submitting} className="w-full py-3.5 bg-red-600 active:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md">
                            {submitting ? <Loader2 className="animate-spin" size={18}/> : <Send size={18}/>} 
                            Gửi báo cáo
                        </button>
                    </form>
                </div>
            </div>
        </div>, document.body
    );
};

// --- Main Component ---
export const MobileEvents: React.FC<MobileEventsProps> = ({ viewUserId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { eventId: routeEventId } = useParams<{ eventId?: string }>();
  const decodedRouteEventId = routeEventId ? decodeURIComponent(routeEventId) : null;
  const isEditRoute = location.pathname.startsWith('/events/edit/');
  const eventId = isEditRoute ? null : decodedRouteEventId;
  const editEventId = isEditRoute ? decodedRouteEventId : null;

  useEffect(() => {
    document.title = "Sự kiện ĐRL | HUB Planner";
  }, []);
  const { isAdmin, isAuditor, isCTV, session } = useUserRole();
const canManage = isAdmin || isAuditor || isCTV;
  
  const today = new Date();

  const [events, setEvents] = useState<HubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [activeScope, setActiveScope] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'expiring_soon'>('newest'); 

  const [participatedEvents, setParticipatedEvents] = useState<string[]>([]);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const [showCTVModal, setShowCTVModal] = useState(false);
  const [showScoreGuide, setShowScoreGuide] = useState(false);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [isManagementView, setIsManagementView] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HubEvent | null>(null);
  const [eventEditData, setEventEditData] = useState<any>({});
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [reportingEvent, setReportingEvent] = useState<HubEvent | null>(null);

  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const tabsList = useMemo(() => [
      {id:'all',l:'Tất cả'},
      {id:'participated', l:`Đã tham gia (${participatedEvents.length})`}, 
      {id:'I',l:'Mục I'},{id:'II',l:'Mục II'},{id:'III',l:'Mục III'},{id:'IV',l:'Mục IV'},{id:'V',l:'Mục V'}
  ], [participatedEvents.length]);
  const tabIndicatorClass = `event-tab-active-${Math.max(0, tabsList.findIndex(tab => tab.id === activeTab))}`;

  useEffect(() => {
      const updateIndicator = () => {
          const activeIndex = tabsList.findIndex(t => t.id === activeTab);
          const activeElement = tabsRef.current[activeIndex];
          if (activeElement && activeElement.parentElement) {
              activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
      };
      updateIndicator();
  }, [activeTab, tabsList]);

  useEffect(() => {
      const loadParticipation = async () => {
          if (session?.user?.id && supabase) {
              const targetId = viewUserId || session.user.id;
              const { data, error } = await supabase.from('user_participations').select('event_id').eq('user_id', targetId); 
              if (!error && data) {
                  const dbEvents = data.map(item => item.event_id.toString());
                  setParticipatedEvents(dbEvents);
                  localStorage.setItem('hub_participated_events', JSON.stringify(dbEvents));
              }
          } else {
              const saved = localStorage.getItem('hub_participated_events');
              if (saved) setParticipatedEvents(JSON.parse(saved));
          }
      };
      if (session !== undefined) loadParticipation();
  }, [session, viewUserId]);

  const toggleParticipation = async (eventId: string) => {
      playClick();
      const isCurrentlyParticipated = participatedEvents.includes(eventId);
      
      setParticipatedEvents(prev => {
          const newEvents = isCurrentlyParticipated ? prev.filter(id => id !== eventId) : [...prev, eventId];
          localStorage.setItem('hub_participated_events', JSON.stringify(newEvents));
          return newEvents;
      });

      if (session?.user?.id && supabase) {
          if (isCurrentlyParticipated) {
              await supabase.from('user_participations').delete().match({ user_id: session.user.id, event_id: parseInt(eventId) });
          } else {
              await supabase.from('user_participations').insert({ user_id: session.user.id, event_id: parseInt(eventId) });
          }
      }
  };

  const showToast = (message: string, type: 'success' | 'error') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 3000);
  };

  const getEventPath = (id: string) => `/events/${encodeURIComponent(id)}`;

  const getEventEditPath = (id: string) => `/events/edit/${encodeURIComponent(id)}`;

  const getEventUrl = (id: string) => `${window.location.origin}${getEventPath(id)}`;

  const handleCopyEventUrl = async (evt: HubEvent) => {
      playClick();
      const url = getEventUrl(evt.id);
      try {
          await navigator.clipboard.writeText(url);
          showToast('Đã sao chép đường link sự kiện.', 'success');
      } catch {
          showToast(url, 'success');
      }
  };

  const fetchEvents = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiUrl(`/events?t=${new Date().getTime()}`));
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lỗi tải dữ liệu');

      let fetchedData = json.data || [];
      if (!canManage) fetchedData = fetchedData.filter((evt: any) => evt.status !== 'pending');

      const parsedEvents: HubEvent[] = fetchedData.map((row: any) => {
          let deadlineDate = null;
          if (row.deadline) {
              deadlineDate = new Date(row.deadline);
              deadlineDate.setHours(23, 59, 59, 999);
          }
          return {
              id: row.id.toString(), name: row.title || 'Sự kiện chưa có tên', category: row.criteria || 'Khác', 
              score: row.points?.toString() || '0', location: row.format || 'Offline', time: formatDateString(row.deadline),
              deadlineDate: deadlineDate, deadline_time: row.deadline_time || null, close_on_full: row.close_on_full || false,
              description: row.description || null, link: row.link || '', organizer: row.organizer || 'HUB',
              type: row.category || '', classification: row.classification || '', scope: row.location_type || 'Trong trường',
              status: row.status || 'Sắp diễn ra', is_manually_closed: row.is_manually_closed || false,
              is_deleted: row.is_deleted || false, created_at: row.created_at || new Date().toISOString(),
              event_date: row.event_date || null, event_time: row.event_time || null,
              registration_start_date: row.registration_start_date || null, registration_start_time: row.registration_start_time || null
          };
      });
      setEvents(parsedEvents);
    } catch (err) {
      setEvents([]); // Fallback empty if failed
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvents(); }, [canManage]);

  useEffect(() => {
                  <button onClick={() => { playClick(); setIsManagementView(false); }} className={`py-2 rounded-xl text-xs font-black transition-all ${!isManagementView ? 'bg-[#EEF2FF] text-[#1A56FF]' : 'text-[#7B8AB0]'}`}>Giao diện SV</button>
  }, [canManage, isManagementView]);

  const openEventEditor = (evt: HubEvent | null = null) => {
      playClick();
      setEditingEvent(evt);
      setEventEditData({
          title: evt?.name || '',
          organizer: evt?.organizer || '',
          criteria: evt?.category || 'III',
          points: evt?.score || '5',
          category: evt?.type || 'Hoạt động phong trào',
          location_type: evt?.scope || 'Trong trường',
          format: evt?.location || 'Offline',
          link: evt?.link || '',
          status: evt?.status || 'Sắp diễn ra',
          event_date: evt?.event_date || '',
          event_time: formatTimeString(evt?.event_time ?? null) || '',
          deadline: evt?.deadlineDate ? evt.deadlineDate.toISOString().split('T')[0] : '',
          deadline_time: evt?.deadline_time || '',
          close_on_full: evt?.close_on_full || false,
          description: evt?.description || '',
      });
      if (evt) navigate(getEventEditPath(evt.id));
  };

  const closeEventEditor = () => {
      setEditingEvent(null);
      setEventEditData({});
      if (editEventId) navigate('/events');
  };

  useEffect(() => {
      if (!editEventId || loading) return;

      if (!canManage) {
          showToast('Bạn không có quyền chỉnh sửa sự kiện này.', 'error');
          navigate(getEventPath(editEventId), { replace: true });
          return;
      }

      const target = events.find(evt => evt.id === editEventId);
      if (!target) {
          setEditingEvent(null);
          setEventEditData({});
          return;
      }

      setEditingEvent(target);
      setEventEditData({
          title: target.name || '',
          organizer: target.organizer || '',
          criteria: target.category || 'III',
          points: target.score || '5',
          category: target.type || 'Hoạt động phong trào',
          location_type: target.scope || 'Trong trường',
          format: target.location || 'Offline',
          link: target.link || '',
          status: target.status || 'Sắp diễn ra',
          event_date: target.event_date || '',
          event_time: formatTimeString(target.event_time ?? null) || '',
          deadline: target.deadlineDate ? target.deadlineDate.toISOString().split('T')[0] : '',
          deadline_time: target.deadline_time || '',
          close_on_full: target.close_on_full || false,
          description: target.description || '',
      });
  }, [editEventId, loading, canManage, events, navigate]);

  const saveEventEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canManage) return;
      setIsSavingEvent(true);
      try {
          const payload = {
              title: eventEditData.title,
              organizer: eventEditData.organizer,
              criteria: eventEditData.criteria,
              points: eventEditData.points,
              category: eventEditData.category,
              location_type: eventEditData.location_type,
              format: eventEditData.format,
              link: eventEditData.link,
              status: eventEditData.status,
              event_date: eventEditData.event_date || null,
              event_time: eventEditData.event_time || null,
              deadline: eventEditData.close_on_full ? null : (eventEditData.deadline || null),
              deadline_time: eventEditData.close_on_full ? null : (eventEditData.deadline_time || null),
              close_on_full: !!eventEditData.close_on_full,
              description: eventEditData.description || null,
          };

          const query = editingEvent
              ? supabase!.from('events').update(payload).eq('id', editingEvent.id).select()
              : supabase!.from('events').insert([payload]).select();
          const { data, error } = await query;
          if (error) throw error;
          if ((!editingEvent || (editingEvent.status === 'pending' && payload.status !== 'pending')) && data?.[0]) {
              await notifyAllUsersAboutEvent(data[0]);
          }
          showToast(editingEvent ? 'Cập nhật sự kiện thành công.' : 'Thêm sự kiện thành công.', 'success');
          closeEventEditor();
          await fetchEvents();
      } catch (err: any) {
          showToast('Lỗi: ' + (err.message || 'Không thể lưu sự kiện'), 'error');
      } finally {
          setIsSavingEvent(false);
      }
  };

  const patchEvent = async (evt: HubEvent, patch: Record<string, any>, successMessage: string) => {
      if (!canManage) return;
      playClick();
      try {
          const { error } = await supabase!.from('events').update(patch).eq('id', evt.id);
          if (error) throw error;
          if (evt.status === 'pending' && patch.status && patch.status !== 'pending') {
              await notifyAllUsersAboutEvent({ ...evt, ...patch, title: evt.name, criteria: patch.criteria || evt.category });
          }
          setEvents(prev => prev.map(item => item.id === evt.id ? { ...item, ...patch } : item));
          showToast(successMessage, 'success');
      } catch (err: any) {
          showToast('Lỗi: ' + (err.message || 'Không thể cập nhật sự kiện'), 'error');
      }
  };

  const isDeadlineEventToday = (evt: HubEvent) => {
      if (!evt.deadlineDate) return false;
      if (evt.is_manually_closed || evt.status === 'Đã kết thúc' || evt.status === 'pending' || evt.is_deleted) return false;
      return evt.deadlineDate.getDate() === today.getDate()
          && evt.deadlineDate.getMonth() === today.getMonth()
          && evt.deadlineDate.getFullYear() === today.getFullYear();
  };

  const filteredEvents = events.filter(evt => {
    const matchesSearch = evt.name.toLowerCase().includes(searchTerm.toLowerCase()) || evt.organizer.toLowerCase().includes(searchTerm.toLowerCase());
    let matchesTab = true;
    let isVisible = true;

    if (activeTab === 'participated') {
        matchesTab = participatedEvents.includes(evt.id);
    } else {
        if (evt.is_deleted && !isManagementView) isVisible = false;
        if (evt.status === 'pending' && !isManagementView) isVisible = false;
        if (activeTab !== 'all') matchesTab = evt.category === activeTab;
    }

    const matchesScope = activeScope === 'all' || (activeScope === 'internal' && evt.scope === 'Trong trường') || (activeScope === 'external' && evt.scope === 'Ngoài trường');
    return matchesSearch && matchesTab && matchesScope && isVisible;
  }).sort((a, b) => {
      const deadlinePriority = Number(isDeadlineEventToday(b)) - Number(isDeadlineEventToday(a));
      if (deadlinePriority !== 0) return deadlinePriority;

      if (sortOrder === 'expiring_soon') {
          const now = today.getTime();
          const getScore = (evt: HubEvent) => {
              if (evt.is_manually_closed || evt.status === 'Đã kết thúc' || evt.is_deleted) return Infinity;
              if (evt.deadlineDate) {
                  const diff = evt.deadlineDate.getTime() - now;
                  return diff < 0 ? Infinity : diff;
              } else if (evt.close_on_full && evt.event_date) {
                  const evtDate = new Date(evt.event_date); evtDate.setHours(23, 59, 59, 999);
                  const diff = evtDate.getTime() - now;
                  return diff < 0 ? Infinity : diff;
              }
              return Infinity - 1;
          };
          return getScore(a) - getScore(b);
      }
      const dateA = new Date(a.created_at).getTime(); const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB; 
  });

  const routeEvent = eventId ? events.find(evt => evt.id === eventId) || null : null;
  const displayedEvents = eventId ? (routeEvent ? [routeEvent] : []) : filteredEvents;
  const visibleEvents = events.filter(evt => !evt.is_deleted && evt.status !== 'pending');
  const openEventsCount = visibleEvents.filter(evt => !evt.is_manually_closed && evt.status !== 'Đã kết thúc' && !checkIsOverdue(evt, today)).length;
  const expiringTodayEvent = visibleEvents.find(isDeadlineEventToday);
  const featuredEvent = expiringTodayEvent || visibleEvents[0] || null;
  const getEventDateTimeLabel = (evt: HubEvent) => evt.event_date ? `${formatTimeString(evt.event_time)} ${formatDateString(evt.event_date)}` : 'Chưa cập nhật';
  const getRegistrationLabel = (evt: HubEvent) => {
      const start = evt.registration_start_date ? `${formatTimeString(evt.registration_start_time)} ${formatDateString(evt.registration_start_date)}` : '...';
      const end = evt.close_on_full ? 'Đóng khi đủ SL' : (evt.time && evt.time !== 'Chưa cập nhật' ? `${evt.deadline_time ? formatTimeString(evt.deadline_time) + ' ' : ''}${evt.time}` : '...');
      return `${start} - ${end}`;
  };

  const NotificationToast = () => {
    if (!notification) return null;
    return createPortal(
        <div className={`fixed top-4 left-4 right-4 z-[100000] bg-white rounded-xl shadow-xl border-l-4 p-4 flex items-center gap-3 animate-slideInRight ${notification.type === 'success' ? 'border-green-500' : 'border-red-500'}`}>
            <div className={`p-2 rounded-full ${notification.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {notification.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
            </div>
            <div className="flex-1">
                <h4 className={`font-bold ${notification.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{notification.type === 'success' ? 'Thành công' : 'Lỗi'}</h4>
                <p className="text-sm text-gray-600">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="text-gray-400 p-1"><X size={18} /></button>
        </div>, document.body
    );
  };

  const renderManagementCard = (evt: HubEvent) => {
      const isPending = evt.status === 'pending';
      const isClosed = evt.is_manually_closed || evt.status === 'Đã kết thúc';

      return (
          <div key={evt.id} className={`bg-white rounded-2xl border border-gray-200 p-4 shadow-sm mb-3 ${evt.is_deleted ? 'opacity-60 grayscale' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                      <div className="flex flex-wrap gap-1.5 mb-2">
                          {isPending && <span className="text-[10px] font-bold px-2 py-1 rounded bg-yellow-50 text-yellow-700 border border-yellow-200">Chờ duyệt</span>}
                          {evt.is_deleted && <span className="text-[10px] font-bold px-2 py-1 rounded bg-gray-100 text-gray-600 border border-gray-200">Đã ẩn</span>}
                          {isClosed && !evt.is_deleted && <span className="text-[10px] font-bold px-2 py-1 rounded bg-gray-100 text-gray-600 border border-gray-200">Đã đóng</span>}
                          <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-50 text-[#003375] border border-blue-100">Mục {evt.category}</span>
                      </div>
                      <h3 className="font-black text-[#003375] text-base leading-snug line-clamp-2">{evt.name}</h3>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1">{evt.organizer} • {evt.location}</p>
                  </div>
                  <button onClick={() => openEventEditor(evt)} className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 shrink-0 active:scale-95" title="Chỉnh sửa">
                      <Edit2 size={18}/>
                  </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                  {isPending && (
                      <button onClick={() => patchEvent(evt, { status: 'Sắp diễn ra', is_deleted: false }, 'Đã duyệt sự kiện.')} className="py-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center justify-center gap-1.5">
                          <CheckCircle2 size={15}/> Duyệt
                      </button>
                  )}
                  <button onClick={() => patchEvent(evt, { is_manually_closed: !evt.is_manually_closed }, evt.is_manually_closed ? 'Đã mở lại đăng ký.' : 'Đã đóng đăng ký.')} className="py-2.5 rounded-xl bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold flex items-center justify-center gap-1.5">
                      {evt.is_manually_closed ? <ToggleRight size={15}/> : <ToggleLeft size={15}/>} {evt.is_manually_closed ? 'Mở lại' : 'Đóng ĐK'}
                  </button>
                  {isAdmin && (
                      <button onClick={() => patchEvent(evt, { is_deleted: !evt.is_deleted }, evt.is_deleted ? 'Đã hiện lại sự kiện.' : 'Đã ẩn sự kiện.')} className="py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center justify-center gap-1.5">
                          {evt.is_deleted ? <RotateCcw size={15}/> : <Trash2 size={15}/>} {evt.is_deleted ? 'Hiện lại' : 'Ẩn'}
                      </button>
                  )}
              </div>
          </div>
      );
  };

  const renderEventCard = (evt: HubEvent) => {
    const isParticipated = participatedEvents.includes(evt.id);
    const isLinkClosed = evt.status === 'Đã kết thúc' || evt.is_manually_closed || checkIsOverdue(evt, today);
    const formattedLink = evt.link && !evt.link.startsWith('http') ? `https://${evt.link}` : evt.link;

    return (
      <div key={evt.id} className={`bg-white rounded-2xl border border-gray-200 p-4 flex flex-col shadow-sm mb-3 relative overflow-hidden
        ${evt.is_deleted ? 'opacity-60 grayscale' : ''} 
      `}>
        <div className="flex justify-between items-start mb-2">
            <span className="text-xs text-gray-500 font-medium flex items-center gap-1.5 line-clamp-1 pr-2">
                <Building2 size={14} className="shrink-0 text-[#003375]"/> {evt.organizer}
            </span>
            <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 ${isLinkClosed || evt.is_deleted ? 'bg-gray-50 text-gray-500 border-gray-200' : 'bg-red-50 text-[#990000] border-red-100'}`}>
                    <Award size={12}/> {evt.score.includes('+') ? evt.score : `+${evt.score}`}
                </span>
                
                <button onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === evt.id ? null : evt.id); }} className="p-1 text-gray-400 active:bg-gray-100 rounded-md">
                    <MoreHorizontal size={18}/>
                </button>
                
                {activeDropdown === evt.id && (
                    <div className="absolute right-4 top-10 w-44 bg-white border border-gray-200 shadow-xl rounded-xl overflow-hidden z-20 py-1 text-sm font-medium">
                        <button onClick={(e) => { e.stopPropagation(); setReportingEvent(evt); setActiveDropdown(null); }} className="w-full text-left px-4 py-3 text-orange-600 active:bg-orange-50 flex items-center gap-2">
                            <AlertTriangle size={16} /> Báo lỗi thông tin
                        </button>
                    </div>
                )}
            </div>
        </div>

        <h3 className="font-bold text-gray-900 text-[15px] leading-snug mb-3 line-clamp-2 min-h-[2.5rem]">
            {evt.name}
        </h3>

        <div className="flex flex-wrap gap-1.5 mb-4">
            <span className="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-1 rounded-md">
                Mục {evt.category}
            </span>
            {evt.location && (
                <span className="bg-gray-100 text-gray-600 text-[10px] font-medium px-2 py-1 rounded-md flex items-center gap-1">
                    <MapPin size={10}/> {evt.scope || 'N/A'}
                </span>
            )}
        </div>

        <div className="space-y-2 text-xs text-gray-600 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
            {evt.type?.toLowerCase().includes('minigame') || evt.classification?.toLowerCase().includes('minigame') ? (
                <div className="flex items-start gap-2">
                    <Clock size={14} className="text-orange-500 shrink-0 mt-0.5" />
                    <div className="flex flex-col">
                        <span className="font-medium text-gray-500">TG tham gia:</span>
                        <span className={`font-bold ${isLinkClosed || evt.is_deleted ? 'text-gray-500' : 'text-[#003375]'}`}>
                            {evt.event_date ? `${formatTimeString(evt.event_time)} ${formatDateString(evt.event_date)}` : '...'}
                            {' - '}
                            {evt.close_on_full ? <span className="text-[#990000]">Đóng khi đủ SL</span> : (evt.time && evt.time !== 'Chưa cập nhật' ? `${evt.deadline_time ? formatTimeString(evt.deadline_time) + ' ' : ''}${evt.time}` : '...')}
                        </span>
                    </div>
                </div>
            ) : (
                <>
                    <div className="flex items-start gap-2">
                        <CalendarClock size={14} className="text-orange-500 shrink-0 mt-0.5" />
                        <div className="flex flex-col">
                            <span className="font-medium text-gray-500">TG đăng ký:</span>
                            <span className={`font-bold ${isLinkClosed || evt.is_deleted ? 'text-gray-500' : 'text-gray-700'}`}>
                                {evt.registration_start_date ? `${formatTimeString(evt.registration_start_time)} ${formatDateString(evt.registration_start_date)}` : '...'}
                                {' - '}
                                {evt.close_on_full ? <span className="text-[#990000]">Đóng khi đủ SL</span> : (evt.time && evt.time !== 'Chưa cập nhật' ? `${evt.deadline_time ? formatTimeString(evt.deadline_time) + ' ' : ''}${evt.time}` : '...')}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-[#003375] shrink-0"/>
                        <span className="truncate">TG diễn ra: <span className="font-semibold text-gray-700">{evt.event_date ? `${formatTimeString(evt.event_time)} ${formatDateString(evt.event_date)}` : 'Chưa cập nhật'}</span></span>
                    </div>
                </>
            )}
        </div>

        <div className="flex items-center gap-2 mt-auto pt-2">
            <button onClick={() => toggleParticipation(evt.id)} className={`p-3 rounded-xl border flex items-center justify-center transition-colors ${isParticipated ? 'bg-green-50 border-green-300 text-green-600' : 'bg-white border-gray-200 text-gray-500 active:bg-gray-50'}`}>
                {isParticipated ? <BookmarkCheck size={20}/> : <Bookmark size={20}/>}
            </button>
            <button
                onClick={() => {
                    if (eventId === evt.id) handleCopyEventUrl(evt);
                    else { playClick(); navigate(getEventPath(evt.id)); }
                }}
                className="p-3 bg-white border border-gray-200 rounded-xl text-gray-500 active:bg-gray-50 flex items-center justify-center"
            >
                <LinkIcon size={20}/>
            </button>
            
            {evt.link && !isLinkClosed && !evt.is_deleted ? (
                <a href={formattedLink} target="_blank" rel="noopener noreferrer" className="flex-1 text-white text-sm font-bold py-3 rounded-xl flex items-center justify-center shadow-sm bg-[#003375] active:bg-[#002855]">
                    Tham gia ngay
                </a>
            ) : (
                <button disabled className="flex-1 py-3 rounded-xl font-semibold text-sm bg-gray-100 text-gray-400 flex items-center justify-center gap-2">
                    <Lock size={16}/> Đã đóng
                </button>
            )}
        </div>
      </div>
    );
  };

  const renderNativeEventCard = (evt: HubEvent) => {
    const isParticipated = participatedEvents.includes(evt.id);
    const isLinkClosed = evt.status === 'Đã kết thúc' || evt.status === 'ÄÃ£ káº¿t thÃºc' || evt.is_manually_closed || checkIsOverdue(evt, today);
    const formattedLink = evt.link && !evt.link.startsWith('http') ? `https://${evt.link}` : evt.link;
    const isExpiring = isDeadlineEventToday(evt);
    const isMinigame = evt.type?.toLowerCase().includes('minigame') || evt.classification?.toLowerCase().includes('minigame');

    return (
      <div key={evt.id} className={`relative overflow-hidden rounded-[22px] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)] ${isExpiring ? 'border border-[#FFE0E8]' : ''} ${evt.is_deleted ? 'opacity-60 grayscale' : ''}`}>
        {isExpiring && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#FF3B5C] to-[#FF9DAE]" />}
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-[#7B8AB0]">
            <Building2 size={14} className="shrink-0 text-[#1A56FF]" />
            <span className="truncate">{evt.organizer}</span>
          </div>
          <div className="relative flex shrink-0 items-center gap-2">
            <span className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${isLinkClosed || evt.is_deleted ? 'border-[#E5EAF4] bg-[#F4F6FA] text-[#7B8AB0]' : 'border-[#FFE0E8] bg-[#FFF0F3] text-[#E11D48]'}`}>
              <Award size={12} /> {evt.score.includes('+') ? evt.score : `+${evt.score}`}
            </span>
            <button onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === evt.id ? null : evt.id); }} className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9AA5C0] active:bg-[#F4F6FA]">
              <MoreHorizontal size={17} />
            </button>
            {activeDropdown === evt.id && (
              <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-[#E5EAF4] bg-white py-1 text-sm font-bold shadow-xl">
                <button onClick={(e) => { e.stopPropagation(); setReportingEvent(evt); setActiveDropdown(null); }} className="flex w-full items-center gap-2 px-4 py-3 text-left text-orange-600 active:bg-orange-50">
                  <AlertTriangle size={16} /> Báo lỗi thông tin
                </button>
              </div>
            )}
          </div>
        </div>

        <h3 className="mb-3 text-[15px] font-black leading-snug tracking-normal text-[#0D1B3E]">{evt.name}</h3>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <span className="rounded-lg bg-[#EEF2FF] px-2 py-1 text-[10px] font-black text-[#1A56FF]">Mục {evt.category}</span>
          {evt.scope && <span className="rounded-lg bg-[#EDFAF3] px-2 py-1 text-[10px] font-black text-[#059669]">{evt.scope}</span>}
          {evt.type && <span className="rounded-lg bg-[#F4F6FA] px-2 py-1 text-[10px] font-black text-[#5C687E]">{evt.type}</span>}
        </div>

        <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-[#EEF2FF] bg-[#F8FAFD] p-3">
          <div className="flex items-start gap-2 text-[11px] font-semibold leading-snug text-[#637087]">
            <Clock size={15} className="mt-0.5 shrink-0 text-[#F5A623]" />
            <div>
              <span>{isMinigame ? 'TG tham gia' : 'TG đăng ký'}</span>
              <b className={`block font-black ${isLinkClosed || evt.is_deleted ? 'text-[#7B8AB0]' : 'text-[#0D1B3E]'}`}>
                {isMinigame ? `${getEventDateTimeLabel(evt)} - ${evt.close_on_full ? 'Đóng khi đủ SL' : (evt.time || '...')}` : getRegistrationLabel(evt)}
              </b>
            </div>
          </div>
          {!isMinigame && (
            <div className="flex items-start gap-2 text-[11px] font-semibold leading-snug text-[#637087]">
              <Calendar size={15} className="mt-0.5 shrink-0 text-[#1A56FF]" />
              <div>
                <span>TG diễn ra</span>
                <b className="block font-black text-[#0D1B3E]">{getEventDateTimeLabel(evt)}</b>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => toggleParticipation(evt.id)} className={`flex h-[42px] w-[42px] items-center justify-center rounded-[14px] border ${isParticipated ? 'border-[#D1FAE5] bg-[#EDFAF3] text-[#059669]' : 'border-[#E8EDF6] bg-white text-[#7B8AB0]'}`}>
            {isParticipated ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}
          </button>
          <button
            onClick={() => {
              if (eventId === evt.id) handleCopyEventUrl(evt);
              else { playClick(); navigate(getEventPath(evt.id)); }
            }}
            className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] border border-[#E8EDF6] bg-white text-[#7B8AB0]"
          >
            <LinkIcon size={19} />
          </button>
          {evt.link && !isLinkClosed && !evt.is_deleted ? (
            <a href={formattedLink} target="_blank" rel="noopener noreferrer" className="flex h-[42px] flex-1 items-center justify-center rounded-[14px] bg-[#1A56FF] text-[12px] font-black text-white shadow-[0_6px_14px_rgba(26,86,255,0.2)]">
              Tham gia ngay
            </a>
          ) : (
            <button disabled className="flex h-[42px] flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-[#F2F4F8] text-[12px] font-black text-[#A8B2C8]">
              <Lock size={14} /> Đã đóng
            </button>
          )}
        </div>
      </div>
    );
  };

return (
    <div className="mobile-page mobile-events-page w-full min-h-[100dvh] bg-[#E8ECF4] animate-fadeIn">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[430px] bg-[#F2F4F8] pb-[calc(110px+env(safe-area-inset-bottom))] text-[#0D1B3E]">
      <div className="h-[calc(env(safe-area-inset-top)+16px)] shrink-0" aria-hidden="true" />
      {/* Sticky Mobile Header */}
      <div className="mobile-events-native-header px-6 pb-4 pt-1">
          <div className="flex items-start justify-between">
              <div>
                  <h2 className="text-[30px] font-black leading-[1.08] tracking-normal text-[#0D1B3E]">Sự kiện</h2>
                  <p className="mt-1 text-[13px] font-semibold text-[#7B8AB0]">Điểm rèn luyện & hoạt động</p>
              </div>
              <div className="flex gap-2">
                  <button onClick={() => { playClick(); fetchEvents(); }} className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-white text-[#0D1B3E] shadow-[0_2px_10px_rgba(13,27,62,0.08)] active:scale-95"><RefreshCw size={19} className={loading ? "animate-spin" : ""} /></button>
                  <button onClick={() => { isManagementView ? openEventEditor(null) : (playClick(), setShowContributeModal(true)); }} className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-[#1A56FF] text-white shadow-[0_8px_18px_rgba(26,86,255,0.26)] active:scale-95"><PlusCircle size={19} /></button>
              </div>
          </div>

          {canManage && (
              <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-white p-1 shadow-[0_2px_12px_rgba(13,27,62,0.06)]">
                  <button onClick={() => { playClick(); setIsManagementView(false); }} className={`py-2 rounded-xl text-xs font-black transition-all ${!isManagementView ? 'bg-[#EEF2FF] text-[#1A56FF]' : 'text-[#7B8AB0]'}`}>Giao diện SV</button>
                  <button onClick={() => { playClick(); setIsManagementView(true); }} className={`py-2 rounded-xl text-xs font-black transition-all ${isManagementView ? 'bg-[#EEF2FF] text-[#1A56FF]' : 'text-[#7B8AB0]'}`}>Quản lý</button>
              </div>
          )}

          {!eventId && <div className="hidden">
              <div className="relative flex-1">
                  <input type="text" placeholder="Tìm tên, BTC..." className="pl-10 pr-4 py-3 w-full bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              </div>
              <button onClick={() => { playClick(); setShowScoreGuide(true); }} className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 active:bg-gray-100">
                  <FileText size={20} />
              </button>
          </div>}

          {!eventId && <div className="hidden">
              <select value={activeScope} onChange={(e) => setActiveScope(e.target.value)} className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 outline-none">
                  <option value="all">Khu vực: Tất cả</option><option value="internal">Trong trường</option><option value="external">Ngoài trường</option>
              </select>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 outline-none">
                  <option value="newest">Sắp xếp: Mới nhất</option><option value="expiring_soon">Sắp hết hạn</option>
              </select>
          </div>}

          {/* Scrollable Tabs */}
          {!eventId && <div className={`event-tab-track ${tabIndicatorClass} hidden`}>
            {tabsList.map((tab, idx) => (
                <button key={tab.id} ref={(el) => { tabsRef.current[idx] = el; }} onClick={() => { playClick(); setActiveTab(tab.id); }} className={`flex-1 px-4 pb-2.5 text-[14px] font-bold whitespace-nowrap z-10 transition-colors ${activeTab === tab.id ? 'text-[#003375]' : 'text-gray-400'}`}>
                    {tab.l}
                </button>
            ))}
            <div className="event-tab-indicator" aria-hidden="true" />
          </div>}
      </div>

      <div className="px-6 pb-8">
          {!eventId && (
              <>
                  <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#9AA5C0]">Tổng quan</div>
                  <div className="mb-3 grid grid-cols-2 gap-3">
                      <div className="min-h-[104px] rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                          <div className="flex items-center justify-between text-[11px] font-bold text-[#7B8AB0]">
                              Sự kiện mở
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#1A56FF]"><Calendar size={14} /></span>
                          </div>
                          <div className="mt-4 text-[27px] font-black leading-none tracking-normal text-[#1A56FF]">{openEventsCount}</div>
                          <div className="mt-1.5 text-[10.5px] font-semibold text-[#9AA5C0]">Đang nhận đăng ký</div>
                      </div>
                      <div className="min-h-[104px] rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                          <div className="flex items-center justify-between text-[11px] font-bold text-[#7B8AB0]">
                              Đã lưu
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDFAF3] text-[#00C07F]"><Bookmark size={14} /></span>
                          </div>
                          <div className="mt-4 text-[27px] font-black leading-none tracking-normal text-[#00C07F]">{participatedEvents.length}</div>
                          <div className="mt-1.5 text-[10.5px] font-semibold text-[#9AA5C0]">Sự kiện quan tâm</div>
                      </div>
                  </div>

                  {featuredEvent && (
                      <div className="relative mb-3 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#1A56FF] to-[#597DFF] p-4 text-white shadow-[0_10px_24px_rgba(26,86,255,0.24)]">
                          <div className="absolute right-[-42px] top-[-48px] h-[130px] w-[130px] rounded-full bg-white/10" />
                          <div className="relative z-10 mb-3 flex items-start justify-between gap-3">
                              <div>
                                  <div className="text-[15px] font-black">{expiringTodayEvent ? 'Sắp hết hạn hôm nay' : 'Sự kiện nổi bật'}</div>
                                  <div className="mt-1 text-[11px] font-semibold opacity-85">{expiringTodayEvent ? 'Ưu tiên đăng ký trước khi đóng form' : 'Hoạt động mới cho sinh viên HUB'}</div>
                              </div>
                              <div className="rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-[10px] font-black">{featuredEvent.score.includes('+') ? featuredEvent.score : `+${featuredEvent.score}`} ĐRL</div>
                          </div>
                          <div className="relative z-10 rounded-2xl border border-white/25 bg-white/15 p-3">
                              <div className="text-[13px] font-black leading-snug">{featuredEvent.name}</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                  <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold"><Clock size={11} className="mr-1 inline" />{featuredEvent.deadline_time ? `Đóng ${formatTimeString(featuredEvent.deadline_time)}` : featuredEvent.time}</span>
                                  <span className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold"><MapPin size={11} className="mr-1 inline" />{featuredEvent.scope}</span>
                              </div>
                          </div>
                      </div>
                  )}

                  <div className="mb-3 rounded-[20px] bg-white p-3.5 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                      <div className="mb-2.5 flex items-center justify-between">
                          <h3 className="flex items-center gap-1.5 text-[13.5px] font-black text-[#0D1B3E]"><Search size={16} className="text-[#1A56FF]" /> Tìm kiếm & Lọc</h3>
                          <div className="flex gap-1.5">
                              <button onClick={() => { playClick(); setShowScoreGuide(true); }} className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-[#EEF2FF] text-[#1A56FF]"><FileText size={15} /></button>
                              <button onClick={() => { playClick(); setSortOrder(sortOrder === 'expiring_soon' ? 'newest' : 'expiring_soon'); }} className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-[#EEF2FF] text-[#1A56FF]"><ArrowDownUp size={15} /></button>
                          </div>
                      </div>
                      <div className="relative mb-2.5">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8B2C8]" />
                          <input type="text" placeholder="Tìm tên sự kiện, BTC..." className="h-[38px] w-full rounded-xl border border-[#E5EAF4] bg-[#F8FAFD] pl-8 pr-3 text-xs font-semibold text-[#5B6478] outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                          <select value={activeScope} onChange={(e) => setActiveScope(e.target.value)} className="h-[38px] appearance-none rounded-xl border border-[#E5EAF4] bg-[#F8FAFD] px-3 text-xs font-bold text-[#0D1B3E] outline-none">
                              <option value="all">Khu vực: Tất cả</option><option value="internal">Trong trường</option><option value="external">Ngoài trường</option>
                          </select>
                          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} className="h-[38px] appearance-none rounded-xl border border-[#E5EAF4] bg-[#F8FAFD] px-3 text-xs font-bold text-[#0D1B3E] outline-none">
                              <option value="newest">Mới nhất</option><option value="expiring_soon">Sắp hết hạn</option><option value="oldest">Cũ nhất</option>
                          </select>
                      </div>
                  </div>

                  <div className="-mx-6 mb-3 flex gap-2 overflow-x-auto px-6 pb-1 no-scrollbar">
                      {tabsList.map((tab) => (
                          <button key={tab.id} onClick={() => { playClick(); setActiveTab(tab.id); }} className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-black shadow-[0_2px_10px_rgba(13,27,62,0.04)] ${activeTab === tab.id ? 'bg-[#1A56FF] text-white shadow-[0_6px_16px_rgba(26,86,255,0.25)]' : 'bg-white text-[#7B8AB0]'}`}>
                              {tab.l}
                          </button>
                      ))}
                  </div>

                  {!canManage && <div className="relative mb-3 overflow-hidden rounded-[20px] border border-[#DAE6FF] bg-gradient-to-br from-[#F8FBFF] to-[#EEF4FF] p-4">
                      <div className="absolute bottom-[-40px] right-[-28px] h-[110px] w-[110px] rounded-full bg-[#1A56FF]/10" />
                      <div className="relative z-10 flex items-center gap-2 text-[13px] font-black text-[#0D1B3E]"><UserPlus size={16} className="text-[#1A56FF]" /> Trở thành CTV HUB Planner</div>
                      <p className="relative z-10 mt-1 text-[11px] font-semibold leading-snug text-[#7B8AB0]">Tham gia cập nhật sự kiện, xây dựng cộng đồng sinh viên HUB.</p>
                      <button onClick={() => { playClick(); setShowCTVModal(true); }} className="relative z-10 mt-3 rounded-xl bg-[#1A56FF] px-4 py-2.5 text-[11px] font-black text-white shadow-[0_6px_14px_rgba(26,86,255,0.2)]">Đăng ký ngay</button>
                  </div>}
              </>
          )}

          {eventId && (
              <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-black text-[#003375]">Đang mở link riêng của sự kiện</p>
                  <p className="mt-1 text-xs leading-relaxed text-blue-800/80">{routeEvent ? routeEvent.name : 'Không tìm thấy sự kiện này hoặc sự kiện đã bị ẩn.'}</p>
                  <button
                      onClick={() => { playClick(); navigate('/events'); }}
                      className="mt-3 w-full rounded-xl bg-white border border-blue-200 py-2.5 text-xs font-black text-[#003375] active:bg-blue-100"
                  >
                      Xem tất cả sự kiện
                  </button>
              </div>
          )}

          {false && !eventId && !canManage && <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 mb-5 shadow-sm relative overflow-hidden">
              <div className="relative z-10 flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                      <UserPlus className="text-blue-600" size={18} />
                      <h4 className="font-bold text-sm text-blue-900">Trở thành CTV HUB Planner</h4>
                  </div>
                  <p className="text-xs text-blue-800/80 mb-3">Tham gia cập nhật sự kiện, xây dựng cộng đồng!</p>
                  <button onClick={() => { playClick(); setShowCTVModal(true); }} className="bg-[#003375] text-white text-xs font-bold py-2.5 px-5 rounded-lg self-start active:scale-95 shadow-sm">Đăng ký ngay</button>
              </div>
              <Users size={120} className="absolute right-[-20px] bottom-[-20px] text-blue-100 opacity-50" />
          </div>}

          {/* List Events */}
          <div className="flex flex-col gap-3">
             {loading ? (
                <div className="flex flex-col items-center justify-center py-10"><Loader2 size={32} className="text-[#003375] animate-spin mb-3" /><p className="text-gray-500 text-sm">Đang tải...</p></div>
             ) : displayedEvents.length > 0 ? (
                displayedEvents.map(evt => isManagementView ? renderManagementCard(evt) : renderNativeEventCard(evt))
             ) : (
                <div className="py-12 text-center bg-white rounded-xl border border-dashed border-gray-300">
                    <Calendar className="mx-auto text-gray-300 mb-2" size={32}/>
                    <p className="text-gray-500 text-sm font-medium">Không tìm thấy sự kiện phù hợp.</p>
                </div>
             )}
          </div>
      </div>
      </div>

      <NotificationToast />
      {showContributeModal && <ContributeEventModal isOpen={showContributeModal} onClose={() => setShowContributeModal(false)} onShowToast={showToast} />}
      <CTVModalWrapper isOpen={showCTVModal} onClose={() => setShowCTVModal(false)} onShowToast={showToast} />
      <ScoreGuideModal isOpen={showScoreGuide} onClose={() => setShowScoreGuide(false)} />
      <ReportEventModal isOpen={!!reportingEvent} onClose={() => setReportingEvent(null)} event={reportingEvent} onShowToast={showToast} />
      {(editingEvent || Object.keys(eventEditData).length > 0) && createPortal(
          <div className="fixed inset-0 bg-black/60 z-[100000] flex items-end justify-center animate-fadeIn" onClick={closeEventEditor}>
              <div className="bg-white rounded-t-3xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-slideUp overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-3 mb-1 shrink-0" />
                  <div className="px-4 pt-2 pb-3 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-black text-[#003375] text-lg flex items-center gap-2">{editingEvent ? <Edit2 size={18}/> : <PlusCircle size={18}/>} {editingEvent ? 'Chỉnh sửa sự kiện' : 'Thêm sự kiện'}</h3>
                      <button onClick={closeEventEditor} className="bg-gray-100 p-2 rounded-full text-gray-500 active:scale-95"><X size={16}/></button>
                  </div>
                  <form onSubmit={saveEventEdit} className="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-3 pb-safe">
                      <input required placeholder="Tên sự kiện" value={eventEditData.title || ''} onChange={e => setEventEditData({...eventEditData, title: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-gray-50" />
                      <input placeholder="BTC" value={eventEditData.organizer || ''} onChange={e => setEventEditData({...eventEditData, organizer: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-gray-50" />
                      <div className="grid grid-cols-2 gap-3">
                          <select value={eventEditData.criteria || 'III'} onChange={e => setEventEditData({...eventEditData, criteria: e.target.value})} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none bg-gray-50">
                              <option value="I">Mục I</option><option value="II">Mục II</option><option value="III">Mục III</option><option value="IV">Mục IV</option><option value="V">Mục V</option><option value="Chưa biết">Chưa biết</option>
                          </select>
                          <input placeholder="Điểm cộng" value={eventEditData.points || ''} onChange={e => setEventEditData({...eventEditData, points: e.target.value})} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-gray-50" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <input placeholder="Loại hình" value={eventEditData.category || ''} onChange={e => setEventEditData({...eventEditData, category: e.target.value})} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-gray-50" />
                          <select value={eventEditData.status || 'Sắp diễn ra'} onChange={e => setEventEditData({...eventEditData, status: e.target.value})} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none bg-gray-50">
                              <option value="pending">Chờ duyệt</option><option value="Sắp diễn ra">Sắp diễn ra</option><option value="Đang diễn ra">Đang diễn ra</option><option value="Đã kết thúc">Đã kết thúc</option>
                          </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <select value={eventEditData.location_type || 'Trong trường'} onChange={e => setEventEditData({...eventEditData, location_type: e.target.value})} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none bg-gray-50">
                              <option value="Trong trường">Trong trường</option><option value="Ngoài trường">Ngoài trường</option>
                          </select>
                          <select value={eventEditData.format || 'Offline'} onChange={e => setEventEditData({...eventEditData, format: e.target.value})} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none bg-gray-50">
                              <option value="Offline">Offline</option><option value="Online">Online</option><option value="Hybrid">Hybrid</option>
                          </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                          <input type="date" value={eventEditData.event_date || ''} onChange={e => setEventEditData({...eventEditData, event_date: e.target.value})} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none bg-gray-50" />
                          <input type="time" value={eventEditData.event_time || ''} onChange={e => setEventEditData({...eventEditData, event_time: e.target.value})} className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none bg-gray-50" />
                      </div>
                      <input placeholder="Link đăng ký" value={eventEditData.link || ''} onChange={e => setEventEditData({...eventEditData, link: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-gray-50" />
                      <textarea rows={3} placeholder="Mô tả" value={eventEditData.description || ''} onChange={e => setEventEditData({...eventEditData, description: e.target.value})} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375] bg-gray-50 resize-none" />
                      <button type="submit" disabled={isSavingEvent} className="w-full py-3 rounded-xl bg-[#003375] text-white text-sm font-bold active:bg-[#002855] disabled:opacity-50 flex items-center justify-center gap-2">
                          {isSavingEvent ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} Lưu sự kiện
                      </button>
                  </form>
              </div>
          </div>, document.body
      )}
    </div>
  );
};
