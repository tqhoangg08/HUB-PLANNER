import { normalizeAdvisorIntentText } from './ai-advisor-intents.ts';

/** Conservative guard; document text is data, never higher-priority instructions. */
export const containsDocumentInstructions = (text: string) => /(?:system|assistant)\s*:/i.test(text)
  || /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|system|prior)\s+instructions|bo qua (?:tat ca )?(?:chi dan|huong dan) truoc|tiet lo (?:token|mat khau)/i.test(normalizeAdvisorIntentText(text));

/** Relevance is separate from authorization. This is not fuzzy support matching. */
export const isRelevantAdvisorEvidence = (question: string, text: string, documentTitle = '') => {
  const query = normalizeAdvisorIntentText(question);
  const evidence = normalizeAdvisorIntentText(text);
  const decision = query.match(/\bquyet dinh\s+(\d{2,6})\b/);
  if (decision && !new RegExp(`\\b${decision[1]}\\b`).test(`${evidence} ${normalizeAdvisorIntentText(documentTitle)}`)) return false;
  if (/\b(?:drl|ren luyen|3529)\b/.test(query)) return /\b(?:ren luyen|drl)\b/.test(evidence);
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
export const sourceSupportedReply = (reply: string, passages: readonly string[]) => {
  const normalized = exactEvidenceText(reply);
  const assertsCurrency = /\b(?:hien hanh|moi nhat|con hieu luc)\b/.test(normalizeAdvisorIntentText(reply));
  if (normalized && !assertsCurrency && passages.some((passage) => exactEvidenceText(passage).includes(normalized))) return reply;
  return `Đoạn nguồn liên quan đã truy xuất (chưa xác nhận hiệu lực hiện hành):\n\n${passages.slice(0, 3).map((passage) => `> ${passage.slice(0, 1200).replace(/\n/g, '\n> ')}`).join('\n\n')}`;
};
