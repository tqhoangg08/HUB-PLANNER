-- Precondition audit: both queries must return zero rows before release.
SELECT COUNT(*) AS duplicate_user_provider_group_count
FROM (
  SELECT 1
  FROM auth_account
  GROUP BY user_id, provider_id
  HAVING COUNT(*) > 1
);

-- One Better Auth user may have at most one credential row and one row for
-- each social provider. The existing provider/account unique index separately
-- prevents one Google identity from linking to two users.
CREATE UNIQUE INDEX IF NOT EXISTS auth_account_user_provider_unique
ON auth_account (user_id, provider_id);
