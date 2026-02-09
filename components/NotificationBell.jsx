import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
// 👇 IMPORT CÔNG CỤ XỬ LÝ NGÀY THÁNG TỪ UTILS
import { formatDate, formatTime } from '../utils/dateUtils';

const NotificationBell = ({ currentUserId }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!currentUserId) return;

    // 1. Lấy thông báo cũ
    const fetchNotifications = async () => {
      try {
        const { data } = await supabase
          .from('notifications')
          .select(`*, actor:profiles!actor_id(full_name, avatar_url, student_code)`)
          .eq('receiver_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (data) {
          setNotifications(data);
          setUnreadCount(data.filter(n => !n.is_read).length);
        }
      } catch (error) {
        console.log("Lỗi tải thông báo:", error);
      }
    };

    fetchNotifications();

    // 2. KẾT NỐI REALTIME (Đã bọc "giáp" chống sập web trên Mobile)
    let channel;
    try {
      channel = supabase
        .channel('public:notifications') 
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `receiver_id=eq.${currentUserId}`, // 👈 ĐÃ THÊM DÒNG NÀY ĐỂ BẮT REALTIME NHẠY HƠN
          },
          async (payload) => {
            // Logic xử lý khi có tin nhắn mới
             const { data: actorData } = await supabase
              .from('profiles')
              .select('full_name, avatar_url, student_code')
              .eq('id', payload.new.actor_id)
              .single();

            const newNotif = { ...payload.new, actor: actorData };
            
            setNotifications(prev => [newNotif, ...prev]);
            setUnreadCount(prev => prev + 1);
          }
        )
        .subscribe((status) => {
           // Nếu kết nối lỗi (do Safari chặn), chỉ log ra console chứ không làm sập app
           if (status === 'CHANNEL_ERROR') {
             console.log('Realtime connection failed (safe mode)');
           }
        });
    } catch (err) {
      console.log("Realtime init error:", err);
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Đóng menu khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRead = async (notif) => {
    if (notif?.actor?.student_code) {
        navigate(`/profile/${notif.actor.student_code}`);
    }
    setIsOpen(false);

    if (!notif.is_read) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notif.id);
      
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const markAllRead = async () => {
    await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('receiver_id', currentUserId)
        .eq('is_read', false);
    
    setNotifications(prev => prev.map(n => ({...n, is_read: true})));
    setUnreadCount(0);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="p-2 relative hover:bg-gray-100 rounded-full transition-colors mt-1"
      >
        <Bell size={20} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 h-4 w-4 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

{isOpen && (
        <div 
          className="
            absolute 
            -right-16 sm:right-0  /* Mobile: Dịch sang phải 64px | Laptop: Neo sát phải */
            mt-2 
            w-72 sm:w-80          /* Mobile: Rộng 288px | Laptop: Rộng 320px */
            bg-white 
            rounded-xl 
            shadow-xl 
            border border-gray-100 
            overflow-hidden 
            z-50 
            animate-fadeIn
            max-w-[95vw]          /* Đảm bảo không bao giờ to hơn màn hình */
          "
        >
          <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <span className="font-bold text-gray-700 text-sm">Thông báo</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-[#003375] hover:underline font-medium">
                Đánh dấu đã đọc
              </button>
            )}
          </div>
          
          <div className="max-h-80 sm:max-h-96 overflow-y-auto custom-scrollbar"> {/* Thêm custom-scrollbar nếu cần */}
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">Chưa có thông báo nào</div>
            ) : (
              notifications.map((notif) => (
                <div 
                  key={notif.id} 
                  onClick={() => handleRead(notif)}
                  className={`p-3 flex items-start gap-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0 ${!notif.is_read ? 'bg-blue-50/60' : ''}`}
                >
                  <div className="relative shrink-0"> {/* Thêm shrink-0 để avatar không bị méo */}
                    <img 
                      src={notif.actor?.avatar_url || `https://ui-avatars.com/api/?name=${notif.actor?.full_name || 'User'}&background=random`} 
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-gray-200" 
                      alt="avatar"
                      onError={(e) => {
                        e.target.src = `https://ui-avatars.com/api/?name=${notif.actor?.full_name || 'U'}&background=random`;
                      }}
                    />
                    {notif.type === 'follow' && (
                        <div className="absolute -bottom-1 -right-1 bg-[#003375] rounded-full p-0.5 border-2 border-white">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                        </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0"> {/* min-w-0 giúp text truncate hoạt động tốt */}
                    <p className="text-xs sm:text-sm text-gray-800 leading-snug">
                      <span className="font-bold">{notif.actor?.full_name || 'Người dùng'}</span>
                      {notif.type === 'follow' ? ' đã bắt đầu theo dõi bạn.' : ' đã tương tác.'}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1 font-medium">
                      {formatTime(notif.created_at)} · {formatDate(notif.created_at)}
                    </p>
                  </div>
                  {!notif.is_read && <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 shrink-0"></div>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;