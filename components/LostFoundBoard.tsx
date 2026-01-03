import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Search, MapPin, Calendar, User, Phone, ExternalLink, Loader2, ImageOff, PlusCircle, RefreshCw } from 'lucide-react';
import { playClick } from '../utils/audio';

const GOOGLE_SHEET_TSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQhNOxdpNzVKa64MndmleEp9g56r4vK7JXPrtjwW1-OqIiptCZztmadjDi2OewRr3j6dEPcshPR9Wz3/pub?output=tsv';
const REPORT_FORM_URL = 'https://forms.gle/rF8riZ8N6SDobu3w5';

interface LostItem {
  id: string;
  timestamp: string;
  finderName: string;
  location: string;
  contact: string;
  imageUrl: string | null;
}

// Helper to convert Drive links to direct image links
const getGoogleDriveDirectLink = (url: string): string | null => {
  if (!url) return null;
  // Extract ID from common Drive URL formats
  const idMatch = url.match(/[-\w]{25,}/);
  if (!idMatch) return null;
  // Use lh3.googleusercontent.com for display (avoids some CORS/bandwidth limits of drive.google.com)
  return `https://lh3.googleusercontent.com/d/${idMatch[0]}`;
};

export const LostFoundBoard: React.FC = () => {
  const [items, setItems] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(GOOGLE_SHEET_TSV_URL);
      if (!response.ok) throw new Error('Không thể tải dữ liệu');
      const text = await response.text();

      Papa.parse(text, {
        header: true, // Assert headers exist based on description
        delimiter: '\t',
        skipEmptyLines: true,
        complete: (results) => {
          // Map columns based on description
          // Cột A: Thời gian (Timestamp)
          // Cột B: Tên người nhặt
          // Cột C: Địa điểm nhặt được
          // Cột D: SĐT/Liên hệ
          // Cột E: Link ảnh
          
          const parsedItems: LostItem[] = results.data.map((row: any, index: number) => {
            const keys = Object.keys(row);
            // Flexible key finding in case header names vary slightly
            const findVal = (keywords: string[]) => {
                const key = keys.find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
                return key ? row[key] : '';
            };

            const timestamp = findVal(['thời gian', 'time', 'timestamp']);
            const finderName = findVal(['tên', 'người nhặt', 'finder']);
            const location = findVal(['địa điểm', 'khu vực', 'location']);
            const contact = findVal(['sđt', 'liên hệ', 'contact', 'điện thoại']);
            const originalLink = findVal(['ảnh', 'image', 'link', 'hình']);

            return {
              id: `lost-${index}`,
              timestamp,
              finderName: finderName || 'Ẩn danh',
              location: location || 'Không rõ',
              contact: contact || 'Liên hệ BTC',
              imageUrl: getGoogleDriveDirectLink(originalLink)
            };
          });

          // Sort by timestamp descending (assuming ISO or similar, if not, simple reverse for "newest first")
          setItems(parsedItems.reverse());
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

  const filteredItems = items.filter(item => 
    item.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.finderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.timestamp.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-slideInRight">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
           <h2 className="text-2xl font-bold text-[#003375] flex items-center gap-2">
             <Search className="text-[#990000]" />
             Góc Tìm Đồ Thất Lạc
           </h2>
           <p className="text-sm text-gray-500 mt-1">
             Kết nối người nhặt và người mất đồ tại HUB
           </p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
                <input
                    type="text"
                    placeholder="Tìm theo địa điểm, tên..."
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#003375] focus:border-[#003375] outline-none w-full md:w-64 transition-all hover:border-blue-300"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            </div>

            <button 
                onClick={() => { playClick(); fetchItems(); }}
                className="p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-[#003375] transition-all active:scale-95 hover:rotate-180 duration-500"
                title="Làm mới"
            >
                <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
            </button>
            
            <a 
                href={REPORT_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={playClick}
                className="px-4 py-2 bg-[#990000] hover:bg-[#7a0000] text-white rounded-lg shadow-sm flex items-center gap-2 font-bold transition-all active:scale-95 hover:shadow-md whitespace-nowrap"
            >
                <PlusCircle size={18} />
                <span className="hidden sm:inline">Báo nhặt được đồ</span>
                <span className="sm:hidden">Báo đồ</span>
            </a>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fadeIn">
          <Loader2 size={40} className="text-[#003375] animate-spin mb-4" />
          <p className="text-gray-500">Đang tải danh sách đồ...</p>
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
                        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-300 group flex flex-col"
                    >
                        {/* Image Section */}
                        <div className="aspect-video w-full bg-gray-100 relative overflow-hidden">
                            {item.imageUrl && !imageErrors[item.id] ? (
                                <img 
                                    src={item.imageUrl} 
                                    alt="Lost item" 
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                    onError={() => handleImageError(item.id)}
                                    loading="lazy"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                                    <ImageOff size={32} className="mb-2 opacity-50" />
                                    <span className="text-xs">Không có ảnh hoặc ảnh lỗi</span>
                                </div>
                            )}
                            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-md flex items-center gap-1">
                                <Calendar size={12} /> {item.timestamp}
                            </div>
                        </div>

                        {/* Details Section */}
                        <div className="p-4 flex-1 flex flex-col">
                            <div className="mb-3">
                                <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Địa điểm nhặt</div>
                                <h3 className="text-lg font-bold text-[#003375] flex items-start gap-2 leading-tight">
                                    <MapPin size={18} className="shrink-0 mt-0.5 text-[#990000]" />
                                    {item.location}
                                </h3>
                            </div>

                            <div className="space-y-2 text-sm text-gray-600 mt-auto">
                                <div className="flex items-center gap-2 bg-blue-50 p-2 rounded-lg border border-blue-100">
                                    <User size={14} className="text-[#003375]" />
                                    <span className="font-medium text-gray-700">Người nhặt:</span>
                                    <span className="truncate">{item.finderName}</span>
                                </div>
                                <div className="flex items-center gap-2 bg-green-50 p-2 rounded-lg border border-green-100">
                                    <Phone size={14} className="text-green-700" />
                                    <span className="font-medium text-gray-700">Liên hệ:</span>
                                    <span className="font-bold text-green-800">{item.contact}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))
            ) : (
                <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-gray-300">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                        <Search size={32} />
                    </div>
                    <p className="text-gray-500 font-medium">Không tìm thấy món đồ nào.</p>
                </div>
            )}
        </div>
      )}
    </div>
  );
};
