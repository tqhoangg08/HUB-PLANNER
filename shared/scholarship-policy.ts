export const rankingKeys = ['topSchoolPercent', 'topSchool', 'topMajor', 'topCohort', 'topClass'] as const;
export type RankingKey = typeof rankingKeys[number];
// Numeric source strings are retained, including their decimal representation.
export type SourceNumber = number | string;
export type PersonalRankings = Partial<Record<RankingKey, SourceNumber | null>>;
export type SourceListKind = 'eligibility' | 'award_decision' | 'unspecified';
export const publicScoreKeys = ['gpa', 'academicRank', 'trainingScore', 'trainingRank', 'credits', 'amountVnd', 'selectionScore'] as const;
export const isPublicField = (field: string) => ['studentCode', 'fullName', 'awardType', 'className', 'major',
  'scholarshipType', 'scholarshipRank', 'cohort', 'trainingProgram', 'sourceOrdinal'].includes(field)
  || publicScoreKeys.some(key => field === 'scores.' + key);
export const sourceNumber = (value: unknown, percent = false): value is SourceNumber => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:[.,]\d+)?$/.test(value))) return false;
  const number = Number(typeof value === 'string' ? value.replace(',', '.') : value);
  return Number.isFinite(number) && (percent ? number >= 0 && number <= 1 : Number.isSafeInteger(number) && number > 0);
};
