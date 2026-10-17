import type { Campaign, OwnAward, Recipient } from './scholarshipApi';
import { personalAwardDetails } from './scholarshipMeModel.ts';
import { rankingKeys, sourceNumber, type RankingKey } from '../shared/scholarship-policy.ts';

export const rankingLabels: Record<RankingKey, string> = {topSchoolPercent:'Tỷ lệ top trường', topSchool:'Top trường', topMajor:'Top ngành', topCohort:'Top khóa', topClass:'Top lớp'};
export const defaultRankingKeys: RankingKey[] = ['topSchool', 'topMajor', 'topClass'];
export const rankingPreferenceKey = 'hub-scholarship-ranking-ui-v1';
export function readRankingPreferences(): RankingKey[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(rankingPreferenceKey) ?? 'null');
    if (Array.isArray(value) && value.every(key => rankingKeys.includes(key)) && new Set(value).size === value.length) return value;
  } catch { /* Private browsing may deny local storage. */ }
  return [...defaultRankingKeys];
}
export function formatRanking(key: RankingKey, value: unknown): string | null {
  if (!sourceNumber(value, key === 'topSchoolPercent')) return null;
  const number = Number(typeof value === 'string' ? value.replace(',', '.') : value);
  return new Intl.NumberFormat('vi-VN', key === 'topSchoolPercent' ? {style:'percent', maximumFractionDigits:20} : {maximumFractionDigits:0}).format(number);
}
export const scholarshipColumns = [
  ['sourceOrdinal','STT'], ['studentCode','MSSV'], ['fullName','Họ tên'], ['className','Mã Lớp SV'], ['major','Ngành học'],
  ['cohort','Khóa'], ['trainingProgram','Chương trình đào tạo'], ['scores.gpa','Điểm TB HB'],
  ['scores.trainingScore','Điểm RL'], ['scores.credits','Số TC'], ['scholarshipRank','Xếp loại HB'], ['scores.amountVnd','Thành tiền'],
] as const;
export function publicTableColumns(campaign: Campaign) {
  return scholarshipColumns.filter(([key]) => key === 'sourceOrdinal' || campaign.approvedFields.includes(key))
    .filter(([key]) => !key.startsWith('scores.') || campaign.scoreColumns.some(column => 'scores.' + column.key === key));
}
export function detailValue(row: Recipient, key: string): string | null {
  if (key.startsWith('scores.')) return personalAwardDetails(row.scores).find(detail => 'scores.' + detail.key === key)?.value ?? null;
  const value = row[key as keyof Recipient];
  return typeof value === 'string' && value.trim() ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}
export function ownDetails(award: OwnAward) {
  const columns: Array<readonly [string, string]> = scholarshipColumns.slice(1);
  if (award.sourceListKind !== 'eligibility') {
    for (const [after, key, label] of [['scores.gpa','scores.academicRank','Xếp loại HT'], ['scores.trainingScore','scores.trainingRank','Xếp loại RL']] as const)
      columns.splice(columns.findIndex(([column]) => column === after) + 1, 0, [key, label]);
    columns.push(['scores.selectionScore', 'Điểm xét học bổng']);
  }
  return columns.flatMap(([key, label]) => {
    const value = detailValue(award, key);
    return value === null ? [] : [{key, label, value}];
  });
}
