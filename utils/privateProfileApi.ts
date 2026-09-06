import { PrivateApiError, privateApiRequest } from './privateApi';

export interface OwnPrivateProfile {
  publicProfile: Record<string, any> | null;
  privateProfile: { data?: Record<string, any> | null; updated_at?: string | null } | null;
}

const PROFILE_BOOTSTRAP_RETRY_DELAYS_MS = [0, 300, 900] as const;
const PROFILE_BOOTSTRAP_REQUEST_TIMEOUT_MS = 4_000;
export const PROFILE_BOOTSTRAP_MAX_WAIT_SECONDS = 14;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));

const isRetryableProfileBootstrapError = (error: unknown) =>
  !(error instanceof PrivateApiError)
  || [401, 403, 429, 500, 502, 503, 504].includes(error.status);

export const fetchOwnPrivateProfile = async (): Promise<OwnPrivateProfile> => {
  let lastError: unknown;

  for (const retryDelay of PROFILE_BOOTSTRAP_RETRY_DELAYS_MS) {
    if (retryDelay > 0) await wait(retryDelay);
    try {
      const response = await privateApiRequest('/api/user/v1/profile', {
        signal: AbortSignal.timeout(PROFILE_BOOTSTRAP_REQUEST_TIMEOUT_MS),
      });
      const payload = await response.json() as OwnPrivateProfile & { success?: boolean };
      if (!payload.success) throw new Error('Phản hồi hồ sơ cá nhân không hợp lệ.');
      return {
        publicProfile: payload.publicProfile || null,
        privateProfile: payload.privateProfile || null,
      };
    } catch (error) {
      lastError = error;
      if (!isRetryableProfileBootstrapError(error)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Không thể tải hồ sơ hiện có.');
};

export const updateOwnPrivateProfile = async (input: {
  publicProfile?: Record<string, unknown>;
  privateProfile?: { data?: object };
}) => {
  await privateApiRequest('/api/user/v1/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
};
