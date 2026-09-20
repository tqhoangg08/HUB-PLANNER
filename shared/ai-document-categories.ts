export const AI_DOCUMENT_CATEGORY_VALUES = [
  'general',
  'training_regulation',
  'grading',
  'graduation',
  'course_registration',
  'academic_warning',
  'tuition',
  'scholarship',
  'student_handbook',
  'discipline',
] as const;

export type AiDocumentCategory = typeof AI_DOCUMENT_CATEGORY_VALUES[number];

export const AI_DOCUMENT_CATEGORY_OPTIONS: ReadonlyArray<{ value: AiDocumentCategory; label: string }> = [
  { value: 'training_regulation', label: 'Quy chế đào tạo' },
  { value: 'grading', label: 'Quy đổi điểm / thang điểm' },
  { value: 'graduation', label: 'Tốt nghiệp' },
  { value: 'course_registration', label: 'Đăng ký học phần' },
  { value: 'academic_warning', label: 'Cảnh báo học vụ' },
  { value: 'tuition', label: 'Học phí' },
  { value: 'scholarship', label: 'Học bổng' },
  { value: 'student_handbook', label: 'Sổ tay sinh viên' },
  { value: 'discipline', label: 'Kỷ luật / vi phạm' },
  { value: 'general', label: 'Khác' },
];

const canonicalCategories = new Set<string>(AI_DOCUMENT_CATEGORY_VALUES);

const searchableCategoryText = (value: unknown) => String(value || '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLowerCase()
  .replace(/đ/g, 'd')
  .replace(/[_-]+/g, ' ')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Persists machine-readable categories and accepts legacy Vietnamese labels. */
export const normalizeAiDocumentCategory = (value: unknown): AiDocumentCategory => {
  const raw = String(value || '').trim().toLowerCase();
  if (canonicalCategories.has(raw)) return raw as AiDocumentCategory;
  const text = searchableCategoryText(value);
  if (!text) return 'general';
  if (['grading', 'diem', 'quy doi diem', 'thang diem'].includes(text)
    || text.includes('quy doi diem') || text.includes('thang diem')) return 'grading';
  if (['quy che', 'quy dinh', 'regulation'].includes(text)
    || text.includes('quy che') || text.includes('quy dinh')) return 'training_regulation';
  if (text.includes('tot nghiep')) return 'graduation';
  if (text.includes('dang ky hoc phan') || text.includes('rut hoc phan')) return 'course_registration';
  if (text.includes('canh bao hoc vu') || text.includes('buoc thoi hoc')) return 'academic_warning';
  if (text.includes('hoc phi')) return 'tuition';
  if (text.includes('hoc bong')) return 'scholarship';
  if (text.includes('so tay sinh vien')) return 'student_handbook';
  if (text.includes('ky luat') || text.includes('vi pham')) return 'discipline';
  return 'general';
};

export const aiDocumentCategoryLabel = (value: unknown) =>
  AI_DOCUMENT_CATEGORY_OPTIONS.find((option) => option.value === normalizeAiDocumentCategory(value))?.label || 'Khác';
