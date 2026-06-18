-- Lost & Found submissions are user-to-admin requests.
-- Users can submit pending information and request changes through feedback;
-- only staff may update published/pending Lost & Found rows directly.
drop policy if exists "lost_found_items_update_owner_or_staff" on public.lost_found_items;

create policy "lost_found_items_update_staff"
on public.lost_found_items
for update
to authenticated
using (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'ctv')
  )
)
with check (
  exists (
    select 1
    from public.user_roles ur
    where (ur.id = (select auth.uid()) or ur.user_id = (select auth.uid()))
      and ur.role in ('admin', 'ctv')
  )
);
