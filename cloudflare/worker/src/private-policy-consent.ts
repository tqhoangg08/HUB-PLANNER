import { BetterAuthIdentityError, requireBetterAuthSession, type BetterAuthIdentityEnv } from './better-auth-identity.ts';

interface PrivatePolicyConsentEnv extends BetterAuthIdentityEnv {
  DB?: D1Database;
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

const validPolicyFields = (policyType: string, policyVersion: string, context: string) =>
  /^[a-z0-9_.:-]{3,80}$/i.test(policyType)
  && /^[a-z0-9_.:-]{3,80}$/i.test(policyVersion)
  && ALLOWED_CONTEXTS.has(context);

const consentResponse = (row: Record<string, unknown> | null) => row ? {
  policyType: row.policy_type,
  policyVersion: row.policy_version,
  context: row.consent_context,
  accepted: Number(row.accepted) === 1,
  acceptedAt: row.accepted_at,
} : null;

export const handlePrivatePolicyConsent = async (request: Request, env: PrivatePolicyConsentEnv) => {
  const identity = await requireBetterAuthSession(request, env);
  if (!env.DB) throw new PrivatePolicyConsentError(503, 'Dá»‹ch vá»¥ Ä‘á»“ng Ã½ táº¡m thá»i chÆ°a kháº£ dá»¥ng.');

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const policyType = String(url.searchParams.get('policyType') || '');
    const policyVersion = String(url.searchParams.get('policyVersion') || '');
    const context = String(url.searchParams.get('context') || '');
    const hasSpecificLookup = policyType || policyVersion || context;
    if (hasSpecificLookup && !validPolicyFields(policyType, policyVersion, context)) {
      throw new PrivatePolicyConsentError(400, 'ThÃ´ng tin Ä‘á»“ng Ã½ khÃ´ng há»£p lá»‡.');
    }
    if (hasSpecificLookup) {
      const row = await env.DB.prepare(
        `SELECT policy_type, policy_version, consent_context, accepted, accepted_at
           FROM policy_consents
          WHERE user_id = ? AND policy_type = ? AND policy_version = ? AND consent_context = ?`,
      ).bind(identity.userId, policyType, policyVersion, context).first<Record<string, unknown>>();
      return { success: true, consent: consentResponse(row) };
    }
    const rows = await env.DB.prepare(
      `SELECT policy_type, policy_version, consent_context, accepted, accepted_at
         FROM policy_consents WHERE user_id = ? ORDER BY accepted_at DESC LIMIT 100`,
    ).bind(identity.userId).all<Record<string, unknown>>();
    return { success: true, consents: (rows.results || []).map(consentResponse) };
  }

  if (request.method !== 'POST') throw new PrivatePolicyConsentError(405, 'PhÆ°Æ¡ng thá»©c khÃ´ng Ä‘Æ°á»£c há»— trá»£.');
  const body = await readBody(request);
  if ('userId' in body || 'user_id' in body) {
    throw new PrivatePolicyConsentError(400, 'KhÃ´ng cho phÃ©p chá»‰ Ä‘á»‹nh ngÆ°á»i dÃ¹ng.');
  }
  const policyType = String(body.policyType || '');
  const policyVersion = String(body.policyVersion || '');
  const context = String(body.context || '');
  if (!validPolicyFields(policyType, policyVersion, context)) {
    throw new PrivatePolicyConsentError(400, 'ThÃ´ng tin Ä‘á»“ng Ã½ khÃ´ng há»£p lá»‡.');
  }
  const acceptedAt = new Date().toISOString();
  const result = await env.DB.prepare(
    `INSERT INTO policy_consents
       (user_id, policy_type, policy_version, consent_context, accepted, source, metadata_json, accepted_at)
     VALUES (?, ?, ?, ?, 1, 'web', '{"auth_provider":"better-auth"}', ?)
     ON CONFLICT(user_id, policy_type, policy_version, consent_context) DO UPDATE SET
       accepted = excluded.accepted,
       source = excluded.source,
       metadata_json = excluded.metadata_json,
       accepted_at = excluded.accepted_at
     WHERE policy_consents.accepted IS NOT excluded.accepted
        OR policy_consents.source IS NOT excluded.source
        OR policy_consents.metadata_json IS NOT excluded.metadata_json`,
  ).bind(identity.userId, policyType, policyVersion, context, acceptedAt).run();
  return { success: true, changed: Number(result.meta?.changes || 0) === 1 };
};

export const privatePolicyConsentErrorStatus = (error: unknown) =>
  error instanceof BetterAuthIdentityError || error instanceof PrivatePolicyConsentError
    ? error.status
    : 500;
