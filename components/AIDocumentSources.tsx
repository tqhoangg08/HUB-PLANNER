import React, { useMemo } from 'react';
import { AlertCircle, FileText } from 'lucide-react';
import { deduplicateAiDocumentSources, type AIDocumentSource } from '../utils/aiDocumentSources';

export { deduplicateAiDocumentSources, type AIDocumentSource } from '../utils/aiDocumentSources';

export const AIDocumentSources: React.FC<{
  sources?: AIDocumentSource[];
  unavailable?: boolean;
}> = ({ sources = [], unavailable = false }) => {
  const visibleSources = useMemo(() => deduplicateAiDocumentSources(sources), [sources]);
  if (!visibleSources.length && !unavailable) return null;

  return (
    <section className="mt-3 space-y-2 border-t border-slate-200 pt-2" aria-label="Nguồn tham khảo">
      {unavailable && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          Kho tài liệu đang tạm thời không khả dụng. Câu trả lời này chưa được đối chiếu
          với tài liệu.
        </div>
      )}
      {visibleSources.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Nguồn tham khảo{visibleSources.length > 1 ? ` (${visibleSources.length})` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {visibleSources.map((source, index) => (
              <div
                key={String(source.id || source.documentId || `${source.title}-${index}`)}
                className="flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left text-[10px] font-semibold text-slate-700"
              >
                <FileText size={11} aria-hidden="true" />
                <span className="truncate">{source.title || source.fileName || 'Tài liệu chính thức'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default AIDocumentSources;
