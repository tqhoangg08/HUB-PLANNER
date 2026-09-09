export type PushRegistrationFailureCode =
  | 'permission_denied'
  | 'service_worker_unavailable'
  | 'push_manager_unsupported'
  | 'vapid_invalid'
  | 'subscribe_failed'
  | 'persist_failed'
  | 'device_mismatch';

export class PushRegistrationError extends Error {
  readonly code: PushRegistrationFailureCode;

  constructor(code: PushRegistrationFailureCode, message: string) {
    super(message);
    this.name = 'PushRegistrationError';
    this.code = code;
  }
}

type DeviceSubscription = {
  endpoint: string;
  toJSON: () => unknown;
  unsubscribe: () => Promise<boolean>;
};

type RegistrationFlowInput<T extends DeviceSubscription> = {
  existingSubscription: T | null;
  forceRebind: boolean;
  createSubscription: () => Promise<T>;
  persistSubscription: (subscription: T) => Promise<{ currentDeviceMatched: boolean; fingerprint: string }>;
};

export const completeCurrentDevicePushRegistration = async <T extends DeviceSubscription>({
  existingSubscription,
  forceRebind,
  createSubscription,
  persistSubscription,
}: RegistrationFlowInput<T>) => {
  let subscription = existingSubscription;
  let rebound = false;
  if (subscription && forceRebind) {
    const removed = await subscription.unsubscribe();
    if (!removed) throw new PushRegistrationError('subscribe_failed', 'Không thể thay đăng ký push đã hết hạn.');
    subscription = null;
    rebound = true;
  }

  const created = !subscription;
  if (!subscription) {
    try {
      subscription = await createSubscription();
    } catch (error) {
      throw new PushRegistrationError(
        error instanceof PushRegistrationError && error.code === 'vapid_invalid' ? 'vapid_invalid' : 'subscribe_failed',
        'Trình duyệt chưa tạo được đăng ký push.',
      );
    }
  }

  let acknowledgement: { currentDeviceMatched: boolean; fingerprint: string };
  try {
    acknowledgement = await persistSubscription(subscription);
  } catch {
    throw new PushRegistrationError('persist_failed', 'Không thể lưu đăng ký thiết bị lên máy chủ.');
  }
  if (!acknowledgement.currentDeviceMatched || !acknowledgement.fingerprint) {
    throw new PushRegistrationError('device_mismatch', 'Máy chủ chưa xác nhận đúng thiết bị hiện tại.');
  }
  return { subscription, created, rebound, ...acknowledgement };
};
