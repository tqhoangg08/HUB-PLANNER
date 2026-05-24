-- Reset HUB notification crawler data so the crawler can rebuild from page 1.
-- This deletes only the new notification RAG/crawler tables.
-- It does not touch school_announcements or user notification preferences.

begin;

delete from public.notification_chunks;
delete from public.school_notifications;
delete from public.school_notification_crawl_runs;

update public.school_notification_backfill_progress
set
  next_page = 1,
  next_item_index = 0,
  status = 'pending',
  last_run_at = null,
  last_error = null;

commit;

-- Quick checks after reset:
select 'notification_chunks' as table_name, count(*) as rows from public.notification_chunks
union all
select 'school_notifications', count(*) from public.school_notifications
union all
select 'school_notification_crawl_runs', count(*) from public.school_notification_crawl_runs
union all
select 'school_notification_backfill_progress_pending', count(*) from public.school_notification_backfill_progress where status = 'pending';
