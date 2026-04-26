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

  const resolvedUserId = userId || (await supabase.auth.getUser()).data.user?.id || null;

  if (resolvedUserId) {
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: resolvedUserId,
      subscription: subscription.toJSON(),
    });

    if (error) throw error;
  }

  return subscription;
};

export const unsubscribeFromDeviceNotifications = async (userId: string | null) => {
  const subscription = await getCurrentPushSubscription();

  if (subscription) {
    await subscription.unsubscribe();
  }

  if (userId) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  }
};
