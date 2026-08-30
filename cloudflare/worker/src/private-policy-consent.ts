import { BetterAuthIdentityError, requireBetterAuthSession, type BetterAuthIdentityEnv } from './better-auth-identity.ts';

interface PrivatePolicyConsentEnv extends BetterAuthIdentityEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

const ALLOWED_CONTEXTS = new Set(['registration', 'ai_usage', 'oauth_registration']);
const MAX_BODY_BYTES = 4 * 1024;

export class PrivatePolicyConsentError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PrivatePolicyConsentError';
    this.status = status;
  }
}

const hashUserId = async (userId: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const readBody = async (request: Request) => {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new PrivatePolicyConsentError(400, 'Dá»¯ liá»‡u Ä‘á»“ng Ã½ vÆ°á»£t giá»›i háº¡n.');
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new PrivatePolicyConsentError(400, 'Dá»¯ liá»‡u Ä‘á»“ng Ã½ khÃ´ng há»£p lá»‡.');
  }
};

export const handlePrivatePolicyConsent = async (request: Request, env: PrivatePolicyConsentEnv) => {
  if (request.method !== 'POST') throw new PrivatePolicyConsentError(405, 'PhÆ°Æ¡ng thá»©c khÃ´ng Ä‘Æ°á»£c há»— trá»£.');
  const identity = await requireBetterAuthSession(request, env);
  const body = await readBody(request);
  if ('userId' in body || 'user_id' in body) {
    throw new PrivatePolicyConsentError(400, 'KhÃ´ng cho phÃ©p chá»‰ Ä‘á»‹nh ngÆ°á»i dÃ¹ng.');
  }
  const policyType = String(body.policyType || '');
  const policyVersion = String(body.policyVersion || '');
  const context = String(body.context || '');
  if (!/^[a-z0-9_.:-]{3,80}$/i.test(policyType) || !/^[a-z0-9_.:-]{3,80}$/i.test(policyVersion) || !ALLOWED_CONTEXTS.has(context)) {
    throw new PrivatePolicyConsentError(400, 'ThÃ´ng tin Ä‘á»“ng Ã½ khÃ´ng há»£p lá»‡.');
  }
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url || !key) throw new PrivatePolicyConsentError(503, 'Dá»‹ch vá»¥ Ä‘á»“ng Ã½ táº¡m thá»i chÆ°a kháº£ dá»¥ng.');
  const response = await fetch(new URL('/rest/v1/policy_consents', url), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      user_id: identity.userId,
      user_id_hash: await hashUserId(identity.userId),
      policy_type: policyType,
      policy_version: policyVersion,
      consent_context: context,
      accepted: true,
      source: 'web',
      metadata: { auth_provider: 'better-auth' },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new PrivatePolicyConsentError(502, 'KhÃ´ng thá»ƒ ghi nháº­n Ä‘á»“ng Ã½.');
  return { success: true };
};

export const privatePolicyConsentErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof PrivatePolicyConsentError
    ? error.status
    : 500;
