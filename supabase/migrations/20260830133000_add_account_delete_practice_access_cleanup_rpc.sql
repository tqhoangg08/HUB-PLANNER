-- Account deletion is performed by the server-side Worker using the service-role
-- credential.  Keep this narrowly scoped cleanup operation in the source
-- database so an account-delete flow does not depend on a PostgREST table
-- mutation transport that may be unavailable while the table remains live.
CREATE OR REPLACE FUNCTION public.delete_practice_pro_access_for_account_cleanup(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.practice_pro_access
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_practice_pro_access_for_account_cleanup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_practice_pro_access_for_account_cleanup(uuid) TO service_role;
