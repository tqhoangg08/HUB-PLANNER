create index if not exists support_tickets_user_last_message_idx
  on public.support_tickets (user_id, last_message_at desc);

create index if not exists support_tickets_status_last_message_idx
  on public.support_tickets (status, last_message_at desc);

create index if not exists support_tickets_assigned_to_idx
  on public.support_tickets (assigned_to);

create index if not exists support_ticket_messages_ticket_created_idx
  on public.support_ticket_messages (ticket_id, created_at desc);

create index if not exists support_ticket_attachments_message_created_idx
  on public.support_ticket_attachments (message_id, created_at desc);

create index if not exists notifications_receiver_unread_created_idx
  on public.notifications (receiver_id, is_read, created_at desc);
