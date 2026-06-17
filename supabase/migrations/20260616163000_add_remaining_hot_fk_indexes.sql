create index if not exists school_announcements_date_created_at_idx
  on public.school_announcements (date desc, created_at desc);

create index if not exists notifications_actor_id_idx
  on public.notifications (actor_id);

create index if not exists user_schedules_course_id_idx
  on public.user_schedules (course_id);
