/** Independent document policy, evaluated after personal/structured routing.
 * No request/body overrides. Only a trusted literal server flag enables it. */
export type DocumentProviderPolicyEnv = {
  AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED?: unknown;
};
export const useCloudflareDocumentPolicy = (env: DocumentProviderPolicyEnv, documentIntent: boolean) =>
  documentIntent && env.AI_ADVISOR_DOCUMENT_CLOUDFLARE_FIRST_ENABLED === 'true';

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
