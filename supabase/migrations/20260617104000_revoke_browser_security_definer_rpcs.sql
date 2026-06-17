-- These SECURITY DEFINER functions now have safer replacements:
-- - admin subscription/payment writes are routed through /api/subscriptions.
-- - account deletion is routed through /api/auth action delete-account.
-- Keep service_role access for backend/manual maintenance.

do $revoke_browser_security_definer_rpcs$
declare
  function_signature text;
  function_regprocedure regprocedure;
begin
  foreach function_signature in array array[
    'public.admin_set_subscription(uuid, text)',
    'public.approve_payment_request(uuid)',
    'public.reject_payment_request(uuid, text)',
    'public.delete_my_account()'
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
$revoke_browser_security_definer_rpcs$;
