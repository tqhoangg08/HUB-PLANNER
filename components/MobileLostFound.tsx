import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Search, MapPin, Calendar, User, Phone, Loader2, ImageOff, PlusCircle, RefreshCw, Info, HelpCircle, Tag, Megaphone, MessageSquare, X, Camera, UploadCloud, CheckCircle2, AlertCircle, Edit2, Trash2, Shield } from 'lucide-react';
import { playClick } from '../utils/audio';
import { CommentSection } from './CommentSection';
import { createPortal } from 'react-dom';
import { useUserRole } from '../hooks/useUserRole';
import NotificationNudge from './NotificationNudge';

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

                const { error: uploadError } = await supabase.storage.from('lost_found_images').upload(filePath, imageFile);
                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage.from('lost_found_images').getPublicUrl(filePath);
                imageUrl = publicUrl;
            }

            if (editingItem) {
                const { error } = await supabase.from('lost_found_items')
                    .update({
                        title: formData.title, description: formData.description, location: formData.location,
                        contact_info: formData.contact_info, user_name: formData.user_name, image_url: imageUrl,
                    }).eq('id', editingItem.id);
                if (error) throw error;
                onShowToast("Cập nhật thành công!", 'success');
            } else {
                const { error } = await supabase.from('lost_found_items').insert([{
                    title: formData.title, description: formData.description, location: formData.location,
                    contact_info: formData.contact_info, user_name: formData.user_name || 'Ẩn danh',
                    image_url: imageUrl, type: type, user_id: currentUserId || null, status: 'pending'
                }]);
                if (error) throw error;
                onShowToast("Đăng tin thành công! Tin sẽ hiển thị sau khi duyệt.", 'success');
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
                        {editingItem ? 'Chỉnh sửa tin' : (type === 'FOUND' ? 'Tin Nhặt được đồ' : 'Tin Báo mất đồ')}
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

                    <button type="submit" disabled={isSubmitting} className={`w-full py-4 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-4 ${type === 'FOUND' ? 'bg-[#003375]' : 'bg-[#990000]'}`}>
                        {isSubmitting ? <Loader2 className="animate-spin"/> : <UploadCloud size={20}/>}
                        {isSubmitting ? 'Đang xử lý...' : (editingItem ? 'Lưu thay đổi' : 'Đăng tin ngay')}
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
        <div className="fixed inset-0 z-[99999] bg-black/60 flex items-end justify-center animate-fadeIn" onClick={onClose}>
            <div className="bg-white w-full h-[95vh] rounded-t-3xl shadow-2xl overflow-hidden flex flex-col relative animate-slideUp" onClick={e => e.stopPropagation()}>
                <button onClick={() => { playClick(); onClose(); }} className="absolute top-4 right-4 z-50 bg-black/50 text-white p-2 rounded-full active:scale-90"><X size={20} /></button>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pb-safe flex flex-col">
                    {/* HÌNH ẢNH SẢN PHẨM */}
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

                    {/* CHI TIẾT */}
                    <div className="p-5 bg-white shrink-0">
                        <h3 className={`text-xl font-bold flex items-start gap-2 leading-tight mb-2 ${
                            isResolved ? 'text-green-700' : item.type === 'FOUND' ? 'text-[#003375]' : 'text-[#990000]'
                        }`}>
                            {isResolved ? <CheckCircle2 size={22} className="shrink-0 mt-0.5" /> : (item.type === 'FOUND' ? <MapPin size={22} className="shrink-0 mt-0.5" /> : <Tag size={22} className="shrink-0 mt-0.5" />)}
                            {item.title}
                        </h3>
                        <div className="flex items-center gap-2 text-gray-500 text-xs mb-4"><Calendar size={14} /><span>Đăng ngày: {new Date(item.created_at).toLocaleDateString('vi-VN')}</span></div>
                        
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
                        </div>
                    </div>

                    <div className="h-2 w-full bg-gray-100 shrink-0"></div>

                    {/* COMMENT SECTION */}
                    <div className="flex-1 bg-white min-h-[400px]">
                        <CommentSection contextId={`lost_found_${item.id}`} title={item.type === 'FOUND' ? 'Trao đổi nhận đồ' : 'Hỏi thăm / Manh mối'} className="h-full pb-safe"/>
                    </div>
                </div>
            </div>
        </div>, document.body
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
      
      if (!canManage) {
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
  }, [isAdmin, isCTV]);

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
          const response = await fetch('/api/approve-lost-found', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${currentSession?.access_token || ''}`,
              },
              body: JSON.stringify({ id }),
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

  const handleDelete = async (item: LostFoundItem) => {
      if (!isAdmin && session?.user?.id !== item.user_id) return;
      playClick();
      if (!window.confirm("Bạn có chắc chắn muốn xóa tin này không?")) return;
      
      const { error } = await supabase!.from('lost_found_items').update({ is_deleted: true }).eq('id', item.id);
      if (error) showToast("Lỗi xóa: " + error.message, 'error');
      else {
          showToast("Đã xóa tin thành công", 'success');
          setItems(prev => prev.filter(i => i.id !== item.id));
      }
  };

  const handleResolve = async (id: number) => {
      playClick();
      if (!window.confirm("Xác nhận đã giải quyết xong bài đăng này?")) return;
      
      const { error } = await supabase!.from('lost_found_items').update({ status: 'resolved' }).eq('id', id);
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
    <div className="mobile-page mobile-lostfound-page w-full min-h-[100dvh] bg-[#F8FAFC] pb-24 animate-fadeIn">
      {/* --- MOBILE STICKY HEADER --- */}
      <div className="mobile-lostfound-header sticky top-0 z-40 bg-white pt-4 pb-0 shadow-sm border-b border-gray-100">
          <div className="px-4 mb-3">
              <h2 className="text-[24px] font-extrabold text-[#003375] tracking-tight leading-none">Tìm đồ thất lạc</h2>
              <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1 italic"><Info size={12}/> Đây là khu vực trao đổi thông tin nội bộ hỗ trợ học tập</p>
          </div>

          <div className="px-4 mb-3">
              <div className="relative w-full">
                  <input type="text" placeholder="Tìm tên đồ, địa điểm..." className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              </div>
          </div>

          <div className="px-4 flex gap-2 mb-3">
              <button onClick={() => { playClick(); fetchItems(); }} className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-[#003375] active:bg-gray-100" title="Làm mới">
                  <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
              </button>
              <button onClick={() => openSubmitModal(activeTab)} className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 shadow-sm text-white ${activeTab === 'FOUND' ? 'bg-[#003375]' : 'bg-[#003375]'}`}>
                  <PlusCircle size={18} /> Đăng tin {activeTab === 'FOUND' ? 'Nhặt được' : 'Báo mất'}
              </button>
          </div>

          {/* TABS */}
          <div className="flex relative mt-1">
              <button onClick={() => { playClick(); setActiveTab('FOUND'); }} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors z-10 ${activeTab === 'FOUND' ? 'text-[#003375]' : 'text-gray-400'}`}>
                  <MapPin size={16} /> Tin nhặt được
              </button>
              <button onClick={() => { playClick(); setActiveTab('LOST'); }} className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors z-10 ${activeTab === 'LOST' ? 'text-[#003375]' : 'text-gray-400'}`}>
                  <Megaphone size={16} /> Tin báo mất
              </button>
              
              {/* Tab Indicator Animation */}
              <div className="absolute bottom-0 h-0.5 bg-[#003375] transition-all duration-300 rounded-t-full w-1/2" style={{ left: activeTab === 'FOUND' ? '0%' : '50%' }}></div>
          </div>
      </div>

      <div className="p-4">
          <NotificationNudge variant="lost-found" compact className="mb-4" />

          {!canManage && (
            <div className="bg-[#FFF8E6] border border-[#FFE8A1] rounded-xl p-3 mb-5 flex gap-3 text-xs text-amber-900 shadow-sm">
                <Info className="shrink-0 text-amber-600 mt-0.5" size={16} />
                <p><strong className="font-bold">Lưu ý:</strong> Vui lòng không yêu cầu chuyển khoản trước để nhận lại đồ. Hãy hẹn gặp ở nơi đông người (Phòng CTSV, Bảo vệ) để trao đổi.</p>
            </div>
          )}

          {canManage && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-5 flex items-center gap-2 text-xs text-blue-800 font-medium">
                <Shield size={16}/> Chế độ Quản trị viên: Hiển thị cả bài chưa duyệt.
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16"><Loader2 size={32} className="text-[#003375] animate-spin mb-3" /><p className="text-gray-500 text-sm">Đang tải...</p></div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center"><p className="font-bold mb-1 text-sm">Đã xảy ra lỗi</p><p className="text-xs">{error}</p></div>
          ) : (
            <div className="flex flex-col gap-4">
                {filteredItems.length > 0 ? (
                    filteredItems.map((item) => {
                        const isPending = item.status === 'pending';
                        const isResolved = item.status === 'resolved';

                        return (
                        <div key={item.id} className={`rounded-2xl shadow-sm border overflow-hidden relative flex flex-col ${
                            isResolved ? 'bg-gray-50 border-gray-200 opacity-90' : 
                            isPending ? 'bg-white border-yellow-300 ring-2 ring-yellow-50' : 'bg-white border-gray-200'
                        }`}>
                            <div className="aspect-[16/9] w-full bg-gray-100 relative overflow-hidden" onClick={() => { playClick(); setSelectedItem(item); }}>
                                {item.image_url ? (
                                    <img src={item.image_url} alt="Item" className={`w-full h-full object-cover ${isResolved ? 'grayscale opacity-70' : ''}`} loading="lazy" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50"><ImageOff size={32} className="mb-2 opacity-30" /><span className="text-xs font-medium">Không có ảnh đính kèm</span></div>
                                )}
                                <div className="absolute top-3 right-3 bg-black/60 text-white text-[10px] font-medium px-2 py-1 rounded-md flex items-center gap-1"><Calendar size={12} /> {new Date(item.created_at).toLocaleDateString('vi-VN')}</div>
                                
                                <div className={`absolute top-3 left-3 text-[10px] font-bold px-2.5 py-1 rounded-md shadow-sm uppercase tracking-wide border ${
                                    isResolved ? 'bg-green-100 text-green-800 border-green-200' :
                                    item.type === 'FOUND' ? 'bg-blue-100 text-[#003375] border-blue-200' : 'bg-red-100 text-[#990000] border-red-200'
                                }`}>
                                    {isResolved ? (item.type === 'FOUND' ? 'Đã trao trả' : 'Đã tìm thấy') : (item.type === 'FOUND' ? 'Nhặt được' : 'Đang tìm')}
                                </div>

                                {isPending && <div className="absolute bottom-3 right-3 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-1 rounded-md shadow-md">Chờ duyệt</div>}
                            </div>

                            <div className="p-4 flex flex-col">
                                <h3 className={`text-base font-bold flex items-start gap-2 leading-tight mb-2 line-clamp-2 ${
                                    isResolved ? 'text-green-700' : item.type === 'FOUND' ? 'text-[#003375]' : 'text-[#990000]'
                                }`}>
                                    {isResolved ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : (item.type === 'FOUND' ? <MapPin size={18} className="shrink-0 mt-0.5" /> : <Tag size={18} className="shrink-0 mt-0.5" />)}
                                    {item.title}
                                </h3>
                                
                                <div className="flex items-center gap-1 text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                    <MapPin size={14} className="shrink-0 text-gray-400"/>
                                    <span className="truncate">Khu vực: <span className="font-semibold text-gray-700">{item.location}</span></span>
                                </div>

                                <div className={`flex items-center gap-2 p-2.5 rounded-xl border ${isResolved ? 'bg-green-50 border-green-100' : (item.type === 'FOUND' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100')}`}>
                                    {item.type === 'FOUND' ? <User size={16} className={isResolved ? "text-green-700" : "text-[#003375]"} /> : <HelpCircle size={16} className={isResolved ? "text-green-700" : "text-[#990000]"} />}
                                    <span className="text-xs font-medium text-gray-600 shrink-0">{item.type === 'FOUND' ? 'Người nhặt:' : 'Người mất:'}</span>
                                    <span className="text-sm font-bold truncate flex-1">{item.user_name}</span>
                                </div>
                            </div>

                            {/* CÁC NÚT THAO TÁC */}
                            <div className="px-4 pb-4 pt-0 flex flex-col gap-2">
                                {session?.user?.id === item.user_id && (
                                    <div className="flex gap-2">
                                        {!isResolved && (
                                            <button onClick={(e) => { e.stopPropagation(); handleResolve(item.id); }} className="flex-1 py-2.5 bg-green-50 active:bg-green-100 text-green-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-green-200">
                                                <CheckCircle2 size={16} /> Đã xong
                                            </button>
                                        )}
                                        <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} className="flex-1 py-2.5 bg-red-50 active:bg-red-100 text-red-600 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-red-200">
                                            <Trash2 size={16} /> Xóa bài
                                        </button>
                                    </div>
                                )}

                                <button onClick={() => { playClick(); setSelectedItem(item); }} className="w-full py-3 bg-gray-50 active:bg-gray-100 text-gray-700 rounded-xl text-sm font-bold flex items-center justify-center gap-2 border border-gray-200">
                                    <MessageSquare size={16} className="text-[#003375]" /> Xem chi tiết & Liên hệ
                                </button>
                            </div>

                            {canManage && (
                                <div className="px-4 pb-4 flex gap-2">
                                    {isPending && (
                                        <button onClick={() => handleApprove(item.id)} className="flex-1 py-2 bg-green-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1">
                                            <CheckCircle2 size={14} /> Duyệt
                                        </button>
                                    )}
                                    <button onClick={() => handleEdit(item)} className="flex-1 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center justify-center gap-1">
                                        <Edit2 size={14} /> Sửa
                                    </button>
                                    {isAdmin && (
                                        <button onClick={() => handleDelete(item)} className="py-2 px-3 bg-red-50 text-red-600 border border-red-200 rounded-lg flex items-center justify-center">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )})
                ) : (
                    <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-gray-300">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-300">{activeTab === 'FOUND' ? <Search size={32} /> : <Megaphone size={32} />}</div>
                        <p className="text-gray-500 font-medium text-sm">Chưa có tin nào.</p>
                        <p className="text-gray-400 text-xs mt-1">Hãy là người đầu tiên đăng tin!</p>
                    </div>
                )}
            </div>
          )}
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
      />
    </div>
  );
};
