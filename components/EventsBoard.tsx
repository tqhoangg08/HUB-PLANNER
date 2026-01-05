import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Papa from 'papaparse';
import { Search, Calendar, MapPin, Award, ExternalLink, Loader2, RefreshCw, Users, Clock, Filter, Tag, AlertCircle, FileText, X, PlusCircle, Sparkles, Hourglass, GraduationCap, BookOpen, Phone, Send, User, Link as LinkIcon, Type, CheckCircle2 } from 'lucide-react';
import { playClick } from '../utils/audio';

const GOOGLE_SHEET_TSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTFfOrgITNGNMq-_wu7TEBQshWl7SOi080vX97Z2QKB6LyfQIicz6lZN9m62s2abF8XPQriTdOTBWoi/pub?output=tsv';

interface HubEvent {
  id: string;
  name: string;      // Tên sự kiện
  category: string;  // Mục (I, II...)
  score: string;     // Điểm số
  location: string;  // Hình thức
  time: string;      // Hạn tham gia (hiển thị)
  deadlineDate: Date | null; // Hạn tham gia (để check expired)
  link: string;      // Link tham gia
  organizer: string; // BTC
  type: string;      // Phân loại
}

const CATEGORIES = [
    { id: 'all', label: 'Tất cả', desc: 'Toàn bộ sự kiện' },
    { id: 'I', label: 'Mục I', desc: 'Học tập & NCKH' },
    { id: 'II', label: 'Mục II', desc: 'Chấp hành quy chế' },
    { id: 'III', label: 'Mục III', desc: 'Hoạt động CT-XH' },
    { id: 'IV', label: 'Mục IV', desc: 'Phẩm chất công dân' },
    { id: 'V', label: 'Mục V', desc: 'Cán bộ & Khác' },
];

// Helper to parse Vietnamese date format dd/mm/yyyy or dd/mm/yyyy HH:mm
const parseVietnameseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    try {
        // Extract date part: 20/10/2023...
        const matches = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (matches) {
            const day = parseInt(matches[1], 10);
            const month = parseInt(matches[2], 10) - 1; // Month is 0-indexed
            const year = parseInt(matches[3], 10);
            const date = new Date(year, month, day);
            // Set to end of day to be lenient
            date.setHours(23, 59, 59, 999);
            return date;
        }
        return null;
    } catch (e) {
        return null;
    }
};

export const EventsBoard: React.FC = () => {
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showScoreGuide, setShowScoreGuide] = useState(false);
  const [showRecruitModal, setShowRecruitModal] = useState(false);
  const [showContributeModal, setShowContributeModal] = useState(false);
  
  // Notification State
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 4000);
  };

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(GOOGLE_SHEET_TSV_URL);
      if (!response.ok) throw new Error('Không thể tải dữ liệu');
      const text = await response.text();

      Papa.parse(text, {
        header: true,
        delimiter: '\t',
        skipEmptyLines: true,
        complete: (results) => {
          const parsedEvents: HubEvent[] = results.data.map((row: any, index: number) => {
            const keys = Object.keys(row);
            
            // Helper to find key case-insensitively
            // Match exactly or strictly contains keyword
            const findKey = (keywords: string[]) => keys.find(k => keywords.some(kw => k.toLowerCase().trim() === kw.toLowerCase()));
            
            // 1. Tên sự kiện
            const name = row[findKey(['Tên sự kiện', 'Tên'])] || 'Sự kiện chưa có tên';
            
            // 2. Mục (I, II, III...) - Logic phân loại chặt chẽ
            let catRaw = row[findKey(['Mục', 'Mục ĐRL'])] || '';
            let category = 'Khác';
            const catUpper = catRaw.toString().trim().toUpperCase();

            // Sử dụng Regex Word Boundary (\b) để đảm bảo khớp chính xác
            // Ví dụ: \bII\b khớp "II", "Mục II" nhưng KHÔNG khớp "III"
            if (/\bIII\b/.test(catUpper) || /\b3\b/.test(catUpper)) {
                category = 'III';
            } else if (/\bII\b/.test(catUpper) || /\b2\b/.test(catUpper)) {
                category = 'II';
            } else if (/\bIV\b/.test(catUpper) || /\b4\b/.test(catUpper)) {
                category = 'IV';
            } else if (/\bV\b/.test(catUpper) || /\b5\b/.test(catUpper)) {
                category = 'V';
            } else if (/\bI\b/.test(catUpper) || /\b1\b/.test(catUpper)) {
                category = 'I';
            }

            // 3. Điểm số
            const score = row[findKey(['Điểm số', 'Điểm'])] || '0';

            // 4. Hình thức -> Location
            const location = row[findKey(['Hình thức', 'Địa điểm'])] || 'Online/Offline';

            // 5. Hạn tham gia -> Time
            const timeRaw = row[findKey(['Hạn tham gia', 'Thời gian', 'Deadline'])] || '';
            const deadlineDate = parseVietnameseDate(timeRaw);

            // 6. Link tham gia
            const link = row[findKey(['Link tham gia', 'Link', 'Liên kết'])] || '';

            // 7. BTC
            const organizer = row[findKey(['BTC', 'Ban tổ chức', 'Đơn vị'])] || 'HUB';

            // 8. Phân loại
            const type = row[findKey(['Phân loại', 'Loại hình'])] || '';

            return {
              id: `evt-${index}`,
              name,
              category,
              score,
              location,
              time: timeRaw,
              deadlineDate,
              link,
              organizer,
              type
            };
          });
          
          // Filter out empty rows if any
          const validEvents = parsedEvents.filter(e => e.name !== 'Sự kiện chưa có tên' || e.link !== '');
          
          setEvents(validEvents);
          setLastUpdated(new Date());
          setLoading(false);
        },
        error: (err: any) => {
          console.error(err);
          setError('Lỗi phân tích dữ liệu.');
          setLoading(false);
        }
      });
    } catch (err) {
      console.error(err);
      setError('Lỗi kết nối đến Google Sheet.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const filteredEvents = events.filter(evt => {
    const matchesSearch = evt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.organizer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.type.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Logic lọc Tab: So sánh chính xác chuỗi category đã parse ('I', 'II', etc.)
    const matchesTab = activeTab === 'all' || evt.category === activeTab;
    
    return matchesSearch && matchesTab;
  });

  const now = new Date();

  // 1. Sự kiện đã kết thúc: Có deadline và deadline < hiện tại
  const expiredEvents = filteredEvents.filter(evt => evt.deadlineDate && evt.deadlineDate < now);

  // 2. Sự kiện sắp diễn ra (Dự kiến): KHÔNG có deadline VÀ KHÔNG có link
  const upcomingEvents = filteredEvents.filter(evt => !evt.deadlineDate && (!evt.link || evt.link.trim() === ''));

  // 3. Sự kiện đang diễn ra: 
  // - Hoặc có deadline tương lai
  // - Hoặc không có deadline nhưng có link (Link mở vô thời hạn)
  const activeEvents = filteredEvents.filter(evt => {
      const isExpired = evt.deadlineDate && evt.deadlineDate < now;
      const isUpcoming = !evt.deadlineDate && (!evt.link || evt.link.trim() === '');
      return !isExpired && !isUpcoming;
  });

  const NotificationToast = () => {
    if (!notification) return null;
    
    return createPortal(
        <div className={`fixed top-4 right-4 z-[100000] max-w-sm w-full bg-white rounded-xl shadow-2xl border-l-4 p-4 flex items-center gap-3 animate-slideInRight ${notification.type === 'success' ? 'border-green-500' : 'border-red-500'}`}>
            <div className={`p-2 rounded-full ${notification.type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {notification.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
            </div>
            <div className="flex-1">
                <h4 className={`font-bold ${notification.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
                    {notification.type === 'success' ? 'Thành công!' : 'Thất bại'}
                </h4>
                <p className="text-sm text-gray-600">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
            </button>
        </div>,
        document.body
    );
  };

  const RecruitFormModal = () => {
      const [formData, setFormData] = useState({
          name: '',
          cohort: '',
          major: '',
          contact: ''
      });
      const [isSubmitting, setIsSubmitting] = useState(false);

      // Lock body scroll when modal is open
      useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
      }, []);

      const handleSubmit = async (e: React.FormEvent) => {
          e.preventDefault();
          playClick();

          if (!formData.name.trim() || !formData.contact.trim()) {
            showToast("Vui lòng nhập Họ tên và Thông tin liên hệ!", 'error');
            return;
          }

          setIsSubmitting(true);
          
          const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwRiiNZHv3rUfBqONmYQ_cxr3NKT32qEt5puiTYmiiAVybFuKVlC5YcUoEM5tomL7jY/exec';

          try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    hoTen: formData.name,
                    khoa: formData.cohort,
                    nganh: formData.major,
                    lienHe: formData.contact
                })
            });
            
            showToast(`Cảm ơn ${formData.name}! Đăng ký thành công.`, 'success');
            setFormData({ name: '', cohort: '', major: '', contact: '' });
            setShowRecruitModal(false);
          } catch (err) {
            console.error(err);
            showToast("Có lỗi kết nối. Vui lòng thử lại sau.", 'error');
          } finally {
            setIsSubmitting(false);
          }
      };

      return createPortal(
        <div className="fixed top-0 left-0 w-full h-full z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 animate-scaleIn overflow-hidden relative">
                <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 p-6 text-white relative">
                    <button 
                        onClick={() => { playClick(); setShowRecruitModal(false); }}
                        className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors active:scale-95"
                    >
                        <X size={20} />
                    </button>
                    <h3 className="text-2xl font-bold flex items-center gap-2 mb-2">
                        <Sparkles size={24} className="text-yellow-300" />
                        Đăng ký CTV
                    </h3>
                    <p className="text-violet-100 text-sm">Cùng nhau xây dựng cộng đồng HUB Planner vững mạnh!</p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Họ và tên</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input 
                                type="text"
                                required
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                placeholder="Nhập họ tên của bạn"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Khóa</label>
                            <div className="relative">
                                <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    type="text"
                                    required
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                    placeholder="VD: K38"
                                    value={formData.cohort}
                                    onChange={e => setFormData({...formData, cohort: e.target.value})}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Ngành học</label>
                            <div className="relative">
                                <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    type="text"
                                    required
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                    placeholder="VD: TCNH"
                                    value={formData.major}
                                    onChange={e => setFormData({...formData, major: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Thông tin liên hệ</label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input 
                                type="text"
                                required
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
                                placeholder="Link Facebook, Zalo hoặc SĐT..."
                                value={formData.contact}
                                onChange={e => setFormData({...formData, contact: e.target.value})}
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1 italic">Chúng mình sẽ liên hệ với bạn qua kênh này.</p>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" size={20}/> : <Send size={20} />}
                        {isSubmitting ? 'Đang gửi...' : 'Xác nhận đăng ký'}
                    </button>
                </form>
            </div>
        </div>,
        document.body
      );
  };

  const ContributeEventModal = () => {
    const [formData, setFormData] = useState({
        tenSuKien: '',
        phanLoai: '',
        muc: '',
        diem: '',
        hinhThuc: 'Offline',
        btc: '',
        hanThamGia: '',
        link: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Lock body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        playClick();

        // Validation
        if (!formData.tenSuKien || !formData.link) {
            showToast("Vui lòng nhập Tên sự kiện và Link bài viết!", 'error');
            return;
        }

        setIsSubmitting(true);
        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyMfssEtyn7vQGNN3Gzy0QQivHaMPQUiUnmnP_mS3Lb5T86k8dMZGQSslVPXGGP7nnb/exec';

        try {
            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            showToast("Đã gửi sự kiện thành công! Cảm ơn bạn.", 'success');
            setFormData({
                tenSuKien: '',
                phanLoai: '',
                muc: '',
                diem: '',
                hinhThuc: 'Offline',
                btc: '',
                hanThamGia: '',
                link: ''
            });
            setShowContributeModal(false);
        } catch (err) {
            console.error(err);
            showToast("Có lỗi xảy ra khi gửi. Vui lòng thử lại.", 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 animate-scaleIn overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-[#990000] p-4 text-white flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <PlusCircle size={20} /> Đóng góp Sự kiện mới
                    </h3>
                    <button 
                        onClick={() => { playClick(); setShowContributeModal(false); }}
                        className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-95"
                    >
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    
                    {/* Tên sự kiện */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Tên sự kiện <span className="text-red-500">*</span></label>
                        <input 
                            type="text"
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#990000] focus:border-[#990000] outline-none"
                            placeholder="Nhập tên sự kiện..."
                            value={formData.tenSuKien}
                            onChange={e => setFormData({...formData, tenSuKien: e.target.value})}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* BTC */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Đơn vị tổ chức (BTC)</label>
                            <div className="relative">
                                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input 
                                    type="text"
                                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#990000] outline-none"
                                    placeholder="VD: CLB Kỹ năng"
                                    value={formData.btc}
                                    onChange={e => setFormData({...formData, btc: e.target.value})}
                                />
                            </div>
                        </div>
                        {/* Phân loại */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Phân loại</label>
                            <div className="relative">
                                <Type className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input 
                                    type="text"
                                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#990000] outline-none"
                                    placeholder="VD: Học thuật"
                                    value={formData.phanLoai}
                                    onChange={e => setFormData({...formData, phanLoai: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         {/* Mục */}
                         <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Mục ĐRL</label>
                            <input 
                                type="text"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#990000] outline-none"
                                placeholder="VD: III"
                                value={formData.muc}
                                onChange={e => setFormData({...formData, muc: e.target.value})}
                            />
                        </div>
                        {/* Điểm */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Điểm số</label>
                            <input 
                                type="text"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#990000] outline-none"
                                placeholder="VD: 5"
                                value={formData.diem}
                                onChange={e => setFormData({...formData, diem: e.target.value})}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                         {/* Hình thức */}
                         <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Hình thức</label>
                            <select 
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#990000] outline-none bg-white"
                                value={formData.hinhThuc}
                                onChange={e => setFormData({...formData, hinhThuc: e.target.value})}
                            >
                                <option value="Offline">Offline</option>
                                <option value="Online">Online</option>
                                <option value="Hỗn hợp">Hỗn hợp</option>
                            </select>
                        </div>
                        {/* Hạn tham gia */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Hạn tham gia</label>
                            <input 
                                type="date"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#990000] outline-none"
                                value={formData.hanThamGia}
                                onChange={e => setFormData({...formData, hanThamGia: e.target.value})}
                            />
                        </div>
                    </div>

                    {/* Link */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Link bài viết (Facebook/Website) <span className="text-red-500">*</span></label>
                        <div className="relative">
                            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                            <input 
                                type="text"
                                required
                                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#990000] outline-none"
                                placeholder="https://..."
                                value={formData.link}
                                onChange={e => setFormData({...formData, link: e.target.value})}
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="w-full bg-[#990000] hover:bg-[#7a0000] text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" size={20}/> : <Send size={20} />}
                        {isSubmitting ? 'Đang gửi...' : 'Lưu sự kiện'}
                    </button>
                </form>
            </div>
        </div>,
        document.body
    );
  };

  const ScoreGuideModal = () => {
    // Lock scroll when mounted
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-scaleIn border border-gray-200 overflow-hidden">
            {/* Modal Header */}
            <div className="bg-[#003375] p-4 flex justify-between items-center text-white shrink-0">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <FileText size={20} className="text-yellow-300" /> 
                    Phiếu đánh giá kết quả rèn luyện sinh viên
                </h3>
                <button 
                    onClick={() => { playClick(); setShowScoreGuide(false); }} 
                    className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-95"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-gray-50">
                <div className="space-y-6">
                    
                    {/* Header Row for visual consistency */}
                    <div className="grid grid-cols-12 gap-2 bg-gray-200 p-2 rounded-t-lg font-bold text-gray-700 text-sm uppercase sticky top-0 z-10 shadow-sm">
                         <div className="col-span-1 text-center">STT</div>
                         <div className="col-span-9">Nội dung đánh giá</div>
                         <div className="col-span-2 text-center">Mức điểm</div>
                    </div>

                    {/* Section I */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
                            <span className="font-bold text-[#003375]">I. Đánh giá về ý thức học tập</span>
                            <span className="text-[#003375] font-bold text-sm bg-blue-100 px-2 py-1 rounded">0 → 20</span>
                        </div>
                        <div className="divide-y divide-gray-100 text-sm text-gray-800">
                             {/* Điểm cộng */}
                            <div className="p-2 bg-green-50/50 font-semibold text-green-800 italic">Điểm cộng</div>
                            
                            <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9 font-semibold">- Kết quả học tập</div>
                                <div className="col-span-2 text-center"></div>
                            </div>
                            {/* Sub-items for GPA */}
                            {[
                                {label: '+ Xuất sắc', score: '+ 15'},
                                {label: '+ Giỏi', score: '+ 10'},
                                {label: '+ Khá', score: '+ 8'},
                                {label: '+ Trung bình khá', score: '+ 6'},
                                {label: '+ Trung bình', score: '+ 5'},
                            ].map((item, idx) => (
                                <div key={`i-gpa-${idx}`} className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                    <div className="col-span-1"></div>
                                    <div className="col-span-9 text-gray-600">{item.label}</div>
                                    <div className="col-span-2 text-center font-bold text-[#003375]">{item.score}</div>
                                </div>
                            ))}

                            <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500">1</div>
                                <div className="col-span-9 font-semibold">- Tham gia các cuộc thi học thuật/ tham gia Hội thảo khoa học, chuyên đề, tọa đàm/ tham gia cuộc thi sáng tạo khởi nghiệp (lấy điểm ở cấp cao nhất)</div>
                                <div className="col-span-2 text-center"></div>
                            </div>
                             {[
                                {label: '+ Cấp tỉnh (thành) trở lên', score: '+ 10'},
                                {label: '+ Cấp Trường', score: '+ 5'},
                                {label: '+ Cấp Khoa', score: '+ 4'},
                            ].map((item, idx) => (
                                <div key={`i-contest-${idx}`} className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                    <div className="col-span-1"></div>
                                    <div className="col-span-9 text-gray-600">{item.label}</div>
                                    <div className="col-span-2 text-center font-bold text-[#003375]">{item.score}</div>
                                </div>
                            ))}

                            <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9 font-semibold">- Có đề tài NCKH</div>
                                <div className="col-span-2 text-center"></div>
                            </div>
                             {[
                                {label: '+ Cấp tỉnh (thành) trở lên', score: '15'},
                                {label: '+ Cấp Trường', score: '10'},
                                {label: '+ Cấp Khoa', score: '8'},
                            ].map((item, idx) => (
                                <div key={`i-nckh-${idx}`} className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                    <div className="col-span-1"></div>
                                    <div className="col-span-9 text-gray-600">{item.label}</div>
                                    <div className="col-span-2 text-center font-bold text-[#003375]">{item.score}</div>
                                </div>
                            ))}

                            <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Là thành viên của một (hoặc nhiều) CLB học thuật trong hoặc ngoài Trường</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 5</div>
                            </div>
                            <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Đạt giải hội thi Olympic hoặc các cuộc thi học thuật (cấp tỉnh, thành trở lên)</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 20</div>
                            </div>
                            <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Tham dự (cổ vũ) các cuộc thi học thuật, hội thảo, chuyên đề, tọa đàm</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 3</div>
                            </div>

                             {/* Điểm trừ */}
                            <div className="p-2 bg-red-50/50 font-semibold text-red-800 italic border-t border-gray-100 mt-2">Điểm trừ</div>
                            <div className="grid grid-cols-12 gap-2 p-3 hover:bg-red-50/20">
                                <div className="col-span-1 text-center font-medium text-gray-500">2</div>
                                <div className="col-span-9 text-red-700">Bị cảnh báo học vụ và các vi phạm khác liên quan học tập và NCKH.</div>
                                <div className="col-span-2 text-center font-bold text-red-600">- 5/lần</div>
                            </div>
                        </div>
                    </div>

                    {/* Section II */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
                            <span className="font-bold text-[#003375]">II. Đánh giá về ý thức chấp hành nội quy, quy chế, quy định tại Trường</span>
                            <span className="text-[#003375] font-bold text-sm bg-blue-100 px-2 py-1 rounded">0 → 25</span>
                        </div>
                        <div className="divide-y divide-gray-100 text-sm text-gray-800">
                             <div className="p-2 bg-green-50/50 font-semibold text-green-800 italic">Điểm cộng</div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500">1</div>
                                <div className="col-span-9">- Không vi phạm nội quy, quy chế trong Trường</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 20</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Tham gia sinh hoạt lớp đầy đủ (02 buổi/học kỳ theo lịch Trường quy định)</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 5</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Hoàn thành các buổi sinh hoạt tập trung của Trường (phổ biến nội quy, quy chế,...)</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 5đ/lần</div>
                             </div>

                             <div className="p-2 bg-red-50/50 font-semibold text-red-800 italic border-t border-gray-100 mt-2">Điểm trừ</div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-red-50/20">
                                <div className="col-span-1 text-center font-medium text-gray-500">2</div>
                                <div className="col-span-9 text-red-700">- Các vi phạm quy định, quy chế của Trường bị lập biên bản.</div>
                                <div className="col-span-2 text-center font-bold text-red-600">- 5đ/lần</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-red-50/20">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9 text-red-700">- Không tham gia sinh hoạt lớp</div>
                                <div className="col-span-2 text-center font-bold text-red-600">- 3/lần</div>
                             </div>
                        </div>
                    </div>

                    {/* Section III */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
                            <span className="font-bold text-[#003375] w-3/4">III. Đánh giá về ý thức tham gia các hoạt động chính trị, xã hội, văn hóa, văn nghệ, thể thao, phòng chống tội phạm và các tệ nạn xã hội</span>
                            <span className="text-[#003375] font-bold text-sm bg-blue-100 px-2 py-1 rounded">0 → 20</span>
                        </div>
                        <div className="divide-y divide-gray-100 text-sm text-gray-800">
                             <div className="p-2 bg-green-50/50 font-semibold text-green-800 italic">Điểm cộng</div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500">1</div>
                                <div className="col-span-9 font-semibold">- Tham gia hoạt động chính trị, văn hóa, văn nghệ, thể thao</div>
                                <div className="col-span-2 text-center"></div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                <div className="col-span-1"></div>
                                <div className="col-span-9 text-gray-600">+ Là thành viên Ban tổ chức</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 10đ/hoạt động</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                <div className="col-span-1"></div>
                                <div className="col-span-9 text-gray-600 font-medium">+ Là thành viên tham gia trực tiếp</div>
                                <div className="col-span-2 text-center"></div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-12">
                                <div className="col-span-1"></div>
                                <div className="col-span-9 text-gray-500">Cấp lớp, khoa, trường, địa phương</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 5đ/hoạt động</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-12">
                                <div className="col-span-1"></div>
                                <div className="col-span-9 text-gray-500">Cấp tỉnh (thành) trở lên</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 10đ/hoạt động</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                <div className="col-span-1"></div>
                                <div className="col-span-9 text-gray-600">+ Cổ vũ</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 3đ/hoạt động</div>
                             </div>

                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Tham gia công trình thanh niên từ cấp chi đoàn trở lên</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 5đ/hoạt động</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Tham gia công tác phòng chống tội phạm và các tệ nạn xã hội</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 5đ/hoạt động</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Tham gia các hoạt động khác</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 3đ/hoạt động</div>
                             </div>

                             <div className="p-2 bg-red-50/50 font-semibold text-red-800 italic border-t border-gray-100 mt-2">Điểm trừ</div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-red-50/20">
                                <div className="col-span-1 text-center font-medium text-gray-500">2</div>
                                <div className="col-span-9 text-red-700">Trong quá trình tham gia, vi phạm kỷ luật, bị lập biên bản</div>
                                <div className="col-span-2 text-center font-bold text-red-600">- 5đ/lần</div>
                             </div>
                        </div>
                    </div>

                    {/* Section IV */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
                            <span className="font-bold text-[#003375]">IV. Đánh giá về ý thức công dân trong quan hệ cộng đồng</span>
                            <span className="text-[#003375] font-bold text-sm bg-blue-100 px-2 py-1 rounded">0 → 25</span>
                        </div>
                         <div className="divide-y divide-gray-100 text-sm text-gray-800">
                             <div className="p-2 bg-green-50/50 font-semibold text-green-800 italic">Điểm cộng</div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Chấp hành quy định tại nơi cư trú</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 15</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Được khen thưởng tại nơi cư trú</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 5</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500">1</div>
                                <div className="col-span-9 font-semibold">- Tham gia công tác xã hội, nhân đạo, từ thiện, tình nguyện; phòng chống tệ nạn xã hội và hoạt động kết nối cộng đồng khác</div>
                                <div className="col-span-2 text-center"></div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                <div className="col-span-1"></div>
                                <div className="col-span-9 text-gray-600">+ Mùa hè xanh</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 15</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                <div className="col-span-1"></div>
                                <div className="col-span-9 text-gray-600">+ Xuân tình nguyện (hoặc tiếp sức mùa thi, hiến máu nhân đạo)</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 10đ/hoạt động</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                <div className="col-span-1"></div>
                                <div className="col-span-9 text-gray-600">+ Thành viên của một hoặc nhiều CLB khác (ngoài CLB học thuật ở mục I và CLB văn hóa - nghệ thuật - thể thao ở mục III)</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 5</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                <div className="col-span-1"></div>
                                <div className="col-span-9 text-gray-600">+ Cộng tác viên của Đoàn TN, Hội SV và các đơn vị trong Trường</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 4</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                <div className="col-span-1"></div>
                                <div className="col-span-9 text-gray-600">+ Tham gia các hoạt động khác</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 4đ/hoạt động</div>
                             </div>

                             <div className="p-2 bg-red-50/50 font-semibold text-red-800 italic border-t border-gray-100 mt-2">Điểm trừ</div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-red-50/20">
                                <div className="col-span-1 text-center font-medium text-gray-500">2</div>
                                <div className="col-span-9 text-red-700">Vi phạm nội quy, quy định nơi cư trú (nội quy KTX hoặc quy định của địa phương) và các vi phạm trong quá trình tham gia các hoạt động thuộc mục IV và bị lập biên bản</div>
                                <div className="col-span-2 text-center font-bold text-red-600">- 5đ/vi phạm</div>
                             </div>
                         </div>
                    </div>

                    {/* Section V */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex justify-between items-center">
                            <span className="font-bold text-[#003375] w-3/4">V. Đánh giá về ý thức và kết quả khi tham gia công tác cán bộ lớp, các đoàn thể, tổ chức khác trong Trường, hoặc đạt được thành tích đặc biệt trong học tập, rèn luyện</span>
                            <span className="text-[#003375] font-bold text-sm bg-blue-100 px-2 py-1 rounded">0 → 10</span>
                        </div>
                        <div className="divide-y divide-gray-100 text-sm text-gray-800">
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Tham gia Ban cán sự lớp, BCH Đoàn TN, Hội SV, Ban chủ nhiệm các CLB, Đội, Nhóm và hoàn thành nhiệm vụ</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 5</div>
                             </div>
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9">- Đạt thành tích đặc biệt xuất sắc trong công tác Đoàn và phong trào sinh viên (có giấy khen, bằng khen từ cấp tỉnh/ thành trở lên)</div>
                                <div className="col-span-2 text-center font-bold text-[#003375]">+ 10</div>
                             </div>
                             
                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9 font-semibold">- Đạt giải NCKH, cuộc thi Olympic hoặc các cuộc thi tương đương khác, cuộc thi sáng tạo khởi nghiệp (lấy thành tích ở cấp cao nhất)</div>
                                <div className="col-span-2 text-center"></div>
                             </div>
                             {[
                                {label: '+ Cấp Khoa', score: '+ 6'},
                                {label: '+ Cấp Trường', score: '+ 8'},
                                {label: '+ Cấp tỉnh (thành) trở lên', score: '+ 10'},
                             ].map((item, idx) => (
                                <div key={`v-contest-${idx}`} className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                    <div className="col-span-1"></div>
                                    <div className="col-span-9 text-gray-600">{item.label}</div>
                                    <div className="col-span-2 text-center font-bold text-[#003375]">{item.score}</div>
                                </div>
                             ))}

                             <div className="grid grid-cols-12 gap-2 p-3 hover:bg-gray-50">
                                <div className="col-span-1 text-center font-medium text-gray-500"></div>
                                <div className="col-span-9 font-semibold">- Các danh hiệu của SV (có quyết định công nhận hoặc giấy chứng nhận)</div>
                                <div className="col-span-2 text-center"></div>
                             </div>
                             {[
                                {label: '+ Cấp Khoa và tương đương', score: '+ 6'},
                                {label: '+ Cấp Trường và tương đương trở lên', score: '+ 10'},
                             ].map((item, idx) => (
                                <div key={`v-title-${idx}`} className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8">
                                    <div className="col-span-1"></div>
                                    <div className="col-span-9 text-gray-600">{item.label}</div>
                                    <div className="col-span-2 text-center font-bold text-[#003375]">{item.score}</div>
                                </div>
                             ))}
                        </div>
                    </div>

                    {/* Total Row */}
                    <div className="bg-[#003375] text-white p-4 rounded-xl flex justify-between items-center shadow-md animate-slideUp">
                        <span className="font-bold text-lg uppercase tracking-wider">Tổng điểm</span>
                        <span className="font-bold text-2xl">100</span>
                    </div>

                </div>
            </div>
            
             <div className="p-4 bg-gray-50 border-t border-gray-200 shrink-0">
                <button 
                  onClick={() => { playClick(); setShowScoreGuide(false); }}
                  className="w-full bg-[#003375] hover:bg-[#002855] text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-md"
                >
                  Đã hiểu
                </button>
             </div>
        </div>
    </div>,
    document.body
    );
  };

  const renderEventCard = (evt: HubEvent) => {
    const isExpired = evt.deadlineDate ? evt.deadlineDate < new Date() : false;
    // An event is 'active' or 'upcoming' if not expired.
    // 'Upcoming' status is specifically when no link and no date is set (handled by list filtering)
    // Here we handle the button state.
    
    // Check if "Upcoming" (No link, no date) for button text
    const isUpcoming = !evt.link && !evt.deadlineDate;
    const canRegister = evt.link && !isExpired;
    
    // Ensure absolute URL
    const formattedLink = evt.link && !evt.link.startsWith('http') 
        ? `https://${evt.link}` 
        : evt.link;

    return (
      <div 
        key={evt.id} 
        className={`bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group relative overflow-hidden ${isExpired ? 'opacity-90 grayscale-[0.3]' : ''} ${isUpcoming ? 'border-dashed border-orange-300 bg-orange-50/30' : ''}`}
      >
        {/* Top Type Tag */}
        {evt.type && (
            <div className={`absolute top-0 right-0 text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10 shadow-sm ${isExpired ? 'bg-gray-100 text-gray-500' : isUpcoming ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-[#003375]'}`}>
                {evt.type}
            </div>
        )}

        <div className="flex justify-between items-start mb-3 mt-2">
            {/* BTC */}
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded border border-gray-200 flex items-center gap-1 line-clamp-1 max-w-[60%]">
                <Users size={12}/> {evt.organizer}
            </span>
            
            {/* Category & Score */}
            <div className="flex gap-1 pr-6"> {/* pr-6 to avoid overlap with type tag */}
                <span className="bg-white text-gray-500 text-xs font-bold px-2 py-1 rounded border border-gray-200 flex items-center justify-center" title={`Mục ${evt.category}`}>
                    {evt.category}
                </span>
                <span className={`text-xs font-bold px-2 py-1 rounded border flex items-center gap-1 ${isExpired ? 'bg-gray-50 text-gray-500 border-gray-100' : 'bg-red-50 text-[#990000] border-red-100'}`}>
                    <Award size={12}/> {evt.score.includes('+') ? evt.score : `+${evt.score}`}
                </span>
            </div>
        </div>

        <h3 className="font-bold text-gray-800 mb-3 line-clamp-2 group-hover:text-[#003375] transition-colors h-[3.5rem] flex items-center">
            {evt.name}
        </h3>

        <div className="space-y-2 text-sm text-gray-600 mb-4 flex-1">
            <div className="flex items-start gap-2">
                <Clock size={16} className={`mt-0.5 shrink-0 ${isExpired ? 'text-red-400' : isUpcoming ? 'text-orange-400' : 'text-gray-400'}`} />
                <div>
                    <span className={isExpired ? 'text-red-500 font-medium line-through decoration-red-500' : isUpcoming ? 'text-orange-600 font-medium italic' : ''}>
                        {isUpcoming ? 'Dự kiến sắp tới' : (evt.time || 'Chưa cập nhật hạn')}
                    </span>
                    {isExpired && <span className="text-red-500 text-xs ml-2 font-bold">(Đã hết hạn)</span>}
                </div>
            </div>
            <div className="flex items-start gap-2">
                <MapPin size={16} className="text-gray-400 mt-0.5 shrink-0" />
                <span className="line-clamp-1">{evt.location}</span>
            </div>
        </div>

        {canRegister ? (
            <a 
                href={formattedLink} 
                target="_blank" 
                rel="noopener noreferrer"
                onClick={(e) => {
                    playClick();
                    e.stopPropagation();
                }}
                className="mt-auto w-full bg-[#003375] hover:bg-[#002855] text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-all active:scale-95 shadow-sm hover:shadow-md"
            >
                Tham gia ngay
            </a>
        ) : (
            <button 
                disabled 
                className={`mt-auto w-full py-2 rounded-lg font-medium text-sm cursor-not-allowed border flex items-center justify-center gap-2 ${isUpcoming ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}
            >
                {isExpired ? (
                    <>Đã hết hạn <AlertCircle size={14}/></>
                ) : isUpcoming ? (
                    <>Sắp mở đơn <Sparkles size={14}/></>
                ) : (
                    "Chưa có link"
                )}
            </button>
        )}
      </div>
    );
  };

  return (
    <div className="animate-slideInRight">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
           <h2 className="text-2xl font-bold text-[#003375] flex items-center gap-2">
             <Calendar className="text-[#990000]" />
             Sự kiện Điểm Rèn Luyện
           </h2>
           <p className="text-sm text-gray-500 mt-1">Một số sự kiện có thể được cập nhật trễ</p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
                <input
                    type="text"
                    placeholder="Tìm tên, BTC, loại hình..."
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none w-full md:w-64 transition-all hover:border-blue-300"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            </div>
            
            <button 
                onClick={() => { playClick(); setShowScoreGuide(true); }}
                className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-[#003375] transition-all flex items-center gap-2 font-medium active:scale-95 hover:shadow-sm"
                title="Xem bảng điểm ĐRL"
            >
                <FileText size={18} />
                <span className="hidden md:inline">Phiếu đánh giá</span>
            </button>
            
            <button 
                onClick={() => { playClick(); setShowContributeModal(true); }}
                className="px-3 py-2 bg-[#990000] text-white rounded-lg hover:bg-[#7a0000] transition-all flex items-center gap-2 font-bold active:scale-95 hover:shadow-md whitespace-nowrap"
                title="Đóng góp sự kiện"
            >
                <PlusCircle size={18} />
                <span className="hidden md:inline">Nhập sự kiện</span>
            </button>

            <button 
                onClick={() => { playClick(); fetchEvents(); }}
                className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-[#003375] transition-all active:scale-95 hover:rotate-180 duration-500"
                title="Làm mới dữ liệu"
            >
                <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
        </div>
      </div>

      {/* Recruitment Banner */}
      <div className="mb-6 bg-gradient-to-r from-violet-600 to-fuchsia-600 p-4 rounded-xl text-white shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
        <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2.5 rounded-full shrink-0">
                <Sparkles size={24} className="text-yellow-300 animate-pulse" />
            </div>
            <div>
                <h3 className="font-bold text-lg leading-tight">Tuyển Đồng đội (CTV)</h3>
                <p className="text-sm text-violet-100 mt-0.5 font-medium">
                    Cần 5 bạn tình nguyện hỗ trợ tổng hợp sự kiện, quyền lợi là được ghi danh lên web nè hehee.
                </p>
            </div>
        </div>
        <button
            onClick={() => { playClick(); setShowRecruitModal(true); }}
            className="px-5 py-2 bg-white text-violet-700 font-bold rounded-lg shadow-sm hover:bg-gray-50 transition-all active:scale-95 whitespace-nowrap text-sm flex items-center gap-2"
        >
            <Users size={16} />
            Đăng ký ngay
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex overflow-x-auto pb-4 gap-2 mb-2 no-scrollbar">
        {CATEGORIES.map(cat => (
            <button
                key={cat.id}
                onClick={() => { playClick(); setActiveTab(cat.id); }}
                className={`
                    px-4 py-2 rounded-xl whitespace-nowrap transition-all duration-300 border flex flex-col items-center min-w-[100px] active:scale-95
                    ${activeTab === cat.id 
                        ? 'bg-[#003375] text-white border-[#003375] shadow-lg scale-105' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm'}
                `}
            >
                <span className="font-bold text-sm">{cat.label}</span>
                <span className={`text-[10px] ${activeTab === cat.id ? 'text-blue-200' : 'text-gray-400'}`}>{cat.desc}</span>
            </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
          <Loader2 size={40} className="text-[#003375] animate-spin mb-4" />
          <p className="text-gray-500">Đang tải dữ liệu...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center animate-fadeIn">
          <p className="font-bold mb-2">Đã xảy ra lỗi</p>
          <p>{error}</p>
          <button 
            onClick={fetchEvents}
            className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg font-medium transition-colors"
          >
            Thử lại
          </button>
        </div>
      ) : (
        <>
            {filteredEvents.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-xl border border-dashed border-gray-300 animate-fadeIn">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                        <Filter size={32} />
                    </div>
                    <p className="text-gray-500 font-medium">Không tìm thấy sự kiện nào.</p>
                    <p className="text-sm text-gray-400">Thử chọn mục khác hoặc tìm kiếm từ khóa khác.</p>
                    {activeTab !== 'all' && (
                        <button 
                            onClick={() => setActiveTab('all')}
                            className="mt-4 text-[#003375] text-sm hover:underline"
                        >
                            Xem tất cả sự kiện
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-12 animate-fadeIn">
                     {/* Active Events Section */}
                    {activeEvents.length > 0 && (
                        <div>
                            <h3 className="text-xl font-bold text-[#003375] mb-4 flex items-center gap-2 border-l-4 border-[#003375] pl-3">
                                🔥 Đang diễn ra
                            </h3>
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {activeEvents.map(evt => renderEventCard(evt))}
                            </div>
                        </div>
                    )}

                    {/* Upcoming Events Section (New) */}
                    {upcomingEvents.length > 0 && (
                        <div>
                            <h3 className="text-xl font-bold text-orange-600 mb-4 flex items-center gap-2 border-l-4 border-orange-500 pl-3">
                                ✨ Sắp diễn ra / Dự kiến
                            </h3>
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {upcomingEvents.map(evt => renderEventCard(evt))}
                            </div>
                        </div>
                    )}

                    {/* Expired Events Section */}
                    {expiredEvents.length > 0 && (
                        <div className="opacity-80">
                            <h3 className="text-xl font-bold text-gray-500 mb-4 flex items-center gap-2 border-l-4 border-gray-300 pl-3">
                                ⏳ Đã kết thúc
                            </h3>
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {expiredEvents.map(evt => renderEventCard(evt))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
      )}
      
      {lastUpdated && (
          <p className="text-center text-xs text-gray-400 mt-6 italic">
            Dữ liệu được cập nhật lần cuối: {lastUpdated.toLocaleTimeString()}
          </p>
      )}

      {showScoreGuide && <ScoreGuideModal />}
      {showRecruitModal && <RecruitFormModal />}
      {showContributeModal && <ContributeEventModal />}
      {notification && <NotificationToast />}
    </div>
  );
};
