import { supabase } from './supabase';
import { urlBase64ToUint8Array } from './pushHelper';
import { apiUrl } from './api';

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
    throw new Error('Can dang nhap de dong bo thiet bi nhan thong bao.');
  }

  if (activePushUserId === null) {
    throw new Error('Da dang xuat, bo qua dong bo thong bao cu.');
  }

  if (activePushUserId !== undefined && activePushUserId !== userId) {
    throw new Error('Phien thong bao da doi tai khoan, bo qua dong bo cu.');
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

const waitForActiveRegistration = async (registration: ServiceWorkerRegistration) => {
  if (registration.active) return registration;

  const worker = registration.installing || registration.waiting;
  if (!worker) return registration;

  await withTimeout(new Promise<void>((resolve) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
    });
  }), SERVICE_WORKER_TIMEOUT_MS, 'Service worker chua san sang.');

  return registration;
};

export const getPushRegistration = async () => {
  if (!isPushSupported()) {
    throw new Error('Trinh duyet khong ho tro push notification.');
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
        'Khong dang ky duoc service worker.'
      )
    );
  } catch {
    return waitForActiveRegistration(
      await withTimeout(
        navigator.serviceWorker.register('/hub-sw.js', { scope: ROOT_SCOPE }),
        SERVICE_WORKER_TIMEOUT_MS,
        'Khong dang ky duoc service worker thong bao.'
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
    throw new Error('Trinh duyet khong ho tro thong bao day.');
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('Thieu VITE_VAPID_PUBLIC_KEY.');
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
    'Trinh duyet dang ky push qua lau.'
  );

  if (userId && hasRecentPushSync(userId, subscription.endpoint)) {
    assertActivePushUser(userId);
    return subscription;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const resolvedUserId = userId || sessionData.session?.user?.id || null;
  const sessionUserId = sessionData.session?.user?.id || null;

  if (resolvedUserId !== sessionUserId) {
    throw new Error('Phien dang nhap da thay doi, bo qua dong bo thong bao cu.');
  }

  assertActivePushUser(resolvedUserId);

  if (resolvedUserId) {
    activeSyncController?.abort();
    const controller = new AbortController();
    activeSyncController = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), API_SYNC_TIMEOUT_MS);

    const response = await fetch(apiUrl('/push?resource=subscription'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionData.session?.access_token || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscription: subscription.toJSON(), bindingStartedAt }),
        signal: controller.signal,
      }).finally(() => {
        window.clearTimeout(timeoutId);
        if (activeSyncController === controller) activeSyncController = null;
      });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Khong the dong bo thiet bi nhan thong bao (${response.status}). ${errorText}`);
    }

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

  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUserId = sessionData.session?.user?.id || null;
  if (!userId || !sessionData.session?.access_token || userId !== sessionUserId) return;

  const response = await fetch(apiUrl('/push?resource=subscription'), {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${sessionData.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });

  if (!response.ok) {
    throw new Error('Khong the go lien ket thong bao cua thiet bi.');
  }
};
