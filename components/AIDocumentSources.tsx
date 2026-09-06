import React, { useState } from 'react';
import { AlertCircle, ChevronDown, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { privateApiRequest } from '../utils/privateApi';

export type AIDocumentSource = {
  id?: string | null;
  documentId?: string | null;
  title: string;
  fileName?: string;
  pageNumber?: number | null;
};

export const AIDocumentSources: React.FC<{
  sources?: AIDocumentSource[];
  unavailable?: boolean;
}> = ({ sources = [], unavailable = false }) => {
  const [opening, setOpening] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const open = async (source: AIDocumentSource) => {
    const documentId = source.id || source.documentId;
    if (!documentId) return;
    setOpening(documentId);
    try {
      const response = await privateApiRequest(`/api/private/v1/ai-document-source/${encodeURIComponent(documentId)}`);
      const payload = await response.json();
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Không mở được nguồn tài liệu:', error);
    } finally {
      setOpening(null);
    }
  };

  if (!sources.length && !unavailable) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-slate-200 pt-2">
      {unavailable && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          Kho tài liệu đang tạm thời không khả dụng. Câu trả lời này chưa được đối chiếu
          với tài liệu.
        </div>
      )}
      {sources.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"
          >
            Nguồn tài liệu ({sources.length})
            <ChevronDown
              size={12}
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
          {expanded && (
            <div className="flex flex-wrap gap-1.5">
              {sources.map((source, index) => (
                <button
                  key={`${source.id}-${source.pageNumber}-${index}`}
                  type="button"
                  onClick={() => open(source)}
                  disabled={!(source.id || source.documentId) || opening === (source.id || source.documentId)}
                  title={(source.id || source.documentId) ? `Mở ${source.fileName || source.title}` : 'Không có file để mở'}
                  className="flex max-w-full items-center gap-1 rounded-md border border-blue-100 bg-blue-50 px-2 py-1 text-left text-[10px] font-semibold text-blue-800 disabled:cursor-default"
                >
                  <FileText size={11} />
                  <span className="truncate">
                    {source.title}
                    {source.pageNumber ? ` · trang ${source.pageNumber}` : ''}
                  </span>
                  {opening === (source.id || source.documentId) ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (source.id || source.documentId) ? (
                    <ExternalLink size={10} />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AIDocumentSources;
