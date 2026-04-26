import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { formatDate, formatTime } from '../utils/dateUtils';
import {
  getCurrentPushSubscription,
  isPushSupported,
  subscribeToDeviceNotifications,
} from '../utils/pushNotifications';

const NotificationBell = ({ currentUserId }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [isLoadingPush, setIsLoadingPush] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 96, right: 16 });

  const navigate = useNavigate();
  const bellRef = useRef(null);
  const panelRef = useRef(null);

  const updatePanelPosition = () => {
    const rect = bellRef.current?.getBoundingClientRect();
    if (!rect) return;

    const isMobile = window.innerWidth < 640;
    setPanelPosition({
      top: isMobile ? Math.max(rect.bottom + 12, 124) : rect.bottom + 8,
      right: Math.max(window.innerWidth - rect.right, 16),
    });
  };

  const refreshPushState = async () => {
    if (!isPushSupported()) {
      setIsPushEnabled(false);
      return;
    }

    const subscription = await getCurrentPushSubscription().catch(() => null);
    setIsPushEnabled(Notification.permission === 'granted' && Boolean(subscription));
  };

  useEffect(() => {
    refreshPushState();

    const handleVisibilityChange = () => {
      if (!document.hidden) refreshPushState();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refreshPushState);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshPushState);
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*, actor:profiles!actor_id(full_name, avatar_url, student_code)')
        .eq('receiver_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter((item) => !item.is_read).length);
      }
    };

    fetchNotifications();

    const channel = supabase
      .channel(`notifications:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `receiver_id=eq.${currentUserId}`,
        },
        async (payload) => {
          let actorData = null;

          if (payload.new.actor_id) {
            const { data } = await supabase
              .from('profiles')
              .select('full_name, avatar_url, student_code')
              .eq('id', payload.new.actor_id)
              .single();
            actorData = data;
          }

          setNotifications((prev) => [{ ...payload.new, actor: actorData }, ...prev]);
          setUnreadCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const clickedBell = bellRef.current?.contains(event.target);
      const clickedPanel = panelRef.current?.contains(event.target);

      if (!clickedBell && !clickedPanel) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updatePanelPosition();
    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);

    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [isOpen]);

  const togglePanel = (event) => {
    event.preventDefault();
    event.stopPropagation();
    updatePanelPosition();
    refreshPushState();
    setIsOpen((prev) => !prev);
  };

  const handleTogglePush = async () => {
    if (!isPushSupported()) {
      alert('Trình duyệt của bạn không hỗ trợ thông báo.');
      return;
    }

    setIsLoadingPush(true);

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Bạn cần cấp quyền thông báo trong cài đặt trình duyệt.');
        return;
      }

      await subscribeToDeviceNotifications(currentUserId);
      setIsPushEnabled(true);
    } catch (error) {
      console.error('Push notification toggle failed:', error);
      alert('Co loi xay ra, vui long thu lai sau.');
    } finally {
      setIsLoadingPush(false);
    }
  };

  const handleRead = async (notif) => {
    setIsOpen(false);

    if (notif.link) {
      navigate(notif.link);
    } else if (notif?.actor?.student_code) {
      navigate(`/profile/${notif.actor.student_code}`);
    }

    if (!notif.is_read) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notif.id);

      setNotifications((prev) => prev.map((item) => (
        item.id === notif.id ? { ...item, is_read: true } : item
      )));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  const markAllRead = async () => {
    if (!currentUserId) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('receiver_id', currentUserId)
      .eq('is_read', false);

    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);
  };

  const renderNotificationContent = (notif) => {
    if (notif.type === 'system_alert') {
      return {
        avatar: (
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center border border-blue-200">
            <Settings size={20} />
          </div>
        ),
        message: (
          <span className="font-medium text-gray-800">
            {notif.content || 'Bạn có thông báo mới từ hệ thống.'}
          </span>
        ),
      };
    }

    const actorName = notif.actor?.full_name || 'Nguoi dung';

    return {
      avatar: (
        <img
          src={notif.actor?.avatar_url || `https://ui-avatars.com/api/?name=${actorName}&background=random`}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-gray-200"
          alt="avatar"
          onError={(event) => {
            event.currentTarget.src = `https://ui-avatars.com/api/?name=${actorName}&background=random`;
          }}
        />
      ),
      message: notif.type === 'follow' ? (
        <>
          <span className="font-bold">{actorName}</span> da bat dau theo doi ban.
        </>
      ) : (
        <>
          <span className="font-bold">{actorName}</span>
          {notif.content ? ` ${notif.content}` : ' da tuong tac voi ban.'}
        </>
      ),
    };
  };

  const panel = isOpen ? createPortal(
    <div
      ref={panelRef}
      style={{ top: panelPosition.top, right: panelPosition.right, zIndex: 100000 }}
      className="fixed w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:w-80 sm:max-w-[95vw] bg-white rounded-2xl sm:rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-fadeIn"
    >
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <span className="font-bold text-gray-700 text-sm">Thông báo</span>
        {unreadCount > 0 && (
          <button type="button" onClick={markAllRead} className="text-xs text-[#003375] hover:underline font-medium">
            Danh dau da doc
          </button>
        )}
      </div>

      <div className="max-h-[52dvh] sm:max-h-80 overflow-y-auto custom-scrollbar">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">Chưa có thông báo nào</div>
        ) : (
          notifications.map((notif) => {
            const { avatar, message } = renderNotificationContent(notif);

            return (
              <div
                key={notif.id}
                onClick={() => handleRead(notif)}
                className={`p-3 flex items-start gap-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0 ${!notif.is_read ? 'bg-blue-50/60' : ''}`}
              >
                <div className="relative shrink-0">{avatar}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm text-gray-800 leading-snug">{message}</p>
                  <p className="text-[10px] text-gray-400 mt-1 font-medium">
                    {formatTime(notif.created_at)} - {formatDate(notif.created_at)}
                  </p>
                </div>
                {!notif.is_read && <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 shrink-0" />}
              </div>
            );
          })
        )}
      </div>

      {!isPushEnabled && (
        <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-gray-700">Thông báo đẩy</span>
            <span className="text-[10px] text-gray-500">Nhan thong bao khi tat web</span>
          </div>

          <button
            type="button"
            onClick={handleTogglePush}
            disabled={isLoadingPush}
            className={`relative inline-flex h-5 w-9 items-center rounded-full bg-gray-300 transition-colors duration-300 focus:outline-none ${
              isLoadingPush ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <span className="inline-block h-4 w-4 translate-x-1 rounded-full bg-white transition duration-300 shadow-sm" />
          </button>
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative z-[100001] pointer-events-auto" ref={bellRef}>
      <button
        type="button"
        aria-label="Mo thong bao"
        onPointerDown={togglePanel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        className="p-3 relative hover:bg-gray-100 rounded-full transition-colors mt-1 pointer-events-auto touch-manipulation"
      >
        <Bell size={20} className="text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
};

export default NotificationBell;
