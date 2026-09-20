import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deduplicateAiDocumentSources } from '../utils/aiDocumentSources.ts';

const source = (path: string) => readFileSync(path, 'utf8');

test('student-facing sources deduplicate one document across multiple cited pages', () => {
  const sources = deduplicateAiDocumentSources([
    { documentId: 'a', title: 'Quy chế đào tạo', pageNumber: 18, locators: ['Điều 21, khoản 2, điểm a'] },
    { documentId: 'a', title: 'Quy chế đào tạo', pageNumber: 19, locators: ['Điều 21, khoản 2, điểm b'] },
    { documentId: 'b', title: 'Quy chế đào tạo', pageNumber: 20 },
    { title: 'Sổ tay sinh viên', pageNumber: 1 },
    { title: '  SỔ TAY  SINH VIÊN ', pageNumber: 2 },
  ]);
  assert.equal(sources.length, 3);
  assert.deepEqual(sources.map((item) => item.documentId || item.title), ['a', 'b', 'Sổ tay sinh viên']);
  assert.deepEqual(sources[0]?.locators, ['Điều 21, khoản 2, điểm a', 'Điều 21, khoản 2, điểm b']);
});

test('student sources are read-only labels and never render page numbers or download actions', () => {
  const component = source('components/AIDocumentSources.tsx');
  assert.doesNotMatch(component, /privateApiRequest|window\.open|ExternalLink|Loader2|<button/);
  assert.doesNotMatch(component, /pageNumber|trang \$\{/);
  assert.match(component, /Nguồn tham khảo/);
  assert.match(component, /<section/);
  assert.match(component, /source\.locators/);
  assert.match(component, /formatLocator/);
});

test('student-facing source UI preserves grounded applicability without exposing pages or downloads', () => {
  const sources = deduplicateAiDocumentSources([
    {
      documentId: 'a', title: 'Quy chế đào tạo',
      applicability: [{ cohortYear: 2026, rawLabel: 'Khóa tuyển sinh năm 2026' }],
    },
    {
      documentId: 'a', title: 'Quy chế đào tạo',
      applicability: [{ fromCohortYear: 2027, rawLabel: 'Từ khóa tuyển sinh năm 2027' }],
    },
  ]);
  assert.equal(sources.length, 1);
  assert.deepEqual(sources[0]?.applicability?.map((item) => item.rawLabel), [
    'Khóa tuyển sinh năm 2026', 'Từ khóa tuyển sinh năm 2027',
  ]);
  const component = source('components/AIDocumentSources.tsx');
  assert.match(component, /Áp dụng:/);
  assert.match(component, /source\.applicability/);
  assert.doesNotMatch(component, /pageNumber|window\.open|<button/);
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
