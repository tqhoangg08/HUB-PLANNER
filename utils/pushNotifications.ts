import { urlBase64ToUint8Array } from './pushHelper';
import { privateApiRequest } from './privateApi';

const ROOT_SCOPE = '/';
const SERVICE_WORKER_TIMEOUT_MS = 8000;
const PUSH_SUBSCRIBE_TIMEOUT_MS = 12000;
const API_SYNC_TIMEOUT_MS = 12000;

let activePushUserId: string | null | undefined;
let activeSyncController: AbortController | null = null;

export const setActivePushNotificationUser = (userId: string | null) => {
  if (activePushUserId === userId) return;

  activePushUserId = userId;
  activeSyncController?.abort();
  activeSyncController = null;
};

const assertActivePushUser = (userId: string | null) => {
  if (!userId) {
    throw new Error('Cần đăng nhập để đồng bộ thiết bị nhận thông báo.');
  }

  if (activePushUserId === null) {
    throw new Error('Đã đăng xuất, bỏ qua đồng bộ thông báo cũ.');
  }

  if (activePushUserId !== undefined && activePushUserId !== userId) {
    throw new Error('Phiên thông báo đã đổi tài khoản, bỏ qua đồng bộ cũ.');
  }
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: number | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export const isIosDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const isStandalonePwa = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as NavigatorWithStandalone).standalone === true;
};

export const requiresIosHomeScreenInstallForPush = () => isIosDevice() && !isStandalonePwa();

export const isPushSupported = () => (
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window
);

export const isPushNotificationSyncAvailable = () => (
  isPushSupported()
);

const waitForActiveRegistration = async (registration: ServiceWorkerRegistration) => {
  if (registration.active) return registration;

  const worker = registration.installing || registration.waiting;
  if (!worker) return registration;

  await withTimeout(new Promise<void>((resolve) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
    });
  }), SERVICE_WORKER_TIMEOUT_MS, 'Service worker chưa sẵn sàng.');

  return registration;
};

export const getPushRegistration = async () => {
  if (!isPushNotificationSyncAvailable()) {
    throw new Error('Trình duyệt không hỗ trợ push notification.');
  }

  const scope = new URL(ROOT_SCOPE, window.location.origin).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const existing = registrations.find((registration) => registration.scope === scope);

  if (existing) {
    existing.update().catch(() => undefined);
    return waitForActiveRegistration(existing);
  }

  try {
    return waitForActiveRegistration(
      await withTimeout(
        navigator.serviceWorker.register('/sw.js', { scope: ROOT_SCOPE }),
        SERVICE_WORKER_TIMEOUT_MS,
        'Không đăng ký được service worker.'
      )
    );
  } catch {
    return waitForActiveRegistration(
      await withTimeout(
        navigator.serviceWorker.register('/hub-sw.js', { scope: ROOT_SCOPE }),
        SERVICE_WORKER_TIMEOUT_MS,
        'Không đăng ký được service worker thông báo.'
      )
    );
  }
};

export const getCurrentPushSubscription = async () => {
  if (!isPushSupported() || Notification.permission !== 'granted') return null;

  const registration = await getPushRegistration();
  return registration.pushManager.getSubscription();
};

export const subscribeToDeviceNotifications = async (userId: string | null) => {
  const bindingStartedAt = new Date().toISOString();

  if (!isPushSupported()) {
    throw new Error('Trình duyệt không hỗ trợ thông báo đẩy.');
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('Thiếu VITE_VAPID_PUBLIC_KEY.');
  }

  const registration = await getPushRegistration();
  if (userId) assertActivePushUser(userId);

  let existingSubscription = await registration.pushManager.getSubscription();

  // The push service can expire an endpoint and the server removes it after a
  // 404/410 while a browser briefly retains the old local subscription. Check
  // the Better Auth-owned server record before reusing it so the next user
  // gesture can create a fresh endpoint instead of resurrecting a dead one.
  if (existingSubscription && userId) {
    try {
      const response = await privateApiRequest('/api/private/v1/push-subscription');
      const payload = await response.json().catch(() => null) as { data?: Array<{ endpoint?: string }> } | null;
      const persisted = payload?.data?.some(row => row.endpoint === existingSubscription?.endpoint) === true;
      if (!persisted) {
        await existingSubscription.unsubscribe();
        existingSubscription = null;
      }
    } catch {
      // A transient status read must not discard a valid browser subscription.
    }
  }

  const subscription = existingSubscription || await withTimeout(
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }),
    PUSH_SUBSCRIBE_TIMEOUT_MS,
    'Trình duyệt đăng ký push quá lâu.'
  );

  const resolvedUserId = userId;
  assertActivePushUser(resolvedUserId);

  if (resolvedUserId) {
    activeSyncController?.abort();
    const controller = new AbortController();
    activeSyncController = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), API_SYNC_TIMEOUT_MS);

    await privateApiRequest('/api/private/v1/push-subscription', {
        method: 'POST',
        body: JSON.stringify({ subscription: subscription.toJSON(), bindingStartedAt }),
        signal: controller.signal,
      }).finally(() => {
        window.clearTimeout(timeoutId);
        if (activeSyncController === controller) activeSyncController = null;
      });

  }

  return subscription;
};

export const unsubscribeFromDeviceNotifications = async (userId: string | null) => {
  const subscription = await getCurrentPushSubscription();

  if (subscription) {
    await unbindDeviceNotificationsForCurrentUser(userId);
    await subscription.unsubscribe();
  }
};

export const unbindDeviceNotificationsForCurrentUser = async (userId?: string | null) => {
  activeSyncController?.abort();
  activeSyncController = null;

  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;
  if (!userId) return;

  await privateApiRequest('/api/private/v1/push-subscription', {
    method: 'DELETE',
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
};
