-- Prepared for the Practice-core D1 cutover. Apply only after the D1
-- migration's owner-mapping plan has passed; CI never applies source changes.
CREATE OR REPLACE FUNCTION public.preflight_account_delete_source_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  source_table text;
  source_column text;
BEGIN
  FOR source_table, source_column IN
    SELECT * FROM (VALUES
      ('bug_reports', 'user_id'),
      ('canva_pro_requests', 'user_id'),
      ('course_reports', 'user_id'),
      ('ctv_requests', 'user_id'),
      ('event_reports', 'user_id'),
      ('feedback', 'user_id'),
      ('lost_found_items', 'user_id'),
      ('user_participations', 'user_id'),
      ('user_course_requests', 'user_id'),
      ('notification_preferences', 'user_id'),
      ('push_subscriptions', 'user_id'),
      ('schedule_notification_logs', 'user_id'),
      ('subscriptions', 'user_id'),
      ('auth_trigger_errors', 'user_id'),
      ('web_error_logs', 'user_id'),
      ('notifications', 'receiver_id'),
      ('notifications', 'actor_id'),
      ('profile_private_data', 'user_id'),
      ('user_roles', 'user_id'),
      ('profiles', 'id')
    ) AS resources(table_name, column_name)
  LOOP
    IF to_regclass(format('public.%I', source_table)) IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = source_table
            AND column_name = source_column
       ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ACCOUNT_DELETE_SOURCE_SCHEMA_UNAVAILABLE';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.preflight_account_delete_source_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preflight_account_delete_source_cleanup() TO service_role;
