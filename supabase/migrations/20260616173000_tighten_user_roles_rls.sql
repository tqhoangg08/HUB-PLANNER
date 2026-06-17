do $drop_user_roles_select_policies$
declare
  policy_name text;
begin
  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'user_roles'
      and p.cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.user_roles', policy_name);
  end loop;
end;
$drop_user_roles_select_policies$;

create policy "user_roles_select_readable"
on public.user_roles
for select
using (true);
