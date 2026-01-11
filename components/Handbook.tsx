import React, { useState } from 'react';
import { Phone, Bus, Users, Award, ChevronRight, HelpCircle, Info, Heart, Mail, Facebook, User, Book } from 'lucide-react';
import { playClick } from '../utils/audio';
import { ContactSection } from './handbook/ContactSection';
import { BusSection } from './handbook/BusSection';
import { ClubSection } from './handbook/ClubSection';
import { FaqSection } from './handbook/FaqSection';

type TabType = 'contacts' | 'bus' | 'clubs' | 'scholarships' | 'regulations' | 'faqs' | 'about';

export const Handbook: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('contacts');

  const handleTabChange = (tab: TabType) => {
      playClick();
      setActiveTab(tab);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'contacts':
        return <ContactSection />;

      case 'bus':
        return <BusSection />;

      case 'clubs':
        return <ClubSection />;

      case 'faqs':
        return <FaqSection />;

      case 'scholarships':
        // Still hardcoded for now as it's static policy content
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
             {/* ... Hardcoded policies ... */}
             <div className="p-4 bg-gray-50 rounded text-center text-sm text-gray-500">
                (Nội dung đang được cập nhật thêm...)
             </div>
          </div>
        );

      case 'about':
        // Static About content
        const founder = { 
            name: 'Trần Quốc Hoàng', 
            role: 'Founder', 
            phone: '0389342812', 
            email: 'tqhoangg@gmail.com', 
            fb: 'http://facebook.com/tqhoangg.05' 
        };

        const collaborators = [
            { name: 'Nguyễn Hoàng Khiêm', role: 'Cộng tác viên', phone: '0932142577', email: 'khiempisces2@gmail.com', fb: 'https://www.facebook.com/nguyen.hoang.khiem.975396' },
            { name: 'Nguyễn Thị Kiều My', role: 'Cộng tác viên', phone: '0376744258', email: 'nmy56358@gmail.com', fb: 'https://www.facebook.com/n.t.kieu.my.573292' },
            { name: 'Đang cập nhật...', role: 'Developer', isPlaceholder: true },
            { name: 'Đang cập nhật...', role: 'Designer', isPlaceholder: true },
            { name: 'Đang cập nhật...', role: 'Content', isPlaceholder: true },
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
                    <div className="shrink-0 relative z-10 flex items-center justify-center bg-gray-50 rounded-full w-40 h-40 border-4 border-white shadow-lg">
                        <Users size={64} className="text-[#003375] opacity-80" />
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
                                </a>
                                {/* Mail */}
                                <a href={`mailto:${founder.email}`} className="p-3 bg-white/10 hover:bg-white text-white hover:text-[#990000] rounded-full transition-all active:scale-95 shadow-sm hover:shadow-md backdrop-blur-sm relative group/icon">
                                    <Mail size={20} />
                                </a>
                                {/* FB */}
                                <a href={founder.fb} target="_blank" rel="noopener noreferrer" className="p-3 bg-white/10 hover:bg-white text-white hover:text-blue-600 rounded-full transition-all active:scale-95 shadow-sm hover:shadow-md backdrop-blur-sm relative group/icon">
                                    <Facebook size={20} />
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
                                        </a>
                                     )}
                                     {member.email && (
                                        <a href={`mailto:${member.email}`} className="text-gray-400 hover:text-[#990000] transition-colors bg-gray-50 p-2 rounded-full hover:bg-red-50 relative group/icon">
                                            <Mail size={18} />
                                        </a>
                                     )}
                                     {member.fb && (
                                        <a href={member.fb} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-600 transition-colors bg-gray-50 p-2 rounded-full hover:bg-blue-50 relative group/icon">
                                            <Facebook size={18} />
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