import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Megaphone, Search, Settings, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatTime } from '../utils/dateUtils';
import {
  getCurrentPushSubscription,
  isPushNotificationSyncAvailable,
  isPushSupported,
  pushRegistrationErrorMessage,
  requiresIosHomeScreenInstallForPush,
  subscribeToDeviceNotifications,
} from '../utils/pushNotifications';
import {
  fetchOwnNotifications,
  markAllOwnNotificationsRead,
  markOwnNotificationRead,
  updateOwnNotificationPreferences,
} from '../utils/privateNotificationsApi';
import { getAvatarColorClass, isAllowedAvatarColor, isAvatarImageUrl } from '../utils/avatarColors';
import { setRuntimeStyleRule } from '../utils/runtimeStyles';
import { FEATURE_SCHEDULE_REMINDERS } from '../utils/featureFlags';
import { PrivateApiError, privateApiRequest } from '../utils/privateApi';

const notificationStreams = new Map();
const isDev = import.meta.env.DEV;

const countUnread = (items) => items.filter((item) => !item.is_read).length;

const logNotificationPayload = (queryName, data) => {
  if (!isDev) return;
  const rows = Array.isArray(data) ? data.length : data ? 1 : 0;
  const bytes = new Blob([JSON.stringify(data ?? null)]).size;
  console.info(`[notification-query] ${queryName}`, { rows, bytes });
};

const emitNotificationStream = (stream) => {
  const snapshot = {
    notifications: stream.notifications,
    unreadCount: stream.notificationsLoaded ? countUnread(stream.notifications) : stream.unreadCount,
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

  stream.fetchPromise = fetchOwnNotifications()
    .then(({ notifications, unreadCount }) => {
      logNotificationPayload('notification_list', notifications);
      stream.notifications = notifications;
      stream.notificationsLoaded = true;
      stream.unreadCount = unreadCount;
      emitNotificationStream(stream);
    })
    .catch(() => undefined)
    .finally(() => {
      stream.fetchPromise = null;
    });

  return stream.fetchPromise;
};

const subscribeToNotificationStream = (userId, listener) => {
  let stream = notificationStreams.get(userId);

  if (!stream) {
    stream = {
      userId,
      notifications: [],
      notificationsLoaded: false,
      unreadCount: 0,
      listeners: new Set(),
      subscribers: 0,
      fetchPromise: null,
    };
    notificationStreams.set(userId, stream);
  }

  stream.subscribers += 1;
  stream.listeners.add(listener);
  listener({ notifications: stream.notifications, unreadCount: stream.notificationsLoaded ? countUnread(stream.notifications) : stream.unreadCount });
  void fetchNotificationStream(stream);

  return () => {
    stream.listeners.delete(listener);
    stream.subscribers = Math.max(0, stream.subscribers - 1);

    if (stream.subscribers === 0) {
      notificationStreams.delete(userId);
    }
  };
};

const hydrateNotificationStream = (userId) => {
  const stream = notificationStreams.get(userId);
  if (!stream) return Promise.resolve();
  return fetchNotificationStream(stream);
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
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);
  const [testPushStatus, setTestPushStatus] = useState('');
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
    if (Notification.permission !== 'granted' || !subscription || !currentUserId) {
      setIsPushEnabled(false);
      return;
    }
    const registration = await subscribeToDeviceNotifications(currentUserId).catch(() => null);
    setIsPushEnabled(registration?.currentDeviceMatched === true);
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
      const payload = await fetchOwnNotifications().catch(() => null);
      if (payload?.preferences) {
        const next = { ...defaultPreferences, ...payload.preferences, schedule: FEATURE_SCHEDULE_REMINDERS };
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
    if (!currentUserId) return;
    const refresh = () => {
      if (!document.hidden) void hydrateNotificationStream(currentUserId);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
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

    if (currentUserId) void hydrateNotificationStream(currentUserId);
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
    const previous = preferences;
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    localStorage.setItem(storageKey, JSON.stringify(next));

    if (!currentUserId) return;
    try {
      await updateOwnNotificationPreferences(next);
    } catch {
      setPreferences(previous);
      localStorage.setItem(storageKey, JSON.stringify(previous));
    }
  };

  const handleTogglePush = async () => {
    if (requiresIosHomeScreenInstallForPush()) {
      alert('Trên iPhone/iPad: bấm Chia sẻ → Thêm vào Màn hình chính, sau đó mở HUB Planner từ biểu tượng vừa cài để bật thông báo.');
      return;
    }

    if (!isPushSupported() || !isPushNotificationSyncAvailable()) {
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

      const registration = await subscribeToDeviceNotifications(currentUserId);
      if (!registration.currentDeviceMatched) throw new Error('device_mismatch');
      setIsPushEnabled(true);
    } catch (error) {
      alert(pushRegistrationErrorMessage(error));
    } finally {
      setIsLoadingPush(false);
    }
  };

  const handleTestPush = async () => {
    setTestPushStatus('');
    if (requiresIosHomeScreenInstallForPush()) {
      setTestPushStatus('Trên iPhone/iPad, hãy thêm HUB Planner vào Màn hình chính rồi mở từ biểu tượng đã cài.');
      return;
    }
    if (!currentUserId || !isPushSupported() || !isPushNotificationSyncAvailable()) {
      setTestPushStatus('Trình duyệt hoặc phiên đăng nhập hiện tại chưa hỗ trợ thông báo đẩy.');
      return;
    }

    setIsSendingTestPush(true);
    try {
      let permission = Notification.permission;
      if (permission === 'default') permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setTestPushStatus('Hãy bật quyền thông báo trong cài đặt trình duyệt hoặc hệ điều hành.');
        return;
      }

      await navigator.serviceWorker.ready;
      let registration = await subscribeToDeviceNotifications(currentUserId);
      if (!registration.currentDeviceMatched) throw new Error('device_mismatch');

      const sendTest = () => privateApiRequest('/api/private/v1/push/test', {
        method: 'POST', body: '{}',
      });
      let response;
      try {
        response = await sendTest();
      } catch (error) {
        // A provider 404 means the locally retained endpoint was cleaned up as
        // stale. Rebind only this device once, then retry the user-scoped test.
        if (!(error instanceof PrivateApiError) || error.status !== 404) throw error;
        setTestPushStatus('Subscription đã hết hạn, đang đăng ký lại thiết bị hiện tại...');
        registration = await subscribeToDeviceNotifications(currentUserId, { forceRebind: true });
        if (!registration.currentDeviceMatched) throw new Error('device_mismatch');
        response = await sendTest();
      }
      const result = await response.json();
      const sent = Number(result?.sent || 0);
      setIsPushEnabled(true);
      setTestPushStatus(`Đã gửi thông báo thử tới ${sent} thiết bị của tài khoản này.`);
    } catch (error) {
      if (error instanceof PrivateApiError && error.status === 401) {
        setTestPushStatus('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      } else if (error instanceof PrivateApiError && error.status === 404) {
        setTestPushStatus('Thiết bị này chưa được đăng ký nhận thông báo. Hãy bật lại thông báo rồi thử lại.');
      } else if (error instanceof PrivateApiError && error.status >= 500) {
        setTestPushStatus('Máy chủ chưa gửi được thông báo thử. Vui lòng thử lại sau.');
      } else if (error instanceof Error && error.name === 'AbortError') {
        setTestPushStatus('Kết nối đăng ký thiết bị quá lâu. Vui lòng kiểm tra mạng rồi thử lại.');
      } else {
        setTestPushStatus(pushRegistrationErrorMessage(error));
      }
    } finally {
      setIsSendingTestPush(false);
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
      try {
        await markOwnNotificationRead(notif.id);
        updateNotificationStream(currentUserId, (prev) => prev.map((item) => (
          item.id === notif.id ? { ...item, is_read: true } : item
        )));
      } catch {
        // Navigation remains successful; a later refresh can retry the read state.
      }
    }
  };

  const markAllRead = async () => {
    if (!currentUserId) return;

    try {
      await markAllOwnNotificationsRead();
      updateNotificationStream(currentUserId, (prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch {
      // Keep the server state authoritative and leave the UI unchanged on failure.
    }
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
            <div className="rounded-lg border border-gray-100 px-3 py-2">
              <button
                type="button"
                onClick={handleTestPush}
                disabled={isSendingTestPush || !currentUserId}
                className="w-full rounded-lg bg-[#003375] px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-[#00265a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSendingTestPush ? 'Đang gửi...' : 'Gửi thông báo thử'}
              </button>
              {testPushStatus && (
                <p className="mt-2 text-xs leading-relaxed text-gray-600" role="status">{testPushStatus}</p>
              )}
            </div>
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

      {!isPushEnabled && isPushNotificationSyncAvailable() && (
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
        aria-label="Mở thông báo"
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
