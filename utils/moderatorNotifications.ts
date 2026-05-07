import { supabase } from './supabase';

export type ModeratorNotificationKind =
  | 'event_pending'
  | 'lost_found_pending'
  | 'course_report'
  | 'event_report'
  | 'bug_report'
  | 'feedback'
  | 'ctv_request'
  | 'user_course_request';

export const notifyModerators = async (kind: ModeratorNotificationKind, recordId: string | number | null | undefined) => {
  if (!recordId) return;

  try {
    const { data } = await supabase.auth.getSession();
    await fetch('/api/moderator-notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
      },
      body: JSON.stringify({ kind, recordId }),
    });
  } catch (error) {
    console.warn('Không gửi được thông báo cho admin/auditor:', error);
  }
};
