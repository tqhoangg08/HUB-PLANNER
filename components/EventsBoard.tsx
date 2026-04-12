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

// --- Sub-Components (Modals) ---

const CTVModalWrapper = ({ isOpen, onClose, onShowToast }: { isOpen: boolean; onClose: () => void; onShowToast: (msg: string, type: 'success' | 'error') => void }) => {
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-3xl max-w-md w-full p-6 animate-scaleIn relative flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-2">
                    <div className="w-14 h-14 bg-blue-100 text-[#003375] rounded-full flex items-center justify-center shadow-sm border border-blue-200">
                        <UserPlus size={28} />
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-colors active:scale-95">
                        <X size={18} />
                    </button>
                </div>
                <h3 className="text-2xl font-black text-[#003375] mb-2 mt-2">Đăng ký CTV</h3>
                <p className="text-sm text-gray-600 mb-6 leading-relaxed">
                    Gia nhập đội ngũ phát triển nội dung, giúp cập nhật thông tin sự kiện nhanh nhất cho cộng đồng sinh viên HUB!
                </p>
                <div className="bg-gray-50 -mx-6 px-6 py-2 border-t border-gray-100 flex-1">
                    <CTVRegistrationForm 
                        onSuccess={() => {
                            onShowToast("Đã gửi đơn đăng ký CTV thành công!", "success");
                        }}
                        onClose={onClose} 
                    />
                </div>
            </div>
        </div>, document.body
    );
};

const ScoreGuideModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    if (!isOpen) return null;

    const sections = [
        {
            id: 'I',
            title: 'Đánh giá về ý thức học tập',
            range: '0 → 20',
            color: 'blue',
            content: [
                { type: 'header', text: 'Điểm cộng' },
                { text: '- Kết quả học tập', points: '' },
                { text: '+ Xuất sắc', points: '+ 15' },
                { text: '+ Giỏi', points: '+ 10' },
                { text: '+ Khá', points: '+ 8' },
                { text: '+ Trung bình khá', points: '+ 6' },
                { text: '+ Trung bình', points: '+ 5' },
                { text: '- Tham gia các cuộc thi học thuật/ tham gia Hội thảo khoa học, chuyên đề, tọa đàm/ tham gia cuộc thi sáng tạo khởi nghiệp (lấy điểm ở cấp cao nhất)', points: '' },
                { text: '+ Cấp tỉnh (thành) trở lên', points: '+ 10' },
                { text: '+ Cấp Trường', points: '+ 5' },
                { text: '+ Cấp Khoa', points: '+ 4' },
                { text: '- Có đề tài NCKH', points: '' },
                { text: '+ Cấp tỉnh (thành) trở lên', points: '15' },
                { text: '+ Cấp Trường', points: '10' },
                { text: '+ Cấp Khoa', points: '8' },
                { text: '- Là thành viên của một (hoặc nhiều) CLB học thuật trong hoặc ngoài Trường', points: '+ 5' },
                { text: '- Đạt giải hội thi Olympic hoặc các cuộc thi học thuật (cấp tỉnh, thành trở lên)', points: '+ 20' },
                { text: '- Tham dự (cổ vũ) các cuộc thi học thuật, hội thảo, chuyên đề, tọa đàm', points: '+ 3' },
                { type: 'header', text: 'Điểm trừ', isNegative: true },
                { text: 'Bị cảnh báo học vụ và các vi phạm khác liên quan học tập và NCKH.', points: '- 5/lần' },
            ]
        },
        {
            id: 'II',
            title: 'Đánh giá về ý thức chấp hành nội quy, quy chế, quy định tại Trường',
            range: '0 → 25',
            color: 'green',
            content: [
                { type: 'header', text: 'Điểm cộng' },
                { text: '- Không vi phạm nội quy, quy chế trong Trường', points: '+ 20' },
                { text: '- Tham gia sinh hoạt lớp đầy đủ (02 buổi/học kỳ theo lịch Trường quy định)', points: '+ 5' },
                { text: '- Hoàn thành các buổi sinh hoạt tập trung của Trường (phổ biến nội quy, quy chế,...)', points: '+ 5đ/lần' },
                { type: 'header', text: 'Điểm trừ', isNegative: true },
                { text: '- Các vi phạm quy định, quy chế của Trường bị lập biên bản.', points: '- 5đ/lần' },
                { text: '- Không tham gia sinh hoạt lớp', points: '- 3/lần' },
            ]
        },
        {
            id: 'III',
            title: 'Đánh giá về ý thức tham gia các hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao, phòng chống tội phạm và các tệ nạn xã hội',
            range: '0 → 20',
            color: 'yellow',
            content: [
                { type: 'header', text: 'Điểm cộng' },
                { text: '- Tham gia hoạt động chính trị, văn hóa, văn nghệ, thể thao', points: '' },
                { text: '+ Là thành viên Ban tổ chức', points: '+ 10đ/hoạt động' },
                { text: '+ Là thành viên tham gia trực tiếp', points: '' },
                { text: '  Cấp lớp, khoa, trường, địa phương', points: '+ 5đ/hoạt động', isSubItem: true },
                { text: '  Cấp tỉnh (thành) trở lên', points: '+ 10đ/hoạt động', isSubItem: true },
                { text: '+ Cổ vũ', points: '+ 3đ/hoạt động' },
                { text: '- Tham gia công trình thanh niên từ cấp chi đoàn trở lên', points: '+ 5đ/hoạt động' },
                { text: '- Tham gia công tác phòng chống tội phạm và các tệ nạn xã hội', points: '+ 5đ/hoạt động' },
                { text: '- Tham gia các hoạt động khác', points: '+ 3đ/hoạt động' },
                { type: 'header', text: 'Điểm trừ', isNegative: true },
                { text: 'Trong quá trình tham gia, vi phạm kỷ luật, bị lập biên bản', points: '- 5đ/lần' },
            ]
        },
        {
            id: 'IV',
            title: 'Đánh giá về ý thức công dân trong quan hệ cộng đồng',
            range: '0 → 25',
            color: 'orange',
            content: [
                { type: 'header', text: 'Điểm cộng' },
                { text: '- Chấp hành quy định tại nơi cư trú', points: '+ 15' },
                { text: '- Được khen thưởng tại nơi cư trú', points: '+ 5' },
                { text: '- Tham gia công tác xã hội, nhân đạo, từ thiện, tình nguyện; phòng chống tệ nạn xã hội và hoạt động kết nối cộng đồng khác', points: '' },
                { text: '+ Mùa hè xanh', points: '+ 15' },
                { text: '+ Xuân tình nguyện (hoặc tiếp sức mùa thi, hiến máu nhân đạo)', points: '+ 10đ/hoạt động' },
                { text: '+ Thành viên của một hoặc nhiều CLB khác (ngoài CLB học thuật ở mục I và CLB văn hóa - nghệ thuật - thể thao ở mục III)', points: '+ 5' },
                { text: '+ Cộng tác viên của Đoàn TN, Hội SV và các đơn vị trong Trường', points: '+ 4' },
                { text: '+ Tham gia các hoạt động khác', points: '+ 4đ/hoạt động' },
                { type: 'header', text: 'Điểm trừ', isNegative: true },
                { text: 'Vi phạm nội quy, quy định nơi cư trú (nội quy KTX hoặc quy định của địa phương) và các vi phạm trong quá trình tham gia các hoạt động thuộc mục IV và bị lập biên bản', points: '- 5đ/vi phạm' },
            ]
        },
        {
            id: 'V',
            title: 'Đánh giá về ý thức và kết quả khi tham gia công tác cán bộ lớp, các đoàn thể, tổ chức khác trong Trường, hoặc đạt được thành tích đặc biệt trong học tập, rèn luyện',
            range: '0 → 10',
            color: 'purple',
            content: [
                { text: '- Tham gia Ban cán sự lớp, BCH Đoàn TN, Hội SV, Ban chủ nhiệm các CLB, Đội, Nhóm và hoàn thành nhiệm vụ', points: '+ 5' },
                { text: '- Đạt thành tích đặc biệt xuất sắc trong công tác Đoàn và phong trào sinh viên (có giấy khen, bằng khen từ cấp tỉnh/ thành trở lên)', points: '+ 10' },
                { text: '- Đạt giải NCKH, cuộc thi Olympic hoặc các cuộc thi tương đương khác, cuộc thi sáng tạo khởi nghiệp (lấy thành tích ở cấp cao nhất)', points: '' },
                { text: '+ Cấp Khoa', points: '+ 6' },
                { text: '+ Cấp Trường', points: '+ 8' },
                { text: '+ Cấp tỉnh (thành) trở lên', points: '+ 10' },
                { text: '- Các danh hiệu của SV (có quyết định công nhận hoặc giấy chứng nhận)', points: '' },
                { text: '+ Cấp Khoa và tương đương', points: '+ 6' },
                { text: '+ Cấp Trường và tương đương trở lên', points: '+ 10' },
            ]
        }
    ];

    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 animate-fadeIn backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl max-w-4xl w-full h-[90vh] flex flex-col animate-scaleIn relative overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-[#003375] text-white shrink-0">
                    <h3 className="text-xl font-bold flex items-center gap-2"><FileText /> Phụ lục Đánh giá Kết quả Rèn luyện</h3>
                    <button onClick={onClose} className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-full transition-colors"><X size={24} /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-gray-50">
                    <div className="space-y-8">
                        {sections.map((section) => (
                            <div key={section.id} className={`bg-white rounded-xl border-l-4 shadow-sm overflow-hidden ${
                                section.color === 'blue' ? 'border-blue-500' :
                                section.color === 'green' ? 'border-green-500' :
                                section.color === 'yellow' ? 'border-yellow-500' :
                                section.color === 'orange' ? 'border-orange-500' :
                                'border-purple-500'
                            }`}>
                                <div className={`px-5 py-4 border-b flex justify-between items-center ${
                                    section.color === 'blue' ? 'bg-blue-50 text-blue-900' :
                                    section.color === 'green' ? 'bg-green-50 text-green-900' :
                                    section.color === 'yellow' ? 'bg-yellow-50 text-yellow-900' :
                                    section.color === 'orange' ? 'bg-orange-50 text-orange-900' :
                                    'bg-purple-50 text-purple-900'
                                }`}>
                                    <h4 className="font-bold text-lg flex items-center gap-2">
                                        <span className="w-8 h-8 rounded-full bg-white/50 flex items-center justify-center text-sm border border-current">{section.id}</span>
                                        {section.title}
                                    </h4>
                                    <span className="font-bold bg-white px-3 py-1.5 rounded-lg text-sm shadow-sm border border-current opacity-90 whitespace-nowrap">{section.range}</span>
                                </div>
                                <div className="p-0">
                                    <table className="w-full text-sm">
                                        <tbody>
                                            {section.content.map((row: any, idx: number) => {
                                                if (row.type === 'header') {
                                                    return (
                                                        <tr key={idx} className={`${row.isNegative ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'} font-bold`}>
                                                            <td colSpan={2} className="px-5 py-3 uppercase text-xs tracking-wider border-b border-gray-100">{row.text}</td>
                                                        </tr>
                                                    )
                                                }
                                                return (
                                                    <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                                                        <td className={`px-5 py-3 text-gray-800 leading-relaxed ${row.isSubItem ? 'pl-10 text-gray-600' : ''}`}>
                                                            {row.text}
                                                        </td>
                                                        <td className="px-5 py-3 text-right font-bold whitespace-nowrap w-28 align-top">
                                                            {row.points && (
                                                                <span className={`px-2 py-1 rounded ${
                                                                    row.points.includes('-') 
                                                                    ? 'text-red-700 bg-red-50' 
                                                                    : 'text-[#003375] bg-blue-50'
                                                                }`}>
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
                    
                    <div className="mt-6 flex justify-end sticky bottom-0 pointer-events-none">
                        <div className="bg-[#003375] text-white px-5 py-2.5 rounded-xl font-bold text-base shadow-xl flex items-center gap-3 pointer-events-auto border-2 border-white/20 transform hover:scale-105 transition-transform backdrop-blur-md">
                            <span className="font-bold text-sm uppercase tracking-wide">TỔNG ĐIỂM TỐI ĐA</span>
                            <span className="bg-white text-[#003375] px-2.5 py-0.5 rounded-lg shadow-inner">100</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>, document.body
    );
};

const ContributeEventModal = ({ isOpen, onClose, onShowToast }: { isOpen: boolean; onClose: () => void; onShowToast: (msg: string, type: 'success' | 'error') => void }) => {
    const [formData, setFormData] = useState({
        title: '',
        deadline: '',
        deadline_time: '',
        close_on_full: false,
        event_date: '', 
        event_time: '', 
        category: 'Hoạt động phong trào',
        criteria: 'III',
        points: '5',
        organizer: '',
        link: '',
        format: 'Offline',
        location_type: 'Trong trường', 
        description: '' 
    });
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.title.trim()) {
            onShowToast("Vui lòng nhập tên sự kiện!", "error");
            return;
        }

        if (!formData.link.trim()) {
            onShowToast("Vui lòng nhập link tham gia!", "error");
            return;
        }

        if (!supabase) {
            onShowToast("Lỗi kết nối Server.", "error");
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
                category: formData.category, 
                criteria: formData.criteria, 
                points: formData.points,
                organizer: formData.organizer,
                link: formData.link,
                format: formData.format,
                description: formData.description, 
                location_type: formData.location_type,
                status: 'pending', 
                is_manually_closed: false 
            };

            const { error } = await supabase
                .from('events')
                .insert([payload]);

            if (error) throw error;

            onShowToast("Đóng góp của bạn đã được gửi và đang chờ Admin duyệt. Cảm ơn bạn!", "success");
            
            setFormData({
                title: '', deadline: '', deadline_time: '', close_on_full: false, event_date: '', event_time: '', category: 'Hoạt động phong trào', criteria: 'III', points: '5',
                organizer: '', link: '', format: 'Offline', location_type: 'Trong trường', description: ''
            });
            onClose();
        } catch (err: any) {
            console.error(err);
            onShowToast("Lỗi gửi đóng góp: " + err.message, "error");
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-scaleIn relative flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="bg-[#003375] p-4 flex justify-between items-center text-white sticky top-0 z-10 shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <PlusCircle size={20}/> Đóng góp Sự kiện mới
                    </h3>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                </div>

                <div className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Tên sự kiện <span className="text-red-500">*</span></label>
                            <input 
                                type="text" 
                                required 
                                className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375] transition-all"
                                placeholder="VD: Cuộc thi Tiếng Anh Star Awards..."
                                value={formData.title} 
                                onChange={e => setFormData({...formData, title: e.target.value})} 
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-2">
                                <div>
                                    <label className={`block text-sm font-bold mb-1 ${formData.close_on_full ? 'text-gray-400' : 'text-gray-700'}`}>Ngày hết hạn ĐK</label>
                                    <input 
                                        type="date" 
                                        disabled={formData.close_on_full}
                                        className={`w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375] transition-all ${formData.close_on_full ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300'}`}
                                        value={formData.deadline} 
                                        onChange={e => setFormData({...formData, deadline: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label className={`block text-sm font-bold mb-1 ${formData.close_on_full ? 'text-gray-400' : 'text-gray-700'}`}>Giờ hết hạn</label>
                                    <input 
                                        type="time" 
                                        disabled={formData.close_on_full}
                                        className={`w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375] transition-all ${formData.close_on_full ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300'}`}
                                        value={formData.deadline_time || ''} 
                                        onChange={e => setFormData({...formData, deadline_time: e.target.value})} 
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Ngày diễn ra</label>
                                <input 
                                    type="date" 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375]"
                                    value={formData.event_date} 
                                    onChange={e => setFormData({...formData, event_date: e.target.value})} 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Giờ diễn ra</label>
                                <input 
                                    type="time" 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375]"
                                    value={formData.event_time} 
                                    onChange={e => setFormData({...formData, event_time: e.target.value})} 
                                />
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200 gap-2">
                            <div>
                                <span className="font-bold text-gray-700 block">Đóng khi đủ số lượng</span>
                                <span className="text-xs text-gray-500">Form ĐK sẽ tự khóa trước thời hạn (Do BTC chủ động đóng).</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input type="checkbox" className="sr-only peer" checked={formData.close_on_full} onChange={e => setFormData({...formData, close_on_full: e.target.checked})} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#003375]"></div>
                            </label>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Loại hình</label>
                            <input 
                                type="text" 
                                className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375]"
                                placeholder="VD: Hội thảo..."
                                value={formData.category} 
                                onChange={e => setFormData({...formData, category: e.target.value})} 
                            />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="col-span-1">
                                <label className="block text-sm font-bold text-gray-700 mb-1">Mục ĐRL</label>
                                <select 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-[#003375]"
                                    value={formData.criteria} 
                                    onChange={e => setFormData({...formData, criteria: e.target.value})}
                                >
                                    <option value="I">Mục I</option>
                                    <option value="II">Mục II</option>
                                    <option value="III">Mục III</option>
                                    <option value="IV">Mục IV</option>
                                    <option value="V">Mục V</option>
                                    <option value="Chưa biết">Chưa biết</option>
                                </select>
                            </div>
                            <div className="col-span-1">
                                <label className="block text-sm font-bold text-gray-700 mb-1">Điểm cộng</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375] text-center font-bold text-[#990000]"
                                    value={formData.points} 
                                    onChange={e => setFormData({...formData, points: e.target.value})} 
                                />
                            </div>
                            <div className="col-span-1">
                                <label className="block text-sm font-bold text-gray-700 mb-1">Khu vực</label>
                                <select 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-[#003375]"
                                    value={formData.location_type} 
                                    onChange={e => setFormData({...formData, location_type: e.target.value})}
                                >
                                    <option value="Trong trường">Trong trường</option>
                                    <option value="Ngoài trường">Ngoài trường</option>
                                </select>
                            </div>
                            <div className="col-span-1">
                                 <label className="block text-sm font-bold text-gray-700 mb-1">Hình thức</label>
                                 <select 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 bg-white outline-none focus:ring-2 focus:ring-[#003375]"
                                    value={formData.format} 
                                    onChange={e => setFormData({...formData, format: e.target.value})}
                                >
                                    <option value="Offline">Offline</option>
                                    <option value="Online">Online</option>
                                    <option value="Hỗn hợp">Hỗn hợp</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Đơn vị tổ chức (BTC)</label>
                                <div className="relative">
                                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                    <input 
                                        type="text" 
                                        className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#003375]"
                                        placeholder="VD: Đoàn trường, CLB..."
                                        value={formData.organizer} 
                                        onChange={e => setFormData({...formData, organizer: e.target.value})} 
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Link tham gia <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                    <input 
                                        type="text" 
                                        required
                                        className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#003375]"
                                        placeholder="https://..."
                                        value={formData.link} 
                                        onChange={e => setFormData({...formData, link: e.target.value})} 
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Mô tả sự kiện</label>
                            <textarea 
                                rows={4}
                                className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375] resize-none"
                                placeholder="Thông tin chi tiết, đối tượng, quyền lợi... (Sẽ được ẩn gọn gàng, hiển thị khi user bấm xem thêm)"
                                value={formData.description}
                                onChange={e => setFormData({...formData, description: e.target.value})}
                            ></textarea>
                        </div>

                        <button 
                            type="submit" 
                            disabled={submitting} 
                            className="w-full py-3 bg-[#003375] hover:bg-[#002855] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md"
                        >
                            {submitting ? <Loader2 className="animate-spin"/> : <Send size={18}/>} 
                            {submitting ? 'Đang gửi...' : 'Gửi đóng góp'}
                        </button>
                    </form>
                </div>
            </div>
        </div>, document.body
    );
};

const ManageEventModal = ({ isOpen, onClose, onShowToast, editingEvent, fetchEvents }: { isOpen: boolean; onClose: () => void; onShowToast: (msg: string, type: 'success' | 'error') => void; editingEvent: HubEvent | null; fetchEvents: () => void }) => {
    const [formData, setFormData] = useState({
        title: editingEvent?.name || '',
        deadline: editingEvent?.deadlineDate ? editingEvent.deadlineDate.toISOString().split('T')[0] : '',
        deadline_time: editingEvent?.deadline_time || '',
        close_on_full: editingEvent?.close_on_full || false,
        event_date: editingEvent?.event_date || '', 
        event_time: formatTimeString(editingEvent?.event_time ?? null) || '', 
        category: editingEvent?.type || 'Hoạt động phong trào',
        classification: editingEvent?.classification || '',
        criteria: editingEvent?.category || 'III',
        points: editingEvent?.score || '5',
        organizer: editingEvent?.organizer || '',
        link: editingEvent?.link || '',
        location_type: editingEvent?.scope || 'Trong trường',
        format: editingEvent?.location || 'Offline',
        status: editingEvent?.status || 'Sắp diễn ra',
        is_manually_closed: editingEvent?.is_manually_closed || false,
        description: editingEvent?.description || ''
    });
    const [submitting, setSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
                category: formData.category,
                classification: formData.classification,
                criteria: formData.criteria,
                points: formData.points,
                organizer: formData.organizer,
                link: formData.link,
                location_type: formData.location_type,
                format: formData.format,
                status: formData.status,
                is_manually_closed: formData.is_manually_closed,
                description: formData.description
            };

            if (editingEvent) {
                const { data, error } = await supabase!
                    .from('events')
                    .update(payload)
                    .eq('id', editingEvent.id)
                    .select();

                if (error) throw error;
                if (!data || data.length === 0) {
                    throw new Error("Bảo mật RLS đang chặn bạn sửa! Vui lòng chạy lệnh SQL để cấp quyền Admin.");
                }
                onShowToast("Cập nhật thành công!", "success");
            } else {
                const { data, error } = await supabase!.from('events').insert([payload]).select();
                if (error) throw error;
                if (!data || data.length === 0) {
                    throw new Error("Bảo mật RLS đang chặn bạn thêm! Vui lòng chạy lệnh SQL để cấp quyền Admin.");
                }
                onShowToast("Thêm sự kiện thành công!", "success");
            }
            fetchEvents();
            onClose();
        } catch (err: any) {
            onShowToast("Lỗi: " + err.message, "error");
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-scaleIn flex flex-col">
                <div className="bg-[#003375] p-4 flex justify-between items-center text-white sticky top-0 z-10 shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        {editingEvent ? <Edit2 size={20}/> : <PlusCircle size={20}/>}
                        {editingEvent ? 'Chỉnh sửa Sự kiện' : 'Thêm Sự kiện Mới'}
                    </h3>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Tên sự kiện <span className="text-red-500">*</span></label>
                        <input type="text" required className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-2">
                            <div>
                                <label className={`block text-sm font-bold mb-1 ${formData.close_on_full ? 'text-gray-400' : 'text-gray-700'}`}>Ngày hết hạn ĐK</label>
                                <input 
                                    type="date" 
                                    disabled={formData.close_on_full}
                                    className={`w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375] transition-all ${formData.close_on_full ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300'}`}
                                    value={formData.deadline} 
                                    onChange={e => setFormData({...formData, deadline: e.target.value})} 
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-bold mb-1 ${formData.close_on_full ? 'text-gray-400' : 'text-gray-700'}`}>Giờ hết hạn</label>
                                <input 
                                    type="time" 
                                    disabled={formData.close_on_full}
                                    className={`w-full border rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375] transition-all ${formData.close_on_full ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : 'border-gray-300'}`}
                                    value={formData.deadline_time || ''} 
                                    onChange={e => setFormData({...formData, deadline_time: e.target.value})} 
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Ngày diễn ra</label>
                            <input type="date" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375]" value={formData.event_date} onChange={e => setFormData({...formData, event_date: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Giờ diễn ra</label>
                            <input type="time" className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375]" value={formData.event_time} onChange={e => setFormData({...formData, event_time: e.target.value})} />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200 gap-2">
                        <div>
                            <span className="font-bold text-gray-700 block">Đóng khi đủ số lượng</span>
                            <span className="text-xs text-gray-500">Form ĐK sẽ tự khóa trước thời hạn (Do BTC chủ động đóng).</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input type="checkbox" className="sr-only peer" checked={formData.close_on_full} onChange={e => setFormData({...formData, close_on_full: e.target.checked})} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#003375]"></div>
                        </label>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Mục</label>
                            <select className="w-full border border-gray-300 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-[#003375]" value={formData.criteria} onChange={e => setFormData({...formData, criteria: e.target.value})}>
                                <option value="I">I</option><option value="II">II</option><option value="III">III</option><option value="IV">IV</option><option value="V">V</option><option value="Chưa biết">Chưa biết</option>
                            </select>
                        </div>
                        <div className="col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Điểm</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" value={formData.points} onChange={e => setFormData({...formData, points: e.target.value})} />
                        </div>
                        <div className="col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Khu vực</label>
                            <select className="w-full border border-gray-300 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-[#003375]" value={formData.location_type} onChange={e => setFormData({...formData, location_type: e.target.value})}>
                                <option value="Trong trường">Trong trường</option>
                                <option value="Ngoài trường">Ngoài trường</option>
                            </select>
                        </div>
                        <div className="col-span-1">
                             <label className="block text-sm font-bold text-gray-700 mb-1">Hình thức</label>
                             <select className="w-full border border-gray-300 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-[#003375]" value={formData.format} onChange={e => setFormData({...formData, format: e.target.value})}>
                                <option value="Offline">Offline</option><option value="Online">Online</option><option value="Hỗn hợp">Hỗn hợp</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Loại hình</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" placeholder="VD: Hội thảo..." value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Phân loại (Text)</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" placeholder="VD: Minigame, Workshop..." value={formData.classification} onChange={e => setFormData({...formData, classification: e.target.value})} />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">BTC</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" value={formData.organizer} onChange={e => setFormData({...formData, organizer: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Link</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" value={formData.link} onChange={e => setFormData({...formData, link: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Trạng thái</label>
                        <select className="w-full border border-gray-300 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-[#003375]" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                            <option value="pending">Chờ duyệt (Pending)</option>
                            <option value="Sắp diễn ra">Sắp diễn ra</option>
                            <option value="Đang diễn ra">Đang diễn ra</option>
                            <option value="Đã kết thúc">Đã kết thúc</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Mô tả sự kiện</label>
                        <textarea 
                            rows={4}
                            className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375] resize-none"
                            placeholder="Thông tin chi tiết, đối tượng, quyền lợi... (Sẽ được ẩn gọn gàng, hiển thị khi user bấm xem thêm)"
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                        ></textarea>
                    </div>

                    <button type="submit" disabled={submitting} className="w-full py-3 bg-[#003375] hover:bg-[#002855] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md">
                        {submitting ? <Loader2 className="animate-spin"/> : <Save size={18}/>} Lưu thay đổi
                    </button>
                </form>
            </div>
        </div>, document.body
    );
};

const DiscussionModal = ({ event, onClose }: { event: {id: string, name: string} | null; onClose: () => void }) => {
    if (!event) return null;
    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 animate-fadeIn backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl max-w-2xl w-full h-[80vh] flex flex-col animate-scaleIn relative overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="font-bold text-[#003375] line-clamp-1">{event.name}</h3>
                        <p className="text-xs text-gray-500">Thảo luận & Hỏi đáp</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-hidden relative">
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
                event_id: parseInt(event.id) || null, 
                user_id: session?.user?.id || null, 
                event_name: event.name,
                organizer: event.organizer,
                issue_description: issue,
                status: 'pending' 
            };

            const { error } = await supabase!.from('event_reports').insert([payload]);
            if (error) throw error;

            onShowToast("Đã gửi báo cáo thành công. Đội ngũ sẽ khắc phục sớm nhất!", "success");
            setIssue('');
            onClose();
        } catch (err: any) {
            console.error(err);
            onShowToast("Lỗi: " + err.message, "error");
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-lg p-0 overflow-hidden animate-scaleIn shadow-2xl relative flex flex-col" onClick={e => e.stopPropagation()}>
                
                <div className="bg-red-600 p-4 flex justify-between items-center text-white shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <AlertTriangle size={20}/> Báo cáo sai sót thông tin
                    </h3>
                    <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={20}/></button>
                </div>

                <div className="p-6">
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-5 text-sm text-orange-800 leading-relaxed">
                        Cảm ơn bạn đã giúp cộng đồng! Vui lòng chỉ ra thông tin bị sai của sự kiện này để chúng mình điều chỉnh ngay nhé.
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Tên sự kiện bị lỗi</label>
                            <div className="w-full bg-gray-100 border border-gray-200 rounded-lg p-3 text-sm font-medium text-gray-700 cursor-not-allowed line-clamp-2">
                                {event.name}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Ban tổ chức</label>
                            <div className="w-full bg-gray-100 border border-gray-200 rounded-lg p-3 text-sm font-medium text-gray-700 cursor-not-allowed flex items-center gap-2">
                                <Users size={16} className="text-gray-400"/> {event.organizer}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-800 mb-1">Chi tiết sai sót <span className="text-red-500">*</span></label>
                            <textarea 
                                rows={4}
                                required
                                autoFocus
                                className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-red-500 resize-none text-sm transition-all"
                                placeholder="VD: Sai tên chương trình, sai số điểm ĐRL, hạn chót đã thay đổi thành ngày..."
                                value={issue}
                                onChange={e => setIssue(e.target.value)}
                            ></textarea>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button 
                                type="button" 
                                onClick={onClose} 
                                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all"
                            >
                                Hủy bỏ
                            </button>
                            <button 
                                type="submit" 
                                disabled={submitting} 
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md"
                            >
                                {submitting ? <Loader2 className="animate-spin" size={18}/> : <Send size={18}/>} 
                                {submitting ? 'Đang gửi...' : 'Gửi báo cáo'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>, document.body
    );
};

export const EventsBoard: React.FC<{ viewUserId?: string }> = ({ viewUserId }) => {
  useEffect(() => {
    document.title = "Sự kiện ĐRL | HUB Planner";
  }, []);

  const { isAdmin, isAuditor, isCTV, session, loading: roleLoading } = useUserRole();
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
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const [showCTVModal, setShowCTVModal] = useState(false);

  const tabsList = useMemo(() => [
      {id:'all',l:'Tất cả'},
      {id:'participated', l:`Đã tham gia (${participatedEvents.length})`}, 
      {id:'I',l:'Mục I'},{id:'II',l:'Mục II'},{id:'III',l:'Mục III'},{id:'IV',l:'Mục IV'},{id:'V',l:'Mục V'}
  ], [participatedEvents.length]);

  useEffect(() => {
      const updateIndicator = () => {
          const activeIndex = tabsList.findIndex(t => t.id === activeTab);
          const activeElement = tabsRef.current[activeIndex];
          if (activeElement) {
              setIndicatorStyle({
                  left: activeElement.offsetLeft,
                  width: activeElement.offsetWidth,
              });
          }
      };

      updateIndicator();
      window.addEventListener('resize', updateIndicator);
      return () => window.removeEventListener('resize', updateIndicator);
  }, [activeTab, tabsList]);

  useEffect(() => {
      const closeDropdown = () => setActiveDropdown(null);
      document.addEventListener('click', closeDropdown);
      return () => document.removeEventListener('click', closeDropdown);
  }, []);

  useEffect(() => {
      const loadParticipation = async () => {
          if (session?.user?.id && supabase) {
              const targetId = viewUserId || session.user.id;

              const { data, error } = await supabase
                  .from('user_participations')
                  .select('event_id')
                  .eq('user_id', targetId); 
              
              if (!error && data) {
                  const dbEvents = data.map(item => item.event_id.toString());
                  setParticipatedEvents(dbEvents);
                  localStorage.setItem('hub_participated_events', JSON.stringify(dbEvents));
              } else {
                  console.error("Lỗi tải data tham gia:", error);
              }
          } 
          else {
              const saved = localStorage.getItem('hub_participated_events');
              if (saved) {
                  try {
                      setParticipatedEvents(JSON.parse(saved));
                  } catch (e) {
                      console.error("Lỗi đọc dữ liệu đã tham gia", e);
                  }
              }
          }
      };

      if (session !== undefined) {
          loadParticipation();
      }
  }, [session, viewUserId]);

  const toggleParticipation = async (eventId: string) => {
      playClick();
      const isCurrentlyParticipated = participatedEvents.includes(eventId);
      
      setParticipatedEvents(prev => {
          const newEvents = isCurrentlyParticipated 
              ? prev.filter(id => id !== eventId) 
              : [...prev, eventId];
          localStorage.setItem('hub_participated_events', JSON.stringify(newEvents));
          return newEvents;
      });

      if (session?.user?.id && supabase) {
          if (isCurrentlyParticipated) {
              const { error } = await supabase
                  .from('user_participations')
                  .delete()
                  .match({ user_id: session.user.id, event_id: parseInt(eventId) });
              
              if (error) console.error("Lỗi xóa tham gia:", error);
          } else {
              const { error } = await supabase
                  .from('user_participations')
                  .insert({ user_id: session.user.id, event_id: parseInt(eventId) });
              
              if (error) console.error("Lỗi thêm tham gia:", error);
          }
      }
  };
  
  const [showScoreGuide, setShowScoreGuide] = useState(false);
  const [showContributeModal, setShowContributeModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HubEvent | null>(null);
  const [discussEvent, setDiscussEvent] = useState<{id: string, name: string} | null>(null);
  const [reportingEvent, setReportingEvent] = useState<HubEvent | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 4000);
  };

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/events?t=${new Date().getTime()}`, {
          headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
          }
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Lỗi khi tải dữ liệu sự kiện');
      }

      let fetchedData = json.data || [];

      if (!canManage) {
        fetchedData = fetchedData.filter((evt: any) => evt.status !== 'pending');
      }

      if (fetchedData) {
          const parsedEvents: HubEvent[] = fetchedData.map((row: any) => {
              let deadlineDate = null;
              if (row.deadline) {
                  deadlineDate = new Date(row.deadline);
                  deadlineDate.setHours(23, 59, 59, 999);
              }

              return {
                  id: row.id.toString(),
                  name: row.title || 'Sự kiện chưa có tên',
                  category: row.criteria || 'Khác', 
                  score: row.points?.toString() || '0',
                  location: row.format || 'Online',
                  time: formatDateString(row.deadline),
                  deadlineDate: deadlineDate,
                  deadline_time: row.deadline_time || null, 
                  close_on_full: row.close_on_full || false,
                  description: row.description || null,
                  link: row.link || '',
                  organizer: row.organizer || 'HUB',
                  type: row.category || '', 
                  classification: row.classification || '', 
                  scope: row.location_type || 'Trong trường',
                  status: row.status || 'Sắp diễn ra',
                  is_manually_closed: row.is_manually_closed || false,
                  is_deleted: row.is_deleted || false,
                  created_at: row.created_at || new Date().toISOString(),
                  event_date: row.event_date || null,
                  event_time: row.event_time || null 
              };
          });

          setEvents(parsedEvents);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      
      const mockEvents: HubEvent[] = [
          {
              id: 'mock-1',
              name: 'CUỘC THI THỬ THÁCH PHÂN TÍCH ĐẦU TƯ LẦN THỨ XIII - IRC 2026',
              organizer: 'International Banking Club - IBC',
              category: 'I',
              score: '5',
              location: 'Hội trường Lớn',
              time: '31/03/2026',
              deadlineDate: new Date(new Date().getTime() + 86400000 * 10), 
              deadline_time: '23:59',
              close_on_full: false,
              description: 'Cuộc thi học thuật lớn nhất trong năm về lĩnh vực tài chính, đầu tư. Sinh viên tham gia sẽ nhận được nhiều quyền lợi và giải thưởng hấp dẫn.',
              link: 'https://forms.gle/...',
              type: 'Cuộc thi',
              classification: 'Học thuật',
              scope: 'Trong trường',
              status: 'Đang diễn ra',
              is_manually_closed: false,
              is_deleted: false,
              created_at: new Date().toISOString(),
              event_date: '2026-04-05',
              event_time: '08:00'
          }
      ];
      
      setEvents(mockEvents);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [canManage]);

  const handleDeleteEvent = async (id: string) => {
      if (!isAdmin) return;
      playClick();
      if (!window.confirm("Bạn có chắc chắn muốn xóa sự kiện này? Nó sẽ ẩn khỏi bảng tin chung nhưng vẫn hiện với người đã tham gia.")) return;

      try {
          const { error } = await supabase!
            .from('events')
            .update({ is_deleted: true })
            .eq('id', id);

          if (error) throw error;
          showToast("Đã xóa sự kiện thành công (Soft Delete)", "success");
          setEvents(prev => prev.map(e => e.id === id ? { ...e, is_deleted: true } : e));
      } catch (err: any) {
          showToast("Lỗi khi xóa: " + err.message, "error");
      }
  };

  const handleToggleClose = async (event: HubEvent) => {
      if (!canManage) return;
      playClick();
      const newState = !event.is_manually_closed;
      
      try {
          const { error } = await supabase!
            .from('events')
            .update({ is_manually_closed: newState })
            .eq('id', event.id);
          
          if (error) throw error;
          
          setEvents(prev => prev.map(e => e.id === event.id ? { ...e, is_manually_closed: newState } : e));
          showToast(newState ? "Đã đóng đơn đăng ký" : "Đã mở lại đơn đăng ký", "success");
      } catch (err: any) {
          showToast("Lỗi cập nhật: " + err.message, "error");
      }
  };

  const handleOpenEdit = (evt: HubEvent) => {
      playClick();
      setEditingEvent(evt);
      setShowManageModal(true);
  };

  const handleOpenAdd = () => {
      playClick();
      setEditingEvent(null);
      setShowManageModal(true);
  };

  const filteredEvents = events.filter(evt => {
    const matchesSearch = evt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.organizer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.classification.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesTab = true;
    let isVisible = true;

    if (activeTab === 'participated') {
        matchesTab = participatedEvents.includes(evt.id);
    } else {
        if (evt.is_deleted) isVisible = false;
        if (activeTab !== 'all') {
            matchesTab = evt.category === activeTab;
        }
    }

    const matchesScope = activeScope === 'all' || 
                         (activeScope === 'internal' && evt.scope === 'Trong trường') ||
                         (activeScope === 'external' && evt.scope === 'Ngoài trường');
    return matchesSearch && matchesTab && matchesScope && isVisible;
  }).sort((a, b) => {
      if (sortOrder === 'expiring_soon') {
          const now = today.getTime();
          const getScore = (evt: HubEvent) => {
              if (evt.is_manually_closed || evt.status === 'Đã kết thúc' || evt.is_deleted) return Infinity;
              
              if (evt.deadlineDate) {
                  const diff = evt.deadlineDate.getTime() - now;
                  if (diff < 0) return Infinity; 
                  return diff;
              } else if (evt.close_on_full && evt.event_date) {
                  const evtDate = new Date(evt.event_date);
                  evtDate.setHours(23, 59, 59, 999);
                  const diff = evtDate.getTime() - now;
                  if (diff < 0) return Infinity;
                  return diff;
              }
              return Infinity - 1;
          };
          return getScore(a) - getScore(b);
      }

      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      
      if (sortOrder === 'newest') {
          return dateB - dateA; 
      } else {
          return dateA - dateB; 
      }
  });

  const isSameDay = (d1: Date | null, d2: Date) => {
      if (!d1) return false;
      return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  };

  const openingEvents = filteredEvents.filter(evt => {
      const isNotExpired = !checkIsOverdue(evt, today);
      const isOpenStatus = !evt.is_manually_closed && evt.status !== 'Đã kết thúc';
      return isNotExpired && isOpenStatus;
  });

  const expiredEvents = filteredEvents.filter(evt => {
      const isExpiredTime = checkIsOverdue(evt, today);
      const isClosedStatus = evt.is_manually_closed || evt.status === 'Đã kết thúc';
      return isExpiredTime || isClosedStatus;
  });

  const participatedStats = useMemo(() => {
      if (activeTab !== 'participated') return null;
      const stats: Record<string, number> = { 'I': 0, 'II': 0, 'III': 0, 'IV': 0, 'V': 0 };
      events.forEach(evt => {
          if (participatedEvents.includes(evt.id)) { 
              const cat = evt.category;
              if (stats[cat] !== undefined) {
                  stats[cat]++;
              }
          }
      });
      return stats;
  }, [events, participatedEvents, activeTab]);

  const NotificationToast = () => {
    if (!notification) return null;
    return createPortal(
        <div className={`fixed top-4 right-4 z-[100000] max-w-sm w-full bg-white rounded-xl shadow-2xl border-l-4 p-4 flex items-center gap-3 animate-slideInRight ${notification.type === 'success' ? 'border-green-500' : 'border-red-500'}`}>
            <div className={`p-2 rounded-full ${notification.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {notification.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
            </div>
            <div className="flex-1">
                <h4 className={`font-bold ${notification.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{notification.type === 'success' ? 'Thành công' : 'Lỗi'}</h4>
                <p className="text-sm text-gray-600">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>, document.body
    );
  };

  // =======================================================================
  // ✨ RENDER DẠNG CARD LƯỚI CHO NGƯỜI DÙNG BÌNH THƯỜNG
  // =======================================================================
  const renderEventCard = (evt: HubEvent) => {
    const isPending = evt.status === 'pending';
    const isStatusClosed = evt.status === 'Đã kết thúc';
    const isActive = evt.status === 'Đang diễn ra';
    
    const isOverdue = checkIsOverdue(evt, today);
    const isDeadlineToday = !isStatusClosed && !isPending && isSameDay(evt.deadlineDate, today);
    const isManualClose = evt.is_manually_closed;
    const isLinkClosed = isStatusClosed || isOverdue || isManualClose; 

    const formattedLink = evt.link && !evt.link.startsWith('http') ? `https://${evt.link}` : evt.link;
    const isParticipated = participatedEvents.includes(evt.id);

    let badgeUI = null;
    if (isPending) badgeUI = <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold"><Circle size={6} fill="currentColor" /> Chờ duyệt</span>;
    else if (evt.is_deleted) badgeUI = <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-bold">Đã ẩn</span>;
    else if (isLinkClosed) badgeUI = <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold"><Lock size={10} /> Đã đóng</span>;
    else if (isDeadlineToday) badgeUI = <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold"><Siren size={10} className="animate-pulse" /> Hạn chót</span>;
    else if (isActive) badgeUI = <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold"><Circle size={6} fill="currentColor" /> Đang diễn ra</span>;
    else badgeUI = <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md flex items-center gap-1 font-bold">Sắp diễn ra</span>;

    return (
      <div key={evt.id} className={`bg-white rounded-xl border border-gray-200 p-3.5 sm:p-5 flex flex-col h-full transition-all duration-300 hover:shadow-lg hover:-translate-y-1 relative group ${evt.is_deleted ? 'opacity-60 grayscale' : ''}`}>
        
        {/* HEADER: Organizer & Status */}
        <div className="flex justify-between items-start gap-2 mb-2 sm:mb-3">
            <span className="text-[11px] sm:text-xs text-gray-500 font-medium flex items-center gap-1.5 line-clamp-1">
                <Building2 size={12} className="sm:w-[14px] sm:h-[14px] shrink-0"/> <span className="truncate">{evt.organizer}</span>
            </span>
            <div className="shrink-0 text-[10px]">
                {badgeUI}
            </div>
        </div>

        {/* TITLE */}
        <h3 className={`font-bold text-gray-900 text-sm sm:text-base leading-snug mb-2 sm:mb-3 line-clamp-2 transition-colors ${!isLinkClosed && !evt.is_deleted ? 'group-hover:text-[#003375]' : ''}`} title={evt.name}>
            {evt.name}
        </h3>

        {/* TAGS */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5 sm:mb-4">
            {evt.classification && (
                <span className="bg-purple-50 text-purple-600 border border-purple-100 text-[9px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md flex items-center gap-1">
                    <Tag size={10}/> {evt.classification}
                </span>
            )}
            <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md border flex items-center gap-1 ${isLinkClosed || evt.is_deleted ? 'bg-gray-50 text-gray-500 border-gray-200' : 'bg-red-50 text-[#990000] border-red-100'}`}>
                <Award size={10}/> {evt.score.includes('+') ? evt.score : `+${evt.score}`}
            </span>
            <span className="bg-gray-50 text-gray-600 border border-gray-200 text-[9px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md">
                Mục {evt.category}
            </span>
            {evt.scope && evt.scope !== 'Khác' && (
                <span className="bg-gray-50 text-gray-600 border border-gray-200 text-[9px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md flex items-center gap-1">
                    <MapPin size={10}/> {evt.scope}
                </span>
            )}
        </div>

        {/* DATETIME */}
        <div className="flex flex-col gap-1 sm:gap-2 text-[11px] sm:text-xs text-gray-600 mb-2.5 sm:mb-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
                <Calendar size={12} className="sm:w-[14px] sm:h-[14px] text-gray-400 shrink-0"/>
                <span className="truncate">Diễn ra: {evt.event_date ? `${formatTimeString(evt.event_time)} ${formatDateString(evt.event_date)}` : 'Chưa cập nhật'}</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
                <Clock size={12} className={`sm:w-[14px] sm:h-[14px] shrink-0 ${isLinkClosed || evt.is_deleted ? 'text-gray-400' : isDeadlineToday ? 'text-red-500' : 'text-gray-400'}`} />
                <span className={`truncate ${isDeadlineToday && !isLinkClosed && !evt.is_deleted ? 'text-red-600 font-bold' : ''}`}>
                    Hạn chót: {evt.close_on_full ? (
                        <span className="font-bold text-[#990000]">Đóng khi đủ SL</span>
                    ) : (
                        evt.time && evt.time !== 'Chưa cập nhật' ? `${evt.deadline_time ? formatTimeString(evt.deadline_time) + ' ' : ''}${evt.time}` : 'Chưa cập nhật'
                    )}
                </span>
            </div>
        </div>

        {/* DESCRIPTION TOGGLE */}
        {evt.description && (
            <details className="text-[11px] sm:text-xs text-gray-600 group/details w-full mb-3 sm:mb-4">
                <summary className="font-semibold text-blue-600 cursor-pointer list-none flex items-center gap-1 hover:underline select-none">
                    <Info size={12}/> Xem chi tiết
                </summary>
                <div className="mt-2 p-2.5 sm:p-3 bg-gray-50 border border-gray-100 rounded-lg whitespace-pre-line max-h-32 overflow-y-auto custom-scrollbar">
                    {evt.description}
                </div>
            </details>
        )}

        {/* FOOTER ACTIONS (Pushed to bottom) */}
        <div className="mt-auto pt-3 sm:pt-4 border-t border-gray-100 flex items-center gap-1.5 sm:gap-2 w-full">
            
            {/* Nhóm 3 nút icon (Lưu, Chat, Báo lỗi) */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                <button 
                    onClick={(e) => { e.stopPropagation(); toggleParticipation(evt.id); }} 
                    className={`p-1.5 sm:p-2 rounded-lg transition-colors flex items-center justify-center ${isParticipated ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`} 
                    title={isParticipated ? "Đã tham gia (Bấm hủy)" : "Đánh dấu tham gia"}
                >
                    {isParticipated ? <BookmarkCheck size={16} className="sm:w-[18px] sm:h-[18px]"/> : <Bookmark size={16} className="sm:w-[18px] sm:h-[18px]"/>}
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); playClick(); setDiscussEvent({ id: evt.id, name: evt.name }); }} 
                    className="p-1.5 sm:p-2 bg-gray-50 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-[#003375] transition-colors flex items-center justify-center" 
                    title="Thảo luận"
                >
                    <MessageCircle size={16} className="sm:w-[18px] sm:h-[18px]"/>
                </button>
                <button 
                    onClick={(e) => { e.stopPropagation(); playClick(); setReportingEvent(evt); }} 
                    className="p-1.5 sm:p-2 bg-gray-50 rounded-lg text-gray-500 hover:text-orange-600 hover:bg-orange-50 transition-colors flex items-center justify-center"
                    title="Báo lỗi"
                >
                    <AlertTriangle size={16} className="sm:w-[18px] sm:h-[18px]"/>
                </button>
            </div>

            {/* Nút Đăng ký ngay (Nằm ngang hàng, kéo dài ra) */}
            {evt.link && !isLinkClosed && !evt.is_deleted ? (
                <a href={formattedLink} target="_blank" rel="noopener noreferrer" onClick={(e) => { playClick(); e.stopPropagation(); }} className={`flex-1 text-white text-[13px] sm:text-sm font-bold px-2 sm:px-4 py-2 sm:py-2.5 rounded-lg flex items-center justify-center transition-colors shadow-sm ${isDeadlineToday ? 'bg-red-600 hover:bg-red-700' : 'bg-[#003375] hover:bg-[#002855]'}`}>
                    Đăng ký ngay
                </a>
            ) : (
                <button disabled className="flex-1 py-2 sm:py-2.5 px-2 sm:px-4 rounded-lg font-semibold text-[11px] sm:text-xs cursor-not-allowed border bg-gray-50 text-gray-400 border-gray-200 flex items-center justify-center gap-1.5">
                    {evt.is_deleted ? "Đã bị ẩn" : (isLinkClosed ? <><Lock size={12} className="sm:w-[14px] sm:h-[14px]"/> Đã kết thúc</> : "Chưa có link")}
                </button>
            )}
        </div>
      </div>
    );
  };

    // ✨ NGĂN CHẶN RENDER (CHỐNG NHÁY) KHI CHƯA LOAD QUYỀN XONG
    if (roleLoading) {
        return (
            <div className="w-full min-h-[60vh] flex flex-col items-center justify-center">
                <Loader2 className="animate-spin text-[#0052cc] mb-3" size={32} />
                <span className="text-gray-400 text-sm font-medium">Đang tải sự kiện...</span>
            </div>
        );
    }

return (
    <div className="animate-slideInRight">
        {/* STICKY HEADER */}
        <div className="relative md:sticky top-0 z-40 bg-[#F8FAFC] pt-2 pb-2 sm:pb-4 -mt-2 mb-2 sm:mb-4 border-b border-transparent md:border-gray-200/60 md:shadow-[0_8px_10px_-10px_rgba(0,0,0,0.05)]">
            <div className="flex flex-col xl:flex-row gap-2 sm:gap-4 items-start xl:items-center justify-between w-full">
                {/* Tiêu đề & Thông báo */}
                <div className="w-full xl:w-auto">
                    <h2 className="text-[26px] font-extrabold text-[#003375] tracking-tight leading-none mb-1">
                        Sự kiện Điểm Rèn Luyện
                    </h2>
                    {canManage && (
                        <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block mt-1 mb-1 border border-blue-100">
                            <Settings size={10} className="inline mr-1"/>
                           {isAdmin ? 'Chế độ Admin: Quản lý danh sách' : (isAuditor ? 'Chế độ Auditor: Quản lý/Sửa/Đóng' : 'Chế độ CTV: Sửa/Đóng sự kiện')}
                        </div>
                    )}
                    {!canManage && (
    <p className="text-[11px] sm:text-xs text-gray-500 italic mt-1.5 max-w-xl leading-relaxed">
        *Lưu ý: Các thông tin sự kiện, phân loại mục và điểm cộng được tổng hợp từ cộng đồng nên chỉ mang tính tham khảo và có thể có sai sót. Bạn vui lòng đối chiếu lại với thông báo chính thức từ BTC nhé.
    </p>
)}
                </div>
                
                {/* Thanh Công Cụ (Filter & Actions) ĐÃ ĐƯỢC CHỐNG DÍNH CHÙM */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full xl:w-auto shrink-0 justify-start xl:justify-end">
                    
                    {/* Search Bar */}
                    <div className="relative w-full sm:w-auto flex-grow sm:flex-grow-0 min-w-[200px]">
                        <input 
                            type="text" 
                            placeholder="Tìm tên, BTC, loại hình..." 
                            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md text-xs outline-none focus:border-[#003375] focus:ring-1 focus:ring-[#003375] transition-all" 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                        />
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    </div>
                    
                    {/* Container hàng 2 trên Mobile (Dropdowns + Buttons) */}
                    <div className="flex flex-row items-center gap-2 w-full sm:w-auto">
                        {/* Dropdowns */}
                        <div className="flex items-center gap-2 flex-1 sm:flex-none">
                            <div className="relative flex-1 sm:flex-none">
                                <select 
                                    value={activeScope} 
                                    onChange={(e) => { playClick(); setActiveScope(e.target.value); }} 
                                    className="w-full appearance-none pl-7 pr-6 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white outline-none cursor-pointer hover:border-blue-300 transition-colors"
                                >
                                    <option value="all">Tất cả khu vực</option>
                                    <option value="internal">Trong trường</option>
                                    <option value="external">Ngoài trường</option>
                                </select>
                                <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                            </div>
                            
                            <div className="relative flex-1 sm:flex-none">
                                <select 
                                    value={sortOrder} 
                                    onChange={(e) => { playClick(); setSortOrder(e.target.value as 'newest' | 'oldest' | 'expiring_soon'); }} 
                                    className="w-full appearance-none pl-7 pr-6 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white outline-none cursor-pointer hover:border-blue-300 transition-colors"
                                >
                                    <option value="newest">Mới nhất</option>
                                    <option value="oldest">Cũ nhất</option>
                                    <option value="expiring_soon">Gần hết hạn</option>
                                </select>
                                <ArrowDownUp className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" size={12} />
                            </div>
                        </div>

                        {/* Nút chức năng (Thu gọn thành icon trên mobile) */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => { playClick(); fetchEvents(); }} className="p-1.5 sm:px-2 sm:py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-[#003375] transition-all active:scale-95 flex items-center justify-center" title="Làm mới">
                                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                            </button>
                            <button onClick={() => { playClick(); setShowScoreGuide(true); }} className="p-1.5 sm:px-2 sm:py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-gray-600 hover:text-[#003375] transition-all active:scale-95 flex items-center justify-center" title="Xem bảng điểm">
                                <FileText size={14} />
                            </button>
                            
                            {canManage ? (
                                <button onClick={handleOpenAdd} className="p-1.5 sm:px-3 sm:py-1.5 bg-[#003375] hover:bg-[#002855] text-white rounded-md shadow-sm flex items-center justify-center text-xs font-bold transition-all active:scale-95" title="Thêm mới">
                                    <PlusCircle size={14} />
                                    <span className="hidden sm:inline sm:ml-1.5">Thêm mới</span>
                                </button>
                            ) : (
                                <button onClick={() => { playClick(); setShowContributeModal(true); }} className="p-1.5 sm:px-3 sm:py-1.5 bg-[#003375] hover:bg-[#002855] text-white rounded-md shadow-sm flex items-center justify-center text-xs font-bold transition-all active:scale-95" title="Gửi đóng góp">
                                    <PlusCircle size={14} />
                                    <span className="hidden sm:inline sm:ml-1.5">Gửi đóng góp</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
        </div>
 </div>
       {/* ✨ ẨN BANNER CTV NẾU LÀ ADMIN / CTV ✨ */}
        {!canManage && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 mb-2 sm:mb-4 flex flex-row items-center justify-between gap-2 sm:gap-3 relative overflow-hidden group">
                <div className="flex items-center gap-2.5 sm:gap-3 relative z-10 flex-1 min-w-0">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-full flex items-center justify-center shadow-sm shrink-0 border border-blue-100">
                        <UserPlus className="text-blue-600 w-3 h-3 sm:w-4 sm:h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-[12px] sm:text-sm text-blue-900 truncate">Trở thành CTV Nhập liệu</h4>
                        {/* Dòng chữ phụ này sẽ bị ẩn trên Mobile, chỉ hiện trên màn to (sm:block) */}
                        <p className="hidden sm:block text-xs mt-0.5 text-blue-800 opacity-60 truncate">
                            Đóng góp xây dựng cộng đồng sinh viên HUB ngay hôm nay!
                        </p>
                    </div>
                </div>
                <button 
                    onClick={() => { playClick(); setShowCTVModal(true); }}
                    className="shrink-0 text-[10px] sm:text-xs font-bold bg-[#003375] text-white hover:bg-[#002855] shadow-sm transition-colors px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md whitespace-nowrap relative z-10 active:scale-95 flex items-center gap-1.5"
                >
                    <UserPlus size={12} className="sm:w-4 sm:h-4" /> 
                    <span>Đăng ký</span>
                </button>
                <div className="absolute right-0 top-0 opacity-[0.03] pointer-events-none transform translate-x-1/4 -translate-y-1/4 group-hover:scale-110 transition-transform duration-500">
                    <Users size={150} />
                </div>
            </div>
        )}

        {/* TABS LỌC CHUNG CHO CẢ ADMIN VÀ USER */}
        <div className="relative flex w-full justify-between overflow-x-auto no-scrollbar border-b border-gray-200 px-1 mb-6">
            {tabsList.map((tab, idx) => (
                <button 
                    key={tab.id} 
                    ref={(el) => { tabsRef.current[idx] = el; }}
                    onClick={() => { playClick(); setActiveTab(tab.id); }} 
                    className={`flex-1 text-center px-2 pb-3 text-sm font-semibold whitespace-nowrap transition-colors z-10 ${activeTab === tab.id ? 'text-[#003375]' : 'text-gray-500 hover:text-gray-800'}`}
                >
                    {tab.l}
                </button>
            ))}
            <div 
                className="absolute bottom-0 h-[2px] bg-[#003375] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] z-20 rounded-t-full"
                style={{ left: `${indicatorStyle.left}px`, width: `${indicatorStyle.width}px` }}
            />
        </div>

        {/* KHU VỰC HIỂN THỊ DỮ LIỆU */}
        {loading ? (
            <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
                <Loader2 size={40} className="text-[#003375] animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Đang tải danh sách sự kiện...</p>
            </div>
        ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center animate-fadeIn">
                <p className="font-bold mb-2">Đã xảy ra lỗi</p>
                <p>{error}</p>
            </div>
        ) : canManage ? (
            /* ✨ BẢNG QUẢN LÝ DÀNH CHO ADMIN VÀ CTV ✨ */
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden animate-fadeIn">
                <div className="overflow-x-auto custom-scrollbar max-h-[65vh]">
                    <table className="w-full text-sm text-left min-w-[900px]">
                        <thead className="bg-gray-50 border-b border-gray-200 text-[11px] text-gray-500 font-bold uppercase tracking-wider sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3">Tên sự kiện</th>
                                <th className="px-4 py-3">BTC & Loại hình</th>
                                <th className="px-4 py-3 text-center">ĐRL</th>
                                <th className="px-4 py-3">Thời gian</th>
                                <th className="px-4 py-3 text-center">Trạng thái</th>
                                <th className="px-4 py-3 text-right">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredEvents.length === 0 ? (
                                <tr><td colSpan={6} className="py-8 text-center text-gray-500 font-medium">Không có sự kiện nào phù hợp.</td></tr>
                            ) : (
                                filteredEvents.map(evt => {
                                    const isPending = evt.status === 'pending';
                                    const isStatusClosed = evt.status === 'Đã kết thúc';
                                    const isActive = evt.status === 'Đang diễn ra';
                                    const isOverdue = checkIsOverdue(evt, today);
                                    const isManualClose = evt.is_manually_closed;
                                    const isLinkClosed = isStatusClosed || isOverdue || isManualClose; 
                                    
                                    let badgeUI = null;
                                    if (isPending) badgeUI = <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap">Chờ duyệt</span>;
                                    else if (evt.is_deleted) badgeUI = <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap">Đã bị ẩn</span>;
                                    else if (isLinkClosed) badgeUI = <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-[10px] font-bold border border-gray-200 whitespace-nowrap">Đã đóng</span>;
                                    else if (isActive) badgeUI = <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap">Đang diễn ra</span>;
                                    else badgeUI = <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap">Sắp diễn ra</span>;

                                    return (
                                        <tr key={evt.id} className={`hover:bg-gray-50 transition-colors ${evt.is_deleted ? 'opacity-60 bg-gray-50/50' : ''}`}>
                                            <td className="px-4 py-3 w-[30%] align-top">
                                                <div className="font-bold text-[#003375] text-sm line-clamp-2 leading-snug">{evt.name}</div>
                                                <div className="text-[10px] text-gray-500 mt-1.5 flex flex-wrap items-center gap-1.5">
                                                    {evt.classification && <span className="bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100 font-medium">{evt.classification}</span>}
                                                    {evt.scope && <span className="font-medium">• {evt.scope}</span>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 align-top text-gray-700 w-[20%]">
                                                <div className="text-xs font-bold line-clamp-2 mb-1">{evt.organizer}</div>
                                                <div className="text-[10px] text-gray-500 flex items-center gap-1"><MapPin size={10}/> {evt.location || 'Offline'}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center align-top w-[10%]">
                                                <div className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 rounded px-2 py-0.5 inline-block mx-auto mb-1">
                                                    {evt.score.includes('+') ? evt.score : `+${evt.score}`}
                                                </div>
                                                <div className="text-[10px] text-gray-500 font-medium">Mục {evt.category}</div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-600 align-top w-[20%]">
                                                <div className="mb-1"><span className="text-gray-400 font-medium">Ngày TC:</span> {evt.event_date ? formatDateString(evt.event_date) : '-'}</div>
                                                <div><span className="text-gray-400 font-medium">Hạn ĐK:</span> {evt.close_on_full ? <span className="text-red-500 font-bold">Đóng khi SL</span> : (evt.deadlineDate ? formatDateString(evt.deadlineDate.toISOString()) : '-')}</div>
                                            </td>
                                            <td className="px-4 py-3 text-center align-top w-[10%]">
                                                {badgeUI}
                                            </td>
                                            <td className="px-4 py-3 text-right align-top w-[10%]">
                                                <div className="flex items-center justify-end gap-1 relative z-20">
                                                    <button onClick={() => handleOpenEdit(evt)} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-md transition-colors" title="Chỉnh sửa chi tiết"><Edit2 size={16}/></button>
                                                    <button onClick={() => handleToggleClose(evt)} className="p-1.5 text-orange-600 hover:bg-orange-100 rounded-md transition-colors" title={evt.is_manually_closed ? 'Mở lại đăng ký' : 'Tạm đóng đăng ký'}>
                                                        {evt.is_manually_closed ? <ToggleRight size={16} className="text-green-600"/> : <ToggleLeft size={16} className="text-orange-600"/>}
                                                    </button>
                                                    {isAdmin && <button onClick={() => handleDeleteEvent(evt.id)} className="p-1.5 text-red-600 hover:bg-red-100 rounded-md transition-colors" title="Ẩn/Xóa sự kiện"><Trash2 size={16}/></button>}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        ) : (
            /* ✨ DẠNG CARD LƯỚI CHO USER BÌNH THƯỜNG ✨ */
            <div className="space-y-8 animate-fadeIn">
                {activeTab === 'participated' && participatedStats && (
                    <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <span className="font-bold text-[#003375] flex items-center gap-2">
                            <BookmarkCheck size={18} /> Thống kê đã tham gia:
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {['I', 'II', 'III', 'IV', 'V'].map(cat => (
                                <div key={cat} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-blue-100 shadow-sm">
                                    <span className="text-xs text-gray-600 font-semibold">Mục {cat}:</span>
                                    <span className="text-sm font-bold text-[#003375]">{participatedStats[cat]}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {openingEvents.length > 0 && (
                    <div>
                        <h3 className="text-xl font-bold text-[#003375] mb-4 flex items-center gap-2">
                            <Flame className="text-orange-500 fill-orange-100" /> 
                            {activeTab === 'participated' ? 'Đang/Đã tham gia (Mở đăng ký)' : 'Đang mở đăng ký'} ({openingEvents.length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {openingEvents.map(evt => renderEventCard(evt))}
                        </div>
                    </div>
                )}

                {expiredEvents.length > 0 && (
                    <div>
                          <h3 className="text-xl font-bold text-gray-500 mb-4 mt-8 flex items-center gap-2">
                            <Lock className="text-gray-400" /> 
                            {activeTab === 'participated' ? 'Đã tham gia (Hết hạn)' : 'Đã hết hạn'} ({expiredEvents.length})
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 opacity-80">
                            {expiredEvents.map(evt => renderEventCard(evt))}
                        </div>
                    </div>
                )}

                {filteredEvents.length === 0 && (
                    <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300"><Calendar size={32} /></div>
                        <p className="text-gray-500 font-medium">
                            {activeTab === 'participated' ? 'Bạn chưa đánh dấu tham gia sự kiện nào.' : 'Không tìm thấy sự kiện phù hợp.'}
                        </p>
                    </div>
                )}
            </div>
        )}

      <NotificationToast />
      <DiscussionModal event={discussEvent} onClose={() => setDiscussEvent(null)} />
      {showContributeModal && <ContributeEventModal isOpen={showContributeModal} onClose={() => setShowContributeModal(false)} onShowToast={showToast} />}
      {showScoreGuide && <ScoreGuideModal isOpen={showScoreGuide} onClose={() => setShowScoreGuide(false)} />}
      {showManageModal && <ManageEventModal isOpen={showManageModal} onClose={() => setShowManageModal(false)} onShowToast={showToast} editingEvent={editingEvent} fetchEvents={fetchEvents} />}
      <CTVModalWrapper isOpen={showCTVModal} onClose={() => setShowCTVModal(false)} onShowToast={showToast} />
      
      <ReportEventModal 
          isOpen={!!reportingEvent} 
          onClose={() => setReportingEvent(null)} 
          event={reportingEvent} 
          onShowToast={showToast} 
      />
    </div>
  );
};