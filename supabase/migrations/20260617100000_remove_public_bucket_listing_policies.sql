do $drop_public_bucket_listing_policies$
declare
  policy_name text;
begin
  for policy_name in
    select p.policyname
    from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
      and p.cmd = 'SELECT'
      and (
        p.policyname = 'Public Access Avatar'
        or p.qual like '%avatars%'
        or p.qual like '%lost_found_images%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_name);
  end loop;
end;
$drop_public_bucket_listing_policies$;
