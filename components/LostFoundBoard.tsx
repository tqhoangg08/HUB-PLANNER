import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { Search, MapPin, Calendar, User, Phone, Loader2, ImageOff, PlusCircle, RefreshCw, Info, HelpCircle, Tag, Megaphone, MessageSquare, X, Camera, UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
import { playClick } from '../utils/audio';
import { CommentSection } from './CommentSection';
import { createPortal } from 'react-dom';

// --- Types matching Supabase Table ---
interface LostFoundItem {
  id: number;
  created_at: string;
  type: 'FOUND' | 'LOST'; // Database Enum or Text
  title: string;          // Tên vật phẩm
  description: string;    // Mô tả chi tiết
  location: string;       // Khu vực
  contact_info: string;   // SĐT/FB
  user_name: string;      // Tên người đăng
  image_url: string | null;
  status: 'pending' | 'approved' | 'OPEN' | 'CLOSED';
}

export const LostFoundBoard: React.FC = () => {
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'FOUND' | 'LOST'>('FOUND');
  
  // Detail Modal State
  const [selectedItem, setSelectedItem] = useState<LostFoundItem | null>(null);

  // Submit Modal State
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitType, setSubmitType] = useState<'FOUND' | 'LOST'>('FOUND');
  
  // Notification Toast
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    
    if (!supabase) {
        setItems([]);
        setError("Chưa cấu hình Supabase.");
        setLoading(false);
        return;
    }

    try {
      const { data, error } = await supabase
        .from('lost_found_items')
        .select('*')
        // .eq('status', 'approved') // Đã bỏ bộ lọc duyệt tin
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
          setItems(data as LostFoundItem[]);
      }
    } catch (err: any) {
      console.error(err);
      setError('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  // Filter Logic
  const filteredItems = items.filter(item => {
    const matchesTab = item.type === activeTab;
    const matchesSearch = 
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const openSubmitModal = (type: 'FOUND' | 'LOST') => {
      playClick();
      setSubmitType(type);
      setShowSubmitModal(true);
  };

  const showToast = (msg: string, type: 'success' | 'error') => {
      setNotification({ msg, type });
      setTimeout(() => setNotification(null), 3000);
  };

  // --- SUBMIT MODAL COMPONENT ---
  const SubmitModal = () => {
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

      // Clean up object URL
      useEffect(() => {
          return () => {
              if (previewUrl) URL.revokeObjectURL(previewUrl);
          };
      }, [previewUrl]);

      const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          if (file) {
              if (file.size > 5 * 1024 * 1024) { // 5MB limit
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
              let imageUrl = null;

              // 1. Upload Image if exists
              if (imageFile) {
                  const fileExt = imageFile.name.split('.').pop();
                  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
                  const filePath = `${fileName}`;

                  const { error: uploadError } = await supabase.storage
                      .from('lost_found_images')
                      .upload(filePath, imageFile);

                  if (uploadError) throw uploadError;

                  // Get Public URL
                  const { data: { publicUrl } } = supabase.storage
                      .from('lost_found_images')
                      .getPublicUrl(filePath);
                  
                  imageUrl = publicUrl;
              }

              // 2. Insert Record via RPC
              const { error: insertError } = await supabase.rpc('submit_lost_found_item', {
                  p_title: formData.title,
                  p_description: formData.description,
                  p_location: formData.location,
                  p_contact_info: formData.contact_info,
                  p_user_name: formData.user_name || 'Ẩn danh',
                  p_image_url: imageUrl,
                  p_type: submitType
              });

              if (insertError) throw insertError;

              // 3. Success
              showToast("Đăng tin thành công!", 'success');
              setShowSubmitModal(false);
              fetchItems(); // Reload list immediately

          } catch (err: any) {
              console.error(err);
              showToast("Lỗi khi đăng tin: " + err.message, 'error');
          } finally {
              setIsSubmitting(false);
          }
      };

      return createPortal(
          <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
              <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scaleIn">
                  <div className={`p-4 text-white flex justify-between items-center shrink-0 ${submitType === 'FOUND' ? 'bg-[#003375]' : 'bg-[#990000]'}`}>
                      <h3 className="font-bold text-lg flex items-center gap-2">
                          {submitType === 'FOUND' ? <PlusCircle size={20}/> : <Megaphone size={20}/>}
                          {submitType === 'FOUND' ? 'Đăng tin Nhặt được đồ' : 'Đăng tin Báo mất đồ'}
                      </h3>
                      <button onClick={() => setShowSubmitModal(false)} className="hover:bg-white/20 p-2 rounded-full transition-colors"><X size={20}/></button>
                  </div>

                  <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                      {/* Image Upload Area */}
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
                              <input 
                                  type="file" 
                                  ref={fileInputRef} 
                                  className="hidden" 
                                  accept="image/*" 
                                  onChange={handleFileChange}
                              />
                              {previewUrl && (
                                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                      <span className="text-white text-sm font-bold flex items-center gap-1"><UploadCloud size={16}/> Thay đổi</span>
                                  </div>
                              )}
                          </div>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Tên vật phẩm <span className="text-red-500">*</span></label>
                          <input type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none" placeholder="VD: Chìa khóa xe, Ví tiền..." value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">{submitType === 'FOUND' ? 'Khu vực nhặt' : 'Khu vực mất'} <span className="text-red-500">*</span></label>
                              <div className="relative">
                                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                  <input type="text" required className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none" placeholder="VD: Nhà xe, A104..." value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} />
                              </div>
                          </div>
                          <div>
                              <label className="block text-sm font-bold text-gray-700 mb-1">Tên của bạn</label>
                              <div className="relative">
                                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
                                  <input type="text" required className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none" placeholder="Tên hiển thị" value={formData.user_name} onChange={e => setFormData({...formData, user_name: e.target.value})} />
                              </div>
                          </div>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Thông tin liên hệ <span className="text-red-500">*</span></label>
                          <input type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none" placeholder="SĐT hoặc Link Facebook..." value={formData.contact_info} onChange={e => setFormData({...formData, contact_info: e.target.value})} />
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-gray-700 mb-1">Mô tả chi tiết</label>
                          <textarea rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] outline-none resize-none" placeholder="Màu sắc, đặc điểm nhận dạng, thời gian..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}></textarea>
                      </div>

                      <button type="submit" disabled={isSubmitting} className={`w-full py-3 rounded-xl font-bold text-white shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-2 ${submitType === 'FOUND' ? 'bg-[#003375] hover:bg-[#002855]' : 'bg-[#990000] hover:bg-[#7a0000]'}`}>
                          {isSubmitting ? <Loader2 className="animate-spin"/> : <UploadCloud size={20}/>}
                          {isSubmitting ? 'Đang gửi...' : 'Đăng tin ngay'}
                      </button>
                  </form>
              </div>
          </div>,
          document.body
      );
  };

  // --- DETAIL MODAL COMPONENT ---
  const ItemDetailModal = () => {
    if (!selectedItem) return null;

    return createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white w-full max-w-6xl h-[90vh] md:h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative animate-scaleIn">
                <button 
                    onClick={() => { playClick(); setSelectedItem(null); }}
                    className="absolute top-4 right-4 z-50 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors active:scale-90"
                >
                    <X size={20} />
                </button>

                {/* LEFT: Info */}
                <div className="w-full md:w-[40%] bg-gray-50 flex flex-col border-b md:border-b-0 md:border-r border-gray-200 overflow-y-auto custom-scrollbar shrink-0 h-[45%] md:h-full">
                    <div className="w-full bg-black/5 flex items-center justify-center relative min-h-[200px] md:min-h-[300px]">
                         {selectedItem.image_url ? (
                            <img 
                                src={selectedItem.image_url} 
                                alt="Item" 
                                className="w-full h-full object-contain max-h-[40vh] md:max-h-[50vh]"
                            />
                        ) : (
                            <div className="flex flex-col items-center text-gray-400 py-10">
                                <ImageOff size={48} className="mb-2 opacity-50" />
                                <span className="text-sm">Không có ảnh</span>
                            </div>
                        )}
                        <div className={`absolute top-4 left-4 text-xs font-bold px-3 py-1.5 rounded-md shadow-sm uppercase tracking-wider ${selectedItem.type === 'FOUND' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'}`}>
                            {selectedItem.type === 'FOUND' ? 'Đồ nhặt được' : 'Đang tìm kiếm'}
                        </div>
                    </div>

                    <div className="p-6 space-y-4">
                        <div>
                            <h3 className={`text-2xl font-bold flex items-start gap-2 leading-tight ${selectedItem.type === 'FOUND' ? 'text-[#003375]' : 'text-[#990000]'}`}>
                                {selectedItem.type === 'FOUND' ? <MapPin size={24} className="shrink-0 mt-1" /> : <Tag size={24} className="shrink-0 mt-1" />}
                                {selectedItem.title}
                            </h3>
                            <div className="flex items-center gap-2 text-gray-500 text-sm mt-2">
                                <Calendar size={14} />
                                <span>Ngày đăng: {new Date(selectedItem.created_at).toLocaleDateString('vi-VN')}</span>
                            </div>
                        </div>

                        <div className="bg-white p-3 rounded-xl border border-gray-200 text-sm text-gray-700 italic">
                            "{selectedItem.description || 'Không có mô tả chi tiết'}"
                        </div>

                        <div className="space-y-3 pt-4 border-t border-gray-200">
                             <div className={`flex items-center gap-3 p-3 rounded-xl border ${selectedItem.type === 'FOUND' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedItem.type === 'FOUND' ? 'bg-blue-200 text-[#003375]' : 'bg-red-200 text-[#990000]'}`}>
                                    {selectedItem.type === 'FOUND' ? <User size={20} /> : <HelpCircle size={20} />}
                                </div>
                                <div>
                                    <span className="block text-xs text-gray-500 font-bold uppercase">{selectedItem.type === 'FOUND' ? 'Người nhặt' : 'Người mất'}</span>
                                    <span className="font-bold text-gray-800 text-lg">{selectedItem.user_name}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-xl border border-green-200 bg-green-50">
                                <div className="w-10 h-10 rounded-full bg-green-200 text-green-800 flex items-center justify-center">
                                    <Phone size={20} />
                                </div>
                                <div>
                                    <span className="block text-xs text-gray-500 font-bold uppercase">Liên hệ</span>
                                    <span className="font-bold text-green-700 text-lg">{selectedItem.contact_info}</span>
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-2 text-sm text-gray-600 mt-2">
                                <MapPin size={16} className="mt-0.5 shrink-0" />
                                <span>Khu vực: <strong>{selectedItem.location}</strong></span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: Comments */}
                <div className="w-full md:w-[60%] h-[55%] md:h-full bg-white flex flex-col relative z-0">
                    <CommentSection 
                        contextId={`lost_found_${selectedItem.id}`} 
                        title={selectedItem.type === 'FOUND' ? 'Trao đổi nhận đồ' : 'Manh mối / Hỏi thăm'}
                        className="flex flex-col h-full bg-white"
                    />
                </div>
            </div>
        </div>,
        document.body
    );
  };

  return (
    <div className="animate-slideInRight">
      {/* Toast Notification */}
      {notification && createPortal(
          <div className={`fixed top-4 right-4 z-[100000] px-4 py-3 rounded-xl shadow-2xl border-l-4 flex items-center gap-3 animate-slideInRight bg-white ${notification.type === 'success' ? 'border-green-500' : 'border-red-500'}`}>
              {notification.type === 'success' ? <CheckCircle2 className="text-green-600"/> : <AlertCircle className="text-red-600"/>}
              <div>
                  <h4 className={`font-bold text-sm ${notification.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>{notification.type === 'success' ? 'Thành công' : 'Thất bại'}</h4>
                  <p className="text-xs text-gray-600">{notification.msg}</p>
              </div>
          </div>,
          document.body
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
           <h2 className="text-2xl font-bold text-[#003375] flex items-center gap-2">
             <Search className="text-[#990000]" />
             Góc Tìm Đồ Thất Lạc
           </h2>
           <p className="text-sm text-gray-500 mt-1">
             Kết nối người nhặt và người mất đồ tại HUB (Cơ sở Thủ Đức & Quận 1)
           </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <div className="relative flex-1 sm:flex-none">
                <input
                    type="text"
                    placeholder="Tìm tên đồ, địa điểm..."
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none w-full sm:w-64 transition-all hover:border-blue-300"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            </div>

            <div className="flex gap-2">
                <button 
                    onClick={() => { playClick(); fetchItems(); }}
                    className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-[#003375] transition-all active:scale-95 hover:rotate-180 duration-500"
                    title="Làm mới"
                >
                    <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                </button>
                
                <button 
                    onClick={() => openSubmitModal(activeTab)}
                    className={`px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 font-bold transition-all active:scale-95 hover:shadow-md whitespace-nowrap justify-center flex-1 ${activeTab === 'FOUND' ? 'bg-[#003375] hover:bg-[#002855] text-white' : 'bg-[#990000] hover:bg-[#7a0000] text-white'}`}
                >
                    <PlusCircle size={18} />
                    {activeTab === 'FOUND' ? 'Đăng tin Nhặt được' : 'Đăng tin Báo mất'}
                </button>
            </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 mb-6">
          <button
            onClick={() => { playClick(); setActiveTab('FOUND'); }}
            className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 transition-all relative ${activeTab === 'FOUND' ? 'text-[#003375]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <MapPin size={18} /> Tin nhặt được
            {activeTab === 'FOUND' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#003375] rounded-t-full animate-scaleIn"></div>}
          </button>
          
          <button
            onClick={() => { playClick(); setActiveTab('LOST'); }}
            className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 transition-all relative ${activeTab === 'LOST' ? 'text-[#990000]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Megaphone size={18} /> Tin báo mất
            {activeTab === 'LOST' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#990000] rounded-t-full animate-scaleIn"></div>}
          </button>
      </div>

      {/* Notice Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-start sm:items-center gap-3 text-sm text-amber-900 animate-fadeIn">
        <Info className="shrink-0 text-amber-600 mt-0.5 sm:mt-0" size={18} />
        <p>
            <strong>Lưu ý:</strong> Vui lòng không yêu cầu chuyển khoản trước để nhận lại đồ. Hãy hẹn gặp ở nơi đông người (Phòng CTSV, Bảo vệ) để trao đổi.
        </p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
          <Loader2 size={40} className="text-[#003375] animate-spin mb-4" />
          <p className="text-gray-500">Đang tải danh sách...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center animate-fadeIn">
          <p className="font-bold mb-2">Đã xảy ra lỗi</p>
          <p>{error}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
            {filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                    <div 
                        key={item.id} 
                        className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-lg transition-all duration-300 group flex flex-col ${item.type === 'FOUND' ? 'border-gray-200' : 'border-red-100 ring-1 ring-red-50'}`}
                    >
                        {/* Image Section */}
                        <div 
                            className="aspect-video w-full bg-gray-100 relative overflow-hidden cursor-pointer"
                            onClick={() => { playClick(); setSelectedItem(item); }}
                        >
                            {item.image_url ? (
                                <img 
                                    src={item.image_url} 
                                    alt="Item" 
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                                    <ImageOff size={32} className="mb-2 opacity-50" />
                                    <span className="text-xs">Không có ảnh</span>
                                </div>
                            )}
                            
                            {/* Timestamp Badge */}
                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
                                <Calendar size={12} /> {new Date(item.created_at).toLocaleDateString('vi-VN')}
                            </div>
                            
                            {/* Type Badge */}
                             <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-1 rounded-md shadow-sm uppercase tracking-wider ${item.type === 'FOUND' ? 'bg-blue-100 text-[#003375]' : 'bg-red-100 text-[#990000]'}`}>
                                {item.type === 'FOUND' ? 'Nhặt được' : 'Đang tìm'}
                            </div>
                        </div>

                        {/* Details Section */}
                        <div className="p-4 flex-1 flex flex-col">
                            <div className="mb-3">
                                <h3 className={`text-lg font-bold flex items-start gap-2 leading-tight line-clamp-1 ${item.type === 'FOUND' ? 'text-[#003375]' : 'text-[#990000]'}`}>
                                    {item.type === 'FOUND' ? <MapPin size={18} className="shrink-0 mt-0.5" /> : <Tag size={18} className="shrink-0 mt-0.5" />}
                                    {item.title}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1 line-clamp-1 flex items-center gap-1">
                                    <MapPin size={12}/> Khu vực: {item.location}
                                </p>
                            </div>

                            <div className="space-y-2 text-sm text-gray-600 mt-auto">
                                <div className={`flex items-center gap-2 p-2 rounded-lg border ${item.type === 'FOUND' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                    {item.type === 'FOUND' ? <User size={14} className="text-[#003375]" /> : <HelpCircle size={14} className="text-[#990000]" />}
                                    <span className="font-medium text-gray-700">{item.type === 'FOUND' ? 'Người nhặt:' : 'Người mất:'}</span>
                                    <span className="truncate flex-1">{item.user_name}</span>
                                </div>
                            </div>
                        </div>

                        {/* Comment Button Trigger */}
                        <div className="px-4 pb-4">
                            <button
                                onClick={() => {
                                    playClick();
                                    setSelectedItem(item);
                                }}
                                className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-[#003375] rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors border border-gray-200"
                            >
                                <MessageSquare size={16} />
                                💬 Chi tiết & Liên hệ
                            </button>
                        </div>
                    </div>
                ))
            ) : (
                <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                        {activeTab === 'FOUND' ? <Search size={32} /> : <Megaphone size={32} />}
                    </div>
                    <p className="text-gray-500 font-medium">Chưa có tin nào. Hãy là người đầu tiên đăng tin!</p>
                </div>
            )}
        </div>
      )}
      
      {showSubmitModal && <SubmitModal />}
      {selectedItem && <ItemDetailModal />}
    </div>
  );
};
