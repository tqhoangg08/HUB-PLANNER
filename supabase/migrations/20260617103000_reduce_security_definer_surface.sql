-- Reduce SECURITY DEFINER exposure for functions that do not need elevated
-- privileges, and remove direct browser access to legacy admin-list RPCs.

do $set_low_privilege_functions_invoker$
declare
  function_signature text;
  function_regprocedure regprocedure;
begin
  foreach function_signature in array array[
    'public.create_payment_request(text, integer, text, text)',
    'public.get_benchmark_rank_for_student(text, text)',
    'public.get_smart_rank_details(text, double precision, integer, integer, text, text, text)',
    'public.get_my_role()',
    'public.is_activity_log_admin()',
    'public.is_subscription_admin()',
    'public.mark_password_set()'
  ]
  loop
    function_regprocedure := to_regprocedure(function_signature);
    if function_regprocedure is not null then
      execute format('alter function %s security invoker', function_regprocedure);
    end if;
  end loop;
end;
$set_low_privilege_functions_invoker$;

-- Admin list data now comes from direct table reads protected by RLS, so these
-- SECURITY DEFINER RPCs should not remain callable from the browser.
do $revoke_legacy_admin_list_rpcs$
declare
  function_signature text;
  function_regprocedure regprocedure;
begin
  foreach function_signature in array array[
    'public.admin_list_subscriptions()',
    'public.admin_list_payment_requests()'
  ]
  loop
    function_regprocedure := to_regprocedure(function_signature);
    if function_regprocedure is not null then
      execute format('revoke execute on function %s from public', function_regprocedure);
      execute format('revoke execute on function %s from anon', function_regprocedure);
      execute format('revoke execute on function %s from authenticated', function_regprocedure);
      execute format('grant execute on function %s to service_role', function_regprocedure);
    end if;
  end loop;
end;
$revoke_legacy_admin_list_rpcs$;
