-- Support tickets, messages and attachment metadata are authoritative in D1.
-- Keep the source cleanup preflight aligned without dropping historical data.
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
      ('ai_chat_logs', 'user_id'),
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
      ('policy_consents', 'user_id'),
      ('practice_attempts', 'user_id'),
      ('practice_pro_access', 'user_id'),
      ('push_subscriptions', 'user_id'),
      ('schedule_notification_logs', 'user_id'),
      ('subscriptions', 'user_id'),
      ('auth_trigger_errors', 'user_id'),
      ('web_error_logs', 'user_id'),
      ('notifications', 'receiver_id'),
      ('notifications', 'actor_id'),
      ('practice_sets', 'owner_id'),
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

  IF to_regprocedure('public.delete_practice_pro_access_for_account_cleanup(uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ACCOUNT_DELETE_SOURCE_CLEANUP_RPC_UNAVAILABLE';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.preflight_account_delete_source_cleanup() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preflight_account_delete_source_cleanup() TO service_role;
