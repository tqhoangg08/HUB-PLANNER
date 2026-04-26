alter table if exists public.push_subscriptions
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists endpoint text;

update public.push_subscriptions
set
  id = coalesce(id, gen_random_uuid()),
  endpoint = coalesce(endpoint, subscription->>'endpoint')
where id is null
   or endpoint is null;

do $$
declare
  primary_key_name text;
begin
  select conname
  into primary_key_name
  from pg_constraint
  where conrelid = 'public.push_subscriptions'::regclass
    and contype = 'p';

  if primary_key_name is not null then
    execute format('alter table public.push_subscriptions drop constraint %I', primary_key_name);
  end if;
end $$;

alter table public.push_subscriptions
  alter column id set not null,
  add constraint push_subscriptions_pkey primary key (id);

create unique index if not exists push_subscriptions_endpoint_key
  on public.push_subscriptions (endpoint)
  where endpoint is not null;

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);
