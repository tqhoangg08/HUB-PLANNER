alter table public.support_ticket_messages
  drop constraint if exists support_ticket_messages_body_length;

alter table public.support_ticket_messages
  add constraint support_ticket_messages_body_length
  check (char_length(body) <= 4000);

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid references public.support_ticket_messages(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  file_key text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_provider text not null default 'cloudflare_r2',
  status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  constraint support_ticket_attachments_file_key_unique unique (file_key),
  constraint support_ticket_attachments_mime_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  constraint support_ticket_attachments_size_check check (
    (mime_type like 'image/%' and size_bytes between 1 and 5242880)
    or (mime_type = 'application/pdf' and size_bytes between 1 and 10485760)
  ),
  constraint support_ticket_attachments_provider_check check (storage_provider = 'cloudflare_r2'),
  constraint support_ticket_attachments_status_check check (status in ('pending', 'uploaded', 'linked', 'deleted'))
);

create index if not exists support_ticket_attachments_ticket_id_idx
  on public.support_ticket_attachments (ticket_id);

create index if not exists support_ticket_attachments_message_id_idx
  on public.support_ticket_attachments (message_id);

create index if not exists support_ticket_attachments_uploaded_by_idx
  on public.support_ticket_attachments (uploaded_by);

create index if not exists support_ticket_attachments_created_at_idx
  on public.support_ticket_attachments (created_at desc);

alter table public.support_ticket_attachments enable row level security;

drop policy if exists "support_attachments_select_visible" on public.support_ticket_attachments;
create policy "support_attachments_select_visible"
on public.support_ticket_attachments
for select
to authenticated
using (
  public.is_support_staff((select auth.uid()))
  or exists (
    select 1
    from public.support_tickets st
    where st.id = ticket_id
      and st.user_id = (select auth.uid())
  )
  and (
    message_id is null
    or exists (
      select 1
      from public.support_ticket_messages stm
      where stm.id = message_id
        and stm.is_internal_note = false
    )
  )
);

grant select on public.support_ticket_attachments to authenticated;
