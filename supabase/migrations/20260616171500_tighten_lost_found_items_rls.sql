drop policy if exists "Admin_CTV_Edit_LostFound" on public.lost_found_items;
drop policy if exists "Admin_Full_Access" on public.lost_found_items;
drop policy if exists "Only_Admin_Delete_LostFound" on public.lost_found_items;
drop policy if exists "Owner_Update_LostFound" on public.lost_found_items;
drop policy if exists "Public_Insert_Pending" on public.lost_found_items;
drop policy if exists "Public_View_Approved" on public.lost_found_items;

create policy "lost_found_items_anon_insert"
on public.lost_found_items
for insert
to anon
with check (true);

create policy "lost_found_items_anon_select_approved"
on public.lost_found_items
for select
to anon
using (status = 'approved'::text);

create policy "lost_found_items_authenticated_all"
on public.lost_found_items
for all
to authenticated
using (true)
with check (true);
