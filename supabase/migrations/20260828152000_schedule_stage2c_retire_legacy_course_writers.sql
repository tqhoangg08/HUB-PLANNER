begin;

-- Stage 2C final authority: Course mutations are served by the production D1
-- authority. Revoke legacy PostgREST/service mutation capabilities before the
-- temporary full source freeze returns to the durable d1 source-control mode.
-- SELECT remains available for reconciliation and historical reads.
revoke insert, update, delete on table public.course_schedules from anon, authenticated, service_role;

do $$
declare
  changed integer;
begin
  update hub_private.schedule_source_control
     set mode = 'd1', updated_at = now()
   where singleton = true
     and mode = 'frozen';

  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'UNEXPECTED_SCHEDULE_SOURCE_CONTROL_STATE';
  end if;
end;
$$;

commit;
