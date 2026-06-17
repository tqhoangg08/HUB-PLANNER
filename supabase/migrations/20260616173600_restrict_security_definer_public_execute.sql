-- Postgres grants EXECUTE on functions to PUBLIC by default. Revoke that
-- inherited access first, then grant back only the RPCs the app intentionally uses.
revoke execute on function public.activity_actor_role() from public;
revoke execute on function public.admin_list_payment_requests() from public;
revoke execute on function public.admin_list_subscriptions() from public;
revoke execute on function public.admin_set_subscription(uuid, text) from public;
revoke execute on function public.anonymize_deleted_user_logs(uuid, text, text) from public;
revoke execute on function public.apply_default_profile_class_name() from public;
revoke execute on function public.approve_payment_request(uuid) from public;
revoke execute on function public.create_payment_request(text, integer, text, text) from public;
revoke execute on function public.delete_my_account() from public;
revoke execute on function public.get_benchmark_rank_for_student(text, text) from public;
revoke execute on function public.get_default_class_name_for_student(text) from public;
revoke execute on function public.get_my_role() from public;
revoke execute on function public.get_smart_rank_details(text, double precision, integer, integer, text, text, text) from public;
revoke execute on function public.handle_new_follow() from public;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.is_activity_log_admin() from public;
revoke execute on function public.is_hub_email(text) from public;
revoke execute on function public.is_subscription_admin() from public;
revoke execute on function public.log_user_activity() from public;
revoke execute on function public.mark_password_set() from public;
revoke execute on function public.queue_lost_found_push() from public;
revoke execute on function public.queue_school_announcement_push() from public;
revoke execute on function public.recalculate_benchmark_rankings(text) from public;
revoke execute on function public.reject_payment_request(uuid, text) from public;
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.submit_lost_found_item(text, text, text, text, text, text, text) from public;
revoke execute on function public.submit_secure_comment(text, text, bigint, boolean, text, text) from public;

-- User-facing RPCs that are called directly from the frontend.
grant execute on function public.admin_list_payment_requests() to authenticated;
grant execute on function public.admin_list_subscriptions() to authenticated;
grant execute on function public.admin_set_subscription(uuid, text) to authenticated;
grant execute on function public.approve_payment_request(uuid) to authenticated;
grant execute on function public.create_payment_request(text, integer, text, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.get_benchmark_rank_for_student(text, text) to authenticated;
grant execute on function public.get_my_role() to authenticated;
grant execute on function public.get_smart_rank_details(text, double precision, integer, integer, text, text, text) to authenticated;
grant execute on function public.mark_password_set() to authenticated;
grant execute on function public.reject_payment_request(uuid, text) to authenticated;
grant execute on function public.submit_secure_comment(text, text, bigint, boolean, text, text) to anon, authenticated;

-- Helper functions used by RLS policies still need execute for signed-in users.
grant execute on function public.is_activity_log_admin() to authenticated;
grant execute on function public.is_subscription_admin() to authenticated;

-- Service role keeps access for Edge/server-side maintenance jobs.
grant execute on function public.activity_actor_role() to service_role;
grant execute on function public.admin_list_payment_requests() to service_role;
grant execute on function public.admin_list_subscriptions() to service_role;
grant execute on function public.admin_set_subscription(uuid, text) to service_role;
grant execute on function public.anonymize_deleted_user_logs(uuid, text, text) to service_role;
grant execute on function public.apply_default_profile_class_name() to service_role;
grant execute on function public.approve_payment_request(uuid) to service_role;
grant execute on function public.create_payment_request(text, integer, text, text) to service_role;
grant execute on function public.delete_my_account() to service_role;
grant execute on function public.get_benchmark_rank_for_student(text, text) to service_role;
grant execute on function public.get_default_class_name_for_student(text) to service_role;
grant execute on function public.get_my_role() to service_role;
grant execute on function public.get_smart_rank_details(text, double precision, integer, integer, text, text, text) to service_role;
grant execute on function public.handle_new_follow() to service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.is_activity_log_admin() to service_role;
grant execute on function public.is_hub_email(text) to service_role;
grant execute on function public.is_subscription_admin() to service_role;
grant execute on function public.log_user_activity() to service_role;
grant execute on function public.mark_password_set() to service_role;
grant execute on function public.queue_lost_found_push() to service_role;
grant execute on function public.queue_school_announcement_push() to service_role;
grant execute on function public.recalculate_benchmark_rankings(text) to service_role;
grant execute on function public.reject_payment_request(uuid, text) to service_role;
grant execute on function public.rls_auto_enable() to service_role;
grant execute on function public.submit_lost_found_item(text, text, text, text, text, text, text) to service_role;
grant execute on function public.submit_secure_comment(text, text, bigint, boolean, text, text) to service_role;
