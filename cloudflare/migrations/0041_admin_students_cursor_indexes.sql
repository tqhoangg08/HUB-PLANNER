-- Additive indexes for bounded, cursor-based admin student listing.
CREATE INDEX IF NOT EXISTS user_profiles_admin_updated_cursor_idx
  ON user_profiles(updated_at DESC, user_id DESC);
CREATE INDEX IF NOT EXISTS user_profiles_admin_class_updated_cursor_idx
  ON user_profiles(class_name, updated_at DESC, user_id DESC)
  WHERE class_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS user_profile_private_admin_major_updated_cursor_idx
  ON user_profile_private(major_name, updated_at DESC, user_id DESC)
  WHERE major_name IS NOT NULL;
