-- Precondition audit: this query must return zero rows before deployment.
-- If duplicates exist, the CREATE UNIQUE INDEX statement fails and D1 rolls
-- the migration back without changing existing account rows.
SELECT provider_id, account_id, COUNT(*) AS duplicate_count
FROM auth_account
GROUP BY provider_id, account_id
HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS auth_account_provider_account_unique
ON auth_account (provider_id, account_id);
