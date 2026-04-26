import { supabase } from './supabase';
import { urlBase64ToUint8Array } from './pushHelper';

const ROOT_SCOPE = '/';

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

  await new Promise<void>((resolve) => {
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
    });
  });

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
      await navigator.serviceWorker.register('/sw.js', { scope: ROOT_SCOPE })
    );
  } catch {
    return waitForActiveRegistration(
      await navigator.serviceWorker.register('/hub-sw.js', { scope: ROOT_SCOPE })
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
  const subscription = existingSubscription || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const { data: sessionData } = await supabase.auth.getSession();
  const resolvedUserId = userId || sessionData.session?.user?.id || null;

  if (resolvedUserId) {
    const response = await fetch('/api/push-subscription', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionData.session?.access_token || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    if (!response.ok) {
      throw new Error('Khong the dong bo thiet bi nhan thong bao.');
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
