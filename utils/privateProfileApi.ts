import { privateApiRequest } from './privateApi';

export interface OwnPrivateProfile {
  publicProfile: Record<string, any> | null;
  privateProfile: { data?: Record<string, any> | null; updated_at?: string | null } | null;
}

export const fetchOwnPrivateProfile = async (): Promise<OwnPrivateProfile> => {
  const response = await privateApiRequest('/api/user/v1/profile');
  const payload = await response.json() as OwnPrivateProfile & { success?: boolean };
  if (!payload.success) throw new Error('Phản hồi hồ sơ cá nhân không hợp lệ.');
  return {
    publicProfile: payload.publicProfile || null,
    privateProfile: payload.privateProfile || null,
  };
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
