import { apiHeaders, apiUrl } from './api';
import { supabase } from './supabase';

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
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const userId = data.session?.user?.id;
  if (!token || !userId) return;

  const cacheKey = `${CONSENT_CACHE_PREFIX}:${userId}:${policyType}:${POLICY_VERSION}:${context}`;
  try {
    if (localStorage.getItem(cacheKey) === 'true') return;
  } catch {
    // Cache is only used to avoid duplicate POSTs.
  }

  const response = await fetch(apiUrl('/auth'), {
    method: 'POST',
    headers: apiHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    body: JSON.stringify({
      action: 'record-policy-consent',
      policyType,
      policyVersion: POLICY_VERSION,
      context,
    }),
  }).catch((error) => {
    console.warn('Khong the ghi nhan dong y chinh sach:', error);
    return null;
  });

  if (response?.ok) {
    try {
      localStorage.setItem(cacheKey, 'true');
    } catch {
      // Cache is only used to avoid duplicate POSTs.
    }
  }
};
