alter table public.support_ticket_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.support_ticket_attachments
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists support_ticket_messages_related_error_log_idx
on public.support_ticket_messages ((metadata->>'related_error_log_id'))
where metadata ? 'related_error_log_id';

create index if not exists support_ticket_attachments_related_error_log_idx
on public.support_ticket_attachments ((metadata->>'related_error_log_id'))
where metadata ? 'related_error_log_id';
