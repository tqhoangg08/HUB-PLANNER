import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const safeLink = (value: string | undefined) => {
  const href = String(value || '').trim();
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
};

/** Shared, raw-HTML-free Markdown presentation for desktop and mobile chat. */
export const AIMessageContent: React.FC<{ content: string }> = ({ content }) => (
  <div className="ai-message-markdown prose prose-sm max-w-none break-words prose-p:leading-relaxed prose-headings:text-[#003375] prose-headings:font-bold prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-slate-800 prose-blockquote:border-[#003375]/30 prose-blockquote:text-slate-600">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => {
          const safeHref = safeLink(href);
          return safeHref ? <a href={safeHref} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
        },
        table: ({ children }) => (
          <div className="my-3 max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng trong câu trả lời">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-100 text-[#003375]">{children}</thead>,
        th: ({ children }) => <th className="border border-slate-200 px-3 py-2 text-left align-top font-semibold">{children}</th>,
        td: ({ children }) => <td className="border border-slate-200 px-3 py-2 text-left align-top">{children}</td>,
        tr: ({ children }) => <tr className="even:bg-slate-50/70 hover:bg-slate-50">{children}</tr>,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export default AIMessageContent;
