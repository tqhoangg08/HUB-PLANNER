/** Adapt known directory labels to the existing HUB Planner academic catalog. */
export const directoryProgramToProfile = (value: string | null | undefined): string => {
  if (!value) return '';
  if (value === 'Chất lượng cao') return 'ĐHCQ Tiếng Anh bán phần (TABP/CLC)';
  if (value === 'Song bằng quốc tế') return 'ĐHCQ Quốc tế cấp song bằng';
  return value;
};

export const directoryCohortToProfile = (
  value: string | null | undefined,
  trainingProgram: string | null | undefined,
): string => {
  if (!value) return '';
  const cohort = value.trim();
  if (!/^\d{1,2}$/.test(cohort)) return cohort;
  if (trainingProgram === 'Đại học chính quy chuẩn') return `K${Number(cohort)}`;
  if (trainingProgram === 'Chất lượng cao') return `CLCK${Number(cohort)}`;
  // Other curricula have no proven one-to-one cohort mapping in this source.
  return cohort;
};
