/**
 * Provider-neutral contract for the later generation cutover. Generation may
 * answer only from these server-authorized retrieval sources; the server
 * validates cited source IDs before exposing an answer.
 */
export type AuthorizedEvidenceSource = {
  sourceId: string;
  documentId: string;
  revision: string;
  snippet: string;
  pageNumber?: number;
  /** Server-authorized source format; a Word storage ordinal is NOT a page. */
  locatorKind?: 'word_unit' | 'page';
  /** Server-owned storage ordinal, never exposed as a physical Word page. */
  unitNumber?: number;
  documentTitle?: string;
};

export type GroundedGenerationRequest = {
  question: string;
  evidence: readonly AuthorizedEvidenceSource[];
};

export type GroundedGenerationResponse = {
  text: string;
  citedSourceIds: readonly string[];
};

export type EvidenceAbstentionDecision =
  | { kind: 'ANSWER'; citedSourceIds: readonly string[] }
  | { kind: 'INSUFFICIENT_EVIDENCE' };

export const validateEvidenceAbstention = (
  request: GroundedGenerationRequest,
  response: GroundedGenerationResponse,
): EvidenceAbstentionDecision => {
  if (!response.text.trim() || !response.citedSourceIds.length) return { kind: 'INSUFFICIENT_EVIDENCE' };
  const allowedSourceIds = new Set(request.evidence.map((source) => source.sourceId));
  const uniqueCitations = [...new Set(response.citedSourceIds)];
  if (!uniqueCitations.every((sourceId) => allowedSourceIds.has(sourceId))) return { kind: 'INSUFFICIENT_EVIDENCE' };
  return { kind: 'ANSWER', citedSourceIds: uniqueCitations };
};
