import { supabase } from './supabase';
import { urlBase64ToUint8Array } from './pushHelper';

const ROOT_SCOPE = '/';
const SERVICE_WORKER_TIMEOUT_MS = 8000;
const PUSH_SUBSCRIBE_TIMEOUT_MS = 12000;
const API_SYNC_TIMEOUT_MS = 12000;

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
  if (!isPushSupported()) {
    throw new Error('Trinh duyet khong ho tro thong bao day.');
  }

  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error('Thieu VITE_VAPID_PUBLIC_KEY.');
  }

  const registration = await getPushRegistration();
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription = existingSubscription || await withTimeout(
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }),
    PUSH_SUBSCRIBE_TIMEOUT_MS,
    'Trinh duyet dang ky push qua lau.'
  );

  const { data: sessionData } = await supabase.auth.getSession();
  const resolvedUserId = userId || sessionData.session?.user?.id || null;

  if (resolvedUserId) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), API_SYNC_TIMEOUT_MS);

    const response = await fetch('/api/push-subscription', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionData.session?.access_token || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
        signal: controller.signal,
      }).finally(() => window.clearTimeout(timeoutId));

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Khong the dong bo thiet bi nhan thong bao (${response.status}). ${errorText}`);
    }
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
  const subscription = await getCurrentPushSubscription();
  if (!subscription) return;

  const { data: sessionData } = await supabase.auth.getSession();
  if (!userId || !sessionData.session?.access_token) return;

  const response = await fetch('/api/push-subscription', {
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
