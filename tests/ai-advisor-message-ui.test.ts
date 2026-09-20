import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deduplicateAiDocumentSources } from '../utils/aiDocumentSources.ts';

const source = (path: string) => readFileSync(path, 'utf8');

test('student-facing sources deduplicate one document across multiple cited pages', () => {
  const sources = deduplicateAiDocumentSources([
    { documentId: 'a', title: 'Quy chế đào tạo', pageNumber: 18 },
    { documentId: 'a', title: 'Quy chế đào tạo', pageNumber: 19 },
    { documentId: 'b', title: 'Quy chế đào tạo', pageNumber: 20 },
    { title: 'Sổ tay sinh viên', pageNumber: 1 },
    { title: '  SỔ TAY  SINH VIÊN ', pageNumber: 2 },
  ]);
  assert.equal(sources.length, 3);
  assert.deepEqual(sources.map((item) => item.documentId || item.title), ['a', 'b', 'Sổ tay sinh viên']);
});

test('student sources are read-only labels and never render page numbers or download actions', () => {
  const component = source('components/AIDocumentSources.tsx');
  assert.doesNotMatch(component, /privateApiRequest|window\.open|ExternalLink|Loader2|<button/);
  assert.doesNotMatch(component, /pageNumber|trang \$\{/);
  assert.match(component, /Nguồn tham khảo/);
  assert.match(component, /<section/);
});

test('desktop and mobile advisor share safe GFM Markdown rendering', () => {
  const renderer = source('components/AIMessageContent.tsx');
  const desktop = source('components/AIAdvisor.tsx');
  const mobile = source('components/MobileAIAdvisor.tsx');
  assert.match(renderer, /ReactMarkdown/);
  assert.match(renderer, /remarkGfm/);
  assert.match(renderer, /<table/);
  assert.match(renderer, /<th/);
  assert.match(renderer, /overflow-x-auto/);
  assert.match(renderer, /target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(renderer, /rehypeRaw|dangerouslySetInnerHTML/);
  assert.match(desktop, /AIMessageContent/);
  assert.match(mobile, /AIMessageContent/);
  assert.doesNotMatch(desktop, /DOMPurify|dangerouslySetInnerHTML/);
  assert.doesNotMatch(mobile, /DOMPurify|dangerouslySetInnerHTML/);
});
