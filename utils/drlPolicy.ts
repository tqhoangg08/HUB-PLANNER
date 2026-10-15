import { DRL_POLICY_VERSION } from './drlPolicy2026.ts';

export { DRL_POLICY_VERSION };
export const LEGACY_DRL_POLICY = 'legacy-workbook';
export const CURRENT_DRL_YEAR = '2026-2027';
export const policyForAcademicYear = (year: string) => {
  if (!/^\d{4}-\d{4}$/.test(year)) throw new Error('Năm học phải có dạng 2026-2027.');
  const [start, end] = year.split('-').map(Number);
  if (end !== start + 1 || start < 2000 || start > 2100) throw new Error('Năm học không hợp lệ.');
  return start >= 2026 ? DRL_POLICY_VERSION : LEGACY_DRL_POLICY;
};
export const isOnlineMiniGame = (draft: { title?: unknown; description?: unknown; category?: unknown; format?: unknown }) => {
  const text = [draft.title, draft.category, draft.description].join(' ').normalize('NFD')
    .replace(/\p{M}/gu, '').toLowerCase();
  return /mini\s*game|tro choi truc tuyen/.test(text) &&
    (/online|truc tuyen/.test(text) || String(draft.format || '').toLowerCase() === 'online');
};
