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
const MAX_ENTRIES = 32;
const MAX_CHARACTERS = 1_000_000;
type Entry = { expires: number; json: string; size: number };

export class ScholarshipFacetCache {
  private entries = new Map<string, Entry>();
  private size = 0;

  get(key: string, now = Date.now()): CachedScholarshipFacets | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now) { this.remove(key); return undefined; }
    // Return an independent object to concurrent requests.
    return JSON.parse(entry.json) as CachedScholarshipFacets;
  }

  put(key: string, value: CachedScholarshipFacets, now = Date.now()) {
    const json = JSON.stringify(value), size = key.length + json.length;
    const expires = this.entries.get(key)?.expires ?? now + TTL_MS;
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
