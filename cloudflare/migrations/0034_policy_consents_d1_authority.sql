-- Policy-consent authority. A single current acceptance is retained for each
-- owner/policy/version/context combination, so repeated browser retries are no-ops.
CREATE TABLE IF NOT EXISTS policy_consents (
  user_id TEXT NOT NULL CHECK (length(user_id) = 36),
  policy_type TEXT NOT NULL CHECK (length(policy_type) BETWEEN 3 AND 80),
  policy_version TEXT NOT NULL CHECK (length(policy_version) BETWEEN 3 AND 80),
  consent_context TEXT NOT NULL CHECK (consent_context IN ('registration', 'ai_usage', 'oauth_registration')),
  accepted INTEGER NOT NULL DEFAULT 1 CHECK (accepted IN (0, 1)),
  source TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'migration')),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json) AND json_type(metadata_json) = 'object'),
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, policy_type, policy_version, consent_context)
);

CREATE INDEX IF NOT EXISTS policy_consents_owner_accepted_idx
  ON policy_consents (user_id, accepted_at DESC);

CREATE TABLE IF NOT EXISTS policy_consent_migrations (
  id TEXT PRIMARY KEY,
  source_rows INTEGER NOT NULL,
  canonical_rows INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint) = 64),
  completed_at TEXT NOT NULL
);
