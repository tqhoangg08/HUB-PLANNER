import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Search, MapPin, Calendar, User, Phone, Loader2, ImageOff, PlusCircle, RefreshCw, Info, HelpCircle, Tag, Megaphone, X, Camera, UploadCloud, CheckCircle2, AlertCircle, Edit2, Trash2, Shield, Bookmark, BookmarkCheck, Flag } from 'lucide-react';
import { playClick } from '../utils/audio';
import { showConfirm } from '../utils/appNotifications';
import { createPortal } from 'react-dom';
import { useUserRole } from '../hooks/useUserRole';
import { notifyModerators } from '../utils/moderatorNotifications';
import { apiUrl } from '../utils/api';
import { TurnstileBox } from './TurnstileBox';
import { protectedSubmit } from '../utils/protectedSubmit';

// --- Types ---
interface LostFoundItem {
  id: number;
  created_at: string;
  type: 'FOUND' | 'LOST';
  title: string;
  description: string;
  location: string;
  contact_info: string;
  user_name: string;
  image_url: string | null;
  status: 'pending' | 'approved' | 'resolved'; 
  is_deleted: boolean; 
  user_id?: string; 
}
type LostFoundRequestIntent = 'report' | 'edit' | 'delete' | 'resolve';
const LOST_FOUND_PAGE_SIZE = 12;
const MAX_LOST_FOUND_IMAGE_BYTES = 3 * 1024 * 1024;

const sanitizeLostFoundSearch = (value: string) =>
  value.trim().replace(/[%,]/g, ' ').replace(/\s+/g, ' ');

const fileToBase64 = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Không đọc được ảnh.'));
    reader.readAsDataURL(file);
});

// --- Mobile Bottom Sheet Drag Handle ---
const DragHandle = () => (
    <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mt-3 mb-1 shrink-0" />
);

// --- SHARED MODAL LOGIC (SUBMIT) ---
interface SubmitModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'FOUND' | 'LOST';
    onShowToast: (msg: string, type: 'success' | 'error') => void;
    editingItem?: LostFoundItem | null; 
    currentUserId?: string | null; 
}

const SubmitModal: React.FC<SubmitModalProps> = ({ isOpen, onClose, type, onShowToast, editingItem, currentUserId }) => {
    const [formData, setFormData] = useState({
        title: '', description: '', location: '', contact_info: '', user_name: ''
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            if (editingItem) {
                setFormData({
                    title: editingItem.title, description: editingItem.description, location: editingItem.location,
                    contact_info: editingItem.contact_info, user_name: editingItem.user_name
                });
                setPreviewUrl(editingItem.image_url);
                setImageFile(null);
            } else {
                setFormData({ title: '', description: '', location: '', contact_info: '', user_name: '' });
                setImageFile(null);
                setPreviewUrl(null);
            }
        }
    }, [isOpen, editingItem]);

    useEffect(() => {
        return () => {
            if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > MAX_LOST_FOUND_IMAGE_BYTES) {
                alert("Ảnh quá lớn (tối đa 3MB)");
                return;
            }
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) return;
        playClick();
        setIsSubmitting(true);

        try {
            let imageUrl = editingItem?.image_url || null;

            if (imageFile && editingItem) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage.from('lost_found_images').upload(filePath, imageFile);
                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage.from('lost_found_images').getPublicUrl(filePath);
                imageUrl = publicUrl;
            }

            const imagePayload = imageFile && !editingItem
                ? {
                    base64: await fileToBase64(imageFile),
                    contentType: imageFile.type || 'image/jpeg',
                }
                : undefined;

            if (editingItem) {
                const { error } = await supabase.from('lost_found_items')
                    .update({
                        title: formData.title, description: formData.description, location: formData.location,
                        contact_info: formData.contact_info, user_name: formData.user_name, image_url: imageUrl,
                    }).eq('id', editingItem.id);
                if (error) throw error;
                onShowToast("Cập nhật thành công!", 'success');
            } else {
                const data = await protectedSubmit<{ id?: number }>({
                    action: 'lost-found',
                    turnstileToken,
                    payload: {
                        title: formData.title,
                        description: formData.description,
                        location: formData.location,
                        contact_info: formData.contact_info,
                        user_name: formData.user_name || 'Ẩn danh',
                        image_url: imageUrl,
                        image: imagePayload,
                        type,
                        user_id: currentUserId || null,
                    },
                });
                onShowToast("Đã gửi thông tin cho Ban quản trị. Nội dung chỉ hiển thị sau khi được duyệt.", 'success');
            }
            onClose();
        } catch (err: any) {
            onShowToast("Lỗi: " + err.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 flex items-end justify-center animate-fadeIn" onClick={onClose}>
            <div className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col h-[90vh] animate-slideUp relative" onClick={e => e.stopPropagation()}>
                <DragHandle />
                <div className="px-5 pt-2 pb-3 flex justify-between items-center shrink-0 border-b border-gray-100">
                    <h3 className={`font-bold text-lg flex items-center gap-2 ${type === 'FOUND' ? 'text-[#003375]' : 'text-[#990000]'}`}>
                        {editingItem ? <Edit2 size={20}/> : (type === 'FOUND' ? <PlusCircle size={20}/> : <Megaphone size={20}/>)}
                        {editingItem ? 'Admin chỉnh sửa tin' : (type === 'FOUND' ? 'Gửi thông tin nhặt được đồ' : 'Báo cáo mất đồ cho Ban quản trị')}
                    </h3>
                    <button onClick={onClose} className="bg-gray-100 p-2 rounded-full text-gray-500 active:scale-95"><X size={18}/></button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4 pb-safe">
                    <div className="flex justify-center">
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full h-40 bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer active:bg-gray-100 relative overflow-hidden"
                        >
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                            ) : (
                                <>
                                    <Camera size={32} className="text-gray-400 mb-2"/>
                                    <p className="text-sm text-gray-500 font-medium">Bấm để tải ảnh lên (nếu có)</p>
                                </>
                            )}
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                            {previewUrl && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                    <span className="text-white text-sm font-bold flex items-center gap-1"><UploadCloud size={16}/> Thay đổi</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Tên vật phẩm <span className="text-red-500">*</span></label>
                        <input type="text" required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#003375] outline-none" placeholder="VD: Chìa khóa xe, Thẻ sinh viên..." value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Khu vực <span className="text-red-500">*</span></label>
                            <input type="text" required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#003375] outline-none" placeholder="VD: Giảng đường A..." value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Tên bạn</label>
                            <input type="text" required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#003375] outline-none" placeholder="Tên để xưng hô" value={formData.user_name} onChange={e => setFormData({...formData, user_name: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Liên hệ <span className="text-red-500">*</span></label>
                        <input type="text" required className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#003375] outline-none" placeholder="SĐT hoặc Link Facebook" value={formData.contact_info} onChange={e => setFormData({...formData, contact_info: e.target.value})} />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Mô tả thêm</label>
                        <textarea rows={3} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#003375] outline-none resize-none" placeholder="Đặc điểm nhận dạng, màu sắc..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
                    </div>

                    {!editingItem && <TurnstileBox token={turnstileToken} onTokenChange={setTurnstileToken} />}

                    <button type="submit" disabled={isSubmitting || (!editingItem && !turnstileToken)} className={`w-full py-4 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-4 ${type === 'FOUND' ? 'bg-[#003375]' : 'bg-[#990000]'}`}>
                        {isSubmitting ? <Loader2 className="animate-spin"/> : <UploadCloud size={20}/>}
                        {isSubmitting ? 'Đang gửi...' : (editingItem ? 'Lưu thay đổi' : 'Gửi thông tin cho Ban quản trị')}
                    </button>
                </form>
            </div>
        </div>,
        document.body
    );
};

// --- ITEM DETAIL MODAL ---
interface ItemDetailModalProps {
    item: LostFoundItem | null;
    onClose: () => void;
    onReport: (item: LostFoundItem) => void;
}
const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose, onReport }) => {
    if (!item) return null;
    const isResolved = item.status === 'resolved';

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 flex items-end justify-center animate-fadeIn" onClick={onClose}>
            <div className="bg-white w-full h-[95vh] rounded-t-3xl shadow-2xl overflow-hidden flex flex-col relative animate-slideUp" onClick={e => e.stopPropagation()}>
                <button onClick={() => { playClick(); onClose(); }} className="absolute top-4 right-4 z-50 bg-black/50 text-white p-2 rounded-full active:scale-90"><X size={20} /></button>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pb-safe flex flex-col">
                    {/* Hình ảnh sản phẩm */}
                    <div className="w-full bg-black flex items-center justify-center relative min-h-[250px] shrink-0">
                         {item.image_url ? (
                            <img src={item.image_url} alt="Item" className={`w-full h-full object-contain max-h-[35vh] ${isResolved ? 'grayscale opacity-70' : ''}`} />
                        ) : (
                            <div className="flex flex-col items-center text-gray-400 py-10"><ImageOff size={48} className="mb-2 opacity-50" /><span className="text-sm">Không có ảnh</span></div>
                        )}
                        <div className={`absolute top-4 left-4 text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm uppercase tracking-wider ${
                            isResolved ? 'bg-green-600 text-white' : 
                            item.type === 'FOUND' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'
                        }`}>
                            {isResolved ? (item.type === 'FOUND' ? 'Đã trao trả' : 'Đã tìm thấy') : (item.type === 'FOUND' ? 'Đồ nhặt được' : 'Đang tìm kiếm')}
                        </div>
                    </div>

                    {/* Chi tiết */}
                    <div className="p-5 bg-white shrink-0">
                        <h3 className={`text-xl font-bold flex items-start gap-2 leading-tight mb-2 ${
                            isResolved ? 'text-green-700' : item.type === 'FOUND' ? 'text-[#003375]' : 'text-[#990000]'
                        }`}>
                            {isResolved ? <CheckCircle2 size={22} className="shrink-0 mt-0.5" /> : (item.type === 'FOUND' ? <MapPin size={22} className="shrink-0 mt-0.5" /> : <Tag size={22} className="shrink-0 mt-0.5" />)}
                            {item.title}
                        </h3>
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-4"><Calendar size={14} /><span>Ngày hiển thị: {new Date(item.created_at).toLocaleDateString('vi-VN')}</span></div>
                        
                        {item.description && (
                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 text-sm text-gray-700 mb-4 whitespace-pre-line">
                                {item.description}
                            </div>
                        )}

                        <div className="space-y-3">
                             <div className={`flex items-center gap-3 p-3 rounded-xl border ${item.type === 'FOUND' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.type === 'FOUND' ? 'bg-blue-200 text-[#003375]' : 'bg-red-200 text-[#990000]'}`}>{item.type === 'FOUND' ? <User size={20} /> : <HelpCircle size={20} />}</div>
                                <div className="overflow-hidden">
                                    <span className="block text-[10px] text-gray-500 font-bold uppercase">{item.type === 'FOUND' ? 'Người nhặt' : 'Người mất'}</span>
                                    <span className="font-bold text-gray-800 text-base truncate block">{item.user_name}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded-xl border border-green-200 bg-green-50">
                                <div className="w-10 h-10 rounded-full bg-green-200 text-green-800 flex items-center justify-center shrink-0"><Phone size={20} /></div>
                                <div className="overflow-hidden">
                                    <span className="block text-[10px] text-green-700/70 font-bold uppercase">Thông tin liên hệ</span>
                                    <span className="font-bold text-green-800 text-base truncate block">{item.contact_info}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-700 mt-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                <MapPin size={18} className="text-gray-400 shrink-0" />
                                <span className="truncate">Khu vực: <strong>{item.location}</strong></span>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    playClick();
                                    onReport(item);
                                }}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-black text-red-600 active:bg-red-100"
                            >
                                <Flag size={16} /> Báo cáo / yêu cầu gỡ
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>, document.body
    );
};

interface ReportModalProps {
    item: LostFoundItem | null;
    onClose: () => void;
    onShowToast: (msg: string, type: 'success' | 'error') => void;
    currentUserId?: string | null;
    requestIntent: LostFoundRequestIntent;
}

const ReportModal: React.FC<ReportModalProps> = ({ item, onClose, onShowToast, currentUserId, requestIntent }) => {
    const [reason, setReason] = useState('');
    const [contact, setContact] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [turnstileToken, setTurnstileToken] = useState('');

    useEffect(() => {
        if (item) {
            setReason('');
            setContact('');
        }
            setTurnstileToken('');
    }, [item]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!item || !supabase || !reason.trim()) return;

        setIsSubmitting(true);
        try {
            const requestLabel = requestIntent === 'edit'
                ? 'Yêu cầu chỉnh sửa thông tin Lost & Found'
                : requestIntent === 'delete'
                    ? 'Yêu cầu xóa/gỡ thông tin Lost & Found'
                    : requestIntent === 'resolve'
                        ? 'Yêu cầu cập nhật trạng thái Lost & Found'
                        : 'Yêu cầu báo cáo/gỡ nội dung Lost & Found';
            const content = [
                requestLabel,
                `Item ID: ${item.id}`,
                `Tiêu đề: ${item.title}`,
                `Loại: ${item.type}`,
                `Link nội bộ: /lost-found?item=${item.id}`,
                `Nội dung yêu cầu: ${reason.trim()}`,
                'Cam kết xử lý: yêu cầu được Ban quản trị/auditor tiếp nhận, rà soát và thực hiện nếu hợp lệ.',
            ].join('\n');

            const data = await protectedSubmit<{ id?: number }>({
                action: 'feedback',
                turnstileToken,
                payload: {
                    type: requestIntent === 'report' ? 'takedown' : 'lost_found_owner_request',
                    content,
                    contact: contact.trim() || 'EMPTY',
                    user_id: currentUserId || null,
                },
            });
            void notifyModerators('feedback', data?.id);
            onShowToast('Đã gửi yêu cầu cho Ban quản trị. Admin/auditor sẽ rà soát và xử lý nếu hợp lệ.', 'success');
            onClose();
        } catch (error: any) {
            console.error(error);
            onShowToast('Không thể gửi yêu cầu: ' + (error.message || 'Vui lòng thử lại.'), 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!item) return null;

    const isOwnerRequest = requestIntent !== 'report';
    const title = isOwnerRequest ? 'Gửi yêu cầu cho Ban quản trị' : 'Báo cáo nội dung';
    const helper = isOwnerRequest
        ? 'Yêu cầu của bạn sẽ được admin/auditor tiếp nhận và thực hiện nếu hợp lệ. Người dùng không tự sửa/xóa nội dung đang hiển thị.'
        : 'Yêu cầu hợp lệ sẽ được admin/auditor rà soát và gỡ/ẩn nội dung vi phạm trong vòng 24 giờ.';
    const reasonLabel = isOwnerRequest ? 'Nội dung yêu cầu' : 'Lý do báo cáo';
    const placeholder = requestIntent === 'edit'
        ? 'VD: Vui lòng sửa số điện thoại thành..., cập nhật mô tả thành...'
        : requestIntent === 'delete'
            ? 'VD: Đây là thông tin của tôi, vui lòng xóa/gỡ vì...'
            : requestIntent === 'resolve'
                ? 'VD: Đồ đã được trả lại / đã tìm thấy, vui lòng cập nhật trạng thái.'
                : 'VD: lộ thông tin cá nhân, sai sự thật, spam, mạo danh, lừa đảo...';

    return createPortal(
        <div className="fixed inset-0 z-[100000] bg-black/60 flex items-end justify-center animate-fadeIn" onClick={onClose}>
            <div className="bg-white w-full rounded-t-3xl shadow-2xl flex flex-col max-h-[88vh] animate-slideUp" onClick={e => e.stopPropagation()}>
                <DragHandle />
                <div className="flex items-center justify-between border-b border-gray-100 px-5 pb-3 pt-2">
                    <h3 className="flex items-center gap-2 text-lg font-black text-red-600"><Flag size={18} /> {title}</h3>
                    <button onClick={onClose} className="rounded-full bg-gray-100 p-2 text-gray-500 active:scale-95"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar pb-safe">
                    <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold leading-relaxed text-red-800">
                        {helper}
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-bold text-gray-700">Thông tin liên quan</label>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-bold text-gray-800">{item.title}</div>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-bold text-gray-700">{reasonLabel} <span className="text-red-500">*</span></label>
                        <textarea
                            required
                            rows={4}
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
                            placeholder={placeholder}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-bold text-gray-700">Liên hệ của bạn</label>
                        <input
                            type="text"
                            value={contact}
                            onChange={(event) => setContact(event.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500"
                            placeholder="Email/SĐT để admin phản hồi nếu cần"
                        />
                    </div>
                    <div className="flex justify-center">
                        <TurnstileBox token={turnstileToken} onTokenChange={setTurnstileToken} />
                    </div>
                    <button type="submit" disabled={isSubmitting || !reason.trim() || !turnstileToken} className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-black text-white disabled:opacity-60">
                        {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Flag size={18} />}
                        {isOwnerRequest ? 'Gửi yêu cầu hỗ trợ' : 'Gửi báo cáo'}
                    </button>
                </form>
            </div>
        </div>,
        document.body
    );
};

// --- MAIN COMPONENT ---
export const MobileLostFound: React.FC = () => {
  useEffect(() => {
    document.title = "Tìm đồ thất lạc | HUB Planner";
  }, []);

  const { isAdmin, isCTV, isStudent, session } = useUserRole(); 
  const canManage = isAdmin || isCTV;

  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'FOUND' | 'LOST'>('LOST');
  const [page, setPage] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  
  const [selectedItem, setSelectedItem] = useState<LostFoundItem | null>(null);
  const [reportingItem, setReportingItem] = useState<LostFoundItem | null>(null);
  const [requestIntent, setRequestIntent] = useState<LostFoundRequestIntent>('report');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editingItem, setEditingItem] = useState<LostFoundItem | null>(null);
  const [submitType, setSubmitType] = useState<'FOUND' | 'LOST'>('LOST');
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    if (!supabase) { setItems([]); setError("Chưa cấu hình Supabase."); setLoading(false); return; }

    try {
      if (!canManage) {
          const from = page * LOST_FOUND_PAGE_SIZE;
          const params = new URLSearchParams({
              resource: 'lost-found',
              type: activeTab,
              limit: String(LOST_FOUND_PAGE_SIZE),
              offset: String(from),
          });
          const term = sanitizeLostFoundSearch(searchTerm);
          if (term) params.set('search', term);

          const response = await fetch(apiUrl(`/events?${params.toString()}`));
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error || 'Không tải được danh sách tìm đồ.');
          setItems((payload.data || []) as LostFoundItem[]);
          setTotalItems(payload.total || 0);
          return;
      }

      let query = supabase.from('lost_found_items')
        .select('id,created_at,type,title,description,location,contact_info,user_name,image_url,status,is_deleted,user_id', { count: 'exact' })
        .eq('is_deleted', false)
        .eq('type', activeTab)
        .order('created_at', { ascending: false });
      
      if (!canManage) {
          query = query.in('status', ['approved', 'resolved']);
      }

      const term = sanitizeLostFoundSearch(searchTerm);
      if (term) {
          query = query.or(`title.ilike.%${term}%,location.ilike.%${term}%,description.ilike.%${term}%`);
      }

      const from = page * LOST_FOUND_PAGE_SIZE;
      const to = from + LOST_FOUND_PAGE_SIZE - 1;
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      if (data) setItems(data as LostFoundItem[]);
      setTotalItems(count || 0);
    } catch (err: any) {
      console.error(err);
      setError('Lỗi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [isAdmin, isCTV, canManage, activeTab, searchTerm, page]);

  useEffect(() => {
    setPage(0);
  }, [activeTab, searchTerm, isAdmin, isCTV, canManage]);

  const filteredItems = items;

  const handleApprove = async (id: number) => {
      if (!canManage) return;
      playClick();
      try {
          const { data: { session: currentSession } } = await supabase!.auth.getSession();
          const response = await fetch(apiUrl('/push?resource=announcement-queue'), {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${currentSession?.access_token || ''}`,
              },
              body: JSON.stringify({ action: 'approve-lost-found', id }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Không thể duyệt tin');

          const suffix = result.alreadySent ? '' : `, đã gửi ${result.sent || 0} thiết bị`;
          showToast(`Đã duyệt tin thành công${suffix}`, 'success');
          setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'approved' } : i));
          return;
      } catch (error: any) {
          showToast("Lỗi duyệt: " + error.message, 'error');
          return;
      }
  };

  const handleDelete = async (item: LostFoundItem) => {
      if (!isAdmin) return;
      playClick();
      if (!await showConfirm("Bạn có chắc chắn muốn xóa tin này không?")) return;
      
      const { error } = await supabase!.from('lost_found_items').update({ is_deleted: true }).eq('id', item.id);
      if (error) showToast("Lỗi xóa: " + error.message, 'error');
      else {
          showToast("Đã xóa tin thành công", 'success');
          setItems(prev => prev.filter(i => i.id !== item.id));
          setTotalItems(prev => Math.max(0, prev - 1));
      }
  };

  const handleResolve = async (id: number) => {
      if (!canManage) return;
      playClick();
      if (!await showConfirm("Xác nhận đã giải quyết xong tin này?")) return;
      
      const { error } = await supabase!.from('lost_found_items').update({ status: 'resolved' }).eq('id', id);
      if (error) showToast("Lỗi cập nhật: " + error.message, 'error');
      else {
          showToast("Đã đánh dấu thành công! Cảm ơn bạn.", 'success');
          setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'resolved' } : i));
      }
  };

  const handleEdit = (item: LostFoundItem) => {
      if (!canManage) return;
      playClick();
      setEditingItem(item);
      setSubmitType(item.type);
      setShowSubmitModal(true);
  };

  const openRequestModal = (item: LostFoundItem, intent: LostFoundRequestIntent) => {
      playClick();
      setRequestIntent(intent);
      setReportingItem(item);
  };

  const openSubmitModal = (type: 'FOUND' | 'LOST') => {
      playClick();
      setEditingItem(null); 
      setSubmitType(type);
      setShowSubmitModal(true);
  };

  const showToast = (msg: string, type: 'success' | 'error') => {
      setNotification({ msg, type });
      setTimeout(() => setNotification(null), 3000);
  };

  const NotificationToast = () => {
      if (!notification) return null;
      return createPortal(
          <div className={`fixed top-4 left-4 right-4 z-[100000] px-4 py-3 rounded-xl shadow-xl border-l-4 flex items-center gap-3 animate-slideInRight bg-white ${notification.type === 'success' ? 'border-green-500' : 'border-red-500'}`}>
              {notification.type === 'success' ? <CheckCircle2 className="text-green-600"/> : <AlertCircle className="text-red-600"/>}
              <div className="flex-1">
                  <h4 className={`font-bold text-sm ${notification.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{notification.type === 'success' ? 'Thành công' : 'Thất bại'}</h4>
                  <p className="text-xs text-gray-600">{notification.msg}</p>
              </div>
              <button onClick={() => setNotification(null)} className="p-1 text-gray-400"><X size={16}/></button>
          </div>, document.body
      );
  };

return (
    <div className="mobile-page mobile-lostfound-page w-full min-h-[100dvh] bg-[#E8ECF4] animate-fadeIn">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[430px] bg-[#F2F4F8] pb-[calc(110px+env(safe-area-inset-bottom))] text-[#0D1B3E]">
      <div className="h-[calc(env(safe-area-inset-top)+16px)] shrink-0" aria-hidden="true" />

      <div className="px-6 pb-4 pt-1">
          <div className="flex items-start justify-between">
              <div>
                  <h2 className="text-[30px] font-black leading-[1.08] tracking-normal text-[#0D1B3E]">Tìm đồ</h2>
                  <p className="mt-1 text-[13px] font-semibold text-[#7B8AB0]">Đồ thất lạc nội bộ</p>
              </div>
              <div className="flex gap-2">
                  <button onClick={() => { playClick(); fetchItems(); }} className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-white text-[#0D1B3E] shadow-[0_2px_10px_rgba(13,27,62,0.08)] active:scale-95" title="Làm mới">
                      <RefreshCw size={19} className={loading ? "animate-spin" : ""} />
                  </button>
                  <button onClick={() => openSubmitModal(activeTab)} className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-[#1A56FF] text-white shadow-[0_8px_18px_rgba(26,86,255,0.26)] active:scale-95" title={activeTab === 'FOUND' ? 'Gửi thông tin nhặt được đồ' : 'Báo cáo mất đồ cho Ban quản trị'}>
                      <PlusCircle size={19} />
                  </button>
              </div>
          </div>
      </div>

      <div className="px-6 pb-8">
          <div className="relative mb-4 grid grid-cols-2 gap-2 overflow-hidden rounded-2xl bg-white p-1 shadow-[0_2px_14px_rgba(13,27,62,0.08)]">
              <span
                  aria-hidden="true"
                  className={`absolute bottom-1 left-1 top-1 w-[calc((100%-1rem)/2)] rounded-xl bg-[#1A56FF] shadow-[0_5px_14px_rgba(26,86,255,0.34)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${activeTab === 'FOUND' ? 'translate-x-[calc(100%+0.5rem)]' : 'translate-x-0'}`}
              />
              <button
                  type="button"
                  onClick={() => { playClick(); setActiveTab('LOST'); }}
                  className={`relative z-10 flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-2 text-[12px] font-extrabold transition-colors duration-300 ${activeTab === 'LOST' ? 'text-white' : 'text-[#9AA5C0] active:bg-slate-50'}`}
              >
                  <Megaphone size={14} strokeWidth={2.5} />
                  <span className="truncate">Tin báo mất</span>
              </button>
              <button
                  type="button"
                  onClick={() => { playClick(); setActiveTab('FOUND'); }}
                  className={`relative z-10 flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-2 text-[12px] font-extrabold transition-colors duration-300 ${activeTab === 'FOUND' ? 'text-white' : 'text-[#9AA5C0] active:bg-slate-50'}`}
              >
                  <MapPin size={14} strokeWidth={2.5} />
                  <span className="truncate">Tin nhặt được</span>
              </button>
          </div>

          <div className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#9AA5C0]">Tổng quan</div>
          <div className="mb-3 grid grid-cols-2 gap-3">
              <div className="min-h-[104px] rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#7B8AB0]">
                      Tin đang mở
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#1A56FF]"><Tag size={14} /></span>
                  </div>
                  <div className="mt-4 text-[27px] font-black leading-none tracking-normal text-[#1A56FF]">{items.filter(item => item.status !== 'resolved').length}</div>
                  <div className="mt-1.5 text-[10.5px] font-semibold text-[#9AA5C0]">{items.filter(item => item.type === 'LOST' && item.status !== 'resolved').length} báo mất • {items.filter(item => item.type === 'FOUND' && item.status !== 'resolved').length} nhặt được</div>
              </div>
              <div className="min-h-[104px] rounded-[20px] bg-white p-4 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#7B8AB0]">
                      Đã giải quyết
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#EDFAF3] text-[#00C07F]"><CheckCircle2 size={14} /></span>
                  </div>
                  <div className="mt-4 text-[27px] font-black leading-none tracking-normal text-[#00C07F]">{items.filter(item => item.status === 'resolved').length}</div>
                  <div className="mt-1.5 text-[10.5px] font-semibold text-[#9AA5C0]">Tổng tin đã hoàn tất</div>
              </div>
          </div>

          <div className="mb-3 rounded-[20px] bg-white p-3.5 shadow-[0_2px_14px_rgba(13,27,62,0.06)]">
              <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[13.5px] font-black text-[#0D1B3E]"><Search size={16} className="text-[#1A56FF]" /> Tìm kiếm & Lọc</h3>
                  <button onClick={() => { playClick(); fetchItems(); }} className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-[#EEF2FF] text-[#1A56FF]">
                      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  </button>
              </div>

              <div className="relative mb-2.5">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8B2C8]" />
                  <input type="text" placeholder="Tìm tên đồ, địa điểm..." className="h-[38px] w-full rounded-xl border border-[#E5EAF4] bg-[#F8FAFD] pl-8 pr-3 text-xs font-semibold text-[#5B6478] outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>

          </div>

          <div className="mb-3 flex gap-2 rounded-[18px] border border-[#FFE8A1] bg-[#FFF8E6] p-3 text-[#92400E] shadow-[0_2px_12px_rgba(245,158,11,0.08)]">
              <Info size={18} className="mt-0.5 shrink-0 text-[#D97706]" />
              <p className="text-[10.8px] font-semibold leading-normal"><b className="font-black">Lưu ý:</b> Thông tin bạn gửi sẽ được Ban quản trị kiểm duyệt trước khi hiển thị. Không yêu cầu chuyển khoản trước để nhận lại đồ. Nếu thấy tin lộ thông tin cá nhân, sai sự thật, mạo danh hoặc có dấu hiệu lừa đảo, hãy bấm "Báo cáo"; yêu cầu hợp lệ sẽ được rà soát và gỡ/ẩn trong vòng 24 giờ.</p>
          </div>

          {canManage && (
              <div className="mb-3 flex items-center gap-2 rounded-[18px] border border-[#DAE6FF] bg-[#EEF2FF] p-3 text-[11px] font-bold text-[#1A56FF]">
                  <Shield size={16} /> Chế độ quản trị viên: hiển thị cả thông tin chưa duyệt.
              </div>
          )}

          <div className="-mx-6 mb-3 flex gap-2 overflow-x-auto px-6 pb-1 no-scrollbar">
              {['Tất cả', 'Thẻ SV', 'Chìa khóa', 'Ví / bóp', 'Thiết bị', 'Khác'].map((category, index) => (
                  <button key={category} className={`shrink-0 rounded-full px-3 py-2 text-[11px] font-black shadow-[0_2px_10px_rgba(13,27,62,0.04)] ${index === 0 ? 'bg-[#1A56FF] text-white shadow-[0_6px_16px_rgba(26,86,255,0.25)]' : 'bg-white text-[#7B8AB0]'}`}>
                      {category}
                  </button>
              ))}
          </div>

          {loading ? (
              <div className="flex flex-col items-center justify-center py-16"><Loader2 size={32} className="mb-3 animate-spin text-[#1A56FF]" /><p className="text-sm text-[#7B8AB0]">Đang tải...</p></div>
          ) : error ? (
              <div className="rounded-[22px] border border-[#FFE0E8] bg-white p-6 text-center text-[#E11D48] shadow-[0_2px_14px_rgba(13,27,62,0.06)]"><p className="mb-1 text-sm font-black">Đã xảy ra lỗi</p><p className="text-xs">{error}</p></div>
          ) : (
              <div className="flex flex-col gap-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.08em] text-[#9AA5C0]">{activeTab === 'FOUND' ? 'Tin nhặt được' : 'Tin báo mất'} ({totalItems})</div>
                  {filteredItems.length > 0 ? (
                      filteredItems.map((item) => {
                          const isPending = item.status === 'pending';
                          const isResolved = item.status === 'resolved';
                          const isFound = item.type === 'FOUND';
                          const isOwner = session?.user?.id === item.user_id;
                          const accentClass = isResolved ? 'text-[#059669]' : isFound ? 'text-[#1A56FF]' : 'text-[#E11D48]';
                          const badgeClass = isResolved ? 'border-[#D1FAE5] bg-[#EDFAF3] text-[#059669]' : isFound ? 'border-[#D6E4FF] bg-[#EAF2FF] text-[#1A56FF]' : 'border-[#FFE0E8] bg-[#FFF0F3] text-[#E11D48]';
                          const imageBg = isFound ? 'bg-[radial-gradient(circle_at_30%_20%,rgba(26,86,255,0.20),transparent_36%),radial-gradient(circle_at_80%_70%,rgba(0,192,127,0.16),transparent_34%),linear-gradient(135deg,#F8FAFD,#EAF0FA)]' : 'bg-[radial-gradient(circle_at_30%_20%,rgba(255,59,92,0.18),transparent_36%),radial-gradient(circle_at_80%_70%,rgba(245,166,35,0.14),transparent_34%),linear-gradient(135deg,#FFF8FB,#F3EEF4)]';
                          const dateLabel = new Date(item.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

                          return (
                              <article key={item.id} className={`overflow-hidden rounded-[22px] bg-white shadow-[0_2px_14px_rgba(13,27,62,0.06)] ${isResolved ? 'opacity-80' : ''} ${isPending ? 'ring-1 ring-[#FDE68A]' : ''}`}>
                                  <button type="button" onClick={() => { playClick(); setSelectedItem(item); }} className={`relative block h-[150px] w-full overflow-hidden text-left ${imageBg}`}>
                                      {item.image_url ? (
                                          <img src={item.image_url} alt={item.title} className={`h-full w-full object-cover ${isResolved ? 'grayscale opacity-70' : ''}`} loading="lazy" />
                                      ) : (
                                          <div className="flex h-full w-full items-center justify-center">
                                              <div className={`grid h-[76px] w-[76px] place-items-center rounded-[22px] border border-white/90 bg-white/75 shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${accentClass}`}>
                                                  {isFound ? <Tag size={38} strokeWidth={2.2} /> : <HelpCircle size={38} strokeWidth={2.2} />}
                                              </div>
                                          </div>
                                      )}
                                      <span className={`absolute left-3 top-3 rounded-[10px] border px-2 py-1.5 text-[9.5px] font-black uppercase tracking-[0.3px] ${badgeClass}`}>
                                          {isResolved ? (isFound ? 'Đã trao trả' : 'Đã tìm thấy') : isFound ? 'Nhặt được' : 'Đang tìm'}
                                      </span>
                                      <span className="absolute right-3 top-3 flex items-center gap-1 rounded-[10px] bg-[#0D1B3E]/65 px-2 py-1.5 text-[9.5px] font-extrabold text-white">
                                          <Calendar size={11} /> {dateLabel}
                                      </span>
                                      {isPending && <span className="absolute bottom-3 right-3 rounded-[10px] bg-[#FDE68A] px-2 py-1.5 text-[9.5px] font-black text-[#92400E]">Chờ duyệt</span>}
                                  </button>

                                  <div className="p-[15px]">
                                      <h3 className={`mb-2.5 flex items-start gap-2 text-[15px] font-black leading-snug ${accentClass}`}>
                                          {isResolved ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : isFound ? <MapPin size={18} className="mt-0.5 shrink-0" /> : <Megaphone size={18} className="mt-0.5 shrink-0" />}
                                          <span className="line-clamp-2">{item.title}</span>
                                      </h3>

                                      <div className="mb-2.5 grid gap-2 rounded-[15px] border border-[#EEF2FF] bg-[#F8FAFD] p-2.5">
                                          <div className="flex min-w-0 items-center gap-2 text-[10.8px] font-semibold text-[#637087]">
                                              <MapPin size={14} className="shrink-0 text-[#9AA5C0]" />
                                              <span className="truncate">Khu vực: <b className="font-black text-[#0D1B3E]">{item.location}</b></span>
                                          </div>
                                          <div className="flex min-w-0 items-center gap-2 text-[10.8px] font-semibold text-[#637087]">
                                              <User size={14} className="shrink-0 text-[#9AA5C0]" />
                                              <span className="truncate">{isFound ? 'Người gửi:' : 'Người báo mất:'} <b className="font-black text-[#0D1B3E]">{item.user_name}</b></span>
                                          </div>
                                      </div>

                                      {item.description && <p className="mb-3 line-clamp-2 text-[11px] font-semibold leading-normal text-[#7B8AB0]">{item.description}</p>}

                                      {isOwner && (
                                          <div className="mb-2 flex gap-2">
                                              {!isResolved && (
                                                  <button onClick={(e) => { e.stopPropagation(); openRequestModal(item, 'resolve'); }} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#D1FAE5] bg-[#EDFAF3] text-[11px] font-black text-[#059669] active:bg-green-100">
                                                      <CheckCircle2 size={15} /> Yêu cầu cập nhật
                                                  </button>
                                              )}
                                              <button onClick={(e) => { e.stopPropagation(); openRequestModal(item, 'edit'); }} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#DAE6FF] bg-[#EEF2FF] text-[11px] font-black text-[#1A56FF] active:bg-blue-100">
                                                  <Edit2 size={15} /> Yêu cầu sửa
                                              </button>
                                              <button onClick={(e) => { e.stopPropagation(); openRequestModal(item, 'delete'); }} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#FFE0E8] bg-[#FFF0F3] text-[11px] font-black text-[#E11D48] active:bg-red-100">
                                                  <Trash2 size={15} /> Yêu cầu xóa
                                              </button>
                                          </div>
                                      )}

                                      <div className="flex items-center gap-2">
                                          <button type="button" className={`flex h-[42px] w-[42px] items-center justify-center rounded-[14px] border ${isResolved ? 'border-[#D1FAE5] bg-[#EDFAF3] text-[#059669]' : 'border-[#E8EDF6] bg-white text-[#7B8AB0]'}`}>
                                              {isResolved ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}
                                          </button>
                                          <button onClick={(e) => { e.stopPropagation(); openRequestModal(item, 'report'); }} className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] border border-red-100 bg-red-50 text-red-600">
                                              <Flag size={18} />
                                          </button>
                                          <button onClick={() => { playClick(); setSelectedItem(item); }} className={`flex h-[42px] flex-1 items-center justify-center rounded-[14px] text-[12px] font-black text-white ${isResolved ? 'bg-[#F2F4F8] !text-[#A8B2C8]' : isFound ? 'bg-[#1A56FF] shadow-[0_6px_14px_rgba(26,86,255,0.2)]' : 'bg-[#E11D48] shadow-[0_6px_14px_rgba(225,29,72,0.18)]'}`}>
                                              {isResolved ? 'Xem chi tiết' : isFound ? 'Xem chi tiết' : 'Tôi tìm thấy'}
                                          </button>
                                      </div>
                                  </div>

                                  {canManage && (
                                      <div className="flex gap-2 px-[15px] pb-[15px]">
                                          {isPending && (
                                              <button onClick={() => handleApprove(item.id)} className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-[#059669] text-[11px] font-black text-white">
                                                  <CheckCircle2 size={14} /> Duyệt
                                              </button>
                                          )}
                                          <button onClick={() => handleEdit(item)} className="flex h-9 flex-1 items-center justify-center gap-1 rounded-xl border border-[#DAE6FF] bg-[#EEF2FF] text-[11px] font-black text-[#1A56FF]">
                                              <Edit2 size={14} /> Sửa
                                          </button>
                                          {isAdmin && (
                                              <button onClick={() => handleDelete(item)} className="flex h-9 w-10 items-center justify-center rounded-xl border border-[#FFE0E8] bg-[#FFF0F3] text-[#E11D48]">
                                                  <Trash2 size={14} />
                                              </button>
                                          )}
                                      </div>
                                  )}
                              </article>
                          );
                      })
                  ) : (
                      <div className="rounded-[22px] border border-dashed border-[#DDE3F0] bg-white py-14 text-center shadow-[0_2px_14px_rgba(13,27,62,0.04)]">
                          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#F8FAFD] text-[#A8B2C8]">{activeTab === 'FOUND' ? <Search size={32} /> : <Megaphone size={32} />}</div>
                          <p className="text-sm font-bold text-[#7B8AB0]">Chưa có tin nào.</p>
                          <p className="mt-1 text-xs font-semibold text-[#9AA5C0]">Bạn có thể gửi thông tin cho Ban quản trị để được hỗ trợ.</p>
                      </div>
                  )}
                  {totalItems > LOST_FOUND_PAGE_SIZE && (
                      <div className="mt-1 flex items-center justify-between rounded-[18px] bg-white p-2 text-[11px] font-black text-[#7B8AB0] shadow-[0_2px_14px_rgba(13,27,62,0.04)]">
                          <button
                              onClick={() => setPage(prev => Math.max(0, prev - 1))}
                              disabled={page === 0}
                              className="rounded-xl border border-[#E8EDF6] px-3 py-2 disabled:opacity-40"
                          >
                              Trước
                          </button>
                          <span>Trang {page + 1}/{Math.max(1, Math.ceil(totalItems / LOST_FOUND_PAGE_SIZE))}</span>
                          <button
                              onClick={() => setPage(prev => prev + 1)}
                              disabled={(page + 1) * LOST_FOUND_PAGE_SIZE >= totalItems}
                              className="rounded-xl border border-[#E8EDF6] px-3 py-2 disabled:opacity-40"
                          >
                              Sau
                          </button>
                      </div>
                  )}
              </div>
          )}
      </div>
      </div>
      <NotificationToast />

      <SubmitModal 
        isOpen={showSubmitModal} 
        onClose={() => setShowSubmitModal(false)}
        type={submitType}
        onShowToast={showToast}
        editingItem={editingItem}
        currentUserId={session?.user?.id}
      />
      <ItemDetailModal 
        item={selectedItem} 
        onClose={() => setSelectedItem(null)}
        onReport={(item) => {
          setSelectedItem(null);
          setRequestIntent('report');
          setReportingItem(item);
        }}
      />
      <ReportModal
        item={reportingItem}
        onClose={() => setReportingItem(null)}
        onShowToast={showToast}
        currentUserId={session?.user?.id}
        requestIntent={requestIntent}
      />
    </div>
  );
};
