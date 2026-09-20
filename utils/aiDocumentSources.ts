export type AIDocumentSource = {
  id?: string | null;
  documentId?: string | null;
  title: string;
  fileName?: string;
  pageNumber?: number | null;
};

const normalizedTitle = (value: string) => value
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

/** Student-facing citations are labels only; document identifiers stay internal. */
export const deduplicateAiDocumentSources = (sources: AIDocumentSource[]) => {
  const seen = new Set<string>();
  return sources.filter((source, index) => {
    const id = String(source.id || source.documentId || '').trim();
    const title = String(source.title || source.fileName || 'Tài liệu chính thức').trim();
    const key = id ? `id:${id}` : `title:${normalizedTitle(title) || index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
