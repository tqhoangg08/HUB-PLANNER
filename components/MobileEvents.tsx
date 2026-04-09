import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../utils/supabase';
import { 
  Search, Calendar, MapPin, Award, Loader2, RefreshCw, Users, Clock, 
  AlertCircle, FileText, X, PlusCircle, Sparkles, GraduationCap, BookOpen, 
  Phone, Send, User, Link as LinkIcon, Type, CheckCircle2, Building2, 
  MessageCircle, ChevronDown, Flame, Lock, Circle, Siren, Edit2, Trash2, 
  Save, ToggleLeft, ToggleRight, Settings, Tag, RotateCcw,
  Info, ExternalLink, CalendarClock,
  Bookmark, BookmarkCheck, ArrowDownUp, AlertTriangle, CalendarDays, MoreHorizontal, UserPlus
} from 'lucide-react';
import { playClick } from '../utils/audio';
import { CommentSection } from './CommentSection';
import { useUserRole } from '../hooks/useUserRole';
import { CTVRegistrationForm } from './CTVRegistrationForm';

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
        <div className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fadeIn sm:p-4" onClick={onClose}>
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
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end sm:items-center justify-center animate-fadeIn backdrop-blur-sm" onClick={onClose}>
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
    const [formData, setFormData] = useState({
        title: '', deadline: '', deadline_time: '', close_on_full: false, event_date: '', event_time: '',
        category: 'Hoạt động phong trào', criteria: 'III', points: '5', organizer: '', link: '', format: 'Offline', location_type: 'Trong trường', description: '' 
    });
    const [submitting, setSubmitting] = useState(false);
    const [isDraftLoaded, setIsDraftLoaded] = useState(false);

    useEffect(() => {
        if (isOpen) {
            const savedDraft = localStorage.getItem(DRAFT_KEY);
            if (savedDraft) {
                try {
                    const parsed = JSON.parse(savedDraft);
                    setFormData(parsed);
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

    const handleClearDraft = () => {
        if (window.confirm("Bạn có chắc muốn xóa toàn bộ nội dung nháp?")) {
            playClick();
            setFormData({
                title: '', deadline: '', deadline_time: '', close_on_full: false, event_date: '', event_time: '',
                category: 'Hoạt động phong trào', criteria: 'III', points: '5', organizer: '', link: '', format: 'Offline', location_type: 'Trong trường', description: ''
            });
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
                category: formData.category, criteria: formData.criteria, points: formData.points,
                organizer: formData.organizer, link: formData.link, format: formData.format,
                description: formData.description, location_type: formData.location_type,
                status: 'pending', is_manually_closed: false 
            };

            const { error } = await supabase.from('events').insert([payload]);
            if (error) throw error;

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
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fadeIn" onClick={onClose}>
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

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Ngày hết hạn</label>
                                <input type="date" disabled={formData.close_on_full} className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50 disabled:bg-gray-200 disabled:text-gray-400" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Giờ hết hạn</label>
                                <input type="time" disabled={formData.close_on_full} className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50 disabled:bg-gray-200 disabled:text-gray-400" value={formData.deadline_time || ''} onChange={e => setFormData({...formData, deadline_time: e.target.value})} />
                            </div>
                        </div>

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
                            <input type="text" className="w-full border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#003375] bg-gray-50" placeholder="VD: Hội thảo" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
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

const DiscussionModal = ({ event, onClose }: { event: {id: string, name: string} | null; onClose: () => void }) => {
    if (!event) return null;
    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-end justify-center animate-fadeIn backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-t-3xl w-full h-[85vh] flex flex-col animate-slideUp relative overflow-hidden" onClick={e => e.stopPropagation()}>
                <DragHandle />
                <div className="p-4 border-b flex justify-between items-center bg-white shrink-0">
                    <div className="flex-1 pr-2">
                        <h3 className="font-bold text-[#003375] text-base line-clamp-1">{event.name}</h3>
                        <p className="text-xs text-gray-500">Thảo luận & Hỏi đáp</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-gray-100 text-gray-500 rounded-full active:scale-95"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-hidden relative pb-safe">
                      <CommentSection contextId={`event_${event.id}`} title="Bình luận" className="h-full border-0 shadow-none rounded-none"/>
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
            const { error } = await supabase.from('event_reports').insert([payload]);
            if (error) throw error;

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
        <div className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fadeIn" onClick={onClose}>
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
  useEffect(() => {
    document.title = "Sự kiện ĐRL | HUB Planner";
  }, []);
  const { isAdmin, isCTV, session } = useUserRole();
  const canManage = isAdmin || isCTV;
  
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
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const [showCTVModal, setShowCTVModal] = useState(false);
  const [showScoreGuide, setShowScoreGuide] = useState(false);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [discussEvent, setDiscussEvent] = useState<{id: string, name: string} | null>(null);
  const [reportingEvent, setReportingEvent] = useState<HubEvent | null>(null);

  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const tabsList = useMemo(() => [
      {id:'all',l:'Tất cả'},
      {id:'participated', l:`Đã tham gia (${participatedEvents.length})`}, 
      {id:'I',l:'Mục I'},{id:'II',l:'Mục II'},{id:'III',l:'Mục III'},{id:'IV',l:'Mục IV'},{id:'V',l:'Mục V'}
  ], [participatedEvents.length]);

  useEffect(() => {
      const updateIndicator = () => {
          const activeIndex = tabsList.findIndex(t => t.id === activeTab);
          const activeElement = tabsRef.current[activeIndex];
          if (activeElement && activeElement.parentElement) {
              setIndicatorStyle({
                  left: activeElement.offsetLeft,
                  width: activeElement.offsetWidth,
              });
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

  const fetchEvents = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/events?t=${new Date().getTime()}`);
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
              event_date: row.event_date || null, event_time: row.event_time || null 
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

  const filteredEvents = events.filter(evt => {
    const matchesSearch = evt.name.toLowerCase().includes(searchTerm.toLowerCase()) || evt.organizer.toLowerCase().includes(searchTerm.toLowerCase());
    let matchesTab = true;
    let isVisible = true;

    if (activeTab === 'participated') {
        matchesTab = participatedEvents.includes(evt.id);
    } else {
        if (evt.is_deleted) isVisible = false;
        if (activeTab !== 'all') matchesTab = evt.category === activeTab;
    }

    const matchesScope = activeScope === 'all' || (activeScope === 'internal' && evt.scope === 'Trong trường') || (activeScope === 'external' && evt.scope === 'Ngoài trường');
    return matchesSearch && matchesTab && matchesScope && isVisible;
  }).sort((a, b) => {
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
            <div className="flex items-center gap-2">
                <Calendar size={14} className="text-[#003375] shrink-0"/>
                <span className="truncate">Diễn ra: {evt.event_date ? `${formatTimeString(evt.event_time)} ${formatDateString(evt.event_date)}` : 'Chưa cập nhật'}</span>
            </div>
            <div className="flex items-center gap-2">
                <Clock size={14} className="text-orange-500 shrink-0" />
                <span className="truncate">Hạn chót: {evt.close_on_full ? <span className="text-[#990000] font-bold">Đóng khi đủ SL</span> : evt.time}</span>
            </div>
        </div>

        <div className="flex items-center gap-2 mt-auto pt-2">
            <button onClick={() => toggleParticipation(evt.id)} className={`p-3 rounded-xl border flex items-center justify-center transition-colors ${isParticipated ? 'bg-green-50 border-green-300 text-green-600' : 'bg-white border-gray-200 text-gray-500 active:bg-gray-50'}`}>
                {isParticipated ? <BookmarkCheck size={20}/> : <Bookmark size={20}/>}
            </button>
            <button onClick={() => { playClick(); setDiscussEvent({ id: evt.id, name: evt.name }); }} className="p-3 bg-white border border-gray-200 rounded-xl text-gray-500 active:bg-gray-50 flex items-center justify-center">
                <MessageCircle size={20}/>
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

return (
    <div className="w-full min-h-[100dvh] bg-[#F8FAFC] pb-24 animate-fadeIn">
      {/* Sticky Mobile Header */}
      <div className="sticky top-0 z-40 bg-white pt-4 pb-2 px-4 shadow-sm">          
          <div className="flex items-center justify-between mb-4">
              <h2 className="text-[24px] font-extrabold text-[#003375] tracking-tight">Sự kiện ĐRL</h2>
              <div className="flex gap-2">
                  <button onClick={() => { playClick(); fetchEvents(); }} className="p-2.5 bg-gray-50 rounded-full text-[#003375] active:bg-gray-100"><RefreshCw size={20} className={loading ? "animate-spin" : ""} /></button>
                  <button onClick={() => { playClick(); setShowContributeModal(true); }} className="p-2.5 bg-[#003375] text-white rounded-full shadow-md active:scale-95"><PlusCircle size={20} /></button>
              </div>
          </div>

          <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                  <input type="text" placeholder="Tìm tên, BTC..." className="pl-10 pr-4 py-3 w-full bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#003375]" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              </div>
              <button onClick={() => { playClick(); setShowScoreGuide(true); }} className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 active:bg-gray-100">
                  <FileText size={20} />
              </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
              <select value={activeScope} onChange={(e) => setActiveScope(e.target.value)} className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 outline-none">
                  <option value="all">Khu vực: Tất cả</option><option value="internal">Trong trường</option><option value="external">Ngoài trường</option>
              </select>
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as any)} className="appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 outline-none">
                  <option value="newest">Sắp xếp: Mới nhất</option><option value="expiring_soon">Sắp hết hạn</option>
              </select>
          </div>

          {/* Scrollable Tabs */}
          <div className="relative flex w-full overflow-x-auto no-scrollbar pt-2">
            {tabsList.map((tab, idx) => (
                <button key={tab.id} ref={(el) => { tabsRef.current[idx] = el; }} onClick={() => { playClick(); setActiveTab(tab.id); }} className={`flex-none px-4 pb-2.5 text-[14px] font-bold whitespace-nowrap z-10 transition-colors ${activeTab === tab.id ? 'text-[#003375]' : 'text-gray-400'}`}>
                    {tab.l}
                </button>
            ))}
            <div className="absolute bottom-0 h-0.5 bg-[#003375] transition-all duration-300 rounded-t-full" style={{ left: `${indicatorStyle.left}px`, width: `${indicatorStyle.width}px` }} />
          </div>
      </div>

      <div className="p-4">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 mb-5 shadow-sm relative overflow-hidden">
              <div className="relative z-10 flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                      <UserPlus className="text-blue-600" size={18} />
                      <h4 className="font-bold text-sm text-blue-900">Trở thành CTV HUB Planner</h4>
                  </div>
                  <p className="text-xs text-blue-800/80 mb-3">Tham gia cập nhật sự kiện, xây dựng cộng đồng!</p>
                  <button onClick={() => { playClick(); setShowCTVModal(true); }} className="bg-[#003375] text-white text-xs font-bold py-2.5 px-5 rounded-lg self-start active:scale-95 shadow-sm">Đăng ký ngay</button>
              </div>
              <Users size={120} className="absolute right-[-20px] bottom-[-20px] text-blue-100 opacity-50" />
          </div>

          {/* List Events */}
          <div className="space-y-0">
             {loading ? (
                <div className="flex flex-col items-center justify-center py-10"><Loader2 size={32} className="text-[#003375] animate-spin mb-3" /><p className="text-gray-500 text-sm">Đang tải...</p></div>
             ) : filteredEvents.length > 0 ? (
                filteredEvents.map(evt => renderEventCard(evt))
             ) : (
                <div className="py-12 text-center bg-white rounded-xl border border-dashed border-gray-300">
                    <Calendar className="mx-auto text-gray-300 mb-2" size={32}/>
                    <p className="text-gray-500 text-sm font-medium">Không tìm thấy sự kiện phù hợp.</p>
                </div>
             )}
          </div>
      </div>

      <NotificationToast />
      <DiscussionModal event={discussEvent} onClose={() => setDiscussEvent(null)} />
      {showContributeModal && <ContributeEventModal isOpen={showContributeModal} onClose={() => setShowContributeModal(false)} onShowToast={showToast} />}
      <CTVModalWrapper isOpen={showCTVModal} onClose={() => setShowCTVModal(false)} onShowToast={showToast} />
      <ScoreGuideModal isOpen={showScoreGuide} onClose={() => setShowScoreGuide(false)} />
      <ReportEventModal isOpen={!!reportingEvent} onClose={() => setReportingEvent(null)} event={reportingEvent} onShowToast={showToast} />
    </div>
  );
};