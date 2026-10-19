// Opportunistic isolate-local aggregate cache, never an authorization cache.
// Callers re-read publication policy on EVERY request, including hits.
// No recipients, identity claims or errors are stored.
export interface CachedScholarshipFacet {
  total: number;
  pages: Record<string, string[]>;
}
export interface CachedScholarshipFacets {
  totalRecipients: number;
  facets: Record<string, CachedScholarshipFacet>;
}

const TTL_MS = 30_000;
// Phase 1 stored up to seven aggregates per entry. Granular scopes preserve
// that logical capacity while retaining the same serialized-memory ceiling.
const MAX_ENTRIES = 32 * 7;
const MAX_PENDING = 32;
const MAX_CHARACTERS = 1_000_000;
type Entry = { expires: number; json: string; size: number };

export class ScholarshipFacetCache {
  private entries = new Map<string, Entry>();
  private size = 0;
  private pending = new Map<string, Promise<string>>();
  private pendingCharacters = 0;
  private outcomes = { hits: 0, misses: 0, joined: 0 };

  // Only JSON data is shared, never D1 statements, Response bodies or policy
  // decisions. The initiating request awaits its own work; every waiter must
  // independently pass the publication fence before using/storing the result.
  async coalesce<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) { this.outcomes.joined++; return JSON.parse(await existing) as T; }
    if (this.pending.size >= MAX_PENDING || this.pendingCharacters + key.length > MAX_CHARACTERS)
      return compute();
    const promise = compute().then(value => JSON.stringify(value));
    this.pending.set(key, promise);
    this.pendingCharacters += key.length;
    try { return JSON.parse(await promise) as T; }
    finally { this.pending.delete(key); this.pendingCharacters -= key.length; }
  }

  stats() {
    return { entries: this.entries.size, characters: this.size,
      pending: this.pending.size, pendingCharacters: this.pendingCharacters, ...this.outcomes };
  }

  get(key: string, now = Date.now()): CachedScholarshipFacets | undefined {
    const entry = this.entries.get(key);
    if (!entry) { this.outcomes.misses++; return undefined; }
    if (entry.expires <= now) { this.remove(key); this.outcomes.misses++; return undefined; }
    this.outcomes.hits++;
    // Return an independent object to concurrent requests.
    return JSON.parse(entry.json) as CachedScholarshipFacets;
  }

  put(key: string, value: CachedScholarshipFacets, now = Date.now()) {
    // Concurrent different pages may finish in either order. Merge only pages
    // of the same immutable scope/total, without refreshing the original TTL.
    const previous = this.entries.get(key);
    const facets = { ...value.facets };
    if (previous && previous.expires > now) {
      const old = JSON.parse(previous.json) as CachedScholarshipFacets;
      for (const [name, facet] of Object.entries(facets)) {
        if (old.facets[name]?.total === facet.total)
          facets[name] = { ...facet, pages: { ...old.facets[name].pages, ...facet.pages } };
      }
    }
    const json = JSON.stringify({ ...value, facets }), size = key.length + json.length;
    const expires = previous && previous.expires > now ? previous.expires : now + TTL_MS;
    this.remove(key);
    if (size > MAX_CHARACTERS) return;
    for (const [oldKey, entry] of this.entries) {
      if (entry.expires <= now) this.remove(oldKey);
    }
    while (this.entries.size >= MAX_ENTRIES || this.size + size > MAX_CHARACTERS) {
      this.remove(this.entries.keys().next().value!);
    }
    this.entries.set(key, { expires, json, size });
    this.size += size;
  }

  private remove(key: string) {
    const entry = this.entries.get(key);
    if (entry) this.size -= entry.size;
    this.entries.delete(key);
  }
}

// Identical campaign identifiers in different database bindings are isolated.
const databases = new WeakMap<D1Database, ScholarshipFacetCache>();
export const scholarshipFacetCache = (db: D1Database) => {
  let cache = databases.get(db);
  if (!cache) { cache = new ScholarshipFacetCache(); databases.set(db, cache); }
  return cache;
};
