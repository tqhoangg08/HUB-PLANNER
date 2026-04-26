CREATE TABLE IF NOT EXISTS public.schedule_notification_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_schedule_id uuid REFERENCES public.user_schedules(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.course_schedules(id) ON DELETE CASCADE,
  reminder_key text NOT NULL UNIQUE,
  reminder_kind text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_notification_logs_user_id_idx
  ON public.schedule_notification_logs(user_id);

CREATE INDEX IF NOT EXISTS schedule_notification_logs_sent_at_idx
  ON public.schedule_notification_logs(sent_at);
