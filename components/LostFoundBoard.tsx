import React, { useEffect, useState, useRef } from 'react';
import Papa from 'papaparse';
import { Search, MapPin, Calendar, User, Phone, ExternalLink, Loader2, ImageOff, PlusCircle, RefreshCw, Info, HelpCircle, Tag, Megaphone, MessageCircle, Send, X, Clock } from 'lucide-react';
import { playClick } from '../utils/audio';
import { supabase } from '../utils/supabase';
import { generateRandomName, getRandomColorClass } from '../utils/nameGenerator';
import { createPortal } from 'react-dom';

// Existing "Found" Items Sheet
const FOUND_ITEMS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQhNOxdpNzVKa64MndmleEp9g56r4vK7JXPrtjwW1-OqIiptCZztmadjDi2OewRr3j6dEPcshPR9Wz3/pub?output=tsv';
const REPORT_FOUND_FORM_URL = 'https://forms.gle/rF8riZ8N6SDobu3w5';

// New "Lost" Items Sheet
const LOST_ITEMS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSpo9UYxB4Xto2uPUDZPY4yPRTi9aMEp-LzOld7SPlfIyXEg438Y36dwnCBjWE36Ts6Dexz1qsBBX1l/pub?output=tsv';
const REPORT_LOST_FORM_URL = 'https://forms.gle/qbJXdJ7R81NDJBno6';

interface BoardItem {
  id: string;
  type: 'found' | 'lost'; 
  timestamp: string;
  personName: string;     
  mainInfo: string;       
  contact: string;
  imageUrl: string | null;
}

interface Comment {
  id: number;
  post_id: string;
  content: string;
  user_display_name: string;
  created_at: string;
  is_anonymous: boolean;
  avatarColor?: string; // Client-side only
}

// Helper to convert Drive links to direct image links
const getGoogleDriveDirectLink = (url: string): string | null => {
  if (!url) return null;
  const idMatch = url.match(/[-\w]{25,}/);
  if (!idMatch) return null;
  return `https://lh3.googleusercontent.com/d/${idMatch[0]}`;
};

// --- SUB-COMPONENT: Item Detail Modal with Comments ---
const ItemDetailModal = ({ item, onClose }: { item: BoardItem, onClose: () => void }) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [sessionName, setSessionName] = useState('');
    const commentsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Create a random name for this session if not exists
        let storedName = localStorage.getItem('hub_anon_name');
        if (!storedName) {
            storedName = generateRandomName();
            localStorage.setItem('hub_anon_name', storedName);
        }
        setSessionName(storedName);
        fetchComments();
    }, [item.id]);

    const fetchComments = async () => {
        try {
            const { data, error } = await supabase
                .from('comments')
                .select('*')
                .eq('post_id', item.id)
                .order('created_at', { ascending: true });
            
            if (error) throw error;
            
            // Assign random colors for UI based on name hash (simple approach)
            const processed = (data || []).map((c: any) => ({
                ...c,
                avatarColor: getRandomColorClass()
            }));
            setComments(processed);
        } catch (err) {
            console.error("Error fetching comments:", err);
        } finally {
            setLoadingComments(false);
            scrollToBottom();
        }
    };

    const scrollToBottom = () => {
        setTimeout(() => {
            commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;

        setSubmitting(true);
        playClick();

        try {
            const { error } = await supabase
                .from('comments')
                .insert([
                    {
                        post_id: item.id,
                        content: newComment.trim(),
                        user_display_name: sessionName,
                        is_anonymous: true
                    }
                ]);

            if (error) throw error;

            setNewComment('');
            fetchComments(); // Refresh list
        } catch (err) {
            console.error("Error posting comment:", err);
            alert("Không thể gửi bình luận. Vui lòng thử lại.");
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden animate-scaleIn border border-gray-200">
                
                {/* Close Button Mobile */}
                <button onClick={onClose} className="absolute top-2 right-2 p-2 bg-black/50 text-white rounded-full md:hidden z-50">
                    <X size={20} />
                </button>

                {/* Left Side: Item Details */}
                <div className="md:w-1/2 bg-gray-50 flex flex-col overflow-y-auto border-r border-gray-200">
                     <div className="relative aspect-video bg-black">
                        {item.imageUrl ? (
                            <img src={item.imageUrl} alt="Item" className="w-full h-full object-contain" />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                <ImageOff size={48} className="mb-2 opacity-50" />
                                <span className="text-sm">Không có hình ảnh</span>
                            </div>
                        )}
                        <div className={`absolute top-4 left-4 text-xs font-bold px-3 py-1 rounded-full shadow-md uppercase tracking-wider ${item.type === 'found' ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'}`}>
                            {item.type === 'found' ? 'Đồ nhặt được' : 'Đồ thất lạc'}
                        </div>
                     </div>
                     
                     <div className="p-6">
                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                             <Clock size={12} /> {item.timestamp}
                        </div>
                        <h2 className="text-2xl font-bold text-gray-800 mb-4">{item.mainInfo}</h2>
                        
                        <div className="space-y-4">
                             <div className="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                                 <p className="text-xs text-gray-500 font-bold uppercase mb-1">{item.type === 'found' ? 'Người nhặt' : 'Người mất'}</p>
                                 <div className="flex items-center gap-2 text-gray-800 font-medium">
                                     <User size={18} className="text-[#003375]" /> {item.personName}
                                 </div>
                             </div>

                             <div className="p-4 bg-green-50 rounded-xl border border-green-200 shadow-sm">
                                 <p className="text-xs text-green-600 font-bold uppercase mb-1">Thông tin liên hệ</p>
                                 <div className="flex items-center gap-2 text-green-800 font-bold text-lg">
                                     <Phone size={18} /> {item.contact}
                                 </div>
                             </div>
                             
                             <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 text-sm text-yellow-800 flex items-start gap-2">
                                <Info size={16} className="shrink-0 mt-0.5" />
                                <p>Hãy gọi điện xác nhận kỹ các đặc điểm nhận dạng trước khi đến nhận đồ để tránh nhầm lẫn.</p>
                             </div>
                        </div>
                     </div>
                </div>

                {/* Right Side: Comments */}
                <div className="md:w-1/2 flex flex-col bg-white h-[50vh] md:h-auto">
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white z-10">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <MessageCircle size={20} className="text-[#003375]" />
                            Bình luận <span className="text-gray-400 font-normal text-sm">({comments.length})</span>
                        </h3>
                        <button onClick={onClose} className="hidden md:block hover:bg-gray-100 p-2 rounded-full transition-colors">
                            <X size={20} className="text-gray-500" />
                        </button>
                    </div>

                    {/* Comments List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-50/50">
                        {loadingComments ? (
                            <div className="flex justify-center py-10">
                                <Loader2 size={24} className="animate-spin text-gray-400" />
                            </div>
                        ) : comments.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">
                                <MessageCircle size={32} className="mx-auto mb-2 opacity-20" />
                                <p className="text-sm">Chưa có bình luận nào.<br/>Hãy là người đầu tiên!</p>
                            </div>
                        ) : (
                            comments.map((comment) => (
                                <div key={comment.id} className="flex gap-3 animate-fadeIn">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs ${comment.avatarColor || 'bg-gray-200'}`}>
                                        {comment.user_display_name.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm">
                                            <p className="text-xs font-bold text-[#003375] mb-0.5">{comment.user_display_name}</p>
                                            <p className="text-sm text-gray-700 leading-relaxed">{comment.content}</p>
                                        </div>
                                        <span className="text-[10px] text-gray-400 ml-2 mt-1 block">
                                            {new Date(comment.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={commentsEndRef} />
                    </div>

                    {/* Comment Input */}
                    <div className="p-4 border-t border-gray-100 bg-white">
                        <form onSubmit={handleSubmit} className="relative">
                            <input
                                type="text"
                                placeholder={`Bình luận dưới tên "${sessionName}"...`}
                                className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#003375] focus:border-[#003375] transition-all text-sm"
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                disabled={submitting}
                            />
                            <button 
                                type="submit"
                                disabled={submitting || !newComment.trim()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#003375] text-white rounded-lg hover:bg-[#002855] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                            >
                                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                        </form>
                         <p className="text-[10px] text-gray-400 mt-2 text-center flex items-center justify-center gap-1">
                            <Info size={10} /> Danh tính của bạn được ẩn danh hoàn toàn
                        </p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};


export const LostFoundBoard: React.FC = () => {
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'found' | 'lost'>('found');
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<BoardItem | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both sheets in parallel
      const [foundRes, lostRes] = await Promise.all([
        fetch(FOUND_ITEMS_SHEET_URL),
        fetch(LOST_ITEMS_SHEET_URL)
      ]);

      if (!foundRes.ok || !lostRes.ok) throw new Error('Không thể tải dữ liệu');

      const foundText = await foundRes.text();
      const lostText = await lostRes.text();

      const parsePromise = (text: string, type: 'found' | 'lost') => new Promise<BoardItem[]>((resolve) => {
        Papa.parse(text, {
            header: true,
            delimiter: '\t',
            skipEmptyLines: true,
            complete: (results) => {
                const parsed: BoardItem[] = results.data.map((row: any, index: number) => {
                    const keys = Object.keys(row);
                    const findVal = (keywords: string[]) => {
                        const key = keys.find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
                        return key ? row[key] : '';
                    };

                    const timestamp = findVal(['thời gian', 'time', 'timestamp']);
                    const contact = findVal(['sđt', 'liên hệ', 'contact', 'điện thoại']);
                    const originalLink = findVal(['ảnh', 'image', 'link', 'hình']);

                    let personName = '';
                    let mainInfo = '';

                    if (type === 'found') {
                        // Logic for Found Items (Existing)
                        personName = findVal(['tên', 'người nhặt', 'finder']) || 'Ẩn danh';
                        mainInfo = findVal(['địa điểm', 'khu vực', 'location']) || 'Không rõ';
                    } else {
                        // Logic for Lost Items (New)
                        // Col B: Tên người mất
                        // Col C: Vật phẩm mất tên
                        personName = findVal(['tên', 'người mất', 'owner', 'name']) || 'Ẩn danh';
                        mainInfo = findVal(['vật phẩm', 'tên đồ', 'item']) || 'Đồ thất lạc';
                    }

                    return {
                        id: `${type}-${index}`, // Unique ID for Supabase link
                        type,
                        timestamp,
                        personName,
                        mainInfo,
                        contact: contact || 'Liên hệ BTC',
                        imageUrl: getGoogleDriveDirectLink(originalLink)
                    };
                });
                resolve(parsed.reverse()); // Newest first
            }
        });
      });

      const [foundItems, lostItems] = await Promise.all([
          parsePromise(foundText, 'found'),
          parsePromise(lostText, 'lost')
      ]);

      setItems([...foundItems, ...lostItems]);
      setLoading(false);

    } catch (err) {
      console.error(err);
      setError('Lỗi kết nối máy chủ.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleImageError = (id: string) => {
    setImageErrors(prev => ({ ...prev, [id]: true }));
  };

  const filteredItems = items.filter(item => {
    const matchesTab = item.type === activeTab;
    const matchesSearch = 
        item.mainInfo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.personName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.timestamp.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="animate-slideInRight">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
           <h2 className="text-2xl font-bold text-[#003375] flex items-center gap-2">
             <Search className="text-[#990000]" />
             Góc Tìm Đồ Thất Lạc
           </h2>
           <p className="text-sm text-gray-500 mt-1">
             Kết nối người nhặt và người mất đồ tại HUB
           </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
            <div className="relative flex-1 sm:flex-none">
                <input
                    type="text"
                    placeholder="Tìm kiếm..."
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
                
                <a 
                    href={activeTab === 'found' ? REPORT_FOUND_FORM_URL : REPORT_LOST_FORM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={playClick}
                    className={`px-4 py-2 rounded-lg shadow-sm flex items-center gap-2 font-bold transition-all active:scale-95 hover:shadow-md whitespace-nowrap justify-center flex-1 ${activeTab === 'found' ? 'bg-[#003375] hover:bg-[#002855] text-white' : 'bg-[#990000] hover:bg-[#7a0000] text-white'}`}
                >
                    <PlusCircle size={18} />
                    {activeTab === 'found' ? 'Báo nhặt được đồ' : 'Báo mất đồ'}
                </a>
            </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-200 mb-6">
          <button
            onClick={() => { playClick(); setActiveTab('found'); }}
            className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 transition-all relative ${activeTab === 'found' ? 'text-[#003375]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <MapPin size={18} /> Tin nhặt được
            {activeTab === 'found' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#003375] rounded-t-full animate-scaleIn"></div>}
          </button>
          
          <button
            onClick={() => { playClick(); setActiveTab('lost'); }}
            className={`pb-3 px-4 text-sm font-bold flex items-center gap-2 transition-all relative ${activeTab === 'lost' ? 'text-[#990000]' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Megaphone size={18} /> Tin báo mất
            {activeTab === 'lost' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#990000] rounded-t-full animate-scaleIn"></div>}
          </button>
      </div>

      {/* Notice Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 flex items-start sm:items-center gap-3 text-sm text-amber-900 animate-fadeIn">
        <Info className="shrink-0 text-amber-600 mt-0.5 sm:mt-0" size={18} />
        <p>
            <strong>Lưu ý:</strong> Web chỉ lưu trữ đồ rơi trong vòng <strong>5-7 ngày</strong> tùy thuộc vào số lượng. Vui lòng liên hệ sớm nếu thấy thông tin.
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
                        className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-lg transition-all duration-300 group flex flex-col cursor-pointer ${item.type === 'found' ? 'border-gray-200 hover:border-blue-200' : 'border-red-100 ring-1 ring-red-50 hover:border-red-200'}`}
                        onClick={() => { playClick(); setSelectedItem(item); }}
                    >
                        {/* Image Section */}
                        <div className="aspect-video w-full bg-gray-100 relative overflow-hidden">
                            {item.imageUrl && !imageErrors[item.id] ? (
                                <img 
                                    src={item.imageUrl} 
                                    alt="Item" 
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    onError={() => handleImageError(item.id)}
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
                                <Calendar size={12} /> {item.timestamp}
                            </div>
                            
                            {/* Type Badge */}
                             <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-1 rounded-md shadow-sm uppercase tracking-wider ${item.type === 'found' ? 'bg-blue-100 text-[#003375]' : 'bg-red-100 text-[#990000]'}`}>
                                {item.type === 'found' ? 'Nhặt được' : 'Đang tìm'}
                            </div>
                        </div>

                        {/* Details Section */}
                        <div className="p-4 flex-1 flex flex-col">
                            <div className="mb-3">
                                <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
                                    {item.type === 'found' ? 'Địa điểm nhặt' : 'Vật phẩm bị mất'}
                                </div>
                                <h3 className={`text-lg font-bold flex items-start gap-2 leading-tight line-clamp-2 ${item.type === 'found' ? 'text-[#003375]' : 'text-[#990000]'}`}>
                                    {item.type === 'found' ? <MapPin size={18} className="shrink-0 mt-0.5" /> : <Tag size={18} className="shrink-0 mt-0.5" />}
                                    {item.mainInfo}
                                </h3>
                            </div>

                            <div className="space-y-2 text-sm text-gray-600 mt-auto">
                                <div className={`flex items-center gap-2 p-2 rounded-lg border ${item.type === 'found' ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                                    {item.type === 'found' ? <User size={14} className="text-[#003375]" /> : <HelpCircle size={14} className="text-[#990000]" />}
                                    <span className="font-medium text-gray-700">{item.type === 'found' ? 'Người nhặt:' : 'Người mất:'}</span>
                                    <span className="truncate">{item.personName}</span>
                                </div>
                            </div>
                            
                            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                                <span className="text-xs text-gray-400">Nhấn để xem chi tiết & bình luận</span>
                                <div className="flex items-center gap-1 text-[#003375] font-bold text-xs bg-blue-50 px-2 py-1 rounded-full">
                                    <MessageCircle size={12}/> Trao đổi
                                </div>
                            </div>
                        </div>
                    </div>
                ))
            ) : (
                <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                        {activeTab === 'found' ? <Search size={32} /> : <Megaphone size={32} />}
                    </div>
                    <p className="text-gray-500 font-medium">Không tìm thấy tin nào.</p>
                </div>
            )}
        </div>
      )}

      {selectedItem && (
          <ItemDetailModal 
            item={selectedItem} 
            onClose={() => { playClick(); setSelectedItem(null); }} 
          />
      )}
    </div>
  );
};
