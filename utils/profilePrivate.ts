import { logWebError } from './logWebError';
import { fetchBetterAuthSession, privateApiRequest, PrivateApiError } from './privateApi';
import { updateOwnPrivateProfile } from './privateProfileApi';

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

const PROFILE_PRIVATE_API_PATH = '/api/staff/v1/profiles';

const fetchJson = async (path: string, init: RequestInit = {}) => {
  const response = await privateApiRequest(path, init);
  return response.json();
};

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
  try {
    const payload = await fetchJson(PROFILE_PRIVATE_API_PATH, {
      method: 'POST',
      body: JSON.stringify({ action: 'map', userIds: [userId], mode: 'full' }),
    });
    return (payload.data?.[0] || null) as ProfilePrivateRow | null;
  } catch (error) {
    await logWebError({
      source: 'frontend',
      action: 'load_profile_private',
      error,
      metadata: { stage: 'd1_staff_fetch_single' },
    });
    throw error;
  }
};

export const fetchProfilePrivateMap = async (userIds: string[], options: FetchProfilePrivateMapOptions = {}) => {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {} as Record<string, ProfilePrivateRow>;
  const mode = options.mode || 'full';
  const useCache = mode === 'summary' && options.useCache !== false;
  const cachedResult = useCache ? getCachedSummaryRows(ids) : null;
  const idsToFetch = cachedResult?.missing || ids;

  if (cachedResult && idsToFetch.length === 0) return cachedResult.cached;

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
  } catch (error) {
    await logWebError({
      source: 'frontend',
      action: 'load_profile_private',
      error,
      metadata: {
        stage: 'd1_staff_fetch_map',
        userCount: idsToFetch.length,
        mode,
      },
    });
    throw error;
  }
};

export const upsertProfilePrivate = async (row: ProfilePrivateRow) => {
  const nextRow = { ...row };
  if (Object.prototype.hasOwnProperty.call(nextRow, 'data')) {
    nextRow.data = await preserveExistingTranscriptData(nextRow.user_id, nextRow.data);
  }
  const hasData = Object.prototype.hasOwnProperty.call(nextRow, 'data');
  const session = await fetchBetterAuthSession();
  if (!session || session.user.id !== nextRow.user_id) {
    throw new PrivateApiError(403, 'Không có quyền cập nhật hồ sơ này.');
  }
  const unsupported = Object.keys(nextRow).filter((key) => !['user_id', 'data'].includes(key));
  if (unsupported.length > 0 || !hasData) {
    throw new PrivateApiError(400, 'Trường hồ sơ này chỉ được cập nhật bởi máy chủ.');
  }
  await updateOwnPrivateProfile({ privateProfile: { data: nextRow.data || {} } });
};

export const updateProfilePrivate = async (userId: string, patch: Partial<Omit<ProfilePrivateRow, 'user_id'>>) => {
  const nextPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'data')) {
    nextPatch.data = await preserveExistingTranscriptData(userId, nextPatch.data);
  }
  if (Object.prototype.hasOwnProperty.call(nextPatch, 'data') && !hasMeaningfulProfileData(nextPatch.data)) {
    delete nextPatch.data;
  }
  const session = await fetchBetterAuthSession();
  if (!session) {
    throw new PrivateApiError(403, 'Không có quyền cập nhật hồ sơ này.');
  }
  const patchKeys = Object.keys(nextPatch);
  if (patchKeys.some((key) => key !== 'data') || !Object.hasOwn(nextPatch, 'data')) {
    throw new PrivateApiError(400, 'Trường hồ sơ này chỉ được cập nhật bởi máy chủ.');
  }
  if (session.user.id === userId) {
    await updateOwnPrivateProfile({ privateProfile: { data: nextPatch.data || {} } });
    return;
  }
  if (session.role !== 'admin') {
    throw new PrivateApiError(403, 'Không có quyền cập nhật hồ sơ này.');
  }
  await privateApiRequest(PROFILE_PRIVATE_API_PATH, {
    method: 'PATCH',
    body: JSON.stringify({ userId, privateProfile: { data: nextPatch.data || {} } }),
  });
};
