create index if not exists profiles_email_idx
  on public.profiles (email)
  where email is not null;

create index if not exists notifications_receiver_created_at_idx
  on public.notifications (receiver_id, created_at desc);

create index if not exists school_announcements_visible_date_created_idx
  on public.school_announcements (date desc, created_at desc)
  where is_hidden = false or is_hidden is null;

create index if not exists user_schedules_user_id_semester_idx
  on public.user_schedules (user_id, semester);
