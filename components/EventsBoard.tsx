import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Papa from 'papaparse';
import { Search, Calendar, MapPin, Award, Loader2, RefreshCw, Users, Clock, AlertCircle, FileText, X, PlusCircle, Sparkles, GraduationCap, BookOpen, Phone, Send, User, Link as LinkIcon, Type, CheckCircle2, Building2, MessageCircle, ChevronDown, Flame, Lock } from 'lucide-react';
import { playClick } from '../utils/audio';
import { CommentSection } from './CommentSection';

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
  scope: string;     // Phạm vi (Trong trường/Ngoài trường)
}

const parseVietnameseDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    try {
        const matches = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (matches) {
            const day = parseInt(matches[1], 10);
            const month = parseInt(matches[2], 10) - 1; 
            const year = parseInt(matches[3], 10);
            const date = new Date(year, month, day);
            // Mặc định set về cuối ngày để tính logic deadline nếu cần
            // Tuy nhiên logic so sánh mới sẽ normalize về 00:00:00
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
  const [activeScope, setActiveScope] = useState('all');
  const [showScoreGuide, setShowScoreGuide] = useState(false);
  const [showRecruitModal, setShowRecruitModal] = useState(false);
  const [showContributeModal, setShowContributeModal] = useState(false);
  
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
            const findKey = (keywords: string[]) => keys.find(k => keywords.some(kw => k.toLowerCase().trim() === kw.toLowerCase()));
            
            const name = row[findKey(['Tên sự kiện', 'Tên'])] || 'Sự kiện chưa có tên';
            let catRaw = row[findKey(['Mục', 'Mục ĐRL'])] || '';
            let category = 'Khác';
            const catUpper = catRaw.toString().trim().toUpperCase();

            if (/\bIII\b/.test(catUpper) || /\b3\b/.test(catUpper)) category = 'III';
            else if (/\bII\b/.test(catUpper) || /\b2\b/.test(catUpper)) category = 'II';
            else if (/\bIV\b/.test(catUpper) || /\b4\b/.test(catUpper)) category = 'IV';
            else if (/\bV\b/.test(catUpper) || /\b5\b/.test(catUpper)) category = 'V';
            else if (/\bI\b/.test(catUpper) || /\b1\b/.test(catUpper)) category = 'I';

            const score = row[findKey(['Điểm số', 'Điểm'])] || '0';
            const location = row[findKey(['Hình thức', 'Địa điểm'])] || 'Online/Offline';
            const timeRaw = row[findKey(['Hạn tham gia', 'Thời gian', 'Deadline'])] || '';
            const deadlineDate = parseVietnameseDate(timeRaw);
            const link = row[findKey(['Link tham gia', 'Link', 'Liên kết'])] || '';
            const organizer = row[findKey(['BTC', 'Ban tổ chức', 'Đơn vị'])] || 'HUB';
            const type = row[findKey(['Phân loại', 'Loại hình'])] || '';
            const scopeRaw = row[findKey(['Phạm vi', 'Khu vực', 'Trong/Ngoài', 'Scope'])] || '';
            let scope = '';
            if (scopeRaw.toLowerCase().includes('trong')) scope = 'Trong trường';
            else if (scopeRaw.toLowerCase().includes('ngoài')) scope = 'Ngoài trường';

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
              type,
              scope
            };
          });
          
          const validEvents = parsedEvents.filter(e => e.name !== 'Sự kiện chưa có tên' || e.link !== '');
          setEvents(validEvents);
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

  // Filter Logic
  const filteredEvents = events.filter(evt => {
    const matchesSearch = evt.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.organizer.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          evt.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === 'all' || evt.category === activeTab;
    const matchesScope = activeScope === 'all' || 
                         (activeScope === 'internal' && evt.scope === 'Trong trường') ||
                         (activeScope === 'external' && evt.scope === 'Ngoài trường');
    return matchesSearch && matchesTab && matchesScope;
  });

  // Group Logic
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const closingTodayEvents: HubEvent[] = [];
  const openEvents: HubEvent[] = [];
  const expiredEvents: HubEvent[] = [];

  filteredEvents.forEach(evt => {
      if (!evt.deadlineDate) {
          // Nếu không có ngày deadline (VD: Sắp diễn ra, hoặc chưa cập nhật), mặc định cho vào Open
          openEvents.push(evt);
          return;
      }

      const deadline = new Date(evt.deadlineDate);
      deadline.setHours(0, 0, 0, 0);

      const tTime = today.getTime();
      const dTime = deadline.getTime();

      if (dTime === tTime) {
          closingTodayEvents.push(evt);
      } else if (dTime > tTime) {
          openEvents.push(evt);
      } else {
          expiredEvents.push(evt);
      }
  });

  // Sort Open events by deadline (sooner first)
  openEvents.sort((a, b) => {
      if (!a.deadlineDate) return 1;
      if (!b.deadlineDate) return -1;
      return a.deadlineDate.getTime() - b.deadlineDate.getTime();
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
      const [formData, setFormData] = useState({ name: '', cohort: '', major: '', contact: '' });
      const [isSubmitting, setIsSubmitting] = useState(false);

      useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
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
                method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hoTen: formData.name, khoa: formData.cohort, nganh: formData.major, lienHe: formData.contact })
            });
            showToast(`Cảm ơn ${formData.name}! Đăng ký thành công.`, 'success');
            setFormData({ name: '', cohort: '', major: '', contact: '' });
            setShowRecruitModal(false);
          } catch (err) {
            showToast("Có lỗi kết nối. Vui lòng thử lại sau.", 'error');
          } finally { setIsSubmitting(false); }
      };

      return createPortal(
        <div className="fixed top-0 left-0 w-full h-full z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 animate-scaleIn overflow-hidden relative">
                <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 p-6 text-white relative">
                    <button onClick={() => { playClick(); setShowRecruitModal(false); }} className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 p-2 rounded-full transition-colors active:scale-95"><X size={20} /></button>
                    <h3 className="text-2xl font-bold flex items-center gap-2 mb-2"><Sparkles size={24} className="text-yellow-300" /> Đăng ký CTV</h3>
                    <p className="text-violet-100 text-sm">Cùng nhau xây dựng cộng đồng HUB Planner vững mạnh!</p>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Họ và tên</label>
                        <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" required className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-violet-500" placeholder="Nhập họ tên của bạn" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm font-bold text-gray-700 mb-1">Khóa</label><div className="relative"><GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" required className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-violet-500" placeholder="VD: K38" value={formData.cohort} onChange={e => setFormData({...formData, cohort: e.target.value})} /></div></div>
                        <div><label className="block text-sm font-bold text-gray-700 mb-1">Ngành học</label><div className="relative"><BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" required className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-violet-500" placeholder="VD: TCNH" value={formData.major} onChange={e => setFormData({...formData, major: e.target.value})} /></div></div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Thông tin liên hệ</label>
                        <div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} /><input type="text" required className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-violet-500" placeholder="Link Facebook, Zalo hoặc SĐT..." value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} /></div>
                    </div>
                    <button type="submit" disabled={isSubmitting} className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-4 disabled:opacity-70">{isSubmitting ? <Loader2 className="animate-spin" size={20}/> : <Send size={20} />} {isSubmitting ? 'Đang gửi...' : 'Xác nhận đăng ký'}</button>
                </form>
            </div>
        </div>, document.body
      );
  };

  const ContributeEventModal = () => {
    const [formData, setFormData] = useState({ tenSuKien: '', phanLoai: '', muc: '', diem: '', hinhThuc: 'Offline', btc: '', hanThamGia: '', link: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        playClick();
        if (!formData.tenSuKien || !formData.link) { showToast("Vui lòng nhập Tên sự kiện và Link bài viết!", 'error'); return; }
        setIsSubmitting(true);
        const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyMfssEtyn7vQGNN3Gzy0QQivHaMPQUiUnmnP_mS3Lb5T86k8dMZGQSslVPXGGP7nnb/exec';
        try {
            await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
            showToast("Đã gửi sự kiện thành công! Cảm ơn bạn.", 'success');
            setFormData({ tenSuKien: '', phanLoai: '', muc: '', diem: '', hinhThuc: 'Offline', btc: '', hanThamGia: '', link: '' });
            setShowContributeModal(false);
        } catch (err) { showToast("Có lỗi xảy ra khi gửi. Vui lòng thử lại.", 'error'); } finally { setIsSubmitting(false); }
    };

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 animate-scaleIn overflow-hidden flex flex-col max-h-[90vh]">
                <div className="bg-[#990000] p-4 text-white flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-lg flex items-center gap-2"><PlusCircle size={20} /> Đóng góp Sự kiện mới</h3>
                    <button onClick={() => { playClick(); setShowContributeModal(false); }} className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-95"><X size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">Tên sự kiện <span className="text-red-500">*</span></label><input type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#990000]" placeholder="Nhập tên sự kiện..." value={formData.tenSuKien} onChange={e => setFormData({...formData, tenSuKien: e.target.value})} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-sm font-bold text-gray-700 mb-1">Đơn vị tổ chức (BTC)</label><div className="relative"><Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><input type="text" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#990000]" placeholder="VD: CLB Kỹ năng" value={formData.btc} onChange={e => setFormData({...formData, btc: e.target.value})} /></div></div>
                        <div><label className="block text-sm font-bold text-gray-700 mb-1">Phân loại</label><div className="relative"><Type className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><input type="text" className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#990000]" placeholder="VD: Học thuật" value={formData.phanLoai} onChange={e => setFormData({...formData, phanLoai: e.target.value})} /></div></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div><label className="block text-sm font-bold text-gray-700 mb-1">Mục ĐRL</label><input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#990000]" placeholder="VD: III" value={formData.muc} onChange={e => setFormData({...formData, muc: e.target.value})} /></div>
                         <div><label className="block text-sm font-bold text-gray-700 mb-1">Điểm số</label><input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#990000]" placeholder="VD: 5" value={formData.diem} onChange={e => setFormData({...formData, diem: e.target.value})} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div><label className="block text-sm font-bold text-gray-700 mb-1">Hình thức</label><select className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#990000] bg-white" value={formData.hinhThuc} onChange={e => setFormData({...formData, hinhThuc: e.target.value})}><option value="Offline">Offline</option><option value="Online">Online</option><option value="Hỗn hợp">Hỗn hợp</option></select></div>
                         <div><label className="block text-sm font-bold text-gray-700 mb-1">Hạn tham gia</label><input type="date" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#990000]" value={formData.hanThamGia} onChange={e => setFormData({...formData, hanThamGia: e.target.value})} /></div>
                    </div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">Link bài viết <span className="text-red-500">*</span></label><div className="relative"><LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} /><input type="text" required className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#990000]" placeholder="https://..." value={formData.link} onChange={e => setFormData({...formData, link: e.target.value})} /></div></div>
                    <button type="submit" disabled={isSubmitting} className="w-full bg-[#990000] hover:bg-[#7a0000] text-white font-bold py-3 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 mt-4 disabled:opacity-70">{isSubmitting ? <Loader2 className="animate-spin" size={20}/> : <Send size={20} />} {isSubmitting ? 'Đang gửi...' : 'Lưu sự kiện'}</button>
                </form>
            </div>
        </div>, document.body
    );
  };

  const ScoreGuideModal = () => {
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
    }, []);

    return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-scaleIn border border-gray-200 overflow-hidden">
            <div className="bg-[#003375] p-4 flex justify-between items-center text-white shrink-0">
                <h3 className="font-bold text-lg flex items-center gap-2"><FileText size={20} className="text-yellow-300" /> Phiếu đánh giá kết quả rèn luyện sinh viên</h3>
                <button onClick={() => { playClick(); setShowScoreGuide(false); }} className="hover:bg-white/20 p-2 rounded-full transition-colors active:scale-95"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-gray-50">
                <div className="space-y-6">
                    <div className="grid grid-cols-12 gap-2 bg-gray-200 p-2 rounded-t-lg font-bold text-gray-700 text-sm uppercase sticky top-0 z-10 shadow-sm"><div className="col-span-1 text-center">STT</div><div className="col-span-9">Nội dung đánh giá</div><div className="col-span-2 text-center">Mức điểm</div></div>
                    
                    {[
                        {title: "I. Đánh giá về ý thức học tập", range: "0 → 20", plus: [{t:"+ Xuất sắc",s:"+ 15"},{t:"+ Giỏi",s:"+ 10"},{t:"+ Khá",s:"+ 8"}], minus: [{t:"Bị cảnh báo học vụ",s:"- 5/lần"}]},
                        {title: "II. Đánh giá về ý thức chấp hành nội quy", range: "0 → 25", plus: [{t:"- Không vi phạm nội quy",s:"+ 20"},{t:"- Tham gia sinh hoạt lớp",s:"+ 5"}], minus: [{t:"- Vi phạm quy định",s:"- 5đ/lần"}]},
                        {title: "III. Tham gia hoạt động chính trị, xã hội", range: "0 → 20", plus: [{t:"- Thành viên BTC",s:"+ 10đ"},{t:"- Tham gia trực tiếp",s:"+ 5đ"},{t:"- Cổ vũ",s:"+ 3đ"}], minus: [{t:"Vi phạm kỷ luật khi tham gia",s:"- 5đ"}]},
                        {title: "IV. Ý thức công dân & cộng đồng", range: "0 → 25", plus: [{t:"- Chấp hành nơi cư trú",s:"+ 15"},{t:"- Mùa hè xanh",s:"+ 15"},{t:"- Hiến máu/Tiếp sức mùa thi",s:"+ 10"}], minus: [{t:"Vi phạm nội quy cư trú",s:"- 5đ"}]},
                        {title: "V. Cán bộ lớp & Thành tích đặc biệt", range: "0 → 10", plus: [{t:"- Cán bộ lớp/Đoàn/Hội",s:"+ 5"},{t:"- Giấy khen cấp trường",s:"+ 10"},{t:"- NCKH/Olympic cấp trường",s:"+ 8"}], minus: []}
                    ].map((sec, idx) => (
                         <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex justify-between items-center"><span className="font-bold text-[#003375]">{sec.title}</span><span className="text-[#003375] font-bold text-sm bg-blue-100 px-2 py-1 rounded">{sec.range}</span></div>
                            <div className="divide-y divide-gray-100 text-sm text-gray-800">
                                <div className="p-2 bg-green-50/50 font-semibold text-green-800 italic">Điểm cộng</div>
                                {sec.plus.map((p, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-2 p-2 hover:bg-gray-50 pl-8"><div className="col-span-1"></div><div className="col-span-9 text-gray-600">{p.t}</div><div className="col-span-2 text-center font-bold text-[#003375]">{p.s}</div></div>
                                ))}
                                {sec.minus.length > 0 && <><div className="p-2 bg-red-50/50 font-semibold text-red-800 italic border-t border-gray-100 mt-2">Điểm trừ</div>
                                {sec.minus.map((m, i) => (
                                    <div key={i} className="grid grid-cols-12 gap-2 p-3 hover:bg-red-50/20"><div className="col-span-1 text-center font-medium text-gray-500"></div><div className="col-span-9 text-red-700">{m.t}</div><div className="col-span-2 text-center font-bold text-red-600">{m.s}</div></div>
                                ))}</>}
                            </div>
                         </div>
                    ))}

                    <div className="bg-[#003375] text-white p-4 rounded-xl flex justify-between items-center shadow-md"><span className="font-bold text-lg uppercase tracking-wider">Tổng điểm</span><span className="font-bold text-2xl">100</span></div>
                </div>
            </div>
             <div className="p-4 bg-gray-50 border-t border-gray-200 shrink-0"><button onClick={() => { playClick(); setShowScoreGuide(false); }} className="w-full bg-[#003375] hover:bg-[#002855] text-white font-bold py-3 rounded-xl transition-all active:scale-95 shadow-md">Đã hiểu</button></div>
        </div>
    </div>, document.body
    );
  };

  const DiscussionModal = () => {
      if (!discussEvent) return null;

      useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'unset'; };
      }, []);

      return createPortal(
          <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
              <div className="bg-white w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-scaleIn">
                  <div className="bg-white p-4 border-b flex justify-between items-center shrink-0">
                      <div>
                          <h3 className="font-bold text-[#003375] text-lg leading-tight line-clamp-1">{discussEvent.name}</h3>
                          <p className="text-xs text-gray-500">Thảo luận về sự kiện này</p>
                      </div>
                      <button 
                          onClick={() => { playClick(); setDiscussEvent(null); }}
                          className="hover:bg-gray-100 p-2 rounded-full transition-colors active:scale-90"
                      >
                          <X size={20} />
                      </button>
                  </div>
                  <div className="flex-1 overflow-hidden bg-gray-50">
                       <CommentSection 
                            contextId={`event_${discussEvent.id}`} 
                            title={discussEvent.name} 
                            className="h-full border-none shadow-none flex flex-col"
                       />
                  </div>
              </div>
          </div>,
          document.body
      );
  };

  const renderEventCard = (evt: HubEvent, status: 'today' | 'open' | 'expired') => {
    // Determine visuals based on status passed from parent
    const isExpired = status === 'expired';
    const isUrgent = status === 'today';
    
    const formattedLink = evt.link && !evt.link.startsWith('http') ? `https://${evt.link}` : evt.link;

    return (
      <div key={evt.id} className={`bg-white rounded-xl shadow-sm border p-5 flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group relative overflow-hidden 
        ${isExpired ? 'border-gray-200 opacity-70 grayscale-[0.8] hover:opacity-100 hover:grayscale-0' : ''} 
        ${isUrgent ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-200'}
        ${status === 'open' && !evt.deadlineDate ? 'border-orange-200 border-dashed bg-orange-50/20' : ''}
      `}>
        {evt.type && <div className={`absolute top-0 right-0 text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10 shadow-sm 
            ${isExpired ? 'bg-gray-100 text-gray-500' : isUrgent ? 'bg-red-500 text-white' : 'bg-blue-100 text-[#003375]'}`}>
            {evt.type}
        </div>}

        <div className="flex justify-between items-start mb-3 mt-2">
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded border border-gray-200 flex items-center gap-1 line-clamp-1 max-w-[60%]"><Users size={12}/> {evt.organizer}</span>
            <div className="flex gap-1 pr-6">
                <span className="bg-white text-gray-500 text-xs font-bold px-2 py-1 rounded border border-gray-200 flex items-center justify-center" title={`Mục ${evt.category}`}>{evt.category}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded border flex items-center gap-1 ${isExpired ? 'bg-gray-50 text-gray-500 border-gray-100' : 'bg-red-50 text-[#990000] border-red-100'}`}><Award size={12}/> {evt.score.includes('+') ? evt.score : `+${evt.score}`}</span>
            </div>
        </div>

        <h3 className={`font-bold text-gray-800 mb-3 line-clamp-2 transition-colors h-[3.5rem] flex items-center ${!isExpired ? 'group-hover:text-[#003375]' : ''}`}>{evt.name}</h3>

        {evt.scope && evt.scope !== 'Khác' && <div className="mb-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${evt.scope === 'Trong trường' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-pink-50 text-pink-700 border-pink-100'}`}><Building2 size={10} /> {evt.scope}</span></div>}

        <div className="space-y-2 text-sm text-gray-600 mb-4 flex-1">
            <div className="flex items-start gap-2">
                <Clock size={16} className={`mt-0.5 shrink-0 ${isExpired ? 'text-gray-400' : isUrgent ? 'text-red-500' : 'text-blue-500'}`} />
                <div>
                    <span className={`${isExpired ? 'line-through text-gray-400' : isUrgent ? 'text-red-600 font-bold animate-pulse' : 'text-gray-700'}`}>
                        {evt.time || 'Chưa cập nhật hạn'}
                    </span>
                    {isUrgent && <span className="block text-[10px] text-red-500 font-bold uppercase tracking-wider">Hạn chót hôm nay!</span>}
                </div>
            </div>
            <div className="flex items-start gap-2"><MapPin size={16} className="text-gray-400 mt-0.5 shrink-0" /><span className="line-clamp-1">{evt.location}</span></div>
        </div>

        <div className="mt-auto flex gap-2">
             <button onClick={() => { playClick(); setDiscussEvent({ id: evt.id, name: evt.name }); }} className="flex-1 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 hover:text-[#003375] py-2 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-all active:scale-95 shadow-sm hover:shadow-md" title="Thảo luận"><MessageCircle size={18} /><span className="hidden sm:inline">Thảo luận</span></button>
            {evt.link && !isExpired ? (
                <a href={formattedLink} target="_blank" rel="noopener noreferrer" onClick={(e) => { playClick(); e.stopPropagation(); }} className={`flex-[2] text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-all active:scale-95 shadow-sm hover:shadow-md ${isUrgent ? 'bg-red-600 hover:bg-red-700' : 'bg-[#003375] hover:bg-[#002855]'}`}>Tham gia ngay</a>
            ) : (
                <button disabled className={`flex-[2] py-2 rounded-lg font-medium text-sm cursor-not-allowed border flex items-center justify-center gap-2 ${isExpired ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>
                    {isExpired ? <>Đã chốt sổ <Lock size={14}/></> : "Chưa có link"}
                </button>
            )}
        </div>
      </div>
    );
  };

  return (
    <div className="animate-slideInRight">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div><h2 className="text-2xl font-bold text-[#003375] flex items-center gap-2"><Calendar className="text-[#990000]" />Sự kiện Điểm Rèn Luyện</h2><p className="text-sm text-gray-500 mt-1">Một số sự kiện có thể được cập nhật trễ</p></div>
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
                <button onClick={() => { playClick(); setShowContributeModal(true); }} className="px-4 py-2 bg-[#003375] hover:bg-[#002855] text-white rounded-lg shadow-sm flex items-center gap-2 font-bold transition-all active:scale-95 hover:shadow-md whitespace-nowrap justify-center flex-1"><PlusCircle size={18} /> Đóng góp</button>
            </div>
        </div>
      </div>

      <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-200 mb-6 overflow-x-auto no-scrollbar">
        {[{id:'all',l:'Tất cả'},{id:'I',l:'Mục I'},{id:'II',l:'Mục II'},{id:'III',l:'Mục III'},{id:'IV',l:'Mục IV'},{id:'V',l:'Mục V'}].map(tab => (
            <button key={tab.id} onClick={() => { playClick(); setActiveTab(tab.id); }} className={`flex-1 min-w-[80px] py-2 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id ? 'bg-blue-50 text-[#003375]' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'}`}>{tab.l}</button>
        ))}
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 mb-6 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
        <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-full shadow-sm"><Users className="text-[#003375]" size={20} /></div>
            <div><h3 className="font-bold text-[#003375] text-sm">Tuyển Cộng tác viên nhập liệu</h3><p className="text-xs text-gray-500">Giúp cộng đồng sinh viên HUB cập nhật sự kiện nhanh nhất</p></div>
        </div>
        <button onClick={() => { playClick(); setShowRecruitModal(true); }} className="bg-white text-[#003375] border border-blue-200 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:shadow-md hover:scale-105 transition-all active:scale-95 whitespace-nowrap">Đăng ký ngay</button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fadeIn"><Loader2 size={40} className="text-[#003375] animate-spin mb-4" /><p className="text-gray-500">Đang tải danh sách sự kiện...</p></div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center animate-fadeIn"><p className="font-bold mb-2">Đã xảy ra lỗi</p><p>{error}</p></div>
      ) : (
        <div className="space-y-8 animate-fadeIn">
            {/* Section 1: Closing Today */}
            {closingTodayEvents.length > 0 && (
                <div>
                    <h3 className="text-xl font-bold text-red-600 mb-4 flex items-center gap-2 animate-pulse">
                        <AlertCircle className="fill-red-100" /> 🚨 Hạn chót hôm nay ({closingTodayEvents.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {closingTodayEvents.map(evt => renderEventCard(evt, 'today'))}
                    </div>
                </div>
            )}

            {/* Section 2: Open */}
            {openEvents.length > 0 && (
                <div>
                    <h3 className="text-xl font-bold text-[#003375] mb-4 flex items-center gap-2">
                        <Flame className="text-orange-500 fill-orange-100" /> 🔥 Đang mở đăng ký ({openEvents.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {openEvents.map(evt => renderEventCard(evt, 'open'))}
                    </div>
                </div>
            )}

            {/* Section 3: Expired */}
            {expiredEvents.length > 0 && (
                <div>
                     <h3 className="text-xl font-bold text-gray-500 mb-4 flex items-center gap-2">
                        <Lock className="text-gray-400" /> 🔒 Đã hết hạn ({expiredEvents.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-80">
                         {expiredEvents.map(evt => renderEventCard(evt, 'expired'))}
                    </div>
                </div>
            )}

            {filteredEvents.length === 0 && (
                <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300"><div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300"><Calendar size={32} /></div><p className="text-gray-500 font-medium">Không tìm thấy sự kiện phù hợp.</p></div>
            )}
        </div>
      )}

      {/* Render all Modals properly */}
      <NotificationToast />
      <DiscussionModal />
      {showRecruitModal && <RecruitFormModal />}
      {showContributeModal && <ContributeEventModal />}
      {showScoreGuide && <ScoreGuideModal />}
    </div>
  );
};
