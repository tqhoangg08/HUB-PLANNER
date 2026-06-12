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

const shouldUseVercelProfileApi = () => {
  return import.meta.env.VITE_USE_VERCEL_API === 'true' || import.meta.env.VITE_API_BASE_URL === '/api';
};

const PROFILE_PRIVATE_API_PATH = '/courses?resource=profile-private';

const getAccessToken = async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  return sessionData?.session?.access_token || '';
};

const fetchJson = async (path: string, init: RequestInit = {}) => {
  const token = await getAccessToken();
  if (!token) throw new Error('Unauthorized');

  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(apiUrl(path), {
    ...init,
    headers,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.error || `Profile API failed (${response.status})`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json();
};

const shouldFallbackToSupabase = (error: any) => [404, 501].includes(error?.status);

const hasMeaningfulProfileData = (value: any) => {
  if (!value || typeof value !== 'object') return false;

  const profileKeys = ['studentName', 'cohort', 'programName', 'majorName', 'specializationName'];
  if (profileKeys.some((key) => typeof value[key] === 'string' && value[key].trim())) return true;

  const semesters = Array.isArray(value.semesters) ? value.semesters : [];
  return semesters.some((semester: any) => {
    const subjects = Array.isArray(semester?.subjects) ? semester.subjects : [];
    if (subjects.length > 0) return true;
    if (semester?.trainingScore !== null && semester?.trainingScore !== undefined) return true;

    const name = typeof semester?.name === 'string' ? semester.name.trim() : '';
    if (!name) return false;
    const isInitialDefault = semesters.length === 1 && name.includes('1') && name.includes('2025-2026');
    return !isInitialDefault;
  });
};

const hasTranscriptData = (value: any) => {
  const semesters = Array.isArray(value?.semesters) ? value.semesters : [];
  return semesters.some((semester: any) => {
    const subjects = Array.isArray(semester?.subjects) ? semester.subjects : [];
    return subjects.length > 0;
  });
};

const preserveExistingTranscriptData = async (userId: string, data: any) => {
  if (!data || hasTranscriptData(data)) return data;

  const existing = await fetchProfilePrivate(userId).catch(() => null);
  if (!hasTranscriptData(existing?.data)) return data;

  return {
    ...data,
    semesters: existing?.data?.semesters,
  };
};

export const fetchProfilePrivate = async (userId: string) => {
  if (shouldUseVercelProfileApi()) {
    try {
      const payload = await fetchJson(`${PROFILE_PRIVATE_API_PATH}&userId=${encodeURIComponent(userId)}`);
      return payload.data as ProfilePrivateRow | null;
    } catch (error: any) {
      if (!shouldFallbackToSupabase(error)) throw error;
      console.warn('Profile private API unavailable, falling back to Supabase:', error);
    }
  }

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

  if (shouldUseVercelProfileApi()) {
    try {
      const payload = await fetchJson(PROFILE_PRIVATE_API_PATH, {
        method: 'POST',
        body: JSON.stringify({ action: 'map', userIds: ids }),
      });
      return rowsToMap(payload.data as ProfilePrivateRow[]);
    } catch (error: any) {
      if (!shouldFallbackToSupabase(error)) throw error;
      console.warn('Profile private API unavailable, falling back to Supabase:', error);
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
  const nextRow = { ...row };
  if (Object.prototype.hasOwnProperty.call(nextRow, 'data')) {
    nextRow.data = await preserveExistingTranscriptData(nextRow.user_id, nextRow.data);
  }

  if (shouldUseVercelProfileApi()) {
    try {
      await fetchJson(PROFILE_PRIVATE_API_PATH, {
        method: 'POST',
        body: JSON.stringify({ row: nextRow }),
      });
      return;
    } catch (error: any) {
      if (!shouldFallbackToSupabase(error)) throw error;
      console.warn('Profile private API unavailable, falling back to Supabase:', error);
    }
  }

  const now = new Date().toISOString();
  const hasData = Object.prototype.hasOwnProperty.call(nextRow, 'data');
  const shouldWriteData = hasData && hasMeaningfulProfileData(nextRow.data);

  if (!shouldWriteData) {
    const { data: updated, error: updateError } = await supabase
      .from(PROFILE_PRIVATE_TABLE)
      .update({
        email: nextRow.email,
        password_set_at: nextRow.password_set_at,
        updated_at: nextRow.updated_at || now,
      })
      .eq('user_id', nextRow.user_id)
      .select('user_id')
      .maybeSingle();

    if (updateError) throw updateError;
    if (updated?.user_id) return;
  }

  const { error } = await supabase
    .from(PROFILE_PRIVATE_TABLE)
    .upsert({
      user_id: nextRow.user_id,
      email: nextRow.email,
      data: shouldWriteData ? (nextRow.data ?? {}) : {},
      password_set_at: nextRow.password_set_at,
      updated_at: nextRow.updated_at || now,
    }, { onConflict: 'user_id' });

  if (error) throw error;
};

export const updateProfilePrivate = async (userId: string, patch: Partial<Omit<ProfilePrivateRow, 'user_id'>>) => {
  const nextPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'data')) {
    nextPatch.data = await preserveExistingTranscriptData(userId, nextPatch.data);
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'data') && !hasMeaningfulProfileData(nextPatch.data)) {
    delete nextPatch.data;
  }

  if (shouldUseVercelProfileApi()) {
    try {
      await fetchJson(PROFILE_PRIVATE_API_PATH, {
        method: 'PATCH',
        body: JSON.stringify({ userId, patch: nextPatch }),
      });
      return;
    } catch (error: any) {
      if (!shouldFallbackToSupabase(error)) throw error;
      console.warn('Profile private API unavailable, falling back to Supabase:', error);
    }
  }

  const { error } = await supabase
    .from(PROFILE_PRIVATE_TABLE)
    .update({
      ...nextPatch,
      updated_at: nextPatch.updated_at || new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) throw error;
};
