import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Megaphone, Search, Settings, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { formatDate, formatTime } from '../utils/dateUtils';
import {
  getCurrentPushSubscription,
  isPushSupported,
  subscribeToDeviceNotifications,
} from '../utils/pushNotifications';
import { getAvatarColorClass, isAllowedAvatarColor, isAvatarImageUrl } from '../utils/avatarColors';
import { setRuntimeStyleRule } from '../utils/runtimeStyles';
import { FEATURE_SCHEDULE_REMINDERS } from '../utils/featureFlags';

const notificationStreams = new Map();

const countUnread = (items) => items.filter((item) => !item.is_read).length;

const emitNotificationStream = (stream) => {
  const snapshot = {
    notifications: stream.notifications,
    unreadCount: countUnread(stream.notifications),
  };

  stream.listeners.forEach((listener) => listener(snapshot));
};

const updateNotificationStream = (userId, updater) => {
  const stream = notificationStreams.get(userId);
  if (!stream) return;

  stream.notifications = updater(stream.notifications);
  emitNotificationStream(stream);
};

const fetchNotificationStream = (stream) => {
  if (stream.fetchPromise) return stream.fetchPromise;

  stream.fetchPromise = supabase
    .from('notifications')
    .select('*, actor:profiles!actor_id(full_name, avatar_url, student_code)')
    .eq('receiver_id', stream.userId)
    .order('created_at', { ascending: false })
    .limit(20)
    .then(({ data }) => {
      if (data) {
        stream.notifications = data;
        emitNotificationStream(stream);
      }
    })
    .finally(() => {
      stream.fetchPromise = null;
    });

  return stream.fetchPromise;
};

const ensureNotificationChannel = (stream) => {
  if (stream.channel) return;

  stream.channel = supabase
    .channel(`notifications:${stream.userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `receiver_id=eq.${stream.userId}`,
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

        stream.notifications = [
          { ...payload.new, actor: actorData },
          ...stream.notifications.filter((item) => item.id !== payload.new.id),
        ].slice(0, 20);
        emitNotificationStream(stream);
      }
    )
    .subscribe();
};

const subscribeToNotificationStream = (userId, listener) => {
  let stream = notificationStreams.get(userId);

  if (!stream) {
    stream = {
      userId,
      notifications: [],
      listeners: new Set(),
      subscribers: 0,
      channel: null,
      fetchPromise: null,
    };
    notificationStreams.set(userId, stream);
  }

  stream.subscribers += 1;
  stream.listeners.add(listener);
  listener({ notifications: stream.notifications, unreadCount: countUnread(stream.notifications) });
  fetchNotificationStream(stream);
  ensureNotificationChannel(stream);

  return () => {
    stream.listeners.delete(listener);
    stream.subscribers = Math.max(0, stream.subscribers - 1);

    if (stream.subscribers === 0) {
      if (stream.channel) supabase.removeChannel(stream.channel);
      notificationStreams.delete(userId);
    }
  };
};

const NotificationBell = ({ currentUserId }) => {
  const defaultPreferences = {
    system: true,
    events: true,
    lost_found: true,
    schedule: FEATURE_SCHEDULE_REMINDERS,
    school: true,
  };

  const preferenceItems = [
    { key: 'system', label: 'Thông báo hệ thống', icon: ShieldCheck },
    { key: 'events', label: 'Sự kiện', icon: Sparkles },
    { key: 'lost_found', label: 'Tìm đồ thất lạc', icon: Search },
    ...(FEATURE_SCHEDULE_REMINDERS ? [{ key: 'schedule', label: 'Lịch học', icon: Megaphone }] : []),
    { key: 'school', label: 'Thông báo nhà trường', icon: Megaphone },
  ];

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [isLoadingPush, setIsLoadingPush] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 96, right: 16 });

  const navigate = useNavigate();
  const bellRef = useRef(null);
  const panelRef = useRef(null);
  const storageKey = currentUserId ? `notification_preferences:${currentUserId}` : 'notification_preferences:guest';

  const getNotificationCategory = (notif) => {
    const raw = `${notif?.category || ''} ${notif?.type || ''} ${notif?.link || ''}`.toLowerCase();
    if (raw.includes('event') || raw.includes('/events')) return 'events';
    if (raw.includes('lost') || raw.includes('found') || raw.includes('/lost-found')) return 'lost_found';
    if (raw.includes('schedule') || raw.includes('course') || raw.includes('/schedule')) return 'schedule';
    if (raw.includes('school') || raw.includes('announcement')) return 'school';
    return 'system';
  };

  const visibleNotifications = notifications.filter((notif) => {
    const category = getNotificationCategory(notif);
    if (category === 'schedule' && !FEATURE_SCHEDULE_REMINDERS) return false;
    return preferences[category] !== false;
  });

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
    setRuntimeStyleRule('notification-panel-position', '.notification-panel', {
      top: `${panelPosition.top}px`,
      right: `${panelPosition.right}px`,
    });
  }, [panelPosition.top, panelPosition.right]);

  useEffect(() => {
    const loadPreferences = async () => {
      const localValue = localStorage.getItem(storageKey);
      if (localValue) {
        try {
          setPreferences({
            ...defaultPreferences,
            ...JSON.parse(localValue),
            schedule: FEATURE_SCHEDULE_REMINDERS,
          });
        } catch {
          setPreferences(defaultPreferences);
        }
      } else {
        setPreferences(defaultPreferences);
      }

      if (!currentUserId) return;
      const { data } = await supabase
        .from('notification_preferences')
        .select('system, events, lost_found, schedule, school')
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (data) {
        const next = { ...defaultPreferences, ...data, schedule: FEATURE_SCHEDULE_REMINDERS };
        setPreferences(next);
        localStorage.setItem(storageKey, JSON.stringify(next));
      }
    };

    loadPreferences();
  }, [currentUserId, storageKey]);

  useEffect(() => {
    if (!currentUserId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    return subscribeToNotificationStream(currentUserId, (snapshot) => {
      setNotifications(snapshot.notifications);
      setUnreadCount(snapshot.unreadCount);
    });
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

  const togglePreference = async (key) => {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    localStorage.setItem(storageKey, JSON.stringify(next));

    if (!currentUserId) return;
    await supabase
      .from('notification_preferences')
      .upsert({
        user_id: currentUserId,
        ...next,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
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

      updateNotificationStream(currentUserId, (prev) => prev.map((item) => (
        item.id === notif.id ? { ...item, is_read: true } : item
      )));
    }
  };

  const markAllRead = async () => {
    if (!currentUserId) return;

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('receiver_id', currentUserId)
      .eq('is_read', false);

    updateNotificationStream(currentUserId, (prev) => prev.map((item) => ({ ...item, is_read: true })));
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
    const actorAvatarUrl = notif.actor?.avatar_url;
    const actorInitial = actorName.trim().charAt(0).toUpperCase() || 'U';

    return {
      avatar: isAvatarImageUrl(actorAvatarUrl) ? (
        <img
          src={actorAvatarUrl}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover border border-gray-200"
          alt="avatar"
          onError={(event) => {
            event.currentTarget.src = `https://ui-avatars.com/api/?name=${actorName}&background=random`;
          }}
        />
      ) : (
        <div
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full text-white flex items-center justify-center border border-gray-200 font-black text-sm ${isAllowedAvatarColor(actorAvatarUrl) ? getAvatarColorClass(actorAvatarUrl) : 'avatar-color-primary'}`}
        >
          {actorInitial}
        </div>
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
      className="notification-panel fixed w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:w-80 sm:max-w-[95vw] bg-white rounded-2xl sm:rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-fadeIn"
    >
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <span className="font-bold text-gray-700 text-sm">Thông báo</span>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button type="button" onClick={markAllRead} className="text-xs text-[#003375] hover:underline font-medium">
              Đánh dấu đã đọc
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            className={`grid h-8 w-8 place-items-center rounded-lg border transition-colors ${showSettings ? 'border-[#003375] bg-blue-50 text-[#003375]' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
            aria-label="Cài đặt thông báo"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="border-b border-gray-100 bg-white p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-gray-500">Cài đặt thông báo</p>
          <div className="space-y-2">
            {preferenceItems.map((item) => {
              const Icon = item.icon;
              const enabled = preferences[item.key] !== false;
              return (
                <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-gray-500" />
                    <span className="text-sm font-bold text-gray-700">{item.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => togglePreference(item.key)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-[#003375]' : 'bg-gray-300'}`}
                    aria-pressed={enabled}
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="max-h-[52dvh] sm:max-h-80 overflow-y-auto custom-scrollbar">
        {visibleNotifications.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">Chưa có thông báo nào</div>
        ) : (
          visibleNotifications.map((notif) => {
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
            <span className="text-[10px] text-gray-500">Nhận thông báo khi tắt web</span>
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
