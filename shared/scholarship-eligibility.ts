import { scholarshipRecord, validateScholarshipImport, ScholarshipValidationError, type ScholarshipMapping } from './scholarship-import.ts';
import { rankingKeys } from './scholarship-policy.ts';

export const eligibilityMapping: ScholarshipMapping = {
  studentCode: 'MSSV', fullName: 'Họ tên', awardType: 'Xếp loại HB', className: 'Mã Lớp SV', major: 'Ngành học',
  scholarshipRank: 'Xếp loại HB', cohort: 'Khóa', trainingProgram: 'Chương trình đào tạo', sourceOrdinal: 'STT', sourceListKind: 'eligibility',
  scores: [
    {key: 'gpa', column: 'Đểm TB HB', label: 'Điểm TB HB'},
    {key: 'trainingScore', column: 'Điểm RL', label: 'Điểm RL'},
    {key: 'credits', column: 'Số TC', label: 'Số TC'},
    {key: 'amountVnd', column: 'Thành tiền', label: 'Thành tiền'},
  ],
  rankings: rankingKeys.map((key, i) => ({key, column: ['Tỷ lệ top trường', 'Top trường', 'Top ngành', 'Top khóa', 'Top lớp'][i]})),
};

// Explicit conversion for this eligibility source; never relabel an old applied batch.
export async function convertEligibilityImport(raw: unknown) {
  if (!scholarshipRecord(raw) || !scholarshipRecord(raw.mapping)) throw new ScholarshipValidationError('INVALID_IMPORT');
  await validateScholarshipImport(raw);
  const original = raw.mapping;
  if (!Array.isArray(original.scores)) throw new ScholarshipValidationError('INVALID_MAPPING');
  const mapping = structuredClone(original) as unknown as ScholarshipMapping;
  for (const key of ['trainingProgram', ...rankingKeys]) {
    const score = mapping.scores.find(item => item.key === key);
    if (!score) continue;
    if (key === 'trainingProgram') {
      if (mapping.trainingProgram && mapping.trainingProgram !== score.column) throw new ScholarshipValidationError('AMBIGUOUS_COLUMN_MAPPING');
      mapping.trainingProgram = score.column;
    } else {
      mapping.rankings ??= [];
      if (mapping.rankings.some(item => item.key === key)) throw new ScholarshipValidationError('AMBIGUOUS_COLUMN_MAPPING');
      mapping.rankings.push({key: key as typeof rankingKeys[number], column: score.column});
    }
    mapping.scores = mapping.scores.filter(item => item !== score);
  }
  mapping.sourceListKind = 'eligibility';
  // STT is an explicit source column, never inferred from MSSV or a class name.
  if (!mapping.sourceOrdinal && Array.isArray(raw.rows) && raw.rows.every(row => scholarshipRecord(row) && scholarshipRecord(row.values) && Object.hasOwn(row.values, 'STT'))) mapping.sourceOrdinal = 'STT';
  const payload = {...raw, mapping};
  const validation = await validateScholarshipImport(payload);
  return {payload, validation};
}
