-- Comment feature is no longer exposed in the app, so this SECURITY DEFINER
-- RPC should not be callable directly from browser roles.
revoke execute on function public.submit_secure_comment(text, text, bigint, boolean, text, text) from public;
revoke execute on function public.submit_secure_comment(text, text, bigint, boolean, text, text) from anon;
revoke execute on function public.submit_secure_comment(text, text, bigint, boolean, text, text) from authenticated;

grant execute on function public.submit_secure_comment(text, text, bigint, boolean, text, text) to service_role;
