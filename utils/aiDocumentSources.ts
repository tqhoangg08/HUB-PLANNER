export type AIDocumentSource = {
  id?: string | null;
  documentId?: string | null;
  title: string;
  fileName?: string;
  pageNumber?: number | null;
  locators?: string[];
  applicability?: Array<{
    cohortYear?: number;
    fromCohortYear?: number;
    academicYear?: string;
    effectiveFrom?: string;
    /** Grounded wording only; the UI never infers a scope. */
    rawLabel: string;
  }>;
  /** Supplied only from the current, server-side D1 policy check. */
  publicView?: 'none' | 'local_rehost' | 'official_link';
  /** Same-origin public viewer path only; never an R2 or Gemini URL. */
  publicUrl?: string;
};

const normalizedTitle = (value: string) => value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

/** Student-facing citations are labels only; document identifiers stay internal. */
export const deduplicateAiDocumentSources = (sources: AIDocumentSource[]) => {
  const byKey = new Map<string, AIDocumentSource>();
  for (const [index, source] of sources.entries()) {
    const id = String(source.id || source.documentId || '').trim();
    const title = String(source.title || source.fileName || 'Tài liệu chính thức').trim();
    const key = id ? `id:${id}` : `title:${normalizedTitle(title) || index}`;
    const locators = [...new Set((Array.isArray(source.locators) ? source.locators : [])
      .map((locator) => String(locator || '').trim()).filter(Boolean))].slice(0, 3);
    const applicability = (Array.isArray(source.applicability) ? source.applicability : [])
      .filter((item) => item && typeof item.rawLabel === 'string' && item.rawLabel.trim())
      .map((item) => ({ ...item, rawLabel: item.rawLabel.trim().slice(0, 180) }))
      .filter((item, itemIndex, items) => items.findIndex((other) => other.rawLabel === item.rawLabel) === itemIndex)
      .slice(0, 3);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        ...source,
        ...(locators.length ? { locators } : {}),
        ...(applicability.length ? { applicability } : {}),
      });
      continue;
    }
    const merged = [...new Set([...(existing.locators || []), ...locators])].slice(0, 3);
    if (merged.length) existing.locators = merged;
    const mergedApplicability = [...(existing.applicability || []), ...applicability]
      .filter((item, itemIndex, items) => items.findIndex((other) => other.rawLabel === item.rawLabel) === itemIndex)
      .slice(0, 3);
    if (mergedApplicability.length) existing.applicability = mergedApplicability;
    if (!existing.publicUrl && source.publicUrl && source.publicView && source.publicView !== 'none') {
      existing.publicView = source.publicView;
      existing.publicUrl = source.publicUrl;
    }
  }
  return [...byKey.values()];
};
