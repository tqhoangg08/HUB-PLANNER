import type { Campaign, ScoreColumn } from './scholarshipApi';

export function scholarshipPage(value: string | null): number {
  return value && /^[1-9]\d*$/.test(value) && Number(value) <= 10000 ? Number(value) : 1;
}

export function approvedScoreColumns(campaign: Campaign): ScoreColumn[] {
  return campaign.scoreColumns.filter(column => campaign.approvedFields.includes(`scores.${column.key}`));
}

// Preserve unrelated deep-link parameters; pass only contract filters to the API.
export function updateScholarshipParams(previous: URLSearchParams, changes: Record<string, string>): URLSearchParams {
  const next = new URLSearchParams(previous);
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value); else next.delete(key);
  }
  return next;
}

export const scholarshipFilterKeys = ['scholarshipType', 'scholarshipRank', 'major', 'className', 'cohort', 'trainingProgram'] as const;
export function resetScholarshipFilters(previous: URLSearchParams): URLSearchParams {
  return updateScholarshipParams(previous, Object.fromEntries(['q', 'category', 'awardType', 'page', ...scholarshipFilterKeys].map(key => [key, ''])));
}

export function scholarshipLoginReturn(value: string | null): string {
  if (!value || /[\\\u0000-\u001f]/.test(value)) return '/dashboard';
  try {
    const url = new URL(value, 'https://local.invalid');
    return url.origin === 'https://local.invalid' && /^\/scholarships(?:\/me|\/celebrate)?$/.test(url.pathname)
      ? url.pathname + url.search + url.hash : '/dashboard';
  } catch { return '/dashboard'; }
}
