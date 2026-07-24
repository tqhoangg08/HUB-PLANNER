const CACHE_PREFIX = 'hub_schedule_course_page_v1';
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 80;

export interface ScheduleCoursePageCachePayload<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  cachedAt: number;
}

const hashCacheScope = (scope: string) => {
  let hash = 0;
  for (let index = 0; index < scope.length; index += 1) {
    hash = ((hash << 5) - hash) + scope.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

export const getScheduleCoursePageCacheKey = (scope: string, page: number) => (
  `${CACHE_PREFIX}:${hashCacheScope(scope)}:${Math.max(0, page)}`
);

export const readScheduleCoursePageCache = <T,>(
  scope: string,
  page: number,
): ScheduleCoursePageCachePayload<T> | null => {
  try {
    const raw = localStorage.getItem(getScheduleCoursePageCacheKey(scope, page));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScheduleCoursePageCachePayload<T>;
    if (
      !parsed
      || !Array.isArray(parsed.data)
      || !Number.isFinite(parsed.cachedAt)
      || Date.now() - parsed.cachedAt > CACHE_TTL_MS
    ) {
      localStorage.removeItem(getScheduleCoursePageCacheKey(scope, page));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const trimOldCacheEntries = () => {
  try {
    const entries = Object.keys(localStorage)
      .filter(key => key.startsWith(`${CACHE_PREFIX}:`))
      .map(key => {
        try {
          const cachedAt = Number(JSON.parse(localStorage.getItem(key) || '{}')?.cachedAt || 0);
          return { key, cachedAt };
        } catch {
          return { key, cachedAt: 0 };
        }
      })
      .sort((left, right) => right.cachedAt - left.cachedAt);

    entries.slice(MAX_CACHE_ENTRIES).forEach(entry => localStorage.removeItem(entry.key));
  } catch {
    // Cache is optional; quota/privacy errors must not interrupt schedule search.
  }
};

export const writeScheduleCoursePageCache = <T,>(
  scope: string,
  page: number,
  payload: Omit<ScheduleCoursePageCachePayload<T>, 'cachedAt'>,
) => {
  try {
    localStorage.setItem(
      getScheduleCoursePageCacheKey(scope, page),
      JSON.stringify({ ...payload, cachedAt: Date.now() }),
    );
    trimOldCacheEntries();
  } catch {
    // Ignore localStorage quota/privacy errors and continue with the live result.
  }
};

export const removeScheduleCoursePageCache = (scope: string, page: number) => {
  try {
    localStorage.removeItem(getScheduleCoursePageCacheKey(scope, page));
  } catch {
    // Cache invalidation is best-effort.
  }
};
