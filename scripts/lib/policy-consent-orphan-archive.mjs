import { createHash } from 'node:crypto';

const hash = (value) => createHash('sha256').update(String(value)).digest('hex');

/**
 * Convert unresolved legacy consents to non-reversible archival metadata.
 * The returned records deliberately do not contain a legacy owner ID, email,
 * provider subject, student code, or any other profile identity.
 */
export const canonicalizePolicyConsentOrphans = (sourceRows, unresolvedLegacyIds) => {
  const canonical = new Map();
  let sourceRowsCount = 0;
  for (const row of sourceRows) {
    if (!unresolvedLegacyIds.has(String(row.legacy_user_id))) continue;
    sourceRowsCount += 1;
    const legacyOwnerHash = hash(row.legacy_user_id);
    const acceptedAt = new Date(row.created_at || 0).toISOString();
    const key = [legacyOwnerHash, row.policy_type, row.policy_version, row.consent_context].join('|');
    const archived = {
      legacyOwnerHash,
      policyType: String(row.policy_type),
      policyVersion: String(row.policy_version),
      consentContext: String(row.consent_context),
      acceptedAt,
    };
    const existing = canonical.get(key);
    if (!existing || Date.parse(archived.acceptedAt) > Date.parse(existing.acceptedAt)) canonical.set(key, archived);
  }
  return {
    sourceRows: sourceRowsCount,
    canonicalRows: [...canonical.values()].map((row) => ({
      ...row,
      sourceFingerprint: hash([
        row.legacyOwnerHash, row.policyType, row.policyVersion, row.consentContext, row.acceptedAt,
      ].join('|')),
    })),
  };
};
