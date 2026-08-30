import { privateApiRequest } from './privateApi';

export type NotificationPreferences = {
  system: boolean;
  events: boolean;
  lost_found: boolean;
  schedule: boolean;
  school: boolean;
};

export type PrivateNotification = {
  id: string;
  receiver_id: string;
  actor_id?: string | null;
  type: string;
  content?: string | null;
  link?: string | null;
  is_read: boolean;
  created_at: string;
  actor?: {
    full_name?: string | null;
    avatar_url?: string | null;
    student_code?: string | null;
  } | null;
};

export const fetchOwnNotifications = async () => {
  const response = await privateApiRequest('/api/user/v1/notifications');
  return response.json() as Promise<{
    success: true;
    notifications: PrivateNotification[];
    unreadCount: number;
    preferences: NotificationPreferences | null;
  }>;
};

const patchNotifications = async (body: Record<string, unknown>) => {
  await privateApiRequest('/api/user/v1/notifications', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
};

export const updateOwnNotificationPreferences = (preferences: NotificationPreferences) =>
  patchNotifications({ action: 'preferences', preferences });

export const markOwnNotificationRead = (notificationId: string) =>
  patchNotifications({ action: 'read', notificationId });

export const markAllOwnNotificationsRead = () =>
  patchNotifications({ action: 'read-all' });
