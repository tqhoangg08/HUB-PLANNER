import {
  answerWithGeminiFileSearch,
  buildDocumentCandidateMetadataFilter,
  GeminiFileSearchError,
  geminiFileSearchConfigured,
  publicDocumentMetadataFilter,
  readCloudflareRequestLocation,
  type GeminiDocumentApplicability,
  type GeminiDocumentSource,
  type GeminiFileSearchDiagnostics,
  type GeminiFileSearchEnv,
  type GeminiFileSearchFailureReason,
} from './gemini-file-search.ts';

/**
 * Provider contracts intentionally stop at the Advisor boundary. Authorization,
 * D1 candidate selection, source resolution and user-facing fallback decisions
 * remain in ai-advisor.ts.
 */
export interface RetrievalProvider<Request, Result> {
  readonly id: string;
  isConfigured(env: unknown): boolean;
  retrieve(request: Request): Promise<Result>;
}

export interface GenerationProvider<Request, Result> {
  readonly id: string;
  isConfigured(env: unknown): boolean;
  generate(request: Request): Promise<Result>;
}

export type GroundedDocumentApplicability = GeminiDocumentApplicability;
export type GroundedDocumentSource = GeminiDocumentSource;
export type DocumentProviderFailureReason = GeminiFileSearchFailureReason;
export type DocumentProviderDiagnostics = GeminiFileSearchDiagnostics;

export type GroundedDocumentAnswer = NonNullable<Awaited<ReturnType<typeof answerWithGeminiFileSearch>>>;

export interface GeminiLegacyProviderEnv extends GeminiFileSearchEnv {
  /** Dependency seam for deterministic Worker tests; production leaves this unset. */
  fileSearchAnswer?: typeof answerWithGeminiFileSearch;
  /** Dependency seam for deterministic Worker timeout tests; never configured in production. */
  fileSearchTimeoutMs?: number;
}

export type GroundedDocumentRetrievalRequest = {
  env: GeminiLegacyProviderEnv;
  system: string;
  retrievalInput: string;
  /** D1-authorized IDs only. The adapter formats them for the legacy provider. */
  allowedDocumentIds?: readonly string[];
  /** Used only by the existing public visibility fallback. */
  category?: string | null;
  timeoutMs: number;
  diagnosticLocation?: { cfCountry?: string; cfColo?: string };
};

/**
 * Gemini currently combines retrieval and generation in one grounded request.
 * Keeping that capability explicit prevents Stage 1 from introducing an extra
 * retrieval-to-generation provider call.
 */
export interface GroundedDocumentAnswerProvider
  extends RetrievalProvider<GroundedDocumentRetrievalRequest, GroundedDocumentAnswer | null> {
  hasUsableCandidateIds(ids: readonly string[]): boolean;
  readonly disabledReason: DocumentProviderFailureReason;
  readonly timeoutReason: DocumentProviderFailureReason;
  readonly noCitationReason: DocumentProviderFailureReason;
  readonly unknownFailureReason: DocumentProviderFailureReason;
  shouldUsePublicFallback(reason: DocumentProviderFailureReason): boolean;
  classifyError(error: unknown): {
    reason: DocumentProviderFailureReason;
    diagnostics?: DocumentProviderDiagnostics;
    errorClass: 'provider_unavailable' | 'timeout' | 'rate_limited' | 'bad_request' | 'location_restricted' | 'empty_response' | 'unknown';
  };
}

const DEFAULT_GEMINI_FILE_SEARCH_MODEL = 'gemini-3.1-flash-lite';

/** Bounds the legacy provider call and the deterministic test seam exactly as before. */
export const withGeminiLegacyDeadline = async <T>(operation: Promise<T>, timeoutMs: number, model: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new GeminiFileSearchError('GEMINI_REQUEST_TIMEOUT', { model, durationMs: timeoutMs })), timeoutMs);
    });
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const classifyGeminiLegacyError = (error: unknown) => {
  const providerError = error instanceof GeminiFileSearchError ? error : null;
  const reason = providerError?.reason || 'GEMINI_REQUEST_FAILED';
  const status = Number(providerError?.diagnostics.status);
  const errorClass = reason === 'GEMINI_REQUEST_TIMEOUT'
    ? 'timeout'
    : reason === 'GEMINI_LOCATION_UNSUPPORTED'
      ? 'location_restricted'
      : reason === 'GEMINI_EMPTY_REPLY'
        ? 'empty_response'
        : status === 429
          ? 'rate_limited'
          : status === 400
            ? 'bad_request'
            : providerError
              ? 'provider_unavailable'
              : 'unknown';
  return {
    reason,
    ...(providerError ? { diagnostics: providerError.diagnostics } : {}),
    errorClass,
  } as const;
};

export const geminiLegacyGroundedDocumentProvider: GroundedDocumentAnswerProvider = {
  id: 'gemini-file-search-legacy',
  isConfigured: (env) => geminiFileSearchConfigured(env as GeminiFileSearchEnv),
  hasUsableCandidateIds: (ids) => Boolean(buildDocumentCandidateMetadataFilter(ids)),
  disabledReason: 'CONFIG_DISABLED',
  timeoutReason: 'GEMINI_REQUEST_TIMEOUT',
  noCitationReason: 'GEMINI_NO_FILE_CITATION',
  unknownFailureReason: 'GEMINI_REQUEST_FAILED',
  shouldUsePublicFallback: (reason) => reason === 'GEMINI_NO_FILE_CITATION' || reason === 'GEMINI_EMPTY_REPLY',
  async retrieve(request) {
    const metadataFilter = request.allowedDocumentIds?.length
      ? buildDocumentCandidateMetadataFilter(request.allowedDocumentIds)
      : publicDocumentMetadataFilter(request.category);
    const answer = request.env.fileSearchAnswer || answerWithGeminiFileSearch;
    return withGeminiLegacyDeadline(
      answer(request.env, request.system, request.retrievalInput, {
        metadataFilter: metadataFilter || undefined,
        timeoutMs: request.timeoutMs,
        diagnosticLocation: request.diagnosticLocation,
      }),
      request.timeoutMs,
      String(request.env.GEMINI_CHAT_MODEL || DEFAULT_GEMINI_FILE_SEARCH_MODEL),
    );
  },
  classifyError: classifyGeminiLegacyError,
};

export interface GroqLegacyProviderEnv {
  GROQ_API_KEY?: string;
  GROQ_API_KEY_2?: string;
  GROQ_API_KEY_3?: string;
  GROQ_API_KEY_4?: string;
  GROQ_API_KEY_5?: string;
  GROQ_MODEL?: string;
}

export type AdvisorGenerationMessage = { role: string; content: string };

export type GeneralGenerationRequest = {
  env: GroqLegacyProviderEnv;
  messages: readonly AdvisorGenerationMessage[];
};

export type GeneralGenerationResult = {
  reply: string | null;
  lastStatus: number;
};

/**
 * V2 generation is intentionally separate from legacy Groq chat. It receives
 * only server-authorized evidence and must explicitly decline unsupported
 * answers. No production provider is enabled for it in Stage 6.
 */
export type EvidenceGenerationSource = {
  sourceId: string;
  documentId: string;
  snippet: string;
  score: number | null;
};

export type EvidenceGenerationRequest = {
  question: string;
  evidence: readonly EvidenceGenerationSource[];
};

export type EvidenceGenerationResult = {
  supported: boolean;
  answer: string;
  sourceIds: readonly string[];
  /** Bounded diagnostic only; never contains model output or support text. */
  rejectionReason?: 'INVALID_GROUNDING';
};

export interface EvidenceGenerationProvider {
  readonly id: string;
  isConfigured(env: unknown): boolean;
  generate(request: EvidenceGenerationRequest): Promise<EvidenceGenerationResult>;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const groqKeys = (env: GroqLegacyProviderEnv) => [
  env.GROQ_API_KEY,
  env.GROQ_API_KEY_2,
  env.GROQ_API_KEY_3,
  env.GROQ_API_KEY_4,
  env.GROQ_API_KEY_5,
].map((value) => String(value || '').trim()).filter(Boolean);

/** Preserves the current endpoint, key order, model, timeout and retry-by-key behavior. */
export const groqLegacyGenerationProvider: GenerationProvider<GeneralGenerationRequest, GeneralGenerationResult> = {
  id: 'groq-legacy',
  isConfigured: (env) => groqKeys(env as GroqLegacyProviderEnv).length > 0,
  async generate({ env, messages }) {
    let lastStatus = 502;
    for (const key of groqKeys(env).slice(0, 3)) {
      try {
        const response = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: String(env.GROQ_MODEL || 'openai/gpt-oss-20b'),
            messages,
            temperature: 0.2,
            max_completion_tokens: 2048,
          }),
          signal: AbortSignal.timeout(25_000),
        });
        lastStatus = response.status;
        const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
        if (!response.ok) continue;
        const reply = String(payload.choices?.[0]?.message?.content || '').trim();
        if (reply) return { reply, lastStatus };
      } catch {
        lastStatus = 502;
      }
    }
    return { reply: null, lastStatus };
  },
};

export type AiAdvisorProviders = {
  groundedDocument: GroundedDocumentAnswerProvider;
  generalGeneration: GenerationProvider<GeneralGenerationRequest, GeneralGenerationResult>;
};

const defaultAiAdvisorProviders: AiAdvisorProviders = {
  groundedDocument: geminiLegacyGroundedDocumentProvider,
  generalGeneration: groqLegacyGenerationProvider,
};

/** Tests may replace either provider without a network call; production uses legacy defaults. */
export const resolveAiAdvisorProviders = (overrides?: Partial<AiAdvisorProviders>): AiAdvisorProviders => ({
  ...defaultAiAdvisorProviders,
  ...overrides,
});

/** Keeps request-location extraction outside core business routing. */
export const readAdvisorProviderLocation = readCloudflareRequestLocation;
