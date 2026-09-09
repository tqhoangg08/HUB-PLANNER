import React, { useEffect, useState } from 'react';
import { BellRing, Loader2, X } from 'lucide-react';
import {
  getCurrentPushSubscription,
  isPushNotificationSyncAvailable,
  isPushSupported,
  pushRegistrationErrorMessage,
  requiresIosHomeScreenInstallForPush,
  subscribeToDeviceNotifications,
} from '../utils/pushNotifications';
import { FEATURE_SCHEDULE_REMINDERS } from '../utils/featureFlags';
import { fetchBetterAuthSession } from '../utils/privateApi';

type NotificationNudgeVariant = 'events' | 'lost-found' | 'schedule';

interface NotificationNudgeProps {
  variant: NotificationNudgeVariant;
  className?: string;
  compact?: boolean;
}

const COPY: Record<NotificationNudgeVariant, { title: string; body: string; cta: string }> = {
  events: {
    title: 'Đừng lỡ sự kiện mới',
    body: 'Nhận thông báo để biết sự kiện mới và hạn đăng ký kịp lúc.',
    cta: 'Bật nhắc sự kiện',
  },
  'lost-found': {
    title: 'Có tin mới là biết ngay',
    body: 'Nhận thông báo khi có tin thất lạc hoặc nhặt được mới được duyệt.',
    cta: 'Bật nhắc tìm đồ',
  },
  schedule: {
    title: 'Nhớ lịch học và lịch thi',
    body: 'Nhận thông báo khi lịch học, lịch thi hoặc thay đổi quan trọng được cập nhật.',
    cta: 'Bật nhắc lịch',
  },
};

const NotificationNudge: React.FC<NotificationNudgeProps> = ({ variant, className = '', compact = false }) => {
  const copy = COPY[variant];
  const scheduleRemindersDisabled = variant === 'schedule' && !FEATURE_SCHEDULE_REMINDERS;
  const [visible, setVisible] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iosInstallRequired, setIosInstallRequired] = useState(false);

  useEffect(() => {
    let alive = true;

    if (scheduleRemindersDisabled) {
      setVisible(false);
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    const checkState = async () => {
      try {
        setError(null);

        const session = await fetchBetterAuthSession();
        if (!session?.user?.id) {
          if (alive) setVisible(false);
          return;
        }

        const needsIosInstall = requiresIosHomeScreenInstallForPush();
        if (alive) setIosInstallRequired(needsIosInstall);
        if (needsIosInstall) {
          if (alive) setVisible(true);
          return;
        }
        if (!isPushSupported() || !isPushNotificationSyncAvailable()) return;

        const currentPermission = Notification.permission;
        if (!alive) return;
        setPermission(currentPermission);

        if (currentPermission === 'granted') {
          const subscription = await getCurrentPushSubscription().catch(() => null);
          if (!alive) return;
          if (!subscription) {
            setVisible(true);
            return;
          }
          const registration = await subscribeToDeviceNotifications(session.user.id).catch(() => null);
          if (!alive) return;
          setVisible(registration?.currentDeviceMatched !== true);
          return;
        }

        setVisible(true);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void checkState();
    const refresh = () => void checkState();
    window.addEventListener('focus', refresh);

    return () => {
      alive = false;
      window.removeEventListener('focus', refresh);
    };
  }, [scheduleRemindersDisabled]);

  const handleDismiss = () => {
    setVisible(false);
  };

  const handleEnable = async () => {
    setSaving(true);
    setError(null);

    try {
      if (iosInstallRequired) {
        setError('Trên iPhone/iPad: bấm Chia sẻ → Thêm vào Màn hình chính, sau đó mở HUB Planner từ biểu tượng vừa cài để bật thông báo.');
        return;
      }

      let nextPermission = Notification.permission;
      if (nextPermission === 'default') {
        nextPermission = await Notification.requestPermission();
        setPermission(nextPermission);
      }

      if (nextPermission === 'denied') {
        setError('Thông báo đang bị chặn trong cài đặt trình duyệt.');
        return;
      }

      const session = await fetchBetterAuthSession();
      const registration = await subscribeToDeviceNotifications(session?.user?.id || null);
      if (!registration.currentDeviceMatched) throw new Error('device_mismatch');
      setVisible(false);
    } catch (err) {
      setError(pushRegistrationErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !visible || scheduleRemindersDisabled) return null;

  const blocked = permission === 'denied' && !iosInstallRequired;

  return (
    <div className={`rounded-lg border border-blue-100 bg-white px-3 py-2.5 shadow-sm ${className}`}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#003375]">
          <BellRing size={17} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold leading-tight text-[#003375]">{copy.title}</h3>
              {!compact && <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{copy.body}</p>}
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="-mr-1 -mt-1 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
              aria-label="Ẩn nhắc thông báo"
            >
              <X size={15} />
            </button>
          </div>

          {compact && <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{copy.body}</p>}

          {error && <p className="mt-2 text-[11px] font-semibold leading-relaxed text-red-600">{error}</p>}

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleEnable}
              disabled={saving || blocked}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#003375] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#002855] disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              {iosInstallRequired ? 'Cách cài trên iPhone/iPad' : blocked ? 'Đang bị chặn' : copy.cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationNudge;
