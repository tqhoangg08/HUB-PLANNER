import { fetchBetterAuthSession, privateApiRequest } from './privateApi';

export const POLICY_VERSION = '2026-06-11';
const CONSENT_CACHE_PREFIX = 'hub_policy_consent_recorded';

export const CONSENT_POLICIES = {
  terms: 'terms_of_use',
  privacy: 'privacy_policy',
  ai: 'ai_third_party_processing',
} as const;

export const recordPolicyConsent = async (
  policyType: string,
  context: 'registration' | 'ai_usage' | 'oauth_registration' = 'registration',
) => {
  const session = await fetchBetterAuthSession().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return;

  const cacheKey = `${CONSENT_CACHE_PREFIX}:${userId}:${policyType}:${POLICY_VERSION}:${context}`;
  try {
    if (localStorage.getItem(cacheKey) === 'true') return;
  } catch {
    // Cache is only used to avoid duplicate POSTs.
  }

  const response = await privateApiRequest('/api/user/v1/policy-consents', {
    method: 'POST',
    body: JSON.stringify({
      policyType,
      policyVersion: POLICY_VERSION,
      context,
    }),
  }).catch((error) => {
    console.warn('Không thể ghi nhận đồng ý chính sách:', error);
    return null;
  });

  if (response) {
    try {
      localStorage.setItem(cacheKey, 'true');
    } catch {
      // Cache is only used to avoid duplicate POSTs.
    }
  }
};
