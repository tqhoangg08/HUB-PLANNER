/**
 * Cache primitives for the AI Advisor. No runtime backend is selected here:
 * production can opt into one only after its isolation and lifecycle are
 * reviewed. The in-memory implementation exists solely for injected tests.
 */
export type AdvisorCacheScope =
  | { kind: 'PUBLIC' }
  | { kind: 'ROLE'; role: string }
  | { kind: 'USER'; userId: string };

export interface AnswerCache<T> {
  get(key: string): Promise<T | null>;
  put(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface RetrievalCache<T> {
  get(key: string): Promise<T | null>;
  put(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export type AdvisorRevisionRecord = {
  id: string;
  /** Original document revision maintained by D1. */
  version?: string | number | null;
  /** Hash of the original uploaded bytes, not the derived indexing artifact. */
  contentHash?: string | null;
  canonicalHash?: string | null;
  /** Existing legacy source selector, for example original or ocr_text. */
  indexSourceKind?: string | null;
  /** Explicit derived representation selector: native_text, ocr, or legacy. */
  derivedSourceKind?: string | null;
  /** Versioned deterministic extraction pipeline. */
  extractionPipelineVersion?: string | null;
  /** SHA-256 of the exact text/Markdown sent to the retrieval index. */
  derivedContentHash?: string | null;
  indexingStatus?: string | null;
};

export type AnswerCacheKeyInput = {
  question: string;
  scope: AdvisorCacheScope;
  sourceRevisionFingerprint: string;
  providerOrFormatterVersion: string;
  promptVersion: string;
  answerPathVersion: string;
};

export type RetrievalCacheKeyInput = {
  question: string;
  scope: AdvisorCacheScope;
  allowedDocumentRevisionFingerprint: string;
  retrievalConfigVersion: string;
};

const bounded = (value: unknown, max = 512) => String(value ?? '').trim().slice(0, max);

export const normalizeAdvisorCacheQuestion = (value: string) => value
  .toLocaleLowerCase('vi-VN')
  .normalize('NFC')
  .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const serializeAdvisorCacheScope = (scope: AdvisorCacheScope) => {
  if (scope.kind === 'PUBLIC') return 'PUBLIC';
  if (scope.kind === 'ROLE') return `ROLE:${bounded(scope.role, 128).toLocaleLowerCase('vi-VN')}`;
  return `USER:${bounded(scope.userId, 256)}`;
};

const digest = async (value: string) => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const canonicalRevisionRecord = (record: AdvisorRevisionRecord) => [
  bounded(record.id, 256),
  bounded(record.version, 64),
  bounded(record.contentHash, 256),
  bounded(record.canonicalHash, 256),
  bounded(record.indexSourceKind, 64),
  bounded(record.derivedSourceKind, 64),
  bounded(record.extractionPipelineVersion, 128),
  bounded(record.derivedContentHash, 256),
  bounded(record.indexingStatus, 64),
].join('|');

/** Stable across D1 result ordering; a changed revision naturally yields a miss. */
export const fingerprintDocumentRevisions = async (records: readonly AdvisorRevisionRecord[]) =>
  digest(records.map(canonicalRevisionRecord).sort().join('\n'));

/** The same mechanism also protects cache entries derived from D1 structured rows. */
export const fingerprintStructuredSources = async (records: readonly Record<string, unknown>[]) =>
  digest(records.map((record) => Object.keys(record).sort().map((key) => `${key}=${bounded(record[key])}`).join('|')).sort().join('\n'));

export const buildAnswerCacheKey = async (input: AnswerCacheKeyInput) =>
  `advisor:answer:v1:${await digest([
    normalizeAdvisorCacheQuestion(input.question),
    serializeAdvisorCacheScope(input.scope),
    bounded(input.sourceRevisionFingerprint, 256),
    bounded(input.providerOrFormatterVersion, 128),
    bounded(input.promptVersion, 128),
    bounded(input.answerPathVersion, 128),
  ].join('\n'))}`;

export const buildRetrievalCacheKey = async (input: RetrievalCacheKeyInput) =>
  `advisor:retrieval:v1:${await digest([
    normalizeAdvisorCacheQuestion(input.question),
    serializeAdvisorCacheScope(input.scope),
    bounded(input.allowedDocumentRevisionFingerprint, 256),
    bounded(input.retrievalConfigVersion, 128),
  ].join('\n'))}`;

/** Test-only implementation. Do not make this a Worker module-global cache. */
export class MemoryAdvisorCache<T> implements AnswerCache<T>, RetrievalCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  async get(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: T, ttlSeconds: number) {
    this.entries.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlSeconds) * 1_000 });
  }

  async delete(key: string) { this.entries.delete(key); }
}
