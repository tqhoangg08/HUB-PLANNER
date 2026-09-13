-- Quarantine unmappable legacy consent metadata without assigning it to a
-- guessed Better Auth user. Runtime policy-consent handlers never read this.
CREATE TABLE IF NOT EXISTS policy_consent_orphan_archive (
  legacy_owner_hash TEXT NOT NULL CHECK (length(legacy_owner_hash) = 64),
  policy_type TEXT NOT NULL CHECK (length(policy_type) BETWEEN 3 AND 80),
  policy_version TEXT NOT NULL CHECK (length(policy_version) BETWEEN 3 AND 80),
  consent_context TEXT NOT NULL CHECK (consent_context IN ('registration', 'ai_usage', 'oauth_registration')),
  accepted_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'legacy_orphan' CHECK (source = 'legacy_orphan'),
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint) = 64),
  migrated_at TEXT NOT NULL,
  PRIMARY KEY (legacy_owner_hash, policy_type, policy_version, consent_context)
);
