import React, { useState } from 'react';
import { Search, Phone, Mail, MapPin, Bus, Users, Book, Award, ChevronRight, GraduationCap, Copy, Check } from 'lucide-react';
import { playClick } from '../utils/audio';

type TabType = 'contacts' | 'bus' | 'clubs' | 'scholarships' | 'regulations';

export const Handbook: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('contacts');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // --- DATA FROM PDF ---
  const contacts = [
    { name: 'Phòng Đào tạo', email: 'phongdaotao@hub.edu.vn', phone: '028.38.212.430', loc: '56 Hoàng Diệu 2 & 36 Tôn Thất Đạm' },
    { name: 'Phòng Công tác Sinh viên (TT SV&QHDN)', email: 'trungtamsvvaqhdn@hub.edu.vn', phone: '028.38.971.636', loc: '56 Hoàng Diệu 2' },
    { name: 'Phòng Khảo thí & ĐBCL', email: 'phongktdbcl@hub.edu.vn', phone: '028.39.144.932', loc: '56 Hoàng Diệu 2' },
    { name: 'Phòng Tài chính – Kế toán', email: 'phongketoan@hub.edu.vn', phone: '028.38.212.591', loc: '36 Tôn Thất Đạm' },
    { name: 'Thư viện', email: 'thuvien@hub.edu.vn', phone: '028.38.971.651', loc: '56 Hoàng Diệu 2' },
    { name: 'Trạm Y tế', email: 'toyte.tccb@hub.edu.vn', phone: '0912.048.079', loc: 'Các cơ sở' },
    { name: 'Khoa Tài chính', email: 'khoatc@hub.edu.vn', phone: '028.38.971.631', loc: 'Tầng 1 - Khu B - 56 HD2' },
    { name: 'Khoa Ngân hàng', email: 'khoanh@hub.edu.vn', phone: '028.38.971.624', loc: 'Tầng 1 - Khu B - 56 HD2' },
    { name: 'Khoa Quản trị kinh doanh', email: 'khoaktqt@hub.edu.vn', phone: '028.38.971.639', loc: 'Tầng 2 - Khu B - 56 HD2' },
    { name: 'Khoa Kế toán – Kiểm toán', email: 'khoaktkt@hub.edu.vn', phone: '028.38.971.641', loc: 'Tầng 1 - Khu B - 56 HD2' },
    { name: 'Khoa Hệ thống thông tin QL', email: 'khoahtttql@hub.edu.vn', phone: '028.38.971.655', loc: 'Tầng 2 - Khu B - 56 HD2' },
    { name: 'Khoa Ngoại ngữ', email: 'khoangoaingu@hub.edu.vn', phone: '028.38.214.305', loc: 'Tầng 2 - Khu B - 56 HD2' },
    { name: 'Khoa Luật kinh tế', email: 'khoalkt@hub.edu.vn', phone: '028.37.200.151', loc: 'Tầng 2 - Khu B - 56 HD2' },
    { name: 'Khoa Kinh tế Quốc tế', email: 'khoaktqt@hub.edu.vn', phone: '028.38.971.640', loc: 'Tầng 1 - Khu B - 56 HD2' },
  ];

  const clubs = [
    { type: 'Học thuật', list: ['CLB Ngân hàng Quốc tế (IBC)', 'CLB Anh văn STEP', 'CLB Anh văn BEE', 'CLB NCKH', 'CLB Tài chính (BUSF)', 'CLB Chứng khoán (SC)', 'CLB Kế toán Kiểm toán (FAAC)', 'CLB Pháp lý'] },
    { type: 'Kỹ năng', list: ['Ban Sự kiện', 'CLB Kỹ năng', 'CLB Mầm sống', 'CLB Hỗ trợ SV Trực tuyến (OSAC)', 'CLB Thể thao trí tuệ', 'Đội Lửa xanh'] },
    { type: 'Sở thích & Văn thể', list: ['Ban Thông tin (B4T)', 'CLB Bóng chuyền', 'CLB Bóng đá', 'CLB Bóng rổ', 'CLB Cầu lông', 'CLB Guitar', 'CLB Nhiếp ảnh', 'Đội Văn nghệ Xung kích'] },
    { type: 'Tình nguyện', list: ['Đội Công tác Xã hội', 'Đội Tình nguyện Mầm Xanh', 'CLB Tủ sách tình bạn'] }
  ];

  const busRoutes = [
    { id: '53', name: 'Lê Hồng Phong – ĐH Quốc gia', time: '5h00 – 19h30', freq: '7–15 phút', color: 'bg-blue-600' },
    { id: '104', name: 'Bến xe An Sương – ĐH Nông Lâm', time: '4h40 – 19h45', freq: '4–12 phút', color: 'bg-green-600' },
    { id: '168', name: 'ĐH Ngân hàng – Metro Thủ Đức', time: '5h00 – 22h00', freq: '10–12 phút', color: 'bg-orange-500' },
  ];

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTabChange = (tab: TabType) => {
      playClick();
      setActiveTab(tab);
  };

  const copyToClipboard = (text: string, id: string) => {
    playClick();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'contacts':
        return (
          <div className="animate-fadeIn">
            <div className="mb-4 relative">
              <input
                type="text"
                placeholder="Tìm khoa, phòng ban..."
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-[#003375] focus:ring-2 focus:ring-blue-100 transition-all outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredContacts.map((c, idx) => (
                <div 
                    key={idx} 
                    className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg cursor-pointer group relative"
                    onClick={() => copyToClipboard(c.email, `email-${idx}`)}
                    title="Nhấn để sao chép Email"
                >
                  <div className="absolute top-4 right-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    {copiedId === `email-${idx}` ? <Check size={16} className="text-green-600"/> : <Copy size={16}/>}
                  </div>
                  <h3 className="font-bold text-[#003375] mb-2">{c.name}</h3>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center gap-2"><Mail size={14} className="text-gray-400"/> {c.email}</div>
                    <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400"/> {c.phone}</div>
                    <div className="flex items-center gap-2"><MapPin size={14} className="text-gray-400"/> {c.loc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'bus':
        return (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 mb-4 transition-all duration-300 hover:shadow-md cursor-default">
                <h3 className="font-bold text-yellow-800 flex items-center gap-2 mb-1">
                    <Bus size={20}/> Thông tin xe buýt hỗ trợ sinh viên
                </h3>
                <p className="text-sm text-yellow-700">Các tuyến xe buýt phổ biến đi qua cơ sở 56 Hoàng Diệu 2, Thủ Đức.</p>
            </div>
            {busRoutes.map(bus => (
              <div 
                key={bus.id} 
                className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg cursor-pointer"
                onClick={playClick}
              >
                <div className="flex items-center gap-4">
                  <div className={`${bus.color} text-white w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shadow-md`}>
                    {bus.id}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800">{bus.name}</h4>
                    <p className="text-sm text-gray-500">Tần suất: {bus.freq}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="block text-xs font-bold text-gray-400 uppercase">Hoạt động</span>
                  <span className="font-medium text-[#003375]">{bus.time}</span>
                </div>
              </div>
            ))}
          </div>
        );

      case 'clubs':
        return (
          <div className="space-y-6 animate-fadeIn">
             <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-4 transition-all duration-300 hover:shadow-md cursor-default">
                <h3 className="font-bold text-[#003375] flex items-center gap-2 mb-1">
                    <Users size={20}/> Hoạt động Đoàn - Hội
                </h3>
                <p className="text-sm text-blue-800">
                    HUB có 39 CLB/Đội/Nhóm. Tham gia để rèn luyện kỹ năng và cộng điểm rèn luyện!
                </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {clubs.map((group, idx) => (
                <div key={idx} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
                  <h4 className="font-bold text-[#990000] border-b pb-2 mb-3">{group.type}</h4>
                  <ul className="space-y-2">
                    {group.list.map((item, i) => (
                      <li 
                        key={i} 
                        className="text-sm text-gray-700 flex items-center gap-2 hover:text-[#003375] cursor-pointer transition-colors"
                        onClick={playClick}
                      >
                        <ChevronRight size={14} className="text-gray-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        );

      case 'scholarships':
        return (
          <div className="space-y-4 animate-fadeIn">
             <h3 className="text-lg font-bold text-[#003375] mb-2 flex items-center gap-2">
                <Award className="text-[#990000]"/> Học bổng Khuyến khích học tập
             </h3>
             
             <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:scale-[1.01]" onClick={playClick}>
                <table className="w-full text-sm">
                    <thead className="bg-[#003375] text-white">
                        <tr>
                            <th className="p-3 text-left">Loại HB</th>
                            <th className="p-3 text-center">GPA (Hệ 4)</th>
                            <th className="p-3 text-center">ĐRL</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        <tr>
                            <td className="p-3 font-medium">Xuất sắc</td>
                            <td className="p-3 text-center font-bold text-green-600">3.6 - 4.0</td>
                            <td className="p-3 text-center">Xuất sắc (90-100)</td>
                        </tr>
                        <tr>
                            <td className="p-3 font-medium">Giỏi</td>
                            <td className="p-3 text-center font-bold text-blue-600">3.2 - 3.59</td>
                            <td className="p-3 text-center">Tốt (80-89)</td>
                        </tr>
                        <tr>
                            <td className="p-3 font-medium">Khá</td>
                            <td className="p-3 text-center font-bold text-yellow-600">2.5 - 3.19</td>
                            <td className="p-3 text-center">Khá (65-79)</td>
                        </tr>
                    </tbody>
                </table>
             </div>
             <p className="text-xs text-gray-500 italic">* Điều kiện: Tích lũy tối thiểu 15 tín chỉ/kỳ, không rớt môn nào, không bị kỷ luật.</p>

             <h3 className="text-lg font-bold text-[#003375] mt-6 mb-2 flex items-center gap-2">
                <Book className="text-[#990000]"/> Chế độ miễn giảm học phí
             </h3>
             <div className="grid gap-2">
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-md cursor-pointer" onClick={playClick}>
                    <span className="font-bold block text-gray-800">Miễn 100% học phí</span>
                    SV khuyết tật, mồ côi cả cha lẫn mẹ, người dân tộc thiểu số rất ít người vùng khó khăn, con liệt sĩ/thương binh...
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-md cursor-pointer" onClick={playClick}>
                    <span className="font-bold block text-gray-800">Giảm 70% học phí</span>
                    SV dân tộc thiểu số ở thôn/bản đặc biệt khó khăn.
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-md cursor-pointer" onClick={playClick}>
                    <span className="font-bold block text-gray-800">Giảm 50% học phí</span>
                    Con của cán bộ CNV chức bị tai nạn lao động, bệnh nghề nghiệp.
                </div>
             </div>
          </div>
        );
        
      default: return null;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-fadeIn">
      {/* Sidebar Navigation */}
      <div className="md:col-span-1 space-y-2">
        <button
          onClick={() => handleTabChange('contacts')}
          className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all ${
            activeTab === 'contacts' ? 'bg-[#003375] text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 hover:scale-[1.02]'
          }`}
        >
          <Phone size={18} />
          <span className="font-medium">Danh bạ Khoa/Phòng</span>
        </button>
        <button
          onClick={() => handleTabChange('bus')}
          className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all ${
            activeTab === 'bus' ? 'bg-[#003375] text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 hover:scale-[1.02]'
          }`}
        >
          <Bus size={18} />
          <span className="font-medium">Xe buýt</span>
        </button>
        <button
          onClick={() => handleTabChange('clubs')}
          className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all ${
            activeTab === 'clubs' ? 'bg-[#003375] text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 hover:scale-[1.02]'
          }`}
        >
          <Users size={18} />
          <span className="font-medium">CLB & Đội nhóm</span>
        </button>
        <button
          onClick={() => handleTabChange('scholarships')}
          className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-all ${
            activeTab === 'scholarships' ? 'bg-[#003375] text-white shadow-md' : 'bg-white hover:bg-gray-50 text-gray-700 hover:scale-[1.02]'
          }`}
        >
          <GraduationCap size={18} />
          <span className="font-medium">Học bổng & Quy chế</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="md:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-gray-200 min-h-[400px]">
        {renderContent()}
      </div>
    </div>
  );
};