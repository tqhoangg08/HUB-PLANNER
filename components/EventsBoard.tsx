import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../utils/supabase';
import { Search, Calendar, MapPin, Award, Loader2, RefreshCw, Users, Clock, AlertCircle, FileText, X, PlusCircle, Sparkles, GraduationCap, BookOpen, Phone, Send, User, Link as LinkIcon, Type, CheckCircle2, Building2, MessageCircle, ChevronDown, Flame, Lock, Circle, Siren, Edit2, Trash2, Save, ToggleLeft, ToggleRight, Settings, Tag, RotateCcw } from 'lucide-react';
import { playClick } from '../utils/audio';
import { CommentSection } from './CommentSection';
import { useUserRole } from '../hooks/useUserRole';

// --- Types ---
interface HubEvent {
  id: string;
  name: string;      // DB: title
  category: string;  // DB: criteria
  score: string;     // DB: points
  location: string;  // DB: format
  time: string;      // DB: deadline string
  deadlineDate: Date | null;
  link: string;
  organizer: string;
  type: string;      // DB: category
  classification: string; // DB: classification (New)
  scope: string;     // DB: location_type
  status: string;
  is_manually_closed: boolean;
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

// --- Sub-Components (Modals) ---

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
                { text: '- Tham gia các cuộc thi học thuật/ hội thảo/ khởi nghiệp (lấy điểm cao nhất)', points: '' },
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
            title: 'Đánh giá về ý thức tham gia các hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao...',
            range: '0 → 20',
            color: 'yellow',
            content: [
                { type: 'header', text: 'Điểm cộng' },
                { text: '- Tham gia hoạt động chính trị, văn hóa, văn nghệ, thể thao', points: '' },
                { text: '+ Là thành viên Ban tổ chức', points: '+ 10đ/hoạt động' },
                { text: '+ Là thành viên tham gia trực tiếp:', points: '' },
                { text: '  • Cấp lớp, khoa, trường, địa phương', points: '+ 5đ/hoạt động' },
                { text: '  • Cấp tỉnh (thành) trở lên', points: '+ 10đ/hoạt động' },
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
                { text: '- Tham gia công tác xã hội, nhân đạo, từ thiện, tình nguyện; phòng chống tệ nạn xã hội...', points: '' },
                { text: '+ Mùa hè xanh', points: '+ 15' },
                { text: '+ Xuân tình nguyện (hoặc tiếp sức mùa thi, hiến máu nhân đạo)', points: '+ 10đ/hoạt động' },
                { text: '+ Thành viên của một hoặc nhiều CLB khác (ngoài CLB học thuật ở mục I và CLB VH-NT-TT ở mục III)', points: '+ 5' },
                { text: '+ Cộng tác viên của Đoàn TN, Hội SV và các đơn vị trong Trường', points: '+ 4' },
                { text: '+ Tham gia các hoạt động khác', points: '+ 4đ/hoạt động' },
                { type: 'header', text: 'Điểm trừ', isNegative: true },
                { text: 'Vi phạm nội quy nơi cư trú hoặc vi phạm khi tham gia hoạt động (bị lập biên bản)', points: '- 5đ/vi phạm' },
            ]
        },
        {
            id: 'V',
            title: 'Đánh giá về ý thức và kết quả khi tham gia công tác cán bộ lớp, đoàn thể... hoặc thành tích đặc biệt',
            range: '0 → 10',
            color: 'purple',
            content: [
                { text: '- Tham gia Ban cán sự lớp, BCH Đoàn TN, Hội SV, Ban chủ nhiệm các CLB, Đội, Nhóm và hoàn thành nhiệm vụ', points: '+ 5' },
                { text: '- Đạt thành tích đặc biệt xuất sắc trong công tác Đoàn và phong trào sinh viên (có giấy khen cấp tỉnh/thành trở lên)', points: '+ 10' },
                { text: '- Đạt giải NCKH, cuộc thi Olympic hoặc các cuộc thi tương đương khác (lấy cao nhất)', points: '' },
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
                {/* Header */}
                <div className="p-4 border-b flex justify-between items-center bg-[#003375] text-white shrink-0">
                    <h3 className="text-xl font-bold flex items-center gap-2"><FileText /> Phụ lục Đánh giá Kết quả Rèn luyện</h3>
                    <button onClick={onClose} className="text-white/80 hover:text-white hover:bg-white/20 p-2 rounded-full transition-colors"><X size={24} /></button>
                </div>
                
                {/* Content */}
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
                                            {section.content.map((row, idx) => {
                                                if (row.type === 'header') {
                                                    return (
                                                        <tr key={idx} className={`${row.isNegative ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'} font-bold`}>
                                                            <td colSpan={2} className="px-5 py-3 uppercase text-xs tracking-wider border-b border-gray-100">{row.text}</td>
                                                        </tr>
                                                    )
                                                }
                                                return (
                                                    <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                                                        <td className="px-5 py-3 text-gray-800 leading-relaxed">{row.text}</td>
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
                    
                    <div className="mt-8 flex justify-end sticky bottom-0 pointer-events-none">
                        <div className="bg-[#003375] text-white px-5 py-3 rounded-xl font-bold text-xl shadow-2xl flex items-center gap-3 pointer-events-auto border-2 border-white/20 transform hover:scale-105 transition-transform">
                            <span>TỔNG ĐIỂM TỐI ĐA</span>
                            <span className="bg-white text-[#003375] px-3 py-1 rounded-lg shadow-inner">100</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>, document.body
    );
};

const RecruitFormModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    if (!isOpen) return null;
    return createPortal(
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4 animate-fadeIn backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl max-w-md w-full p-6 animate-scaleIn relative text-center" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X size={20} /></button>
                <div className="w-16 h-16 bg-blue-100 text-[#003375] rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users size={32} />
                </div>
                <h3 className="text-xl font-bold text-[#003375] mb-2">Trở thành CTV Nhập liệu</h3>
                <p className="text-gray-600 mb-6 text-sm">
                    Bạn muốn đóng góp cho cộng đồng sinh viên HUB? Hãy tham gia đội ngũ cập nhật tin tức sự kiện cùng chúng mình nhé!
                </p>
                <a href="#" onClick={(e) => { e.preventDefault(); alert("Đang mở form đăng ký..."); }} className="block w-full py-3 bg-[#003375] text-white rounded-xl font-bold hover:bg-[#002855] transition-colors mb-3">
                    Đăng ký ngay
                </a>
                <button onClick={onClose} className="block w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors">
                    Để sau
                </button>
            </div>
        </div>, document.body
    );
};

const DRAFT_KEY = 'event_form_draft';

const ContributeEventModal = ({ isOpen, onClose, onShowToast }: { isOpen: boolean; onClose: () => void; onShowToast: (msg: string, type: 'success' | 'error') => void }) => {
    const [formData, setFormData] = useState({
        title: '',
        deadline: '',
        category: 'Hoạt động phong trào',
        criteria: 'III',
        points: '5',
        organizer: '',
        link: '',
        format: 'Offline',
        location_type: 'Trong trường', // Default
        description: '' // Ghi chú thêm
    });
    const [submitting, setSubmitting] = useState(false);
    const [isDraftLoaded, setIsDraftLoaded] = useState(false);

    // --- Auto-Restore Draft ---
    useEffect(() => {
        if (isOpen) {
            const savedDraft = localStorage.getItem(DRAFT_KEY);
            if (savedDraft) {
                try {
                    const parsed = JSON.parse(savedDraft);
                    setFormData(parsed);
                    setIsDraftLoaded(true);
                    // Ẩn thông báo "Đã khôi phục" sau 3s
                    setTimeout(() => setIsDraftLoaded(false), 3000);
                } catch (e) {
                    console.error("Failed to restore draft", e);
                }
            }
        }
    }, [isOpen]);

    // --- Auto-Save Draft ---
    useEffect(() => {
        if (isOpen) {
            const timeoutId = setTimeout(() => {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
            }, 500); // Debounce 500ms
            return () => clearTimeout(timeoutId);
        }
    }, [formData, isOpen]);

    const handleClearDraft = () => {
        if (window.confirm("Bạn có chắc muốn xóa toàn bộ nội dung nháp và nhập lại từ đầu?")) {
            playClick();
            const resetData = {
                title: '',
                deadline: '',
                category: 'Hoạt động phong trào',
                criteria: 'III',
                points: '5',
                organizer: '',
                link: '',
                format: 'Offline',
                location_type: 'Trong trường',
                description: ''
            };
            setFormData(resetData);
            localStorage.removeItem(DRAFT_KEY);
        }
    };

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Basic validation
        if (!formData.title.trim()) {
            onShowToast("Vui lòng nhập tên sự kiện!", "error");
            return;
        }

        if (!supabase) {
            onShowToast("Lỗi kết nối Server.", "error");
            return;
        }

        setSubmitting(true);
        playClick();

        try {
            // Prepare payload matching DB schema
            const payload = {
                title: formData.title,
                deadline: formData.deadline || null,
                category: formData.category, // Loại hình (Minigame, Workshop...)
                criteria: formData.criteria, // Mục I, II...
                points: formData.points,
                organizer: formData.organizer,
                link: formData.link,
                format: formData.format,
                // Map description to a DB field if exists, or assume standard structure
                // Assuming 'description' column exists or we fit it into title/notes
                description: formData.description, 
                location_type: formData.location_type,
                status: 'pending', // IMPORTANT: Hardcode pending
                is_manually_closed: false // IMPORTANT: Hardcode false
            };

            const { error } = await supabase
                .from('events')
                .insert([payload]);

            if (error) throw error;

            onShowToast("Đóng góp của bạn đã được gửi và đang chờ Admin duyệt. Cảm ơn bạn!", "success");
            
            // Clean up draft
            localStorage.removeItem(DRAFT_KEY);
            setFormData({
                title: '',
                deadline: '',
                category: 'Hoạt động phong trào',
                criteria: 'III',
                points: '5',
                organizer: '',
                link: '',
                format: 'Offline',
                location_type: 'Trong trường',
                description: ''
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
                        {isDraftLoaded && <span className="text-xs bg-white/20 px-2 py-1 rounded animate-pulse">Đã khôi phục nháp</span>}
                        <button 
                            onClick={handleClearDraft} 
                            className="hover:bg-white/20 p-2 rounded-full transition-colors text-white/80 hover:text-white"
                            title="Xóa bản nháp / Làm mới"
                        >
                            <RotateCcw size={18} />
                        </button>
                        <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                </div>

                <div className="p-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex gap-3 text-sm text-blue-800">
                        <Sparkles className="shrink-0 mt-0.5" size={18}/>
                        <p>Dữ liệu đang nhập sẽ tự động được lưu. Bạn có thể quay lại sau mà không mất nội dung.</p>
                    </div>

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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Thời gian / Deadline</label>
                                <input 
                                    type="date" 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375]"
                                    value={formData.deadline} 
                                    onChange={e => setFormData({...formData, deadline: e.target.value})} 
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Phân loại</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375]"
                                    placeholder="VD: Hội thảo, Minigame..."
                                    value={formData.category} 
                                    onChange={e => setFormData({...formData, category: e.target.value})} 
                                />
                            </div>
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
                                <label className="block text-sm font-bold text-gray-700 mb-1">Link tham gia</label>
                                <div className="relative">
                                    <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                    <input 
                                        type="text" 
                                        className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#003375]"
                                        placeholder="https://..."
                                        value={formData.link} 
                                        onChange={e => setFormData({...formData, link: e.target.value})} 
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Ghi chú thêm</label>
                            <textarea 
                                rows={3}
                                className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-[#003375] resize-none"
                                placeholder="Thông tin chi tiết khác (nếu có)..."
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


export const EventsBoard: React.FC = () => {
  // Roles
  const { isAdmin, isCTV } = useUserRole();
  const canManage = isAdmin || isCTV;

  // Data State
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [activeScope, setActiveScope] = useState('all');
  
  // Modals State
  const [showScoreGuide, setShowScoreGuide] = useState(false);
  const [showRecruitModal, setShowRecruitModal] = useState(false);
  const [showContributeModal, setShowContributeModal] = useState(false);
  
  // Management Modal State (Add/Edit)
  const [showManageModal, setShowManageModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<HubEvent | null>(null);
  
  // Discussion State
  const [discussEvent, setDiscussEvent] = useState<{id: string, name: string} | null>(null);

  // Notification State
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 4000);
  };

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);

    if (!supabase) {
        setEvents([]);
        setError("Chưa cấu hình Supabase.");
        setLoading(false);
        return;
    }

    try {
      // Updated query to filter out soft-deleted events
      let query = supabase.from('events')
        .select('*')
        .eq('is_deleted', false)
        .order('deadline', { ascending: true });
      
      // If NOT Admin/CTV, only show accepted/published events
      if (!canManage) {
          query = query.neq('status', 'pending');
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
          const parsedEvents: HubEvent[] = data.map((row: any) => {
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
                  link: row.link || '',
                  organizer: row.organizer || 'HUB',
                  type: row.category || '', 
                  classification: row.classification || '', // New field mapping
                  scope: row.location_type || 'Trong trường',
                  status: row.status || 'Sắp diễn ra',
                  is_manually_closed: row.is_manually_closed || false
              };
          });

          setEvents(parsedEvents);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Lỗi kết nối đến cơ sở dữ liệu.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [canManage]); // Refetch if role changes

  // --- MANAGEMENT ACTIONS ---

  const handleDeleteEvent = async (id: string) => {
      if (!isAdmin) return; // Strict Check
      playClick();
      // Changed message to imply soft delete if needed, but user said 'Soft Delete', not necessarily change text significantly.
      // But "vĩnh viễn" (permanently) is now technically wrong. Let's adjust slightly.
      if (!window.confirm("Bạn có chắc chắn muốn xóa sự kiện này?")) return;

      try {
          // Soft delete: Update is_deleted to true
          const { error } = await supabase!
            .from('events')
            .update({ is_deleted: true })
            .eq('id', id);

          if (error) throw error;
          showToast("Đã xóa sự kiện thành công", "success");
          setEvents(prev => prev.filter(e => e.id !== id));
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

  // --- RENDERING ---

  const filteredEvents = events.filter(evt => {
    const matchesSearch = evt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.organizer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.classification.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === 'all' || evt.category.includes(activeTab);
    const matchesScope = activeScope === 'all' || 
                         (activeScope === 'internal' && evt.scope === 'Trong trường') ||
                         (activeScope === 'external' && evt.scope === 'Ngoài trường');
    return matchesSearch && matchesTab && matchesScope;
  });

  // Grouping Logic
  const today = new Date();
  const isSameDay = (d1: Date | null, d2: Date) => {
      if (!d1) return false;
      return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  };

  // Logic: For admins, also show pending. For students, filter them out (already done in fetch but double check here if needed)
  const deadlineTodayEvents = filteredEvents.filter(evt => evt.status !== 'Đã kết thúc' && isSameDay(evt.deadlineDate, today));
  const activeEvents = filteredEvents.filter(evt => evt.status !== 'Đã kết thúc' && !isSameDay(evt.deadlineDate, today));
  const closedEvents = filteredEvents.filter(evt => evt.status === 'Đã kết thúc');

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

  // --- Manage Modal Component with Auto-Save ---
  const ADMIN_DRAFT_KEY = 'admin_event_draft';

  const ManageEventModal = () => {
      const [formData, setFormData] = useState({
          title: editingEvent?.name || '',
          deadline: editingEvent?.deadlineDate ? editingEvent.deadlineDate.toISOString().split('T')[0] : '',
          category: editingEvent?.type || 'Hoạt động phong trào',
          classification: editingEvent?.classification || '',
          criteria: editingEvent?.category || 'III',
          points: editingEvent?.score || '5',
          organizer: editingEvent?.organizer || '',
          link: editingEvent?.link || '',
          location_type: editingEvent?.scope || 'Trong trường',
          format: editingEvent?.location || 'Offline',
          status: editingEvent?.status || 'Sắp diễn ra',
          is_manually_closed: editingEvent?.is_manually_closed || false
      });
      const [submitting, setSubmitting] = useState(false);
      const [isDraftLoaded, setIsDraftLoaded] = useState(false);

      // 1. Auto-Restore Draft (Only for Create Mode)
      useEffect(() => {
          if (!editingEvent) {
              const saved = localStorage.getItem(ADMIN_DRAFT_KEY);
              if (saved) {
                  try {
                      setFormData(JSON.parse(saved));
                      setIsDraftLoaded(true);
                      setTimeout(() => setIsDraftLoaded(false), 3000);
                  } catch (e) {
                      console.error("Draft parse error", e);
                  }
              }
          }
      }, []);

      // 2. Auto-Save Draft (Only for Create Mode)
      useEffect(() => {
          if (!editingEvent) {
              const timeout = setTimeout(() => {
                  localStorage.setItem(ADMIN_DRAFT_KEY, JSON.stringify(formData));
              }, 500); // Debounce
              return () => clearTimeout(timeout);
          }
      }, [formData, editingEvent]);

      const handleReset = () => {
          if (confirm("Bạn có chắc muốn xóa bản nháp và nhập lại từ đầu?")) {
              playClick();
              localStorage.removeItem(ADMIN_DRAFT_KEY);
              setFormData({
                  title: '', deadline: '', category: 'Hoạt động phong trào', classification: '',
                  criteria: 'III', points: '5', organizer: '', link: '', location_type: 'Trong trường',
                  format: 'Offline', status: 'Sắp diễn ra', is_manually_closed: false
              });
          }
      };

      const handleSubmit = async (e: React.FormEvent) => {
          e.preventDefault();
          setSubmitting(true);
          playClick();
          
          try {
              const payload = {
                  title: formData.title,
                  deadline: formData.deadline,
                  category: formData.category,
                  classification: formData.classification,
                  criteria: formData.criteria,
                  points: formData.points,
                  organizer: formData.organizer,
                  link: formData.link,
                  location_type: formData.location_type,
                  format: formData.format,
                  status: formData.status,
                  is_manually_closed: formData.is_manually_closed
              };

              if (editingEvent) {
                  // Update
                  const { error } = await supabase!.from('events').update(payload).eq('id', editingEvent.id);
                  if (error) throw error;
                  showToast("Cập nhật thành công!", "success");
              } else {
                  // Insert
                  const { error } = await supabase!.from('events').insert([payload]);
                  if (error) throw error;
                  // Cleanup Draft on Success
                  localStorage.removeItem(ADMIN_DRAFT_KEY);
                  showToast("Thêm sự kiện thành công!", "success");
              }
              fetchEvents();
              setShowManageModal(false);
          } catch (err: any) {
              showToast("Lỗi: " + err.message, "error");
          } finally {
              setSubmitting(false);
          }
      };

      return createPortal(
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar animate-scaleIn">
                <div className="bg-[#003375] p-4 flex justify-between items-center text-white sticky top-0 z-10">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        {editingEvent ? <Edit2 size={20}/> : <PlusCircle size={20}/>}
                        {editingEvent ? 'Chỉnh sửa Sự kiện' : 'Thêm Sự kiện Mới'}
                    </h3>
                    
                    <div className="flex items-center gap-2">
                        {isDraftLoaded && <span className="text-xs bg-white/20 px-2 py-1 rounded animate-pulse">Đã khôi phục nháp</span>}
                        {!editingEvent && (
                            <button 
                                onClick={handleReset} 
                                className="hover:bg-white/20 p-2 rounded-full transition-colors text-white/80 hover:text-white"
                                title="Xóa nháp / Làm mới"
                            >
                                <RotateCcw size={18} />
                            </button>
                        )}
                        <button onClick={() => setShowManageModal(false)} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={20}/></button>
                    </div>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {!editingEvent && (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 flex items-center gap-2">
                            <Sparkles size={16} className="shrink-0"/>
                            Dữ liệu đang nhập sẽ tự động được lưu nháp.
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Tên sự kiện <span className="text-red-500">*</span></label>
                        <input type="text" required className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Deadline</label>
                            <input type="date" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
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
                    </div>
                    
                    {/* Manual Close Switch */}
                    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                        <span className="font-bold text-gray-700">Đóng đăng ký sớm (Thủ công)</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={formData.is_manually_closed} onChange={e => setFormData({...formData, is_manually_closed: e.target.checked})} />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                        </label>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="col-span-1">
                            <label className="block text-sm font-bold text-gray-700 mb-1">Mục</label>
                            <select className="w-full border border-gray-300 rounded-lg p-2 bg-white outline-none focus:ring-2 focus:ring-[#003375]" value={formData.criteria} onChange={e => setFormData({...formData, criteria: e.target.value})}>
                                <option value="I">I</option><option value="II">II</option><option value="III">III</option><option value="IV">IV</option><option value="V">V</option>
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

                    {/* Classification Field */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Phân loại (Text)</label>
                        <input 
                            type="text" 
                            className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" 
                            placeholder="VD: Minigame, Workshop, Talkshow..."
                            value={formData.classification} 
                            onChange={e => setFormData({...formData, classification: e.target.value})} 
                        />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">BTC</label>
                        <input type="text" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" value={formData.organizer} onChange={e => setFormData({...formData, organizer: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Link</label>
                        <input type="text" className="w-full border border-gray-300 rounded-lg p-2 outline-none focus:ring-2 focus:ring-[#003375]" value={formData.link} onChange={e => setFormData({...formData, link: e.target.value})} />
                    </div>

                    <button type="submit" disabled={submitting} className="w-full py-3 bg-[#003375] hover:bg-[#002855] text-white font-bold rounded-xl flex items-center justify-center gap-2">
                        {submitting ? <Loader2 className="animate-spin"/> : <Save size={18}/>} Lưu thay đổi
                    </button>
                </form>
            </div>
        </div>, document.body
      );
  };

  const renderEventCard = (evt: HubEvent) => {
    // Basic Status
    const isPending = evt.status === 'pending';
    const isStatusClosed = evt.status === 'Đã kết thúc';
    const isActive = evt.status === 'Đang diễn ra';
    const isUpcoming = evt.status === 'Sắp diễn ra';
    const isDeadlineToday = !isStatusClosed && !isPending && isSameDay(evt.deadlineDate, today);

    // Hybrid Close Logic
    const isOverdue = evt.deadlineDate ? evt.deadlineDate < new Date() : false;
    const isManualClose = evt.is_manually_closed;
    const isLinkClosed = isStatusClosed || isOverdue || isManualClose;

    const formattedLink = evt.link && !evt.link.startsWith('http') ? `https://${evt.link}` : evt.link;

    return (
      <div key={evt.id} className={`bg-white rounded-xl shadow-sm border p-5 flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group relative overflow-hidden 
        ${isLinkClosed ? 'border-gray-200 opacity-80' : ''} 
        ${isActive && !isLinkClosed ? 'border-green-300 ring-1 ring-green-50' : ''}
        ${isUpcoming && !isLinkClosed ? 'border-yellow-300' : ''}
        ${isDeadlineToday && !isLinkClosed ? 'border-red-300 ring-1 ring-red-50' : ''}
        ${isPending ? 'border-yellow-400 ring-2 ring-yellow-100' : ''}
      `}>
        {/* Status Badge */}
        <div className={`absolute top-0 right-0 text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10 shadow-sm flex items-center gap-1
            ${isLinkClosed ? 'bg-gray-200 text-gray-600' : 
              isDeadlineToday ? 'bg-red-600 text-white' :
              isActive ? 'bg-green-100 text-green-700' : 
              'bg-yellow-100 text-yellow-700'}`}>
            {isDeadlineToday && !isLinkClosed && <Siren size={10} className="animate-pulse" />}
            {!isDeadlineToday && !isLinkClosed && !isPending && <Circle size={6} fill="currentColor" />} 
            {isPending 
                ? 'Đang chờ duyệt'
                : (isLinkClosed 
                    ? (isManualClose ? 'Đã đóng đơn sớm' : 'Đã kết thúc')
                    : (isDeadlineToday ? 'Hạn chốt hôm nay' : evt.status)
                  )
            }
        </div>

        {/* Classification Badge (if present) or Category Type (Fallback) */}
        {(evt.classification || evt.type) && (
            <div className="absolute top-3 left-3 text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-100 flex items-center gap-1">
                {evt.classification || evt.type}
            </div>
        )}

        <div className="flex justify-between items-start mb-3 mt-6">
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded border border-gray-200 flex items-center gap-1 line-clamp-1 max-w-[60%]"><Users size={12}/> {evt.organizer}</span>
            <div className="flex gap-1">
                <span className="bg-white text-gray-500 text-xs font-bold px-2 py-1 rounded border border-gray-200 flex items-center justify-center" title={`Mục ${evt.category}`}>{evt.category}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded border flex items-center gap-1 ${isLinkClosed ? 'bg-gray-50 text-gray-500 border-gray-100' : 'bg-red-50 text-[#990000] border-red-100'}`}><Award size={12}/> {evt.score.includes('+') ? evt.score : `+${evt.score}`}</span>
            </div>
        </div>

        <h3 className={`font-bold text-gray-800 mb-3 line-clamp-2 transition-colors h-[3.5rem] flex items-center ${!isLinkClosed ? 'group-hover:text-[#003375]' : ''}`}>{evt.name}</h3>
        {evt.scope && evt.scope !== 'Khác' && <div className="mb-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${evt.scope === 'Trong trường' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-pink-50 text-pink-700 border-pink-100'}`}><Building2 size={10} /> {evt.scope}</span></div>}

        <div className="space-y-2 text-sm text-gray-600 mb-4 flex-1">
            <div className="flex items-start gap-2">
                <Clock size={16} className={`mt-0.5 shrink-0 ${isLinkClosed ? 'text-gray-400' : isDeadlineToday ? 'text-red-500 animate-pulse' : 'text-blue-500'}`} />
                <div>
                    <span className={`font-medium ${isDeadlineToday && !isLinkClosed ? 'text-red-600' : 'text-gray-700'}`}>
                        {evt.time || 'Chưa cập nhật hạn'}
                    </span>
                </div>
            </div>
            <div className="flex items-start gap-2"><MapPin size={16} className="text-gray-400 mt-0.5 shrink-0" /><span className="line-clamp-1">{evt.location}</span></div>
        </div>

        <div className="mt-auto flex gap-2">
             <button onClick={() => { playClick(); setDiscussEvent({ id: evt.id, name: evt.name }); }} className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-[#003375] py-2 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-all active:scale-95 shadow-sm hover:shadow-md" title="Thảo luận"><MessageCircle size={18} /><span className="hidden sm:inline">Thảo luận</span></button>
            
            {evt.link && !isLinkClosed ? (
                <a href={formattedLink} target="_blank" rel="noopener noreferrer" onClick={(e) => { playClick(); e.stopPropagation(); }} className={`flex-[2] text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-all active:scale-95 shadow-sm hover:shadow-md ${isDeadlineToday ? 'bg-red-600 hover:bg-red-700' : 'bg-[#003375] hover:bg-[#002855]'}`}>Tham gia ngay</a>
            ) : (
                <button disabled className={`flex-[2] py-2 rounded-lg font-medium text-sm cursor-not-allowed border flex items-center justify-center gap-2 ${isLinkClosed ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>
                    {isLinkClosed ? <>Đã đóng đơn <Lock size={14}/></> : "Chưa có link"}
                </button>
            )}
        </div>

        {/* --- IN-PLACE MANAGEMENT TOOLBAR --- */}
        {canManage && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => handleOpenEdit(evt)}
                        className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Chỉnh sửa"
                    >
                        <Edit2 size={16} />
                    </button>
                    <button 
                        onClick={() => handleToggleClose(evt)}
                        className={`p-1.5 rounded-lg transition-colors flex items-center gap-1 ${evt.is_manually_closed ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                        title={evt.is_manually_closed ? "Mở lại đăng ký" : "Đóng đăng ký ngay"}
                    >
                        {evt.is_manually_closed ? <ToggleRight size={16}/> : <ToggleLeft size={16}/>}
                    </button>
                </div>
                
                {isAdmin && (
                    <button 
                        onClick={() => handleDeleteEvent(evt.id)}
                        className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        title="Xóa (Soft Delete)"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
        )}
      </div>
    );
  };

  return (
    <div className="animate-slideInRight">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
            <h2 className="text-2xl font-bold text-[#003375] flex items-center gap-2">
                <Calendar className="text-[#990000]" />Sự kiện Điểm Rèn Luyện
            </h2>
            {canManage && (
                <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block mt-1 border border-blue-100">
                    <Settings size={10} className="inline mr-1"/>
                    {isAdmin ? 'Chế độ Admin: Toàn quyền' : 'Chế độ CTV: Sửa/Đóng đơn'}
                </div>
            )}
            {!canManage && <p className="text-sm text-gray-500 mt-1">Một số sự kiện có thể được cập nhật trễ</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto items-stretch">
            <div className="relative flex-1 sm:flex-none"><input type="text" placeholder="Tìm tên, BTC, loại hình..." className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none w-full md:w-64 transition-all hover:border-blue-300 h-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /></div>
            <div className="relative">
                <select value={activeScope} onChange={(e) => { playClick(); setActiveScope(e.target.value); }} className="appearance-none pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none bg-white text-sm font-medium text-gray-700 h-full w-full sm:w-auto cursor-pointer hover:border-blue-300 transition-colors">
                    <option value="all">Tất cả khu vực</option><option value="internal">Trong trường</option><option value="external">Ngoài trường</option>
                </select>
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            </div>
            <div className="flex gap-2">
                <button onClick={() => { playClick(); fetchEvents(); }} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-[#003375] transition-all active:scale-95 hover:rotate-180 duration-500" title="Làm mới"><RefreshCw size={20} className={loading ? "animate-spin" : ""} /></button>
                <button onClick={() => { playClick(); setShowScoreGuide(true); }} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-[#003375] transition-all active:scale-95" title="Xem bảng điểm"><FileText size={20} /></button>
                
                {/* Action Button: Contribute (Student) vs Add (Admin/CTV) */}
                {canManage ? (
                    <button onClick={handleOpenAdd} className="px-4 py-2 bg-[#003375] hover:bg-[#002855] text-white rounded-lg shadow-sm flex items-center gap-2 font-bold transition-all active:scale-95 hover:shadow-md whitespace-nowrap justify-center flex-1">
                        <PlusCircle size={18} /> Thêm mới
                    </button>
                ) : (
                    <button onClick={() => { playClick(); setShowContributeModal(true); }} className="px-4 py-2 bg-[#003375] hover:bg-[#002855] text-white rounded-lg shadow-sm flex items-center gap-2 font-bold transition-all active:scale-95 hover:shadow-md whitespace-nowrap justify-center flex-1">
                        <PlusCircle size={18} /> Đóng góp
                    </button>
                )}
            </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200 mb-6 overflow-x-auto no-scrollbar">
        {[{id:'all',l:'Tất cả'},{id:'I',l:'Mục I'},{id:'II',l:'Mục II'},{id:'III',l:'Mục III'},{id:'IV',l:'Mục IV'},{id:'V',l:'Mục V'}].map(tab => (
            <button key={tab.id} onClick={() => { playClick(); setActiveTab(tab.id); }} className={`flex-1 min-w-[80px] py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-blue-50 text-[#003375]' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>{tab.l}</button>
        ))}
      </div>

      {!canManage && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 mb-6 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
            <div className="flex items-center gap-3">
                <div className="bg-white p-2 rounded-full shadow-sm"><Users className="text-[#003375]" size={20} /></div>
                <div><h3 className="font-bold text-[#003375] text-sm">Tuyển Cộng tác viên nhập liệu</h3><p className="text-xs text-gray-500">Giúp cộng đồng sinh viên HUB cập nhật sự kiện nhanh nhất</p></div>
            </div>
            <button onClick={() => { playClick(); setShowRecruitModal(true); }} className="bg-white text-[#003375] border border-blue-200 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:shadow-md hover:scale-105 transition-all active:scale-95 whitespace-nowrap">Đăng ký ngay</button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fadeIn"><Loader2 size={40} className="text-[#003375] animate-spin mb-4" /><p className="text-gray-500">Đang tải danh sách sự kiện...</p></div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center animate-fadeIn"><p className="font-bold mb-2">Đã xảy ra lỗi</p><p>{error}</p></div>
      ) : (
        <div className="space-y-8 animate-fadeIn">
            {deadlineTodayEvents.length > 0 && (
                <div className="bg-red-50 rounded-xl border border-red-200 p-4 sm:p-6 animate-pulse-soft">
                    <h3 className="text-xl font-bold text-red-700 mb-4 flex items-center gap-2"><Siren className="animate-pulse" /> 🚨 Hạn chốt hôm nay ({deadlineTodayEvents.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{deadlineTodayEvents.map(evt => renderEventCard(evt))}</div>
                </div>
            )}
            {activeEvents.length > 0 && (
                <div>
                    <h3 className="text-xl font-bold text-[#003375] mb-4 flex items-center gap-2"><Flame className="text-orange-500 fill-orange-100" /> 🔥 Đang mở đăng ký ({activeEvents.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{activeEvents.map(evt => renderEventCard(evt))}</div>
                </div>
            )}
            {closedEvents.length > 0 && (
                <div>
                     <h3 className="text-xl font-bold text-gray-500 mb-4 flex items-center gap-2"><Lock className="text-gray-400" /> 🔒 Đã hết hạn ({closedEvents.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-80">{closedEvents.map(evt => renderEventCard(evt))}</div>
                </div>
            )}
            {filteredEvents.length === 0 && (
                <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300"><div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300"><Calendar size={32} /></div><p className="text-gray-500 font-medium">Không tìm thấy sự kiện phù hợp.</p></div>
            )}
        </div>
      )}

      <NotificationToast />
      <DiscussionModal event={discussEvent} onClose={() => setDiscussEvent(null)} />
      {showRecruitModal && <RecruitFormModal isOpen={showRecruitModal} onClose={() => setShowRecruitModal(false)} />}
      {showContributeModal && <ContributeEventModal isOpen={showContributeModal} onClose={() => setShowContributeModal(false)} onShowToast={showToast} />}
      {showScoreGuide && <ScoreGuideModal isOpen={showScoreGuide} onClose={() => setShowScoreGuide(false)} />}
      {showManageModal && <ManageEventModal />}
    </div>
  );
};
