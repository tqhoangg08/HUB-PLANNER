import React, { useState } from 'react';
import { ChevronLeft, Search, Bell, MoreVertical, Edit2, Pencil, MapPin, Mail, Phone, Clock } from 'lucide-react';

// --- MOCK DATA ---
const userProfileData = {
  avatarInitials: "T",
  fullName: "Trương Huỳnh Đức",
  username: "Trương Huỳnh Đức",
  studentType: "SV chính quy",
  studentId: "20520245",
  contactInfo: {
    address: "Khu phố 6, Phường Linh Trung, Thành phố Thủ Đức, Thành phố Hồ Chí Minh, Việt Nam",
    personalEmail: "20520245@gm.uit.edu.vn",
    phone: "0961314502"
  }
};

const activityLogs = [
  {
    id: 1,
    time: "10:14 PM | Oct 20, 2024",
    description: "Bạn vừa cập nhật mục tiêu GPA thành 3.65 (Khá)",
    actionText: "Chi tiết",
    actionUrl: "#"
  },
  {
    id: 2,
    time: "09:15 AM | Oct 20, 2024",
    description: "AI Advisor gợi ý bạn nên đăng ký thêm 3 môn tự chọn để bù điểm.",
    actionText: "Xem gợi ý",
    actionUrl: "#"
  },
  {
    id: 3,
    time: "04:30 PM | Oct 19, 2024",
    description: "Bảng điểm học kỳ 2 (2023-2024) vừa được hệ thống đồng bộ tự động.",
    actionText: "Xem bảng điểm",
    actionUrl: "#"
  }
];

const bottomNavItems = [
  { icon: BarChart2, label: "Tổng quan", active: false },
  { icon: CalendarDays, label: "Lộ trình", active: false },
  { icon: Sparkles, label: "Trợ lý AI", active: false },
  { icon: Files, label: "Tài liệu", active: false },
  { icon: UserCircle, label: "Cá nhân", active: true },
];

// --- HỢP PHẦN UI ---

// 1. Header component
const ProfileHeader = () => (
  <header className="bg-[#003375] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-md">
    <div className="flex items-center gap-2.5">
      <button className="p-1 -ml-1"><ChevronLeft size={24} /></button>
      <h1 className="font-bold text-lg tracking-tight">Cá nhân</h1>
    </div>
    <div className="flex items-center gap-1.5">
      <button className="p-1.5"><Search size={20} /></button>
      <button className="p-1.5"><Bell size={20} /></button>
      <button className="p-1.5"><MoreVertical size={20} /></button>
    </div>
  </header>
);

// 2. Profile Info Section
const ProfileInfo = () => (
  <div className="bg-[#003375] text-white px-5 pt-4 pb-7 flex items-center gap-5">
    {/* Avatar */}
    <div className="relative shrink-0">
      <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center text-[#003375] font-extrabold text-4xl shadow-lg border border-white/20">
        {userProfileData.avatarInitials}
      </div>
      <button className="absolute -bottom-1.5 -right-1.5 bg-[#4285F4] text-white p-1.5 rounded-full border-2 border-white/20 shadow-md">
        <Pencil size={14} className='fill-current' />
      </button>
    </div>
    
    {/* Name & Sub-info */}
    <div className="flex-1 space-y-0.5">
      <div className="flex items-center gap-2">
        <h2 className="font-bold text-xl leading-tight">{userProfileData.fullName}</h2>
        <button className="text-white/80 p-0.5 -mt-0.5"><Edit2 size={16} /></button>
      </div>
      <p className="text-sm text-white/90">{userProfileData.username}</p>
      <p className="text-sm text-white/90">{userProfileData.studentType}</p>
      <p className="text-sm text-white/90">{userProfileData.studentId}</p>
    </div>
  </div>
);

// 3. Thông tin cá nhân Tab Content
const PersonalInfoTab = () => (
  <div className="p-4 space-y-4">
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <h3 className="font-bold text-gray-900 mb-5">Thông tin liên lạc</h3>
      
      <div className="space-y-4 text-sm">
        {/* Địa chỉ */}
        <div className="flex items-start gap-3.5">
          <MapPin size={20} className="text-[#003375] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-gray-500 mb-0.5">Địa chỉ</p>
            <p className="text-gray-900 leading-relaxed">{userProfileData.contactInfo.address}</p>
          </div>
          <button className="text-blue-600 p-0.5"><Edit2 size={16} /></button>
        </div>

        {/* Email cá nhân */}
        <div className="flex items-start gap-3.5">
          <Mail size={20} className="text-[#003375] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-gray-500 mb-0.5">Email cá nhân</p>
            <p className="text-gray-900">{userProfileData.contactInfo.personalEmail}</p>
          </div>
        </div>

        {/* Điện thoại */}
        <div className="flex items-start gap-3.5">
          <Phone size={20} className="text-[#003375] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-gray-500 mb-0.5">Điện thoại</p>
            <p className="text-gray-900">{userProfileData.contactInfo.phone}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// 4. Lịch sử hoạt động Tab Content
const ActivityHistoryTab = () => (
  <div className="p-4 space-y-3.5">
    {activityLogs.map((log) => (
      <div key={log.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-start gap-3.5 relative overflow-hidden">
        {/* Timeline Dot & Line */}
        <div className="w-8 shrink-0 flex flex-col items-center pt-1.5 h-full absolute top-0 left-0">
          <div className="w-2 h-2 rounded-full bg-[#003375]"></div>
          <div className="w-0.5 h-full bg-gray-100 flex-1"></div>
        </div>

        <Clock size={16} className="text-gray-400 shrink-0 mt-0.5 relative z-10" />
        <div className="flex-1 text-sm relative z-10 pl-6 border-l-2 border-gray-100 -ml-8">
          <p className="text-gray-500 mb-1">{log.time}</p>
          <p className="text-gray-900 leading-relaxed mb-2.5">{log.description}</p>
          <a href={log.actionUrl} className="font-bold text-blue-600 hover:text-blue-800 transition-colors">
            {log.actionText} →
          </a>
        </div>
      </div>
    ))}
  </div>
);

// 5. Bottom Navigation component
const BottomNav = () => (
  <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-5px_15px_rgba(0,0,0,0.03)] px-3 pt-2.5 pb-safe flex items-center justify-around z-50">
    {bottomNavItems.map((item, index) => (
      <button key={index} className={`flex flex-col items-center gap-1.5 w-[70px] ${item.active ? 'text-[#003375]' : 'text-gray-500'}`}>
        <item.icon size={22} className={item.active ? 'fill-[#003375]/10' : ''} />
        <span className={`text-[11px] font-semibold ${item.active ? '' : 'text-gray-500'}`}>{item.label}</span>
      </button>
    ))}
  </nav>
);


// ============================================
// MAIN PAGE COMPONENT
// ============================================

export const ProfilePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'info' | 'history'>('info');

  return (
    <div className="min-h-screen bg-[#F1F5F9] pb-32"> {/* Thêm pb-32 để không bị BottomNav che */}
      <style>{`
        /* Ẩn scrollbar */
        .custom-scrollbar::-webkit-scrollbar { width: 0px; background: transparent; }
        
        /* Font Tini (Tiny) */
        body { font-size: 14px; color: #1f2937; } 
      `}</style>
      
      <ProfileHeader />
      <ProfileInfo />

      {/* Tabs */}
      <div className="sticky top-[52px] bg-white z-40 border-b border-gray-100 shadow-sm">
        <div className="flex items-center">
          <button 
            onClick={() => setActiveTab('info')}
            className={`flex-1 text-center py-4 text-[13px] font-bold border-b-2 transition-colors ${activeTab === 'info' ? 'border-[#003375] text-[#003375]' : 'border-transparent text-gray-600 active:bg-gray-50'}`}
          >
            Thông tin cá nhân
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex-1 text-center py-4 text-[13px] font-bold border-b-2 transition-colors ${activeTab === 'history' ? 'border-[#003375] text-[#003375]' : 'border-transparent text-gray-600 active:bg-gray-50'}`}
          >
            Lịch sử hoạt động
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <main className="custom-scrollbar">
        {activeTab === 'info' && <PersonalInfoTab />}
        {activeTab === 'history' && <ActivityHistoryTab />}
      </main>

      <BottomNav />
    </div>
  );
};


// Icons bổ sung cho Bottom Nav
import { BarChart2, CalendarDays, Sparkles, Files, UserCircle } from 'lucide-react';