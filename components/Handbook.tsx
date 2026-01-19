import React, { useState } from 'react';
import { Search, Phone, Mail, MapPin, Bus, Users, Book, Award, ChevronRight, Copy, Check, HelpCircle, ExternalLink, Info, Heart, Facebook, User } from 'lucide-react';
import { playClick } from '../utils/audio';

type TabType = 'contacts' | 'bus' | 'clubs' | 'scholarships' | 'regulations' | 'faqs' | 'about';

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
    {
      type: 'Học thuật',
      list: [
        { name: 'CLB Ngân hàng Quốc tế (IBC)', link: 'https://www.facebook.com/CLBIBC', email: 'ibc@hub.edu.vn', manager: 'Đoàn trường' },
        { name: 'CLB Anh văn STEP', link: 'https://www.facebook.com/stepclubhub', email: 'clb.step@hub.edu.vn', manager: 'Đoàn trường' },
        { name: 'CLB Anh văn BEE', link: 'https://www.facebook.com/BeeClubHUB', email: 'clb.bee@hub.edu.vn', manager: 'Đoàn trường' },
        { name: 'CLB SV Nghiên cứu Khoa học (SRC)', link: 'https://www.facebook.com/spyclubhub', email: 'clb.nckh@hub.edu.vn', manager: 'Đoàn trường' },
        { name: 'Đội Enactus BU', link: 'https://www.facebook.com/EBankingUniversity', email: 'clb.enactus@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Tài chính (BUSF)', link: 'https://www.facebook.com/BUSFClub', email: 'busf@hub.edu.vn', manager: 'Đoàn khoa TC' },
        { name: 'CLB Quản trị và Marketing (MMC)', link: 'https://www.facebook.com/HUBMMC', email: 'mmc@hub.edu.vn', manager: 'Đoàn khoa QTKD' },
        { name: 'CLB Anh ngữ Quốc tế (IEC)', link: 'https://www.facebook.com/iec.hub', email: 'iec@hub.edu.vn', manager: 'Đoàn khoa KTQT' },
        { name: 'CLB Kinh doanh và KT Quốc tế (IBEC)', link: 'https://www.facebook.com/IBEC.HUB', email: 'ibec.hub@gmail.com', manager: 'Đoàn khoa KTQT' },
        { name: 'CLB Kết nối nghề nghiệp (Career Link)', link: '', email: 'clb.careerlink@hub.edu.vn', manager: 'Đoàn khoa NH' },
        { name: 'CLB Nghiên cứu ứng dụng (SARA)', link: '', email: 'sara@hub.edu.vn', manager: 'Đoàn khoa KTKT' },
        { name: 'CLB Kế toán Kiểm toán (FAAC)', link: 'https://www.facebook.com/hub.faac', email: 'faac.hub@gmail.com', manager: 'Đoàn khoa KTKT' },
        { name: 'CLB Pháp lý', link: 'https://www.facebook.com/CLBPHAPLYHUB', email: 'clb.phaply@hub.edu.vn', manager: 'Đoàn khoa Luật' },
        { name: 'CLB Học thuật GIEO', link: '', email: 'gieoclub@hub.edu.vn', manager: 'Đoàn khoa HTTTQL' },
        { name: 'CLB DATA LAB', link: 'https://www.facebook.com/profile.php?id=61576925573439', email: '', manager: 'Đoàn khoa Khoa học dữ liệu'}
      ]
    },
    {
      type: 'Kỹ năng',
      list: [
        { name: 'Ban Sự kiện', link: 'https://www.facebook.com/bansukienhub', email: 'bansukien@hub.edu.vn', manager: 'Đoàn trường' },
        { name: 'CLB Mầm sống', link: 'https://www.facebook.com/mamsong.hub', email: 'clb.mamsong@hub.edu.vn', manager: 'Đoàn trường' },
        { name: 'CLB Kỹ năng', link: 'https://www.facebook.com/clbknbuh', email: 'clb.kynang@hub.edu.vn', manager: 'Đoàn trường' },
        { name: 'CLB Khởi nghiệp (FIC)', link: 'https://www.facebook.com/ficstart', email: 'fic@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Youth For Chance (YFC)', link: 'https://www.facebook.com/youthforchance', email: 'clb.youthforchance@hub.edu.vn', manager: 'Hội SV' },
        { name: 'Đội Lửa xanh (Blue Fire)', link: 'https://www.facebook.com/luaxanhdoi.hub/', email: 'doi.bluefire@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Hội nhập Quốc tế (IIC)', link: 'https://www.facebook.com/iic.qtkd.hub', email: 'iic.hub@gmail.com', manager: 'Đoàn khoa QTKD' },
        { name: 'CLB Thể thao trí tuệ (ISTHub)', link: 'https://www.facebook.com/is.hub22', email: 'ISTHub@gmail.com', manager: 'Đoàn hệ CLC' }
      ]
    },
    {
      type: 'Sở thích & Văn thể',
      list: [
        { name: 'Ban Thông tin Truyền thông (B4T)', link: 'https://www.facebook.com/b4t.hub', email: 'ban4t@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Bóng chuyền', link: 'https://www.facebook.com/HUBvolleyball', email: 'clb.bongchuyen@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Bóng đá (BUFC)', link: 'https://www.facebook.com/footballclubbuh', email: 'clb.bongda@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Bóng rổ', link: 'https://www.facebook.com/bankingbasketball', email: 'clb.bongro@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Cầu lông (BBC)', link: 'https://www.facebook.com/hubbadminton', email: 'clb.caulong@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Dân Ca & Nhạc Cổ Truyền', link: 'https://www.facebook.com/HUB.DanCa', email: 'clb.danca@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Guitar', link: 'https://www.facebook.com/guitarclub.hub', email: 'clb.guitar@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Điện ảnh và Nghệ thuật (3F)', link: 'https://www.facebook.com/3FProductionfilm', email: 'clb.3f@hub.edu.vn', manager: 'Hội SV' },
        { name: 'Đội Văn nghệ Xung kích (VNXK)', link: 'https://www.facebook.com/vnxuki.hub', email: 'vnxk@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Vovinam', link: 'https://www.facebook.com/vovinam.hub', email: 'clb.vovinam@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Nữ sinh (GCBU)', link: 'https://www.facebook.com/clbnusinh', email: 'clb.nusinh@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Phát thanh (VoBU)', link: 'https://www.facebook.com/ClbPhatthanhDHNH', email: 'clb.phatthanh@hub.edu.vn', manager: 'Hội SV' },
        { name: 'CLB Cờ Vua (ICC)', link: 'https://www.facebook.com/chessclubbuh', email: 'iic@hub.edu.vn', manager: 'Đoàn khoa KTQT' }
      ]
    },
    {
      type: 'Tình nguyện',
      list: [
        { name: 'CLB Hỗ trợ SV Trực tuyến (OSAC)', link: 'https://www.facebook.com/hotrosinhvientructuyen', email: 'osac@hub.edu.vn', manager: 'Đoàn trường' },
        { name: 'CLB Tủ sách tình bạn', link: 'https://www.facebook.com/clbtusachtinhban', email: 'clb.tstb@hub.edu.vn', manager: 'Hội SV' },
        { name: 'Đội Tình nguyện Mầm Xanh', link: 'https://www.facebook.com/mamxanhtinhnguyen', email: 'mamxanhtn@hub.edu.vn', manager: 'Hội SV' },
        { name: 'Đội Công tác Xã hội', link: 'https://www.facebook.com/HUB.QTKD.CTXH', email: 'ctxh.qtkd@hub.edu.vn', manager: 'Đoàn khoa QTKD' }
      ]
    }
  ];

  const busRoutes = [
    { id: '53', name: 'Lê Hồng Phong – ĐH Quốc gia', time: '5h00 – 19h30', freq: '7–15 phút', color: 'bg-blue-600' },
    { id: '104', name: 'Bến xe An Sương – ĐH Nông Lâm', time: '4h40 – 19h45', freq: '4–12 phút', color: 'bg-green-600' },
    { id: '168', name: 'ĐH Ngân hàng – Metro Thủ Đức', time: '5h00 – 22h00', freq: '10–12 phút', color: 'bg-orange-500' },
  ];

  const faqs = [
    {
        group: "Nhóm 1: Về Bảo Mật & Tài Khoản",
        items: [
            {
                q: "Web có lưu mật khẩu Portal hay thông tin cá nhân của mình không?",
                a: "Về Mật khẩu Portal (Quan trọng): Tuyệt đối KHÔNG. Web không bao giờ lưu mật khẩu Portal của bạn. Việc đăng nhập Portal chỉ diễn ra cục bộ trên trình duyệt của bạn để lấy bảng điểm. Về Dữ liệu Điểm & Thông tin cá nhân: Nếu bạn là Khách (Chưa đăng nhập): Dữ liệu chỉ được lưu trên trình duyệt của chính máy bạn đang dùng (Local Storage). Server không biết bạn là ai. Nếu bạn Đăng nhập: Tên, MSSV và Bảng điểm sẽ được mã hóa và lưu an toàn trên cơ sở dữ liệu (Database) của hệ thống. Điều này giúp bạn không bị mất dữ liệu khi đổi máy."
            },
            {
                q: "Tại sao mình tải lại trang hoặc đổi máy thì dữ liệu bị mất?",
                a: "Vì dữ liệu được lưu trên trình duyệt (như đã nói ở trên) để đảm bảo bảo mật. Nếu bạn dùng tab ẩn danh (Incognito) hoặc xóa cache, dữ liệu sẽ biến mất. Hãy dùng tab thường để dữ liệu được giữ lại cho lần truy cập sau nhé trên thiết bị của bạn hoặc đăng nhập để hệ thống đồng bộ dữ liệu của bạn lên đám mây, giúp bạn truy cập bảng điểm từ bất cứ đâu (điện thoại, laptop) mà không cần nhập lại từ đầu."
            }
        ]
    },
    {
        group: "Nhóm 2: Về Tính Năng Học Tập",
        items: [
            {
                q: "Làm sao để nhập điểm tự động từ Portal trường thay vì nhập tay?",
                a: "Rất đơn giản! Bạn vào Portal -> Xem điểm -> Nhấn Ctrl + P để lưu trang web dưới dạng file PDF. Sau đó quay lại HUB Planner, bấm nút \"Nhập PDF\" màu đỏ và tải file đó lên. Hệ thống sẽ tự tách điểm, tên môn và tín chỉ cho bạn trong 1 giây."
            },
            {
                q: "Công cụ tính điểm GPA hệ 4 hay hệ 10?",
                a: "Web hỗ trợ tính song song cả hai. Khi bạn nhập điểm thành phần (CC, Giữa kỳ, Cuối kỳ), hệ thống sẽ tự động quy đổi ra điểm tổng kết hệ 10, điểm chữ (A, B, C...) và điểm hệ 4 để bạn tiện theo dõi chuẩn đầu ra."
            },
            {
                q: "Tính năng \"Xếp hạng dự báo\" (Ranking) có chính xác không?",
                a: "Đây là tính năng tham khảo dựa trên dữ liệu ẩn danh của các khóa trước. Nó giúp bạn biết mức điểm hiện tại của mình đang nằm ở Top bao nhiêu % (ví dụ: Top 10% giỏi nhất khoa) để có động lực phấn đấu săn học bổng."
            },
            {
                q: "AI Cố vấn (Gemini) có thể giúp gì cho mình?",
                a: "Bạn có thể chat với AI để hỏi về lộ trình học, cách cải thiện điểm các môn khó, hoặc nhờ AI tư vấn xem với GPA hiện tại thì cần nỗ lực bao nhiêu để ra trường đúng hạn."
            }
        ]
    },
    {
        group: "Nhóm 3: Tiện ích mở rộng",
        items: [
            {
                q: "Mình bị mất đồ tại trường (Thủ Đức/Quận 1), làm sao để đăng tin?",
                a: "Bạn vào mục Lost & Found, bấm nút \"Đăng tin tìm đồ\". Hãy mô tả chi tiết (loại đồ, màu sắc, khu vực rơi) để các bạn khác dễ thấy. Nếu có hình ảnh minh họa càng tốt."
            }
        ]
    }
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
                    className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg cursor-pointer group relative hover:border-blue-200"
                    onClick={() => copyToClipboard(c.email, `email-${idx}`)}
                    title="Nhấn để sao chép Email"
                >
                  <div className="absolute top-4 right-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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
            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 mb-4 transition-all duration-300 hover:shadow-md cursor-default hover:-translate-y-1">
                <h3 className="font-bold text-yellow-800 flex items-center gap-2 mb-1">
                    <Bus size={20}/> Thông tin xe buýt hỗ trợ sinh viên
                </h3>
                <p className="text-sm text-yellow-700">Các tuyến xe buýt phổ biến đi qua cơ sở 56 Hoàng Diệu 2, Thủ Đức.</p>
            </div>
            {busRoutes.map(bus => (
              <div 
                key={bus.id} 
                className="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg cursor-pointer hover:border-blue-200"
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
             <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 mb-4 transition-all duration-300 hover:shadow-md cursor-default hover:-translate-y-1">
                <h3 className="font-bold text-[#003375] flex items-center gap-2 mb-1">
                    <Users size={20}/> Hoạt động Đoàn - Hội
                </h3>
                <p className="text-sm text-blue-800">
                    HUB có 39 CLB/Đội/Nhóm. Tham gia để rèn luyện kỹ năng và cộng điểm rèn luyện!
                </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {clubs.map((group, idx) => (
                <div key={idx} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:border-blue-200">
                  <h4 className="font-bold text-[#990000] border-b pb-2 mb-3">{group.type}</h4>
                  <ul className="space-y-2">
                    {group.list.map((item, i) => {
                        let badgeColor = "bg-gray-100 text-gray-600";
                        if (item.manager === 'Đoàn trường') badgeColor = "bg-blue-100 text-blue-800";
                        else if (item.manager === 'Hội SV') badgeColor = "bg-orange-100 text-orange-800";
                        else if (item.manager.includes('Đoàn khoa')) badgeColor = "bg-purple-100 text-purple-800";

                        return (
                          <li key={i} className="group/item border-b border-gray-100 last:border-0 pb-2 mb-2 last:mb-0 last:pb-0">
                            <div className="flex justify-between items-start">
                                <span className="text-sm font-semibold text-gray-800 mb-1 block group-hover/item:text-[#003375] transition-colors">{item.name}</span>
                                {item.link && (
                                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-500" onClick={playClick}>
                                        <ExternalLink size={14} />
                                    </a>
                                )}
                            </div>
                            
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-transparent ${badgeColor}`}>
                                    {item.manager}
                                </span>
                                {item.email && (
                                    <button 
                                        className="text-[11px] text-gray-500 hover:text-[#003375] flex items-center gap-1 hover:bg-gray-50 px-1 rounded transition-colors"
                                        onClick={() => copyToClipboard(item.email, `club-${idx}-${i}`)}
                                        title="Sao chép Email"
                                    >
                                        <Mail size={10} /> {item.email}
                                        {copiedId === `club-${idx}-${i}` && <Check size={10} className="text-green-600"/>}
                                    </button>
                                )}
                            </div>
                          </li>
                        );
                    })}
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
                        <tr className="hover:bg-gray-50 transition-colors">
                            <td className="p-3 font-medium">Xuất sắc</td>
                            <td className="p-3 text-center font-bold text-green-600">3.6 - 4.0</td>
                            <td className="p-3 text-center">Xuất sắc (90-100)</td>
                        </tr>
                        <tr className="hover:bg-gray-50 transition-colors">
                            <td className="p-3 font-medium">Giỏi</td>
                            <td className="p-3 text-center font-bold text-blue-600">3.2 - 3.59</td>
                            <td className="p-3 text-center">Tốt (80-89)</td>
                        </tr>
                        <tr className="hover:bg-gray-50 transition-colors">
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
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-md cursor-pointer hover:border-blue-200" onClick={playClick}>
                    <span className="font-bold block text-gray-800">Miễn 100% học phí</span>
                    SV khuyết tật, mồ côi cả cha lẫn mẹ, người dân tộc thiểu số rất ít người vùng khó khăn, con liệt sĩ/thương binh...
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-md cursor-pointer hover:border-blue-200" onClick={playClick}>
                    <span className="font-bold block text-gray-800">Giảm 70% học phí</span>
                    SV dân tộc thiểu số ở thôn/bản đặc biệt khó khăn.
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-md cursor-pointer hover:border-blue-200" onClick={playClick}>
                    <span className="font-bold block text-gray-800">Giảm 50% học phí</span>
                    Con của cán bộ CNV chức bị tai nạn lao động, bệnh nghề nghiệp.
                </div>
             </div>
          </div>
        );

      case 'faqs':
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="bg-gradient-to-r from-[#003375] to-blue-600 p-4 rounded-xl shadow-lg mb-6 text-white flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-full">
                        <HelpCircle size={24} className="text-yellow-300"/>
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">Câu hỏi thường gặp (FAQs)</h3>
                        <p className="text-blue-100 text-sm">Giải đáp nhanh các thắc mắc về tính năng và bảo mật.</p>
                    </div>
                </div>

                {faqs.map((group, idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                        <div className="bg-gray-50 px-4 py-3 text-[#003375] font-bold text-sm uppercase tracking-wide border-b border-gray-200">
                            {group.group}
                        </div>
                        <div className="divide-y divide-gray-100">
                            {group.items.map((item, i) => (
                                <div key={i} className="p-4 hover:bg-blue-50/30 transition-colors">
                                    <h4 className="font-bold text-gray-800 mb-2 flex gap-2">
                                        <span className="text-[#990000] font-black shrink-0">Q:</span>
                                        <span className="text-gray-900">{item.q}</span>
                                    </h4>
                                    <p className="text-gray-600 text-sm leading-relaxed ml-6 pl-2 border-l-2 border-blue-100">
                                        <span className="font-bold text-[#003375] mr-1">A:</span>
                                        {item.a}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );

      case 'about':
        const founder = { 
            name: 'Trần Quốc Hoàng', 
            role: 'Founder', 
            phone: '0389342812', 
            email: 'contact@hotrosinhvienhub.id.vn', 
            fb: 'http://facebook.com/tqhoangg.05' 
        };

        const collaborators = [
            { name: 'Nguyễn Hoàng Khiêm', role: 'Cộng tác viên', phone: '0932142577', email: 'khiempisces2@gmail.com', fb: 'https://www.facebook.com/nguyen.hoang.khiem.975396' },
            { name: 'Nguyễn Thị Kiều My', role: 'Cộng tác viên', phone: '0376744258', email: 'nmy56358@gmail.com', fb: 'https://www.facebook.com/n.t.kieu.my.573292' },
            { name: 'Đoàn Trâm', role: 'Cộng tác viên', phone: '0968719370', email: 'doantram0728@gmail.com', fb: 'https://www.facebook.com/oantram.668591' },
            { name: 'Đang cập nhật...', role: 'Đang cập nhật', isPlaceholder: true },
            { name: 'Đang cập nhật...', role: 'Đang cập nhật', isPlaceholder: true },
        ];

        return (
             <div className="animate-fadeIn pb-10">
                 {/* Hero Section */}
                 <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 mb-10 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                    <div className="flex-1 relative z-10">
                        <div className="inline-block bg-blue-100 text-[#003375] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 border border-blue-200">
                            Về dự án
                        </div>
                        <h2 className="text-3xl md:text-4xl font-black text-[#003375] mb-6 uppercase tracking-tight">
                            Về chúng mình
                        </h2>
                        <p className="text-gray-600 leading-relaxed text-base md:text-lg text-justify">
                            <span className="font-bold text-[#003375]">HUB PLANNER</span> là dự án phi lợi nhuận được phát triển bởi chính sinh viên trường Đại học Ngân hàng TP.HCM. Xuất phát từ nhu cầu thực tế, chúng mình tạo ra HUB PLANNER với sứ mệnh đơn giản hóa đời sống sinh viên, từ quản lý điểm số đến kết nối cộng đồng. Chúng mình luôn nỗ lực hoàn thiện từng ngày để mang lại trải nghiệm tốt nhất cho các bạn.
                        </p>
                        <div className="mt-6 flex items-center gap-2 text-[#990000] font-bold text-sm">
                            <Heart className="fill-current animate-pulse" size={18} />
                            <span>Made with love for HUB Students</span>
                        </div>
                    </div>
                    {/* PHẦN ĐÃ SỬA: Xóa border/bg trắng, tăng kích thước lên w-64 h-64 */}
                    <div className="shrink-0 relative z-10 flex items-center justify-center w-64 h-64">
                        <img 
                            src="/logo.png" 
                            alt="HUB Planner Logo" 
                            className="w-full h-full object-contain"
                        />
                    </div>
                 </div>

                 {/* Team Section */}
                 <div className="text-center mb-10">
                     <h3 className="text-2xl font-black text-gray-800 uppercase tracking-widest relative inline-block pb-2">
                        Humans of HUB Planner
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-1 bg-[#990000] rounded-full"></div>
                     </h3>
                 </div>

                 {/* Founder Card */}
                 <div className="max-w-md mx-auto mb-10 transform hover:-translate-y-2 transition-transform duration-300">
                     <div className="bg-gradient-to-br from-[#003375] to-[#00509d] rounded-2xl shadow-xl overflow-hidden text-white relative group cursor-default">
                         <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                         <div className="p-8 text-center relative z-10">
                             <div className="w-24 h-24 mx-auto bg-white rounded-full p-1 shadow-lg mb-4 flex items-center justify-center text-[#003375] font-bold text-3xl">
                                H
                             </div>
                             <h4 className="text-2xl font-bold mb-1">{founder.name}</h4>
                             <p className="text-blue-200 text-sm font-semibold uppercase tracking-widest mb-6 bg-white/10 inline-block px-3 py-1 rounded-full border border-white/20">{founder.role}</p>
                             
                             <div className="flex justify-center gap-4 mt-6">
                                {/* Phone */}
                                <a href={`tel:${founder.phone}`} className="p-3 bg-white/10 hover:bg-white text-white hover:text-[#003375] rounded-full transition-all active:scale-95 shadow-sm hover:shadow-md backdrop-blur-sm relative group/icon">
                                    <Phone size={20} />
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-black/90 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                        {founder.phone}
                                        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-black/90"></span>
                                    </span>
                                </a>
                                {/* Mail */}
                                <a href={`mailto:${founder.email}`} className="p-3 bg-white/10 hover:bg-white text-white hover:text-[#990000] rounded-full transition-all active:scale-95 shadow-sm hover:shadow-md backdrop-blur-sm relative group/icon">
                                    <Mail size={20} />
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-black/90 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                        {founder.email}
                                        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-black/90"></span>
                                    </span>
                                </a>
                                {/* FB */}
                                <a href={founder.fb} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/10 hover:bg-white text-white hover:text-blue-600 rounded-full transition-all active:scale-95 shadow-sm hover:shadow-md backdrop-blur-sm relative group/icon">
                                    <Facebook size={20} />
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-black/90 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                        Facebook
                                        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-black/90"></span>
                                    </span>
                                </a>
                             </div>
                         </div>
                     </div>
                 </div>

                 {/* Collaborators Grid */}
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                     {collaborators.map((member, idx) => (
                         <div 
                           key={idx} 
                           className={`bg-white rounded-xl shadow-sm border p-6 flex flex-col items-center text-center transition-all duration-300 ${member.isPlaceholder ? 'border-dashed border-gray-300 opacity-60' : 'border-gray-100 hover:shadow-lg hover:-translate-y-1 hover:border-blue-100'}`}
                         >
                             <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${member.isPlaceholder ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-[#003375]'}`}>
                                 <User size={32} />
                             </div>
                             <h5 className={`font-bold text-lg mb-1 ${member.isPlaceholder ? 'text-gray-400' : 'text-gray-800'}`}>{member.name}</h5>
                             <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{member.role}</p>
                             
                             {!member.isPlaceholder && (
                                 <div className="flex gap-4 mt-auto pt-4 border-t border-gray-100 w-full justify-center">
                                     {member.phone && (
                                        <a href={`tel:${member.phone}`} className="text-gray-400 hover:text-green-600 transition-colors bg-gray-50 p-2 rounded-full hover:bg-green-50 relative group/icon">
                                            <Phone size={18} />
                                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-black/80 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                                                {member.phone}
                                                <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-black/80"></span>
                                            </span>
                                        </a>
                                     )}
                                     {member.email && (
                                        <a href={`mailto:${member.email}`} className="text-gray-400 hover:text-[#990000] transition-colors bg-gray-50 p-2 rounded-full hover:bg-red-50 relative group/icon">
                                            <Mail size={18} />
                                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-black/80 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                                                {member.email}
                                                <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-black/80"></span>
                                            </span>
                                        </a>
                                     )}
                                     {member.fb && (
                                        <a href={member.fb} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 transition-colors bg-gray-50 p-2 rounded-full hover:bg-blue-50 relative group/icon">
                                            <Facebook size={18} />
                                            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-bold text-white bg-black/80 rounded opacity-0 group-hover/icon:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                                                Facebook
                                                <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-black/80"></span>
                                            </span>
                                        </a>
                                     )}
                                 </div>
                             )}
                         </div>
                     ))}
                 </div>
             </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-slideInRight">
      {/* Sidebar Menu */}
      <div className="md:col-span-1">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 sticky top-24">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-3 pt-2">Danh mục</h3>
            <div className="space-y-1">
                <button
                    onClick={() => handleTabChange('contacts')}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 ${activeTab === 'contacts' ? 'bg-[#003375] text-white shadow-md' : 'text-gray-600 hover:bg-gray-50 hover:shadow-sm'}`}
                >
                    <Phone size={20} />
                    <span className="font-bold">Danh bạ & Khoa</span>
                    {activeTab === 'contacts' && <ChevronRight size={16} className="ml-auto opacity-70"/>}
                </button>

                <button
                    onClick={() => handleTabChange('bus')}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 ${activeTab === 'bus' ? 'bg-yellow-500 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50 hover:shadow-sm'}`}
                >
                    <Bus size={20} />
                    <span className="font-bold">Xe buýt</span>
                    {activeTab === 'bus' && <ChevronRight size={16} className="ml-auto opacity-70"/>}
                </button>

                <button
                    onClick={() => handleTabChange('clubs')}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 ${activeTab === 'clubs' ? 'bg-[#990000] text-white shadow-md' : 'text-gray-600 hover:bg-gray-50 hover:shadow-sm'}`}
                >
                    <Users size={20} />
                    <span className="font-bold">CLB - Đội - Nhóm</span>
                    {activeTab === 'clubs' && <ChevronRight size={16} className="ml-auto opacity-70"/>}
                </button>

                <button
                    onClick={() => handleTabChange('scholarships')}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 ${activeTab === 'scholarships' ? 'bg-green-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50 hover:shadow-sm'}`}
                >
                    <Award size={20} />
                    <span className="font-bold">Học bổng & Quy chế</span>
                    {activeTab === 'scholarships' && <ChevronRight size={16} className="ml-auto opacity-70"/>}
                </button>

                <button
                    onClick={() => handleTabChange('faqs')}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 ${activeTab === 'faqs' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50 hover:shadow-sm'}`}
                >
                    <HelpCircle size={20} />
                    <span className="font-bold">FAQs</span>
                    {activeTab === 'faqs' && <ChevronRight size={16} className="ml-auto opacity-70"/>}
                </button>

                <button
                    onClick={() => handleTabChange('about')}
                    className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all duration-200 ${activeTab === 'about' ? 'bg-[#003375] text-white shadow-md' : 'text-gray-600 hover:bg-white hover:shadow-sm'}`}
                >
                    <Info size={20} />
                    <span className="font-bold">Về chúng mình</span>
                     {activeTab === 'about' && <ChevronRight size={16} className="ml-auto opacity-70"/>}
                </button>
            </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="md:col-span-3">
        {renderContent()}
      </div>
    </div>
  );
};
