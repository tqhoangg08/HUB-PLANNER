/** Independent document policy, evaluated after personal/structured routing.
 * No request/body overrides. Only a trusted literal server flag enables it. */
export type DocumentProviderPolicyEnv = {
  AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED?: unknown;
  AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT?: unknown;
};
/** Fail closed: missing, fractional, coerced or out-of-range configuration is OFF. */
export const readDocumentPolicyPercent = (value: unknown): number => {
  if (typeof value !== 'string' || !/^(0|[1-9]\d?|100)$/.test(value)) return 0;
  return Number(value);
};
export const useCloudflareDocumentPolicy = (env: DocumentProviderPolicyEnv, documentIntent: boolean) =>
  documentIntent && env.AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED === 'true'
    && readDocumentPolicyPercent(env.AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT) > 0;

/** Independent, stable cohort. Never accepts a client identity or logs the hash.
 * Four digest bytes avoid the biased one-byte %100 distribution of legacy V2. */
export const documentPolicyBucket = async (authenticatedUserId: string): Promise<number> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`advisor-document-policy-v1:${authenticatedUserId}`));
  return new DataView(digest).getUint32(0, false) / 0x1_0000_0000 * 100;
};
export const selectCloudflareDocumentPolicy = async (env: DocumentProviderPolicyEnv, authenticatedUserId: string): Promise<boolean> => {
  if (!useCloudflareDocumentPolicy(env, true) || !authenticatedUserId.trim()) return false;
  const percent = readDocumentPolicyPercent(env.AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_PERCENT);
  return percent === 100 || await documentPolicyBucket(authenticatedUserId) < percent;
};

export const DOCUMENT_POLICY_DEADLINE_MS = 30_000;
/** Shared budget, not a fresh timeout per search/read/generation. An in-flight
 * binding call cannot be cancelled, but no subsequent call starts on expiry. */
export const createDocumentPolicyDeadline = (budgetMs = DOCUMENT_POLICY_DEADLINE_MS) => {
  const deadline = Date.now() + budgetMs;
  let expired = false;
  const timeout = () => { expired = true; return new DOMException('Document provider unavailable.', 'TimeoutError'); };
  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      const remaining = deadline - Date.now();
      if (expired || remaining <= 0) throw timeout();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          Promise.resolve().then(work),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timeout()), remaining); }),
        ]);
      } finally { if (timer !== undefined) clearTimeout(timer); }
    },
  };
};
