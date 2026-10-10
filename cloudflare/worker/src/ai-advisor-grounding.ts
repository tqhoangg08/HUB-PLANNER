import { normalizeAdvisorIntentText } from './ai-advisor-intents.ts';
import {selectEvidenceWindow} from './ai-advisor-source-sections.ts';

/** Conservative guard; document text is data, never higher-priority instructions. */
export const containsDocumentInstructions = (text: string) => /(?:system|assistant)\s*:/i.test(text)
  || /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|system|prior)\s+instructions|bo qua (?:tat ca )?(?:chi dan|huong dan) truoc|tiet lo (?:token|mat khau)/i.test(normalizeAdvisorIntentText(text));

/** Relevance is separate from authorization. This is not fuzzy support matching. */
export const isRelevantAdvisorEvidence = (question: string, text: string, documentTitle = '') => {
  const query = normalizeAdvisorIntentText(question);
  const evidence = normalizeAdvisorIntentText(text);
  const decision = query.match(/\bquyet dinh\s+(\d{2,6})\b/);
  if (decision && !new RegExp(`\\b${decision[1]}\\b`).test(`${evidence} ${normalizeAdvisorIntentText(documentTitle)}`)) return false;
  if (/\b(?:drl|ren luyen|3529)\b/.test(query)) {
    const conductTitle = /\bquy che\b.*\bren luyen\b/.test(normalizeAdvisorIntentText(documentTitle));
    const directConduct = /\b(?:diem ren luyen|danh gia (?:ket qua )?ren luyen|drl|dgkqrlsv)\b/.test(evidence);
    const academicConversion = /\b(?:gpa|diem chu|he 4|he 10|quy doi diem hoc tap)\b/.test(evidence);
    // "Học tập và rèn luyện" in a GPA conversion paragraph is not DRL evidence.
    // Conversely, a real DRL rule may legitimately include academic performance.
    if (academicConversion && !directConduct) return false;
    return directConduct || /\bren luyen\b/.test(evidence) || conductTitle;
  }
  const policyTopics: Array<[RegExp, RegExp]> = [
    [/\b(?:quy doi diem|thang diem|diem chu|he 4|he 10)\b/, /\b(?:diem|tin chi|hoc phan)\b/],
    [/\bhoc bong\b/, /\bhoc bong\b/],
    [/\bhoc phi\b/, /\b(?:hoc phi|mien giam|hoc le phi)\b/],
    [/\btot nghiep\b/, /\btot nghiep\b/],
    [/\b(?:dang ky hoc phan|rut hoc phan)\b/, /\b(?:dang ky|rut|hoc phan)\b/],
    [/\b(?:canh bao hoc vu|buoc thoi hoc)\b/, /\b(?:canh bao|thoi hoc)\b/],
  ];
  for (const [queryTopic, sourceTopic] of policyTopics) if (queryTopic.test(query) && !sourceTopic.test(evidence)) return false;
  return true;
};

export const exactEvidenceText = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

/** Client-safe failure stage: never a raw provider error or private source ID. */
export const documentSearchFailureStatus = (reason: string) => {
  if (reason === 'GEMINI_REQUEST_TIMEOUT') return 'provider_timeout';
  if (reason === 'CONFIG_DISABLED') return 'not_configured';
  if (reason === 'GEMINI_NO_FILE_CITATION') return 'no_citations';
  if (reason === 'INSUFFICIENT_GROUNDED_EVIDENCE') return 'insufficient_evidence';
  if (reason.startsWith('D1_CITATION_')) return 'source_validation_failed';
  return 'provider_error';
};

/** Cheap factual surface checks, not a second model/verifier. Quotes remain mandatory. */
export const hasUnsupportedAnswerDetails = (answer: string, evidence: readonly string[]) => {
  const source = exactEvidenceText(evidence.join('\n'));
  const withoutListNumbers = answer.replace(/^\s*\d+[.)]\s/gm, '');
  const numericTokens = (text: string) => text.match(/(?<![\p{L}\d])\d+(?:[.,/-]\d+)*(?![\p{L}\d])/gu) || [];
  const numbers = numericTokens(withoutListNumbers);
  const sourceNumbers = new Set(numericTokens(source));
  if (numbers.some((number) => !sourceNumbers.has(number))) return true;
  const urls = answer.match(/https?:\/\/[^\s)\]>]+/g) || [];
  if (urls.some((url) => !source.includes(url))) return true;
  const locators = normalizeAdvisorIntentText(answer).match(/\b(?:dieu|khoan|chuong|muc|trang)\s+\d+\b/g) || [];
  const normalizedSource = normalizeAdvisorIntentText(source);
  return locators.some((locator) => !normalizedSource.includes(locator));
};

/** No model prose is treated as evidence. Exact output, or bounded source quotes. */
const quoteRelevantWindow = (passage: string, question: string) => {
  if (passage.length <= 1200 || !question) return passage.slice(0, 1200);
  const query = normalizeAdvisorIntentText(question);
  if(/\b(?:quy tac ung xu|ke hoach hoc tap|hoc phi)\b/.test(query))return selectEvidenceWindow(passage,question,1200);
  const anchors = /\bmini game\b/.test(query) ? ['mini game', 'tro choi truc tuyen']
    : /\bminh chung\b/.test(query) ? ['minh chung', 'hoat dong ngoai truong']
    : /\b(?:nhom|tieu chi|diem toi da|thang diem)\b/.test(query) ? ['noi dung danh gia', 'thang diem', 'diem toi da']
    : /\b(?:so quyet dinh|ngay ban hanh|ten van ban)\b/.test(query) ? ['ban hanh kem theo', 'quyet dinh so']
    : /\b(?:hieu luc|moi nhat)\b/.test(query) ? ['hieu luc', 'thang diem', 'noi dung danh gia'] : [];
  // Only locate literal paragraphs. Selection is not support validation and
  // never repairs OCR words, numbers, negation or punctuation in a quote.
  let offset = 0;
  let bestOffset = 0;
  let bestScore = 0;
  for (const paragraph of passage.split(/\n/)) {
    const normalized = normalizeAdvisorIntentText(paragraph);
    const score = anchors.reduce((sum, anchor) => sum + (normalized.includes(anchor) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; bestOffset = offset; }
    offset += paragraph.length + 1;
  }
  const start = Math.max(0, Math.min(bestOffset, passage.length - 1200));
  const end = Math.min(passage.length, start + 1200);
  return `${start ? '…\n' : ''}${passage.slice(start, end)}${end < passage.length ? '\n…' : ''}`;
};

export const sourceSupportedReply = (reply: string, passages: readonly string[], question = '') => {
  const normalized = exactEvidenceText(reply);
  const assertsCurrency = /\b(?:hien hanh|moi nhat|con hieu luc)\b/.test(normalizeAdvisorIntentText(reply));
  if (normalized && !assertsCurrency && isRelevantAdvisorEvidence(question, reply)
    && passages.some((passage) => exactEvidenceText(passage).includes(normalized))) return reply;
  return `Đoạn nguồn liên quan đã truy xuất (chưa xác nhận hiệu lực hiện hành; các trích đoạn có thể chưa đủ để trả lời toàn bộ câu hỏi):\n\n${passages.slice(0, 3).map((passage) => `> ${quoteRelevantWindow(passage, question).replace(/\n/g, '\n> ')}`).join('\n\n')}`;
};
