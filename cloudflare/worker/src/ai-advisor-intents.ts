/** Query normalization only; NEVER apply this to evidence/support quote matching. */
export const normalizeAdvisorIntentText = (value: string) => value.normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/[đĐ]/g, 'd').toLowerCase()
  .replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').replace(/\bd r l\b/g, 'drl').trim();

export type ConductIntent = 'regulations' | 'personal_score' | 'event_eligibility' | 'portal_help' | 'event_listing';

/** Ordered specificity keeps personal records and event listings out of policy generation. */
export const classifyConductIntent = (question: string): ConductIntent | null => {
  const text = normalizeAdvisorIntentText(question);
  if (!/\b(?:drl|diem ren luyen|3529)\b/.test(text)
    && !(/\bren luyen\b/.test(text) && /\b(?:sinh vien|bang|phieu|tieu chi|quy che|quy dinh|xep loai|minh chung|phuc khao)\b/.test(text))) return null;
  if (/\b(?:toi|minh|cua toi|cua minh)\b/.test(text)
    && /\b(?:bao nhieu diem|diem.*ky nay|diem.*hoc ky|diem.*cua (?:toi|minh))\b/.test(text)
    && !/\b(?:quy che|quy dinh|tieu chi|phuc khao)\b/.test(text)) return 'personal_score';
  if (/\b(?:cong sinh vien|website|tren web|thao tac|bam|dang nhap)\b/.test(text)
    && /\b(?:cach|huong dan|tu danh gia)\b/.test(text)) return 'portal_help';
  if (/\b(?:su kien|mini game|minigame|tham gia|hoat dong)\b/.test(text)
    && /\b(?:co duoc|duoc tinh|duoc cong|tinh drl|cong diem|tinh diem)\b/.test(text)) return 'event_eligibility';
  if (/\b(?:su kien|hoat dong)\b/.test(text)
    && !/\b(?:quy che|quy dinh|tieu chi|minh chung|phuc khao)\b/.test(text)) return 'event_listing';
  return 'regulations';
};
