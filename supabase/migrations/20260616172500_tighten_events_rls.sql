do $drop_event_policies$
declare
  policy_name text;
begin
  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'events'
  loop
    execute format('drop policy if exists %I on public.events', policy_name);
  end loop;
end;
$drop_event_policies$;

create policy "events_select_public"
on public.events
for select
using (true);

create policy "events_insert_authenticated"
on public.events
for insert
to authenticated
with check (
  status = 'pending'::text
  or exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role = any (array['admin'::text, 'auditor'::text, 'editor'::text, 'ctv'::text])
  )
);

create policy "events_update_staff"
on public.events
for update
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role = any (array['admin'::text, 'auditor'::text, 'editor'::text, 'ctv'::text])
  )
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role = any (array['admin'::text, 'auditor'::text, 'editor'::text, 'ctv'::text])
  )
);

create policy "events_delete_admin"
on public.events
for delete
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role = 'admin'::text
  )
);
