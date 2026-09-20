export type AIDocumentSource = {
  id?: string | null;
  documentId?: string | null;
  title: string;
  fileName?: string;
  pageNumber?: number | null;
  locators?: string[];
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
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, locators.length ? { ...source, locators } : source);
      continue;
    }
    const merged = [...new Set([...(existing.locators || []), ...locators])].slice(0, 3);
    if (merged.length) existing.locators = merged;
  }
  return [...byKey.values()];
};
