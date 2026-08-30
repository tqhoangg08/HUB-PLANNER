import { urlBase64ToUint8Array } from './pushHelper';
import { privateApiRequest } from './privateApi';

const ROOT_SCOPE = '/';
const SERVICE_WORKER_TIMEOUT_MS = 8000;
const PUSH_SUBSCRIBE_TIMEOUT_MS = 12000;
const API_SYNC_TIMEOUT_MS = 12000;
const PUSH_SYNC_CACHE_PREFIX = 'hub_push_subscription_synced';
const PUSH_SYNC_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

const pushSyncCacheKey = (userId: string, endpoint: string) => `${PUSH_SYNC_CACHE_PREFIX}:${userId}:${endpoint}`;

const hasRecentPushSync = (userId: string, endpoint: string) => {
  try {
    const syncedAt = Number(localStorage.getItem(pushSyncCacheKey(userId, endpoint)) || 0);
    return Date.now() - syncedAt < PUSH_SYNC_CACHE_TTL_MS;
  } catch {
    return false;
  }
};

const markPushSynced = (userId: string, endpoint: string) => {
  try {
    localStorage.setItem(pushSyncCacheKey(userId, endpoint), String(Date.now()));
  } catch {
    // Local cache is an optimization only.
  }
};

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

  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription = existingSubscription || await withTimeout(
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }),
    PUSH_SUBSCRIBE_TIMEOUT_MS,
    'Trình duyệt đăng ký push quá lâu.'
  );

  if (userId && hasRecentPushSync(userId, subscription.endpoint)) {
    assertActivePushUser(userId);
    return subscription;
  }

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

    markPushSynced(resolvedUserId, subscription.endpoint);
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
