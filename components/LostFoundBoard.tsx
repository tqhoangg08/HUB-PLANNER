import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Search, MapPin, Calendar, User, Phone, Loader2, ImageOff, PlusCircle, RefreshCw, Info, HelpCircle, Tag, Megaphone, MessageSquare, X, Camera, UploadCloud, CheckCircle2, AlertCircle, Edit2, Trash2, Shield } from 'lucide-react';
import { playClick } from '../utils/audio';
import { showConfirm } from '../utils/appNotifications';
import { CommentSection } from './CommentSection';
import { createPortal } from 'react-dom';
import { useUserRole } from '../hooks/useUserRole';
import NotificationNudge from './NotificationNudge';
import { notifyModerators } from '../utils/moderatorNotifications';

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
        title: '',
        description: '',
        location: '',
        contact_info: '',
        user_name: ''
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            if (editingItem) {
                setFormData({
                    title: editingItem.title,
                    description: editingItem.description,
                    location: editingItem.location,
                    contact_info: editingItem.contact_info,
                    user_name: editingItem.user_name
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
            if (file.size > 5 * 1024 * 1024) { 
                alert("Ảnh quá lớn (tối đa 5MB)");
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

            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('lost_found_images')
                    .upload(filePath, imageFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('lost_found_images')
                    .getPublicUrl(filePath);
                
                imageUrl = publicUrl;
            }

            if (editingItem) {
                const { error } = await supabase
                    .from('lost_found_items')
                    .update({
                        title: formData.title,
                        description: formData.description,
                        location: formData.location,
                        contact_info: formData.contact_info,
                        user_name: formData.user_name,
                        image_url: imageUrl,
                    })
                    .eq('id', editingItem.id);
                if (error) throw error;
                onShowToast("Cập nhật thành công!", 'success');
            } else {
                const { data, error } = await supabase
                    .from('lost_found_items')
                    .insert([{
                        title: formData.title,
                        description: formData.description,
                        location: formData.location,
                        contact_info: formData.contact_info,
                        user_name: formData.user_name || 'Ẩn danh',
                        image_url: imageUrl,
                        type: type,
                        user_id: currentUserId || null, 
                        status: 'pending'
                    }])
                    .select('id')
                    .single();
                if (error) throw error;
                void notifyModerators('lost_found_pending', data?.id);
                onShowToast("Đăng tin thành công! Tin sẽ hiển thị sau khi duyệt.", 'success');
            }
            onClose();
        } catch (err: any) {
            console.error(err);
            onShowToast("Lỗi: " + err.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn">
                <div className={`p-4 text-white flex justify-between items-center shrink-0 ${type === 'FOUND' ? 'bg-[#003375]' : 'bg-[#990000]'}`}>
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        {editingItem ? <Edit2 size={20}/> : (type === 'FOUND' ? <PlusCircle size={20}/> : <Megaphone size={20}/>)}
                        {editingItem ? 'Chỉnh sửa tin' : (type === 'FOUND' ? 'Đăng tin Nhặt được đồ' : 'Đăng tin Báo mất đồ')}
                    </h3>
                    <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={20}/></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    <div className="flex justify-center">
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full h-40 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 hover:border-blue-300 transition-all relative overflow-hidden group"
                        >
                            {previewUrl ? (
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                            ) : (
                                <>
                                    <Camera size={32} className="text-gray-400 mb-2 group-hover:text-[#003375] transition-colors"/>
                                    <p className="text-sm text-gray-500 font-medium">Bấm để tải ảnh lên (nếu có)</p>
                                </>
                            )}
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                            {previewUrl && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-white text-sm font-bold flex items-center gap-1"><UploadCloud size={16}/> Thay đổi</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Tên vật phẩm <span className="text-red-500">*</span></label>
                        <input type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Khu vực <span className="text-red-500">*</span></label>
                            <input type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Tên bạn</label>
                            <input type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none" value={formData.user_name} onChange={e => setFormData({...formData, user_name: e.target.value})} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Liên hệ <span className="text-red-500">*</span></label>
                        <input type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none" value={formData.contact_info} onChange={e => setFormData({...formData, contact_info: e.target.value})} />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Mô tả</label>
                        <textarea rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none resize-none" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
                    </div>

                    <button type="submit" disabled={isSubmitting} className={`w-full py-3 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-2 ${type === 'FOUND' ? 'bg-[#003375] hover:bg-[#002855]' : 'bg-[#990000] hover:bg-[#7a0000]'}`}>
                        {isSubmitting ? <Loader2 className="animate-spin"/> : <UploadCloud size={20}/>}
                        {isSubmitting ? 'Đang lưu...' : (editingItem ? 'Lưu thay đổi' : 'Đăng tin ngay')}
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
}
const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ item, onClose }) => {
    if (!item) return null;
    const isResolved = item.status === 'resolved';

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white w-full max-w-6xl h-[90vh] md:h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative animate-scaleIn">
                <button onClick={() => { playClick(); onClose(); }} className="absolute top-4 right-4 z-50 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors active:scale-90"><X size={20} /></button>
                <div className="w-full md:w-[40%] bg-gray-50 flex flex-col border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto custom-scrollbar shrink-0 h-[45%] md:h-full">
                    <div className="w-full bg-black/5 flex items-center justify-center relative min-h-[200px] md:min-h-[300px]">
                         {item.image_url ? (
                            <img src={item.image_url} alt="Item" className={`w-full h-full object-contain max-h-[40vh] md:max-h-[50vh] ${isResolved ? 'grayscale opacity-70' : ''}`} />
                        ) : (
                            <div className="flex flex-col items-center text-gray-400 py-10"><ImageOff size={48} className="mb-2 opacity-50" /><span className="text-sm">Không có ảnh</span></div>
                        )}
                        <div className={`absolute top-4 left-4 text-xs font-bold px-3 py-1.5 rounded-md shadow-sm uppercase tracking-wider ${
                            isResolved ? 'bg-green-600 text-white' : 
                            item.type === 'FOUND' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'
                        }`}>
                            {isResolved ? (item.type === 'FOUND' ? 'Đã trao trả' : 'Đã tìm thấy') : (item.type === 'FOUND' ? 'Đồ nhặt được' : 'Đang tìm kiếm')}
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        <div>
                            <h3 className={`text-2xl font-bold flex items-start gap-2 leading-tight ${
                                isResolved ? 'text-green-700' :
                                item.type === 'FOUND' ? 'text-[#003375]' : 'text-[#990000]'
                            }`}>
                                {isResolved ? <CheckCircle2 size={24} className="shrink-0 mt-1" /> : (item.type === 'FOUND' ? <MapPin size={24} className="shrink-0 mt-1" /> : <Tag size={24} className="shrink-0 mt-1" />)}
                                {item.title}
                            </h3>
                            <div className="flex items-center gap-2 text-gray-500 text-sm mt-2"><Calendar size={14} /><span>Ngày đăng: {new Date(item.created_at).toLocaleDateString('vi-VN')}</span></div>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-gray-200 text-sm text-gray-700 italic">"{item.description || 'Không có mô tả chi tiết'}"</div>
                        <div className="space-y-3 pt-4 border-t border-gray-200">
                             <div className={`flex items-center gap-3 p-3 rounded-xl border ${item.type === 'FOUND' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${item.type === 'FOUND' ? 'bg-blue-200 text-[#003375]' : 'bg-red-200 text-[#990000]'}`}>{item.type === 'FOUND' ? <User size={20} /> : <HelpCircle size={20} />}</div>
                                <div><span className="block text-xs text-gray-500 font-bold uppercase">{item.type === 'FOUND' ? 'Người nhặt' : 'Người mất'}</span><span className="font-bold text-gray-800 text-lg">{item.user_name}</span></div>
                            </div>
                            <div className="flex items-center gap-3 p-3 rounded-xl border border-green-200 bg-green-50">
                                <div className="w-10 h-10 rounded-full bg-green-200 text-green-800 flex items-center justify-center"><Phone size={20} /></div>
                                <div><span className="block text-xs text-gray-500 font-bold uppercase">Liên hệ</span><span className="font-bold text-green-700 text-lg">{item.contact_info}</span></div>
                            </div>
                            <div className="flex items-start gap-2 text-sm text-gray-600 mt-2"><MapPin size={16} className="mt-0.5 shrink-0" /><span>Khu vực: <strong>{item.location}</strong></span></div>
                        </div>
                    </div>
                </div>
                <div className="w-full md:w-[60%] h-[55%] md:h-full bg-white flex flex-col relative z-0">
                    <CommentSection contextId={`lost_found_${item.id}`} title={item.type === 'FOUND' ? 'Trao đổi nhận đồ' : 'Manh mối / Hỏi thăm'} className="flex flex-col h-full bg-white"/>
                </div>
            </div>
        </div>, document.body
    );
};

// --- MAIN COMPONENT ---
export const LostFoundBoard: React.FC = () => {
  useEffect(() => {
    document.title = "Tìm đồ thất lạc | HUB Planner";
  }, []);

  const { isAdmin, isCTV, isStudent, session } = useUserRole(); 
  const canManage = isAdmin || isCTV;

  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'FOUND' | 'LOST'>('FOUND');
  
  const [selectedItem, setSelectedItem] = useState<LostFoundItem | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editingItem, setEditingItem] = useState<LostFoundItem | null>(null);
  const [submitType, setSubmitType] = useState<'FOUND' | 'LOST'>('FOUND');
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    if (!supabase) { setItems([]); setError("Chưa cấu hình Supabase."); setLoading(false); return; }

    try {
      let query = supabase.from('lost_found_items')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      
      if (isStudent) {
          query = query.in('status', ['approved', 'resolved']);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (data) setItems(data as LostFoundItem[]);
    } catch (err: any) {
      console.error(err);
      setError('Lỗi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [isAdmin, isCTV, isStudent]);

  const filteredItems = items.filter(item => {
    const matchesTab = item.type === activeTab;
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleApprove = async (id: number) => {
      if (!canManage) return;
      playClick();
      try {
          const { data: { session: currentSession } } = await supabase!.auth.getSession();
          const response = await fetch('/api/push?resource=announcement-queue', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${currentSession?.access_token || ''}`,
              },
              body: JSON.stringify({ action: 'approve-lost-found', id }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Khong the duyet tin');

          const suffix = result.alreadySent ? '' : `, da gui ${result.sent || 0} thiet bi`;
          showToast(`Da duyet tin thanh cong${suffix}`, 'success');
          setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'approved' } : i));
          return;
      } catch (error: any) {
          showToast("Loi duyet: " + error.message, 'error');
          return;
      }
  };

  // ✨ Đã sửa hàm handleDelete để hỗ trợ Admin HOẶC Chủ nhân bài viết
  const handleDelete = async (item: LostFoundItem) => {
      // Cho phép Admin xóa hoặc người dùng xóa bài của chính mình
      if (!isAdmin && session?.user?.id !== item.user_id) return;
      
      playClick();
      if (!await showConfirm("Bạn có chắc chắn muốn xóa tin này không?")) return;
      
      const { error } = await supabase!
        .from('lost_found_items')
        .update({ is_deleted: true })
        .eq('id', item.id);

      if (error) showToast("Lỗi xóa: " + error.message, 'error');
      else {
          showToast("Đã xóa tin thành công", 'success');
          setItems(prev => prev.filter(i => i.id !== item.id));
      }
  };

  const handleResolve = async (id: number) => {
      playClick();
      if (!await showConfirm("Bạn xác nhận là đã giải quyết xong (Tìm thấy đồ / Đã trả lại đồ) cho bài đăng này?")) return;
      
      const { error } = await supabase!
        .from('lost_found_items')
        .update({ status: 'resolved' })
        .eq('id', id);

      if (error) showToast("Lỗi cập nhật: " + error.message, 'error');
      else {
          showToast("Đã đánh dấu thành công! Cảm ơn bạn.", 'success');
          setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'resolved' } : i));
      }
  };

  const handleEdit = (item: LostFoundItem) => {
      playClick();
      setEditingItem(item);
      setSubmitType(item.type);
      setShowSubmitModal(true);
  };

  const openSubmitModal = (type: 'FOUND' | 'LOST') => {
      playClick();
      setEditingItem(null); 
      setSubmitType(type);
      setShowSubmitModal(true);
  };

  const showToast = (msg: string, type: 'success' | 'error') => {
      setNotification({ msg, type });
      setTimeout(() => setNotification(null), 5000);
  };

return (
    <div className="w-full pb-10 animate-slideInRight relative">
      {notification && createPortal(
          <div className={`fixed top-4 right-4 z-[100000] px-4 py-3 rounded-xl shadow-2xl border-l-4 flex items-center gap-3 animate-slideInRight bg-white ${notification.type === 'success' ? 'border-green-500' : 'border-red-500'}`}>
              {notification.type === 'success' ? <CheckCircle2 className="text-green-600"/> : <AlertCircle className="text-red-600"/>}
              <div><h4 className={`font-bold text-sm ${notification.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{notification.type === 'success' ? 'Thành công' : 'Thất bại'}</h4><p className="text-xs text-gray-600">{notification.msg}</p></div>
          </div>, document.body
      )}

      {/* VÙNG STICKY */}
      <div className="relative md:sticky top-0 z-40 bg-[#F8FAFC] pt-2 pb-4 -mt-2 mb-6 border-b border-transparent md:border-gray-200/60 md:shadow-[0_8px_10px_-10px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
            <div>
                <h2 className="text-[24px] sm:text-[26px] font-extrabold text-[#003375] tracking-tight leading-none">
                    Tìm đồ thất lạc</h2>
                <p className="text-xs text-gray-500 mt-1 italic flex items-center gap-1">
                    <Info size={12}/> Đây là khu vực trao đổi thông tin nội bộ hỗ trợ học tập
                </p>
                
                {canManage && (
                    <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block mt-2 border border-blue-100">
                        <Shield size={10} className="inline mr-1"/>
                        {isAdmin ? 'Admin Mode: Full Access' : 'CTV Mode: Approve/Edit'}
                    </div>
                )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto items-stretch">
                <div className="relative flex-1 sm:flex-none">
                    <input type="text" placeholder="Tìm tên đồ, địa điểm..." className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none sm:w-64 transition-all hover:border-blue-300 h-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { playClick(); fetchItems(); }} className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-[#003375] transition-all active:scale-95 hover:rotate-180 duration-500" title="Làm mới"><RefreshCw size={20} className={loading ? "animate-spin" : ""} /></button>
                    <button onClick={() => openSubmitModal(activeTab)} className={`px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 font-bold transition-all active:scale-95 hover:shadow-md whitespace-nowrap justify-center flex-1 ${activeTab === 'FOUND' ? 'bg-[#003375] hover:bg-[#002855] text-white' : 'bg-[#990000] hover:bg-[#7a0000] text-white'}`}>
                        <PlusCircle size={18} /> {activeTab === 'FOUND' ? 'Đăng tin Nhặt được' : 'Đăng tin Báo mất'}
                    </button>
                </div>
            </div>
          </div>

          <div className="flex gap-4 border-b border-gray-200">
              <button onClick={() => { playClick(); setActiveTab('FOUND'); }} className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 transition-all relative ${activeTab === 'FOUND' ? 'text-[#003375]' : 'text-gray-500 hover:text-gray-700'}`}>
                <MapPin size={18} /> Tin nhặt được {activeTab === 'FOUND' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#003375] rounded-t-full animate-scaleIn"></div>}
              </button>
              <button onClick={() => { playClick(); setActiveTab('LOST'); }} className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 transition-all relative ${activeTab === 'LOST' ? 'text-[#990000]' : 'text-gray-500 hover:text-gray-700'}`}>
                <Megaphone size={18} /> Tin báo mất {activeTab === 'LOST' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#990000] rounded-t-full animate-scaleIn"></div>}
              </button>
          </div>
      </div>

      <NotificationNudge variant="lost-found" className="mb-5" />

      {!canManage && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-start sm:items-center gap-3 text-sm text-amber-900 animate-fadeIn">
            <Info className="shrink-0 text-amber-600 mt-0.5 sm:mt-0" size={18} />
            <p><strong>Lưu ý:</strong> Vui lòng không yêu cầu chuyển khoản trước để nhận lại đồ. Hãy hẹn gặp ở nơi đông người (Phòng CTSV, Bảo vệ) để trao đổi.</p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fadeIn"><Loader2 size={40} className="text-[#003375] animate-spin mb-4" /><p className="text-gray-500">Đang tải danh sách...</p></div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center animate-fadeIn"><p className="font-bold mb-2">Đã xảy ra lỗi</p><p>{error}</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
            {filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                    const isPending = item.status === 'pending';
                    const isResolved = item.status === 'resolved';

                    const borderClass = isResolved 
                        ? 'border-green-200 ring-1 ring-green-50 bg-gray-50'
                        : isPending 
                            ? 'border-yellow-400 ring-2 ring-yellow-100' 
                            : (item.type === 'FOUND' ? 'border-gray-200' : 'border-red-100 ring-1 ring-red-50');

                    return (
                    <div key={item.id} className={`rounded-xl shadow-sm border overflow-hidden hover:shadow-lg transition-all duration-300 group flex flex-col ${borderClass} ${isResolved ? 'opacity-80' : 'bg-white'}`}>
                        <div className="aspect-video w-full bg-gray-100 relative overflow-hidden cursor-pointer" onClick={() => { playClick(); setSelectedItem(item); }}>
                            {item.image_url ? (
                                <img src={item.image_url} alt="Item" className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${isResolved ? 'grayscale opacity-70' : ''}`} loading="lazy" />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50"><ImageOff size={32} className="mb-2 opacity-50" /><span className="text-xs">Không có ảnh</span></div>
                            )}
                            <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md flex items-center gap-1"><Calendar size={12} /> {new Date(item.created_at).toLocaleDateString('vi-VN')}</div>
                            
                             <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-1 rounded-md shadow-sm uppercase tracking-wider ${
                                isResolved ? 'bg-green-100 text-green-800 border border-green-200' :
                                item.type === 'FOUND' ? 'bg-blue-100 text-[#003375]' : 'bg-red-100 text-[#990000]'
                            }`}>
                                {isResolved ? (item.type === 'FOUND' ? 'Đã trao trả' : 'Đã tìm thấy') : (item.type === 'FOUND' ? 'Nhặt được' : 'Đang tìm')}
                            </div>

                            {isPending && <div className="absolute bottom-2 left-2 bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded-md shadow-md animate-pulse">Chờ duyệt</div>}
                        </div>

                        <div className="p-4 flex-1 flex flex-col">
                            <div className="mb-3">
                                <h3 className={`text-lg font-bold flex items-start gap-2 leading-tight line-clamp-1 ${
                                    isResolved ? 'text-green-700' :
                                    item.type === 'FOUND' ? 'text-[#003375]' : 'text-[#990000]'
                                }`}>
                                    {isResolved ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : (item.type === 'FOUND' ? <MapPin size={18} className="shrink-0 mt-0.5" /> : <Tag size={18} className="shrink-0 mt-0.5" />)}
                                    {item.title}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1 line-clamp-1 flex items-center gap-1"><MapPin size={12}/> Khu vực: {item.location}</p>
                            </div>
                            <div className="space-y-2 text-sm text-gray-600 mt-auto">
                                <div className={`flex items-center gap-2 p-2 rounded-lg border ${isResolved ? 'bg-green-50 border-green-100' : (item.type === 'FOUND' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100')}`}>
                                    {item.type === 'FOUND' ? <User size={14} className={isResolved ? "text-green-700" : "text-[#003375]"} /> : <HelpCircle size={14} className={isResolved ? "text-green-700" : "text-[#990000]"} />}
                                    <span className="font-medium text-gray-700">{item.type === 'FOUND' ? 'Người nhặt:' : 'Người mất:'}</span><span className="truncate flex-1">{item.user_name}</span>
                                </div>
                            </div>
                        </div>

                        <div className="px-4 pb-4 flex flex-col gap-2">
                            {/* ✨ NÚT DÀNH RIÊNG CHO NGƯỜI ĐĂNG */}
                            {session?.user?.id === item.user_id && (
                                <>
                                    {!isResolved && (
                                        <button onClick={(e) => { e.stopPropagation(); handleResolve(item.id); }} className="w-full py-1.5 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors border border-green-200">
                                            <CheckCircle2 size={16} /> {item.type === 'FOUND' ? 'Đánh dấu đã trao trả' : 'Đánh dấu đã tìm thấy'}
                                        </button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} className="w-full py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors border border-red-200">
                                        <Trash2 size={16} /> Xóa bài đăng
                                    </button>
                                </>
                            )}

                            <button onClick={() => { playClick(); setSelectedItem(item); }} className="w-full py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-[#003375] rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors border border-gray-200">
                                <MessageSquare size={16} /> 💬 Chi tiết & Liên hệ
                            </button>
                        </div>

                        {/* TÍNH NĂNG CỦ A ADMIN/CTV */}
                        {canManage && (
                            <div className="px-4 pb-4 pt-2 border-t border-gray-100 flex gap-2">
                                {isPending && (
                                    <button onClick={() => handleApprove(item.id)} className="flex-1 py-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg text-xs font-bold flex items-center justify-center gap-1">
                                        <CheckCircle2 size={14} /> Duyệt
                                    </button>
                                )}
                                <button onClick={() => handleEdit(item)} className="flex-1 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-xs font-bold flex items-center justify-center gap-1">
                                    <Edit2 size={14} /> Sửa
                                </button>
                                {isAdmin && (
                                    <button onClick={() => handleDelete(item)} className="py-1.5 px-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )})
            ) : (
                <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">{activeTab === 'FOUND' ? <Search size={32} /> : <Megaphone size={32} />}</div>
                    <p className="text-gray-500 font-medium">Chưa có tin nào. Hãy là người đầu tiên đăng tin!</p>
                </div>
            )}
        </div>
      )}
      
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
      />
    </div>
  );
};
