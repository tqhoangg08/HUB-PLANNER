import { urlBase64ToUint8Array } from './pushHelper';
import { PrivateApiError, privateApiRequest } from './privateApi';
import {
  completeCurrentDevicePushRegistration,
  PushRegistrationError,
} from './pushRegistrationFlow';

export { completeCurrentDevicePushRegistration, PushRegistrationError } from './pushRegistrationFlow';

const ROOT_SCOPE = '/';
const SERVICE_WORKER_TIMEOUT_MS = 8000;
const PUSH_SUBSCRIBE_TIMEOUT_MS = 12000;
const API_SYNC_TIMEOUT_MS = 12000;

export const pushRegistrationErrorMessage = (error: unknown) => {
  if (!(error instanceof PushRegistrationError)) {
    return 'Chưa đăng ký được thiết bị. Vui lòng kiểm tra kết nối rồi thử lại.';
  }
  if (error.code === 'permission_denied') return 'Thông báo đang bị chặn trong cài đặt trình duyệt hoặc hệ điều hành.';
  if (error.code === 'service_worker_unavailable') return 'Service worker chưa sẵn sàng. Hãy tải lại ứng dụng rồi thử lại.';
  if (error.code === 'push_manager_unsupported') return 'Trình duyệt này không hỗ trợ đăng ký Web Push.';
  if (error.code === 'vapid_invalid') return 'Cấu hình thông báo của ứng dụng chưa hợp lệ.';
  if (error.code === 'subscribe_failed') return 'Trình duyệt chưa tạo được đăng ký cho thiết bị hiện tại.';
  if (error.code === 'persist_unauthenticated') return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi bật thông báo.';
  if (error.code === 'persist_owner_unmapped') return 'Chưa liên kết được thiết bị với tài khoản HUB hiện tại.';
  if (error.code === 'persist_storage_failed') return 'Máy chủ chưa lưu được thiết bị nhận thông báo. Vui lòng thử lại sau.';
  if (error.code === 'persist_failed') return 'Thiết bị đã đăng ký cục bộ nhưng chưa lưu được lên máy chủ.';
  return 'Máy chủ chưa xác nhận đúng thiết bị hiện tại.';
};

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
  if (!worker) {
    throw new PushRegistrationError('service_worker_unavailable', 'Service worker chưa sẵn sàng.');
  }

  await withTimeout(new Promise<void>((resolve) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
    });
  }), SERVICE_WORKER_TIMEOUT_MS, 'Service worker chưa sẵn sàng.');

  return registration;
};

export const getPushRegistration = async () => {
  if (!isPushNotificationSyncAvailable()) {
    throw new PushRegistrationError('push_manager_unsupported', 'Trình duyệt không hỗ trợ push notification.');
  }

  const scope = new URL(ROOT_SCOPE, window.location.origin).href;
  const registrations = await navigator.serviceWorker.getRegistrations();
  const existing = registrations.find((registration) => registration.scope === scope);

  if (existing) {
    await existing.update().catch(() => undefined);
    const active = await waitForActiveRegistration(existing);
    if (!active.active) throw new PushRegistrationError('service_worker_unavailable', 'Service worker chưa sẵn sàng.');
    if (!active.pushManager) throw new PushRegistrationError('push_manager_unsupported', 'PushManager không khả dụng.');
    return active;
  }

  try {
    const registered = await waitForActiveRegistration(
      await withTimeout(
        navigator.serviceWorker.register('/sw.js', { scope: ROOT_SCOPE }),
        SERVICE_WORKER_TIMEOUT_MS,
        'Không đăng ký được service worker.'
      )
    );
    const ready = await withTimeout(
      navigator.serviceWorker.ready,
      SERVICE_WORKER_TIMEOUT_MS,
      'Service worker chưa sẵn sàng.',
    );
    if (ready.scope !== scope || !ready.active) {
      throw new PushRegistrationError('service_worker_unavailable', 'Service worker không hoạt động đúng scope.');
    }
    return registered.active ? registered : ready;
  } catch {
    const fallback = await waitForActiveRegistration(
      await withTimeout(
        navigator.serviceWorker.register('/hub-sw.js', { scope: ROOT_SCOPE }),
        SERVICE_WORKER_TIMEOUT_MS,
        'Không đăng ký được service worker thông báo.'
      )
    );
    if (!fallback.active || !fallback.pushManager) {
      throw new PushRegistrationError('service_worker_unavailable', 'Service worker thông báo chưa sẵn sàng.');
    }
    return fallback;
  }
};

export const getCurrentPushSubscription = async () => {
  if (!isPushSupported() || Notification.permission !== 'granted') return null;

  const registration = await getPushRegistration();
  return registration.pushManager.getSubscription();
};

export type CurrentDeviceRegistration = {
  subscription: PushSubscription;
  currentDeviceMatched: true;
  created: boolean;
  rebound: boolean;
  fingerprint: string;
};

const validateApplicationServerKey = (publicKey: string) => {
  let applicationServerKey: Uint8Array;
  try {
    applicationServerKey = urlBase64ToUint8Array(publicKey);
  } catch {
    throw new PushRegistrationError('vapid_invalid', 'VAPID public key không hợp lệ.');
  }
  if (applicationServerKey.byteLength !== 65 || applicationServerKey[0] !== 4) {
    throw new PushRegistrationError('vapid_invalid', 'VAPID public key không hợp lệ.');
  }
  return applicationServerKey;
};

export const subscribeToDeviceNotifications = async (
  userId: string | null,
  options: { forceRebind?: boolean } = {},
): Promise<CurrentDeviceRegistration> => {
  const bindingStartedAt = new Date().toISOString();

  if (!isPushSupported()) {
    throw new PushRegistrationError('push_manager_unsupported', 'Trình duyệt không hỗ trợ thông báo đẩy.');
  }
  if (Notification.permission !== 'granted') {
    throw new PushRegistrationError('permission_denied', 'Quyền thông báo chưa được cấp.');
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new PushRegistrationError('vapid_invalid', 'Thiếu VITE_VAPID_PUBLIC_KEY.');
  }
  const applicationServerKey = validateApplicationServerKey(publicKey);

  const registration = await getPushRegistration();
  if (userId) assertActivePushUser(userId);

  const resolvedUserId = userId;
  assertActivePushUser(resolvedUserId);

  const result = await completeCurrentDevicePushRegistration({
    existingSubscription: await registration.pushManager.getSubscription(),
    forceRebind: options.forceRebind === true,
    createSubscription: () => withTimeout(
      registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }),
      PUSH_SUBSCRIBE_TIMEOUT_MS,
      'Trình duyệt đăng ký push quá lâu.',
    ),
    persistSubscription: async (subscription) => {
      assertActivePushUser(resolvedUserId);
      activeSyncController?.abort();
      const controller = new AbortController();
      activeSyncController = controller;
      const timeoutId = window.setTimeout(() => controller.abort(), API_SYNC_TIMEOUT_MS);
      let response: Response;
      try {
        response = await privateApiRequest('/api/private/v1/push-subscription', {
          method: 'POST',
          body: JSON.stringify({ subscription: subscription.toJSON(), bindingStartedAt }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof PrivateApiError) {
          if (error.status === 401) throw new PushRegistrationError('persist_unauthenticated', error.message);
          if (error.status === 409) throw new PushRegistrationError('persist_owner_unmapped', error.message);
          if (error.status >= 500) throw new PushRegistrationError('persist_storage_failed', error.message);
        }
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
        if (activeSyncController === controller) activeSyncController = null;
      }
      const payload = await response.json().catch(() => null) as {
        currentDeviceMatched?: unknown;
        fingerprint?: unknown;
      } | null;
      return {
        currentDeviceMatched: payload?.currentDeviceMatched === true,
        fingerprint: typeof payload?.fingerprint === 'string' ? payload.fingerprint : '',
      };
    },
  });

  return { ...result, subscription: result.subscription as PushSubscription } as CurrentDeviceRegistration;
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
