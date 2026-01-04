import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { Search, MapPin, Calendar, User, Phone, ExternalLink, Loader2, ImageOff, PlusCircle, RefreshCw, Info, HelpCircle, Tag, Megaphone } from 'lucide-react';
import { playClick } from '../utils/audio';

// Existing "Found" Items Sheet
const FOUND_ITEMS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQhNOxdpNzVKa64MndmleEp9g56r4vK7JXPrtjwW1-OqIiptCZztmadjDi2OewRr3j6dEPcshPR9Wz3/pub?output=tsv';
const REPORT_FOUND_FORM_URL = 'https://forms.gle/rF8riZ8N6SDobu3w5';

// New "Lost" Items Sheet
const LOST_ITEMS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSpo9UYxB4Xto2uPUDZPY4yPRTi9aMEp-LzOld7SPlfIyXEg438Y36dwnCBjWE36Ts6Dexz1qsBBX1l/pub?output=tsv';
const REPORT_LOST_FORM_URL = 'https://forms.gle/qbJXdJ7R81NDJBno6';

interface BoardItem {
  id: string;
  type: 'found' | 'lost'; // Distinguish between found items and lost reports
  timestamp: string;
  personName: string;     // Finder Name (for Found) or Owner Name (for Lost)
  mainInfo: string;       // Location (for Found) or Item Name (for Lost)
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
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'found' | 'lost'>('found');
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

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
                        id: `${type}-${index}`,
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
                        className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-lg transition-all duration-300 group flex flex-col ${item.type === 'found' ? 'border-gray-200' : 'border-red-100 ring-1 ring-red-50'}`}
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
                                <h3 className={`text-lg font-bold flex items-start gap-2 leading-tight ${item.type === 'found' ? 'text-[#003375]' : 'text-[#990000]'}`}>
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
                        {activeTab === 'found' ? <Search size={32} /> : <Megaphone size={32} />}
                    </div>
                    <p className="text-gray-500 font-medium">Không tìm thấy tin nào.</p>
                </div>
            )}
        </div>
      )}
    </div>
  );
};
