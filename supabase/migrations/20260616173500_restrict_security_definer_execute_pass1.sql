-- Internal trigger/helper functions should not be callable through PostgREST RPC.
revoke execute on function public.activity_actor_role() from anon, authenticated;
revoke execute on function public.anonymize_deleted_user_logs(uuid, text, text) from anon, authenticated;
revoke execute on function public.apply_default_profile_class_name() from anon, authenticated;
revoke execute on function public.get_default_class_name_for_student(text) from anon, authenticated;
revoke execute on function public.handle_new_follow() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.is_hub_email(text) from anon, authenticated;
revoke execute on function public.log_user_activity() from anon, authenticated;
revoke execute on function public.queue_lost_found_push() from anon, authenticated;
revoke execute on function public.queue_school_announcement_push() from anon, authenticated;
revoke execute on function public.recalculate_benchmark_rankings(text) from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.submit_lost_found_item(text, text, text, text, text, text, text) from anon, authenticated;

-- Signed-in/admin RPC functions stay available to authenticated users, but not anon.
revoke execute on function public.admin_list_payment_requests() from anon;
revoke execute on function public.admin_list_subscriptions() from anon;
revoke execute on function public.admin_set_subscription(uuid, text) from anon;
revoke execute on function public.approve_payment_request(uuid) from anon;
revoke execute on function public.create_payment_request(text, integer, text, text) from anon;
revoke execute on function public.delete_my_account() from anon;
revoke execute on function public.get_benchmark_rank_for_student(text, text) from anon;
revoke execute on function public.get_my_role() from anon;
revoke execute on function public.get_smart_rank_details(text, double precision, integer, integer, text, text, text) from anon;
revoke execute on function public.is_activity_log_admin() from anon;
revoke execute on function public.is_subscription_admin() from anon;
revoke execute on function public.mark_password_set() from anon;
revoke execute on function public.reject_payment_request(uuid, text) from anon;
