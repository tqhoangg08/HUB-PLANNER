alter table public.school_notification_backfill_progress
add column if not exists next_item_index int not null default 0;

update public.school_notification_backfill_progress
set next_item_index = 0
where next_item_index is null;
