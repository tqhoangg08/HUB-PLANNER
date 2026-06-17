do $set_function_search_paths$
declare
  function_signature text;
  function_regprocedure regprocedure;
begin
  foreach function_signature in array array[
    'public.is_hub_email(text)',
    'public.get_available_semesters()',
    'public.get_smart_rank(text, double precision, integer, integer)',
    'public.delete_my_account()',
    'public.get_semesters()',
    'public.auto_update_old_announcements()',
    'public.match_documents(public.vector, double precision, integer)',
    'public.submit_lost_found_item(text, text, text, text, text, text, text)',
    'public.submit_secure_comment(text, text, bigint, boolean, text, text)',
    'public.handle_new_user()',
    'public.prevent_code_change()',
    'public.set_school_notification_updated_at()',
    'public.is_meaningful_profile_private_data(jsonb)',
    'public.profile_private_data_has_subjects(jsonb)',
    'public.subscription_expiry_for_plan(text)',
    'public.guard_profile_private_data_from_empty_overwrite()',
    'public.get_my_role()',
    'public.calculate_scholarship()',
    'public.handle_new_follow()',
    'public.match_notification_chunks(public.vector, double precision, integer)',
    'public.sync_profile_private_data_columns()'
  ]
  loop
    function_regprocedure := to_regprocedure(function_signature);

    if function_regprocedure is not null then
      execute format('alter function %s set search_path = public', function_regprocedure);
    end if;
  end loop;
end;
$set_function_search_paths$;
