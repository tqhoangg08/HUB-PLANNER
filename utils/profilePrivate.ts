import { supabase } from './supabase';
import { apiUrl } from './api';
import { logWebError } from './logWebError';

export const PROFILE_PRIVATE_TABLE = 'profile_private_data';

export type ProfilePrivateRow = {
  user_id: string;
  email?: string | null;
  data?: Record<string, any> | null;
  password_set_at?: string | null;
  updated_at?: string | null;
};

type ProfilePrivateMapMode = 'full' | 'summary';

type FetchProfilePrivateMapOptions = {
  mode?: ProfilePrivateMapMode;
  useCache?: boolean;
};

const SUMMARY_CACHE_KEY = 'hub_profile_private_summary_cache_v1';
const SUMMARY_CACHE_TTL_MS = 5 * 60 * 1000;
const summaryMemoryCache = new Map<string, { row: ProfilePrivateRow; cachedAt: number }>();

const rowsToMap = (rows: ProfilePrivateRow[] | null | undefined) => {
  return (rows || []).reduce((map: Record<string, ProfilePrivateRow>, row: ProfilePrivateRow) => {
    map[row.user_id] = row;
    return map;
  }, {});
};

const loadSummarySessionCache = () => {
  if (typeof sessionStorage === 'undefined' || summaryMemoryCache.size > 0) return;

  try {
    const raw = sessionStorage.getItem(SUMMARY_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, { row: ProfilePrivateRow; cachedAt: number }>;
    const now = Date.now();
    Object.entries(parsed || {}).forEach(([userId, entry]) => {
      if (entry?.row?.user_id && now - entry.cachedAt < SUMMARY_CACHE_TTL_MS) {
        summaryMemoryCache.set(userId, entry);
      }
    });
  } catch {
    sessionStorage.removeItem(SUMMARY_CACHE_KEY);
  }
};

const persistSummarySessionCache = () => {
  if (typeof sessionStorage === 'undefined') return;

  try {
    const now = Date.now();
    const serializable: Record<string, { row: ProfilePrivateRow; cachedAt: number }> = {};
    summaryMemoryCache.forEach((entry, userId) => {
      if (now - entry.cachedAt < SUMMARY_CACHE_TTL_MS) serializable[userId] = entry;
    });
    sessionStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(serializable));
  } catch {
    // Session cache is an optimization only.
  }
};

const getCachedSummaryRows = (ids: string[]) => {
  loadSummarySessionCache();
  const now = Date.now();
  const cached: Record<string, ProfilePrivateRow> = {};
  const missing: string[] = [];

  ids.forEach((id) => {
    const entry = summaryMemoryCache.get(id);
    if (entry && now - entry.cachedAt < SUMMARY_CACHE_TTL_MS) {
      cached[id] = entry.row;
    } else {
      if (entry) summaryMemoryCache.delete(id);
      missing.push(id);
    }
  });

  return { cached, missing };
};

const cacheSummaryRows = (rows: ProfilePrivateRow[]) => {
  const cachedAt = Date.now();
  rows.forEach((row) => {
    if (row?.user_id) summaryMemoryCache.set(row.user_id, { row, cachedAt });
  });
  persistSummarySessionCache();
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
      if (!shouldFallbackToSupabase(error)) {
        await logWebError({
          source: 'supabase',
          action: 'load_profile_private',
          error,
          metadata: {
            stage: 'api_fetch_single',
            userId,
          },
        });
        throw error;
      }
      console.warn('Profile private API unavailable, falling back to Supabase:', error);
    }
  }

  const { data, error } = await supabase
    .from(PROFILE_PRIVATE_TABLE)
    .select('user_id, email, data, password_set_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    await logWebError({
      source: 'supabase',
      action: 'load_profile_private',
      error,
      metadata: {
        stage: 'supabase_fetch_single',
        userId,
      },
    });
    throw error;
  }
  return data as ProfilePrivateRow | null;
};

export const fetchProfilePrivateMap = async (userIds: string[], options: FetchProfilePrivateMapOptions = {}) => {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {} as Record<string, ProfilePrivateRow>;
  const mode = options.mode || 'full';
  const useCache = mode === 'summary' && options.useCache !== false;
  const cachedResult = useCache ? getCachedSummaryRows(ids) : null;
  const idsToFetch = cachedResult?.missing || ids;

  if (cachedResult && idsToFetch.length === 0) return cachedResult.cached;

  if (shouldUseVercelProfileApi()) {
    try {
      const payload = await fetchJson(PROFILE_PRIVATE_API_PATH, {
        method: 'POST',
        body: JSON.stringify({ action: 'map', userIds: idsToFetch, mode }),
      });
      const fetchedRows = payload.data as ProfilePrivateRow[];
      if (mode === 'summary') cacheSummaryRows(fetchedRows);
      return {
        ...(cachedResult?.cached || {}),
        ...rowsToMap(fetchedRows),
      };
    } catch (error: any) {
      if (!shouldFallbackToSupabase(error)) {
        await logWebError({
          source: 'supabase',
          action: 'load_profile_private',
          error,
          metadata: {
            stage: 'api_fetch_map',
            userCount: idsToFetch.length,
            mode,
          },
        });
        throw error;
      }
      console.warn('Profile private API unavailable, falling back to Supabase:', error);
    }
  }

  const { data, error } = await supabase
    .from(PROFILE_PRIVATE_TABLE)
    .select('user_id, email, data, password_set_at, updated_at')
    .in('user_id', idsToFetch);

  if (error) {
    await logWebError({
      source: 'supabase',
      action: 'load_profile_private',
      error,
      metadata: {
        stage: 'supabase_fetch_map',
        userCount: idsToFetch.length,
        mode,
      },
    });
    throw error;
  }

  const fetchedRows = data as ProfilePrivateRow[];
  if (mode === 'summary') cacheSummaryRows(fetchedRows);
  return {
    ...(cachedResult?.cached || {}),
    ...rowsToMap(fetchedRows),
  };
};

export const upsertProfilePrivate = async (row: ProfilePrivateRow) => {
  const nextRow = { ...row };
  if (Object.prototype.hasOwnProperty.call(nextRow, 'data')) {
    nextRow.data = await preserveExistingTranscriptData(nextRow.user_id, nextRow.data);
  }
  const hasData = Object.prototype.hasOwnProperty.call(nextRow, 'data');

  if (shouldUseVercelProfileApi()) {
    try {
      await fetchJson(PROFILE_PRIVATE_API_PATH, {
        method: 'POST',
        body: JSON.stringify({ row: nextRow }),
      });
      return;
    } catch (error: any) {
      if (!shouldFallbackToSupabase(error)) {
        await logWebError({
          source: 'supabase',
          action: 'save_profile_private',
          error,
          metadata: {
            stage: 'api_upsert',
            userId: nextRow.user_id,
            hasData,
          },
        });
        throw error;
      }
      console.warn('Profile private API unavailable, falling back to Supabase:', error);
    }
  }

  const now = new Date().toISOString();
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

    if (updateError) {
      await logWebError({
        source: 'supabase',
        action: 'save_profile_private',
        error: updateError,
        metadata: {
          stage: 'supabase_update_metadata',
          userId: nextRow.user_id,
          hasData,
        },
      });
      throw updateError;
    }
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

  if (error) {
    await logWebError({
      source: 'supabase',
      action: 'save_profile_private',
      error,
      metadata: {
        stage: 'supabase_upsert',
        userId: nextRow.user_id,
        hasData,
      },
    });
    throw error;
  }
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
      if (!shouldFallbackToSupabase(error)) {
        await logWebError({
          source: 'supabase',
          action: 'save_profile_private',
          error,
          metadata: {
            stage: 'api_update',
            userId,
            patchKeys: Object.keys(nextPatch),
          },
        });
        throw error;
      }
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

  if (error) {
    await logWebError({
      source: 'supabase',
      action: 'save_profile_private',
      error,
      metadata: {
        stage: 'supabase_update',
        userId,
        patchKeys: Object.keys(nextPatch),
      },
    });
    throw error;
  }
};
