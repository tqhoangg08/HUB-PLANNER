import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Search, Calendar, MapPin, Award, ExternalLink, Loader2, RefreshCw, Users, Clock, Filter, Tag, AlertCircle } from 'lucide-react';
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

  return (
    <div className="animate-slideInRight">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
           <h2 className="text-2xl font-bold text-[#003375] flex items-center gap-2">
             <Calendar className="text-[#990000]" />
             Sự kiện Điểm Rèn Luyện
           </h2>
           <p className="text-sm text-gray-500 mt-1">Một vài sự kiện có thể được cập nhật trễ</p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
                <input
                    type="text"
                    placeholder="Tìm tên, BTC, loại hình..."
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none w-full md:w-64 transition-shadow"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            </div>
            <button 
                onClick={() => { playClick(); fetchEvents(); }}
                className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-[#003375] transition-colors"
                title="Làm mới dữ liệu"
            >
                <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex overflow-x-auto pb-4 gap-2 mb-2 no-scrollbar">
        {CATEGORIES.map(cat => (
            <button
                key={cat.id}
                onClick={() => { playClick(); setActiveTab(cat.id); }}
                className={`
                    px-4 py-2 rounded-xl whitespace-nowrap transition-all duration-200 border flex flex-col items-center min-w-[100px]
                    ${activeTab === cat.id 
                        ? 'bg-[#003375] text-white border-[#003375] shadow-md scale-105' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'}
                `}
            >
                <span className="font-bold text-sm">{cat.label}</span>
                <span className={`text-[10px] ${activeTab === cat.id ? 'text-blue-200' : 'text-gray-400'}`}>{cat.desc}</span>
            </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={40} className="text-[#003375] animate-spin mb-4" />
          <p className="text-gray-500">Đang tải dữ liệu...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-xl text-center">
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.length > 0 ? (
            filteredEvents.map((evt) => {
                const isExpired = evt.deadlineDate ? evt.deadlineDate < new Date() : false;
                const canRegister = evt.link && !isExpired;
                
                // Ensure absolute URL
                const formattedLink = evt.link && !evt.link.startsWith('http') 
                    ? `https://${evt.link}` 
                    : evt.link;

                return (
                  <div 
                    key={evt.id} 
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col transition-all duration-300 hover:shadow-lg hover:scale-[1.02] group relative overflow-hidden"
                  >
                    {/* Top Type Tag */}
                    {evt.type && (
                        <div className="absolute top-0 right-0 bg-blue-100 text-[#003375] text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10">
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
                            <span className="bg-red-50 text-[#990000] text-xs font-bold px-2 py-1 rounded border border-red-100 flex items-center gap-1">
                                <Award size={12}/> {evt.score.includes('+') ? evt.score : `+${evt.score}`}
                            </span>
                        </div>
                    </div>

                    <h3 className="font-bold text-gray-800 mb-3 line-clamp-2 group-hover:text-[#003375] transition-colors h-[3.5rem] flex items-center">
                        {evt.name}
                    </h3>

                    <div className="space-y-2 text-sm text-gray-600 mb-4 flex-1">
                        <div className="flex items-start gap-2">
                            <Clock size={16} className={`mt-0.5 shrink-0 ${isExpired ? 'text-red-400' : 'text-gray-400'}`} />
                            <div>
                                <span className={isExpired ? 'text-red-500 font-medium line-through decoration-red-500' : ''}>
                                    {evt.time || 'Chưa cập nhật hạn'}
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
                            className="mt-auto w-full bg-[#003375] hover:bg-[#002855] text-white py-2 rounded-lg font-medium flex items-center justify-center gap-2 text-sm transition-all active:scale-95 shadow-sm hover:shadow"
                        >
                            Đăng ký ngay <ExternalLink size={14} />
                        </a>
                    ) : (
                        <button 
                            disabled 
                            className="mt-auto w-full bg-gray-100 text-gray-400 py-2 rounded-lg font-medium text-sm cursor-not-allowed border border-gray-200 flex items-center justify-center gap-2"
                        >
                            {isExpired ? (
                                <>Đã hết hạn <AlertCircle size={14}/></>
                            ) : (
                                "Chưa có link"
                            )}
                        </button>
                    )}
                  </div>
                );
            })
          ) : (
            <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300">
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
          )}
        </div>
      )}
      
      {lastUpdated && (
          <p className="text-center text-xs text-gray-400 mt-6 italic">
            Dữ liệu được cập nhật lần cuối: {lastUpdated.toLocaleTimeString()}
          </p>
      )}
    </div>
  );
};
