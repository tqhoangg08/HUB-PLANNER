import { GoogleGenAI } from '@google/genai';

export interface GeminiFileSearchEnv {
  GEMINI_FILE_SEARCH_ENABLED?: string;
  GEMINI_FILE_SEARCH_API_KEY?: string;
  GEMINI_FILE_SEARCH_STORE?: string;
  GEMINI_CHAT_MODEL?: string;
  GEMINI_THINKING_LEVEL?: string;
}

export interface GeminiDocumentSource {
  documentId: string | null;
  fileName: string;
  title: string | null;
  pageNumber: number | null;
  /** Internal grounding metadata; presentation intentionally hides pages. */
  pageNumbers?: number[];
  /**
   * Deterministically parsed only from File Search grounding text. These are
   * optional because the SDK does not guarantee retrieved passages.
   */
  locators?: string[];
  /** Multiple grounded applicability ranges can belong to one cited document. */
  applicability?: GeminiDocumentApplicability[];
}

export interface GeminiDocumentApplicability {
  cohortYear?: number;
  fromCohortYear?: number;
  academicYear?: string;
  effectiveFrom?: string;
  /** Exact bounded wording found in retrieved text; never derived from a title or page. */
  rawLabel: string;
}

/**
 * Internal-only stage labels. These intentionally contain no request, source,
 * document-content, credential, or storage-path data.
 */
export type GeminiFileSearchFailureReason =
  | 'CONFIG_DISABLED'
  | 'GEMINI_REQUEST_FAILED'
  | 'GEMINI_REQUEST_TIMEOUT'
  | 'GEMINI_EMPTY_REPLY'
  | 'GEMINI_NO_FILE_CITATION'
  | 'D1_CITATION_NOT_FOUND'
  | 'D1_CITATION_NOT_ACTIVE'
  | 'D1_CITATION_CATEGORY_REJECTED'
  | 'SUCCESS';

export type GeminiInvalidArgumentClassification =
  | 'INVALID_ARGUMENT_CONTENTS'
  | 'INVALID_ARGUMENT_TOOL'
  | 'INVALID_ARGUMENT_METADATA_FILTER'
  | 'INVALID_ARGUMENT_THINKING_CONFIG'
  | 'INVALID_ARGUMENT_GENERATION_CONFIG'
  | 'INVALID_ARGUMENT_MODEL'
  | 'INVALID_ARGUMENT_UNKNOWN';

export type GeminiFileSearchDiagnostics = {
  model: string;
  errorName?: string;
  status?: number;
  durationMs?: number;
  apiErrorMessage?: string;
  apiErrorStatusText?: string;
  apiErrorReason?: string;
  google400Classification?: GeminiInvalidArgumentClassification;
  contentsKind?: 'string' | 'content_array';
  contentsCount?: number;
  systemChars?: number;
  inputChars?: number;
  maxOutputTokensPresent?: boolean;
  thinkingLevel?: string;
  toolCount?: number;
  metadataFilterChars?: number;
  keyFingerprint?: string;
  storeFingerprint?: string;
  metadataFilterFingerprint?: string;
};

export class GeminiFileSearchError extends Error {
  readonly reason: Extract<GeminiFileSearchFailureReason, 'GEMINI_REQUEST_FAILED' | 'GEMINI_REQUEST_TIMEOUT' | 'GEMINI_EMPTY_REPLY'>;
  readonly diagnostics: GeminiFileSearchDiagnostics;

  constructor(
    reason: Extract<GeminiFileSearchFailureReason, 'GEMINI_REQUEST_FAILED' | 'GEMINI_REQUEST_TIMEOUT' | 'GEMINI_EMPTY_REPLY'>,
    diagnostics: GeminiFileSearchDiagnostics,
  ) {
    super(reason);
    this.name = 'GeminiFileSearchError';
    this.reason = reason;
    this.diagnostics = diagnostics;
  }
}

export type GeminiFileSearchOptions = {
  /** A server-selected public-document filter; never derived directly from user input. */
  metadataFilter?: string;
  /** A server-selected per-request bound; never client-controlled. */
  timeoutMs?: number;
};

const DEFAULT_FILE_SEARCH_TIMEOUT_MS = 16_000;
const DEFAULT_FILE_SEARCH_MODEL = 'gemini-3.1-flash-lite';
const FILE_SEARCH_MAX_OUTPUT_TOKENS = 2_048;
const DOCUMENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DOCUMENT_CANDIDATE_IDS = 12;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const MAX_SAFE_API_ERROR_MESSAGE_CHARS = 300;
const UUID_LIKE_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
const API_KEY_PATTERN = /\bAIza[0-9A-Za-z_-]{20,}\b/gu;
const BEARER_PATTERN = /\bBearer\s+[0-9A-Za-z._~+\/-]+=*/giu;
const STORE_PATTERN = /\bfileSearchStores\/[0-9A-Za-z_-]+\b/gu;
const TOKENIZED_URL_PATTERN = /https?:\/\/[^\s"'<>?]+\?[^\s"'<>]*/giu;

const parseJsonRecord = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    return record(JSON.parse(value));
  } catch {
    return null;
  }
};

const boundedStructuralRecords = (error: unknown) => {
  const root = record(error);
  if (!root) return [];
  const messageJson = parseJsonRecord(root.message);
  const bodyJson = parseJsonRecord(root.body);
  const response = record(root.response);
  return [
    root,
    record(root.error),
    messageJson,
    record(messageJson?.error),
    record(root.body),
    bodyJson,
    record(bodyJson?.error),
    response,
    record(response?.error),
  ].filter((value): value is Record<string, unknown> => Boolean(value));
};

const structuralDetailValues = (records: Record<string, unknown>[]) => {
  const reasons: string[] = [];
  const domains: string[] = [];
  for (const item of records) {
    const details = Array.isArray(item.details) ? item.details.slice(0, 8) : [];
    for (const detail of details) {
      const entry = record(detail);
      if (!entry) continue;
      if (typeof entry.reason === 'string') reasons.push(entry.reason);
      if (typeof entry.domain === 'string') domains.push(entry.domain);
    }
  }
  return { reasons, domains };
};

const sanitizeApiErrorText = (value: unknown, sensitiveValues: readonly string[]) => {
  let text = String(value || '').replace(/\s+/g, ' ').trim();
  for (const sensitive of sensitiveValues) {
    const candidate = String(sensitive || '').trim();
    if (candidate.length >= 4) text = text.split(candidate).join('[REDACTED]');
  }
  return text
    .replace(TOKENIZED_URL_PATTERN, '[URL_REDACTED]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(API_KEY_PATTERN, '[API_KEY_REDACTED]')
    .replace(STORE_PATTERN, '[STORE_REDACTED]')
    .replace(UUID_LIKE_PATTERN, '[DOCUMENT_ID_REDACTED]')
    .slice(0, MAX_SAFE_API_ERROR_MESSAGE_CHARS);
};

export const classifyGeminiInvalidArgument = (
  status: number | undefined,
  statusText: string | undefined,
  message: string | undefined,
  reason: string | undefined,
): GeminiInvalidArgumentClassification | undefined => {
  const evidence = `${statusText || ''} ${message || ''} ${reason || ''}`.toLowerCase();
  if (status !== 400 && !evidence.includes('invalid_argument') && !evidence.includes('invalid argument')) return undefined;
  if (/metadata[_\s-]*filter|aip-?160/.test(evidence)) return 'INVALID_ARGUMENT_METADATA_FILTER';
  if (/thinking[_\s-]*(config|level|budget)|thinkingconfig/.test(evidence)) return 'INVALID_ARGUMENT_THINKING_CONFIG';
  if (/max[_\s-]*output[_\s-]*tokens|generation[_\s-]*config|generationconfig/.test(evidence)) return 'INVALID_ARGUMENT_GENERATION_CONFIG';
  if (/\bmodel(s)?\b|model[_\s-]*name/.test(evidence)) return 'INVALID_ARGUMENT_MODEL';
  if (/\bcontents?\b|\bparts?\b|\brole\b/.test(evidence)) return 'INVALID_ARGUMENT_CONTENTS';
  if (/file[_\s-]*search|filesearch|\btools?\b|file[_\s-]*search[_\s-]*store/.test(evidence)) return 'INVALID_ARGUMENT_TOOL';
  return 'INVALID_ARGUMENT_UNKNOWN';
};

export const extractSafeGeminiApiErrorDiagnostics = (
  error: unknown,
  sensitiveValues: readonly string[] = [],
) => {
  const records = boundedStructuralRecords(error);
  const root = record(error);
  const statusValue = records.map((item) => item.status ?? item.statusCode ?? item.code)
    .find((value) => Number.isInteger(Number(value)));
  const parsedStatus = Number(statusValue);
  const status = Number.isInteger(parsedStatus) && parsedStatus >= 100 && parsedStatus <= 599 ? parsedStatus : undefined;
  const statusTextRaw = records.map((item) => item.status).find((value) => typeof value === 'string');
  const messages = records.map((item) => item.message).filter((value): value is string => typeof value === 'string');
  const apiMessage = messages.find((value) => !value.trim().startsWith('{')) || messages[0] || '';
  const { reasons, domains } = structuralDetailValues(records);
  const statusText = sanitizeApiErrorText(statusTextRaw, sensitiveValues) || undefined;
  const apiErrorMessage = sanitizeApiErrorText(apiMessage, sensitiveValues) || undefined;
  const apiErrorReason = sanitizeApiErrorText([reasons[0], domains[0]].filter(Boolean).join('@'), sensitiveValues) || undefined;
  return {
    errorName: typeof root?.name === 'string' ? root.name.slice(0, 80) : undefined,
    status,
    apiErrorMessage,
    apiErrorStatusText: statusText,
    apiErrorReason,
    google400Classification: classifyGeminiInvalidArgument(status, statusText, apiErrorMessage, apiErrorReason),
  };
};

export const buildGeminiRequestShapeDiagnostic = (
  system: string,
  retrievalInput: string,
  metadataFilter: string,
  thinkingLevel: string,
) => ({
  contentsKind: 'content_array' as const,
  contentsCount: 1,
  systemChars: system.length,
  inputChars: retrievalInput.length,
  maxOutputTokensPresent: true,
  thinkingLevel,
  toolCount: 1,
  metadataFilterChars: metadataFilter.length,
});

const sha256Fingerprint = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
};

export const geminiFileSearchConfigured = (env: GeminiFileSearchEnv) =>
  env.GEMINI_FILE_SEARCH_ENABLED === 'true'
  && Boolean(String(env.GEMINI_FILE_SEARCH_API_KEY || '').trim())
  && Boolean(String(env.GEMINI_FILE_SEARCH_STORE || '').trim());

export const publicDocumentMetadataFilter = (category?: string | null) => {
  const normalizedCategory = String(category || '').trim().toLowerCase();
  return normalizedCategory && /^[a-z_]{2,64}$/.test(normalizedCategory)
    ? `visibility = "public" AND category = "${normalizedCategory}"`
    : 'visibility = "public"';
};

/**
 * Builds an AIP-160 filter exclusively from D1-authoritative UUIDs. It is
 * deliberately separate from user search text so File Search never receives
 * interpolated client input as filter syntax.
 */
export const buildDocumentCandidateMetadataFilter = (ids: readonly string[]) => {
  const validIds = [...new Set(ids.map((id) => String(id || '').trim()).filter((id) => DOCUMENT_ID_PATTERN.test(id)))]
    .slice(0, MAX_DOCUMENT_CANDIDATE_IDS);
  if (!validIds.length) return null;
  return `visibility = "public" AND (${validIds.map((id) => `document_id = "${id}"`).join(' OR ')})`;
};

const MAX_LOCATORS_PER_SOURCE = 3;

const uniqueLocators = (locators: string[]) => [...new Set(locators.map((locator) => locator.trim()).filter(Boolean))]
  .slice(0, MAX_LOCATORS_PER_SOURCE);

/**
 * Extracts formal Vietnamese document locators from text that File Search has
 * grounded. It deliberately does not use filenames, questions, or pages.
 */
export const extractOfficialDocumentLocators = (value: unknown): string[] => {
  const text = typeof value === 'string' ? value.slice(0, 4_000) : '';
  if (!text) return [];
  // Headings use a line boundary so "học phần 2" cannot become "Phần 2".
  const part = text.match(/(?:^|\n)\s*phần\s+([ivxlcdm]+|\d{1,3})\b/imu)?.[1];
  const chapter = text.match(/(?:^|[^\p{L}\p{N}])chương\s+([ivxlcdm]+|\d{1,3})\b/iu)?.[1];
  const section = text.match(/(?:^|[^\p{L}\p{N}])mục\s+(\d{1,3}[a-z]?)\b/iu)?.[1];
  const article = text.match(/(?:^|[^\p{L}\p{N}])điều\s+(\d{1,3}[a-z]?)\b/iu)?.[1];
  const explicitClause = text.match(/(?:^|[^\p{L}\p{N}])khoản\s+(\d{1,3})\b/iu)?.[1];
  // A bare "2." is a clause only in an excerpt that already names an article.
  const numberedClause = article
    ? text.match(/(?:^|\n)\s*(\d{1,3})\s*[.)](?=\s*[^\n\d][^\n]{0,180})/u)?.[1]
    : undefined;
  const clause = explicitClause || numberedClause;
  const explicitPoint = text.match(/(?:^|[^\p{L}\p{N}])điểm\s+([a-zđ])\b/iu)?.[1];
  // Likewise, a bare "a)" becomes a point only with article + clause context.
  const letterPoint = article && clause
    ? text.match(/(?:^|\n)\s*([a-zđ])\)(?=\s*\S)/iu)?.[1]
    : undefined;
  const point = explicitPoint || letterPoint;
  const subitem = text.match(/(?:^|[^\p{L}\p{N}])tiểu\s*mục\s+(\d{1,3}[a-z]?)\b/iu)?.[1];

  const components: string[] = [];
  if (part) components.push(`Phần ${part.toUpperCase()}`);
  if (chapter) components.push(`Chương ${chapter.toUpperCase()}`);
  if (section) components.push(`Mục ${section}`);
  if (article) components.push(`Điều ${article}`);
  if (clause) components.push(`khoản ${clause}`);
  if (point) components.push(`điểm ${point.toLowerCase()}`);
  if (subitem) components.push(`tiểu mục ${subitem}`);
  return components.length ? [components.join(', ')] : [];
};

const applicabilityKey = (value: GeminiDocumentApplicability) => [
  value.cohortYear || '', value.fromCohortYear || '', value.academicYear || '', value.effectiveFrom || '', value.rawLabel,
].join('|');

const uniqueApplicability = (values: GeminiDocumentApplicability[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = applicabilityKey(value);
    if (!value.rawLabel || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_LOCATORS_PER_SOURCE);
};

/**
 * Reads applicability only from retrieved/attributed content. A year in a
 * filename, citation page, or the user's question is intentionally ignored.
 */
export const extractOfficialDocumentApplicability = (value: unknown): GeminiDocumentApplicability[] => {
  const text = typeof value === 'string' ? value.slice(0, 4_000) : '';
  if (!text) return [];
  const matches: GeminiDocumentApplicability[] = [];
  const add = (applicability: Omit<GeminiDocumentApplicability, 'rawLabel'>, rawLabel: string) => {
    const label = rawLabel.replace(/\s+/g, ' ').trim().slice(0, 180);
    if (label) matches.push({ ...applicability, rawLabel: label });
  };

  for (const match of text.matchAll(/(?:áp\s+dụng[^\n.;]{0,100}?)?(?:các\s+)?khóa\s+tuyển\s+sinh\s+từ\s+(?:năm\s*)?(20\d{2})\b/giu)) {
    add({ fromCohortYear: Number(match[1]) }, `Từ khóa tuyển sinh năm ${match[1]}`);
  }
  // Also recognize the safe, normalized label that this helper itself emits
  // when sources are deduplicated later in the Worker.
  for (const match of text.matchAll(/(?:^|[^\p{L}\p{N}])từ\s+khóa\s+tuyển\s+sinh\s+(?:năm\s*)?(20\d{2})\b/giu)) {
    add({ fromCohortYear: Number(match[1]) }, `Từ khóa tuyển sinh năm ${match[1]}`);
  }
  for (const match of text.matchAll(/(?:áp\s+dụng[^\n.;]{0,100}?)?khóa\s+tuyển\s+sinh(?:\s+năm)?\s+(20\d{2})\b/giu)) {
    // "từ năm" belongs to the range above, never a single-cohort rule.
    const source = match[0];
    if (/\btừ\s+(?:năm\s*)?20\d{2}\b/iu.test(source)) continue;
    add({ cohortYear: Number(match[1]) }, `Khóa tuyển sinh năm ${match[1]}`);
  }
  for (const match of text.matchAll(/\bnăm\s+học\s*(20\d{2})\s*[-–]\s*(20\d{2})\b/giu)) {
    add({ academicYear: `${match[1]}-${match[2]}` }, `Năm học ${match[1]}-${match[2]}`);
  }
  for (const match of text.matchAll(/\bcó\s+hiệu\s+lực\s+kể\s+từ\s+(?:ngày\s+)?([^\n.;]{2,96})/giu)) {
    const effectiveFrom = match[1].replace(/\s+/g, ' ').trim();
    add({ effectiveFrom }, `Có hiệu lực kể từ ${effectiveFrom}`);
  }
  return uniqueApplicability(matches);
};

const textValue = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const nestedTextValue = (value: unknown) => {
  const item = record(value);
  if (!item) return '';
  return textValue(item.text) || textValue(item.content) || textValue(item.value);
};

/** FileCitation has no snippet in the current SDK type, but retain safe support for API variants. */
const citationSnippet = (item: Record<string, unknown>) => {
  const candidates = [
    item.snippet, item.quote, item.text, item.content, item.context, item.passage,
    nestedTextValue(item.content), nestedTextValue(item.grounding), nestedTextValue(item.retrievedContext),
  ];
  return candidates.map((candidate) => textValue(candidate)).find(Boolean) || '';
};

const citedTextSlice = (text: string | null, item: Record<string, unknown>) => {
  if (!text) return '';
  const start = Number(item.startIndex ?? item.start_index);
  const end = Number(item.endIndex ?? item.end_index);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return '';
  const bytes = new TextEncoder().encode(text);
  if (end > bytes.byteLength) return '';
  return new TextDecoder().decode(bytes.slice(start, end)).trim();
};

type GroundedAnnotation = { item: Record<string, unknown>; text: string | null };

const walk = (value: unknown, annotations: GroundedAnnotation[], inheritedText: string | null = null) => {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, annotations, inheritedText);
    return;
  }
  const item = record(value);
  if (!item) return;
  const text = typeof item.text === 'string' ? item.text : inheritedText;
  if (item.type === 'file_citation' || item.type === 'fileCitation') annotations.push({ item, text });
  const attached = Array.isArray(item.annotations) ? item.annotations : [];
  if (typeof item.text === 'string') {
    for (const annotation of attached) {
      const candidate = record(annotation);
      if (candidate && (candidate.type === 'file_citation' || candidate.type === 'fileCitation')) {
        annotations.push({ item: candidate, text: item.text });
      }
    }
  }
  for (const [key, child] of Object.entries(item)) {
    // Citations on this exact text block were already collected with their
    // attributed text above. Avoid a duplicate without citation context.
    if (key === 'annotations' && typeof item.text === 'string') continue;
    walk(child, annotations, text);
  }
};

export const extractGeminiDocumentSources = (interaction: unknown): GeminiDocumentSource[] => {
  const annotations: GroundedAnnotation[] = [];
  walk(interaction, annotations);
  const sources: GeminiDocumentSource[] = [];
  const byKey = new Map<string, number>();
  for (const annotation of annotations) {
    const item = annotation.item;
    // @google/genai's JavaScript objects use camelCase, while stored/mocked
    // interaction payloads can use the REST API's snake_case. Normalize both
    // before D1 performs the actual authority check.
    const source = String(item.documentUri || item.document_uri || item.source || item.documentName || item.document_name || '').trim();
    const metadata = record(item.customMetadata) || record(item.custom_metadata);
    const fileName = String(item.fileName || item.file_name || item.filename || '').trim();
    const pageNumber = Number(item.pageNumber ?? item.page_number ?? 0) || null;
    const match = source.match(/(?:\/documents\/|\b)([0-9a-f-]{36})(?:$|[\/?#])/i);
    const documentNameMatch = source.match(/\/documents\/([A-Za-z0-9._-]{1,256})(?:$|[\/?#])/);
    const metadataDocumentId = String(metadata?.document_id || metadata?.documentId || '').trim();
    const documentId = /^[0-9a-f-]{36}$/i.test(metadataDocumentId)
      ? metadataDocumentId
      : match?.[1] || documentNameMatch?.[1] || null;
    const key = `${documentId || source}|${fileName}|${pageNumber || ''}`;
    // A citation with a D1 identifier remains useful even if Gemini omits its
    // presentation filename: the authoritative D1 row supplies that later.
    if (!fileName && !documentId) continue;
    // Snippet/quote takes precedence. If unavailable, FileCitation's byte
    // offsets identify the grounded portion of the model answer.
    const groundedText = citationSnippet(item) || citedTextSlice(annotation.text, item);
    const locators = uniqueLocators(extractOfficialDocumentLocators(groundedText));
    const applicability = extractOfficialDocumentApplicability(groundedText);
    const existingIndex = byKey.get(key);
    if (existingIndex !== undefined) {
      const existing = sources[existingIndex];
      if (locators.length) existing.locators = uniqueLocators([...(existing.locators || []), ...locators]);
      if (applicability.length) existing.applicability = uniqueApplicability([...(existing.applicability || []), ...applicability]);
      continue;
    }
    byKey.set(key, sources.length);
    sources.push({
      documentId,
      fileName,
      title: fileName ? fileName.replace(/\.[^.]+$/, '') : null,
      pageNumber,
      ...(locators.length ? { locators } : {}),
      ...(applicability.length ? { applicability } : {}),
    });
  }
  return sources;
};

type GenerateContentGroundingExtraction = {
  sources: GeminiDocumentSource[];
  groundingChunkCount: number;
  documentIdMetadataCount: number;
  pageNumberCount: number;
};

const metadataScalar = (value: unknown) => {
  const entry = record(value);
  return String(entry?.stringValue ?? entry?.string_value ?? entry?.numericValue ?? entry?.numeric_value ?? entry?.value ?? value ?? '').trim();
};

const groundedMetadataDocumentId = (value: unknown) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const metadata = record(item);
      const key = String(metadata?.key || metadata?.name || '').trim().toLowerCase();
      const candidate = metadataScalar(metadata);
      if (key === 'document_id' && DOCUMENT_ID_PATTERN.test(candidate)) return candidate;
    }
    return null;
  }
  const metadata = record(value);
  const candidate = metadataScalar(metadata?.document_id ?? metadata?.documentId);
  return DOCUMENT_ID_PATTERN.test(candidate) ? candidate : null;
};

/**
 * GenerateContent File Search grounding is represented by retrievedContext
 * chunks, not Interactions' file_citation annotations. A document ID is only
 * trusted here when its custom metadata supplies the exact UUID; D1 remains
 * the final authority after this parser returns.
 */
const extractGenerateContentGrounding = (response: unknown): GenerateContentGroundingExtraction => {
  const root = record(response);
  const candidate = Array.isArray(root?.candidates) ? record(root?.candidates[0]) : null;
  const grounding = record(candidate?.groundingMetadata) || record(candidate?.grounding_metadata);
  const chunks = Array.isArray(grounding?.groundingChunks)
    ? grounding.groundingChunks
    : Array.isArray(grounding?.grounding_chunks) ? grounding.grounding_chunks : [];
  const sources: GeminiDocumentSource[] = [];
  const byDocumentId = new Map<string, number>();
  let documentIdMetadataCount = 0;
  let pageNumberCount = 0;
  for (const chunk of chunks) {
    const chunkRecord = record(chunk);
    const context = record(chunkRecord?.retrievedContext) || record(chunkRecord?.retrieved_context);
    if (!context) continue;
    const documentId = groundedMetadataDocumentId(context.customMetadata ?? context.custom_metadata);
    if (!documentId) continue;
    documentIdMetadataCount += 1;
    const pageNumber = Number(context.pageNumber ?? context.page_number ?? 0) || null;
    if (pageNumber) pageNumberCount += 1;
    // Only retrievedContext.text is evidence for formal locators and scope.
    const groundedText = typeof context.text === 'string' ? context.text : '';
    const locators = uniqueLocators(extractOfficialDocumentLocators(groundedText));
    const applicability = extractOfficialDocumentApplicability(groundedText);
    const title = String(context.title || '').trim();
    const existingIndex = byDocumentId.get(documentId);
    if (existingIndex !== undefined) {
      const existing = sources[existingIndex];
      if (locators.length) existing.locators = uniqueLocators([...(existing.locators || []), ...locators]);
      if (applicability.length) existing.applicability = uniqueApplicability([...(existing.applicability || []), ...applicability]);
      if (pageNumber) {
        existing.pageNumbers = [...new Set([...(existing.pageNumbers || (existing.pageNumber ? [existing.pageNumber] : [])), pageNumber])].sort((left, right) => left - right);
      }
      continue;
    }
    byDocumentId.set(documentId, sources.length);
    sources.push({
      documentId,
      fileName: title,
      title: title || null,
      pageNumber,
      ...(pageNumber ? { pageNumbers: [pageNumber] } : {}),
      ...(locators.length ? { locators } : {}),
      ...(applicability.length ? { applicability } : {}),
    });
  }
  return { sources, groundingChunkCount: chunks.length, documentIdMetadataCount, pageNumberCount };
};

export const extractGenerateContentDocumentSources = (response: unknown) => extractGenerateContentGrounding(response).sources;

/** Official-policy retrieval is one synthesized user request, never chat turns. */
export const buildGeminiPolicyContents = (retrievalInput: string) => [{
  role: 'user' as const,
  parts: [{ text: String(retrievalInput || '').trim() }],
}];

export const buildGeminiInteractionSteps = (
  history: Array<{ role: string; content: string }>,
  question: string,
) => [
  ...history.flatMap((message) => {
    const text = String(message.content || '').trim();
    if (!text) return [];
    return [{
      type: message.role === 'assistant' ? 'model_output' : 'user_input',
      content: [{ type: 'text', text }],
    }];
  }),
  {
    type: 'user_input',
    content: [{ type: 'text', text: question.trim() }],
  },
];

const outputText = (interaction: unknown) => {
  const value = record(interaction);
  if (typeof value?.text === 'string') return value.text.trim();
  if (typeof value?.outputText === 'string') return value.outputText.trim();
  if (typeof value?.output_text === 'string') return value.output_text.trim();
  const texts: string[] = [];
  const collect = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(collect);
    const item = record(node);
    if (!item) return;
    if (item.type === 'text' && typeof item.text === 'string') texts.push(item.text);
    else Object.values(item).forEach(collect);
  };
  collect(interaction);
  return texts.join('\n').trim();
};

export const answerWithGeminiFileSearch = async (
  env: GeminiFileSearchEnv,
  system: string,
  retrievalInput: string,
  options: GeminiFileSearchOptions = {},
) => {
  if (!geminiFileSearchConfigured(env)) return null;
  const ai = new GoogleGenAI({ apiKey: String(env.GEMINI_FILE_SEARCH_API_KEY) });
  const model = String(env.GEMINI_CHAT_MODEL || DEFAULT_FILE_SEARCH_MODEL);
  const configuredThinking = String(env.GEMINI_THINKING_LEVEL || 'minimal').toLowerCase();
  const thinkingLevel = ['minimal', 'medium', 'high'].includes(configuredThinking) ? configuredThinking : 'minimal';
  const timeoutMs = Math.max(1_000, Math.min(Number(options.timeoutMs) || DEFAULT_FILE_SEARCH_TIMEOUT_MS, DEFAULT_FILE_SEARCH_TIMEOUT_MS));
  const storeName = String(env.GEMINI_FILE_SEARCH_STORE);
  const apiKey = String(env.GEMINI_FILE_SEARCH_API_KEY);
  const metadataFilter = options.metadataFilter || publicDocumentMetadataFilter();
  const requestShape = buildGeminiRequestShapeDiagnostic(system, retrievalInput, metadataFilter, thinkingLevel);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  let response: unknown;
  try {
    response = await ai.models.generateContent({
      model,
      contents: buildGeminiPolicyContents(retrievalInput),
      config: {
        systemInstruction: system,
        maxOutputTokens: FILE_SEARCH_MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: thinkingLevel.toUpperCase() },
        tools: [{ fileSearch: {
          fileSearchStoreNames: [storeName],
          metadataFilter,
        } }],
        abortSignal: controller.signal,
        httpOptions: { timeout: timeoutMs },
      },
    } as never);
  } catch (error) {
    const durationMs = Math.max(0, Date.now() - startedAt);
    const safeApiError = extractSafeGeminiApiErrorDiagnostics(error, [apiKey, storeName, retrievalInput, system]);
    const [keyFingerprint, storeFingerprint, metadataFilterFingerprint] = await Promise.all([
      sha256Fingerprint(apiKey),
      sha256Fingerprint(storeName),
      sha256Fingerprint(metadataFilter),
    ]);
    const errorName = safeApiError.errorName;
    const timedOut = controller.signal.aborted || errorName === 'AbortError' || durationMs >= timeoutMs;
    throw new GeminiFileSearchError(timedOut ? 'GEMINI_REQUEST_TIMEOUT' : 'GEMINI_REQUEST_FAILED', {
      model,
      ...safeApiError,
      ...requestShape,
      keyFingerprint,
      storeFingerprint,
      metadataFilterFingerprint,
      durationMs,
    });
  } finally {
    clearTimeout(timeout);
  }
  const reply = outputText(response);
  if (!reply) throw new GeminiFileSearchError('GEMINI_EMPTY_REPLY', { model });
  const grounding = extractGenerateContentGrounding(response);
  return {
    reply,
    documentSources: grounding.sources,
    groundingChunkCount: grounding.groundingChunkCount,
    documentIdMetadataCount: grounding.documentIdMetadataCount,
    pageNumberCount: grounding.pageNumberCount,
  };
};
