delete from public.notification_chunks;

update public.school_notifications
set
  pdf_file_path = null,
  extracted_text_file_path = null,
  extracted_text = null,
  extraction_method = null,
  extraction_status = null,
  extraction_error = null,
  content_hash = null;

drop policy if exists "Public can read notification chunks metadata" on public.notification_chunks;
create policy "No public notification chunk reads"
on public.notification_chunks for select
using (false);

drop policy if exists "Public can read school notifications" on public.school_notifications;
create policy "No public school notification reads"
on public.school_notifications for select
using (false);

revoke select on public.notification_chunks from anon, authenticated;
revoke select on public.school_notifications from anon, authenticated;
revoke execute on function public.match_notification_chunks(vector, double precision, integer) from anon, authenticated;
