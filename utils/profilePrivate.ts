import { supabase } from './supabase';
import { apiUrl } from './api';

export const PROFILE_PRIVATE_TABLE = 'profile_private_data';

export type ProfilePrivateRow = {
  user_id: string;
  email?: string | null;
  data?: Record<string, any> | null;
  password_set_at?: string | null;
  updated_at?: string | null;
};

const rowsToMap = (rows: ProfilePrivateRow[] | null | undefined) => {
  return (rows || []).reduce((map: Record<string, ProfilePrivateRow>, row: ProfilePrivateRow) => {
    map[row.user_id] = row;
    return map;
  }, {});
};

export const fetchProfilePrivate = async (userId: string) => {
  const { data, error } = await supabase
    .from(PROFILE_PRIVATE_TABLE)
    .select('user_id, email, data, password_set_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as ProfilePrivateRow | null;
};

export const fetchProfilePrivateMap = async (userIds: string[]) => {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {} as Record<string, ProfilePrivateRow>;

  if (ids.length > 1) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (token) {
        const response = await fetch(apiUrl('/courses?resource=profile-private-map'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userIds: ids }),
        });

        if (response.ok) {
          const payload = await response.json();
          return rowsToMap(payload.data as ProfilePrivateRow[]);
        }
      }
    } catch (error) {
      console.warn('Không thể tải dữ liệu private qua API admin:', error);
    }
  }

  const { data, error } = await supabase
    .from(PROFILE_PRIVATE_TABLE)
    .select('user_id, email, data, password_set_at, updated_at')
    .in('user_id', ids);

  if (error) throw error;

  return rowsToMap(data as ProfilePrivateRow[]);
};

export const upsertProfilePrivate = async (row: ProfilePrivateRow) => {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(PROFILE_PRIVATE_TABLE)
    .upsert({
      user_id: row.user_id,
      email: row.email,
      data: row.data ?? {},
      password_set_at: row.password_set_at,
      updated_at: row.updated_at || now,
    }, { onConflict: 'user_id' });

  if (error) throw error;
};

export const updateProfilePrivate = async (userId: string, patch: Partial<Omit<ProfilePrivateRow, 'user_id'>>) => {
  const { error } = await supabase
    .from(PROFILE_PRIVATE_TABLE)
    .update({
      ...patch,
      updated_at: patch.updated_at || new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) throw error;
};
