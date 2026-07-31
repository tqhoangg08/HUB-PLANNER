const DEFAULT_CLOUDFLARE_PUBLIC_API =
  'https://hub-planner-public-dev-api.tqhoangg2.workers.dev';
const HEALTH_CACHE_KEY = 'hub_cloudflare_admin_health_v1';
const HEALTH_CACHE_TTL_MS = 5 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 5_000;

export interface CloudflareSyncResource {
  resource: string;
  source_row_count: number;
  visible_row_count: number;
  source_max_created_at: string | null;
  synced_at: string;
}

export interface CloudflareHealthSnapshot {
  ok: boolean;
  resources: Record<string, CloudflareSyncResource>;
}

export interface CloudflareHealthResult {
  snapshot: CloudflareHealthSnapshot;
  checkedAt: number;
  fromCache: boolean;
  stale: boolean;
}

export type SyncFreshness = 'healthy' | 'stale' | 'missing';

interface CachedHealth {
  checkedAt: number;
  snapshot: CloudflareHealthSnapshot;
}

const cloudflarePublicApiBase = String(
  import.meta.env?.VITE_CLOUDFLARE_PUBLIC_API_BASE_URL ||
    DEFAULT_CLOUDFLARE_PUBLIC_API
).replace(/\/$/, '');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeCount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};

const normalizeNullableText = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
};

const normalizeResource = (
  key: string,
  value: unknown
): CloudflareSyncResource | null => {
  if (!isRecord(value)) return null;
  const syncedAt = String(value.synced_at || '').trim();
  if (!syncedAt || Number.isNaN(Date.parse(syncedAt))) return null;

  return {
    resource: String(value.resource || key),
    source_row_count: normalizeCount(value.source_row_count),
    visible_row_count: normalizeCount(
      value.visible_row_count ?? value.source_row_count
    ),
    source_max_created_at: normalizeNullableText(
      value.source_max_created_at
    ),
    synced_at: syncedAt,
  };
};

export const normalizeCloudflareHealthPayload = (
  value: unknown
): CloudflareHealthSnapshot => {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.resources)) {
    throw new Error('Phản hồi trạng thái Cloudflare không hợp lệ.');
  }

  const resources = Object.fromEntries(
    Object.entries(value.resources)
      .map(([key, resource]) => [key, normalizeResource(key, resource)] as const)
      .filter(
        (entry): entry is readonly [string, CloudflareSyncResource] =>
          entry[1] !== null
      )
  );

  return { ok: true, resources };
};

export const classifySyncFreshness = (
  syncedAt: string | null | undefined,
  staleAfterMinutes: number,
  now = Date.now()
): SyncFreshness => {
  if (!syncedAt) return 'missing';
  const syncedTime = Date.parse(syncedAt);
  if (Number.isNaN(syncedTime)) return 'missing';
  return now - syncedTime <= staleAfterMinutes * 60 * 1000
    ? 'healthy'
    : 'stale';
};

const readCachedHealth = (): CachedHealth | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(HEALTH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedHealth;
    if (!Number.isFinite(parsed?.checkedAt)) return null;
    return {
      checkedAt: parsed.checkedAt,
      snapshot: normalizeCloudflareHealthPayload(parsed.snapshot),
    };
  } catch {
    return null;
  }
};

const writeCachedHealth = (cached: CachedHealth) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(HEALTH_CACHE_KEY, JSON.stringify(cached));
  } catch {
    // sessionStorage can be unavailable in private/restricted browser modes.
  }
};

const requestHealth = async (): Promise<CachedHealth> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort('cloudflare-health-timeout'),
    HEALTH_TIMEOUT_MS
  );

  try {
    const response = await fetch(`${cloudflarePublicApiBase}/health`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Cloudflare trả về mã ${response.status}.`);
    }

    const snapshot = normalizeCloudflareHealthPayload(await response.json());
    const cached = { checkedAt: Date.now(), snapshot };
    writeCachedHealth(cached);
    return cached;
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

let pendingHealthRequest: Promise<CachedHealth> | null = null;

export const fetchCloudflareHealth = async (
  options: { force?: boolean } = {}
): Promise<CloudflareHealthResult> => {
  const cached = readCachedHealth();
  const cacheAge = cached ? Date.now() - cached.checkedAt : Number.POSITIVE_INFINITY;
  if (!options.force && cached && cacheAge <= HEALTH_CACHE_TTL_MS) {
    return {
      ...cached,
      fromCache: true,
      stale: false,
    };
  }

  try {
    if (!pendingHealthRequest) {
      pendingHealthRequest = requestHealth().finally(() => {
        pendingHealthRequest = null;
      });
    }
    const fresh = await pendingHealthRequest;
    return {
      ...fresh,
      fromCache: false,
      stale: false,
    };
  } catch (error) {
    if (cached) {
      return {
        ...cached,
        fromCache: true,
        stale: true,
      };
    }
    throw error;
  }
};

