/** Shared by trusted offline parser and Worker. Never infer source score scales. */
export const SCHOLARSHIP_MAX_ROWS = 2000;
export const SCHOLARSHIP_MAX_BODY = 1024 * 1024;
export const normalizeScholarshipName = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi').replace(/đ/g, 'd').trim().replace(/\s+/g, ' ');
export const scholarshipSha256 = async (value: string | Uint8Array) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
};
export interface ScholarshipMapping {
  studentCode: string; fullName: string; awardType: string;
  className?: string; major?: string; sourceIdentifier?: string;
  scholarshipType?: string; scholarshipRank?: string; cohort?: string;
  scores: Array<{ key: string; column: string; label: string }>;
}
export interface ScholarshipImportRow { sourceRowNumber: number; values: Record<string, string | number | null>; }
export interface ScholarshipCanonicalRow {
  sourceRowNumber: number; sourceIdentifier: string | null; studentCode: string;
  fullName: string; fullNameSearch: string; className: string | null; major: string | null;
  awardType: string; scholarshipType?: string | null; scholarshipRank?: string | null; cohort?: string | null;
  scores: Record<string, string | number | null>; rowSha256: string;
}
export class ScholarshipValidationError extends Error { readonly status = 400; }
export const scholarshipRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code: string): never => { throw new ScholarshipValidationError(code); };
export const scholarshipText = (value: unknown, max: number, required = true): string => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return fail('INVALID_TEXT');
  const text = value.normalize('NFC').trim();
  if (required && !text) return fail('REQUIRED_TEXT');
  return text;
};
const strictKeys = (value: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('UNKNOWN_FIELD');
};
export const validateScholarshipImport = async (raw: unknown) => {
  if (!scholarshipRecord(raw)) return fail('INVALID_IMPORT');
  strictKeys(raw, ['sourceSha256', 'sourceFilename', 'mapping', 'rows']);
  if (typeof raw.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(raw.sourceSha256)) return fail('INVALID_SOURCE_CHECKSUM');
  const sourceFilename = scholarshipText(raw.sourceFilename, 160);
  if (/[\\/]/.test(sourceFilename)) return fail('INVALID_FILENAME');
  const m = raw.mapping;
  if (!scholarshipRecord(m)) return fail('INVALID_MAPPING');
  strictKeys(m, ['studentCode', 'fullName', 'awardType', 'className', 'major', 'sourceIdentifier', 'scholarshipType', 'scholarshipRank', 'cohort', 'scores']);
  const mapping: ScholarshipMapping = {
    studentCode: scholarshipText(m.studentCode, 120), fullName: scholarshipText(m.fullName, 120),
    awardType: scholarshipText(m.awardType, 120), scores: [],
  };
  for (const field of ['className', 'major', 'sourceIdentifier', 'scholarshipType', 'scholarshipRank', 'cohort'] as const)
    if (m[field] !== undefined) mapping[field] = scholarshipText(m[field], 120);
  if (!Array.isArray(m.scores) || m.scores.length > 16) return fail('INVALID_SCORE_MAPPING');
  for (const score of m.scores) {
    if (!scholarshipRecord(score)) return fail('INVALID_SCORE_MAPPING');
    strictKeys(score, ['key', 'column', 'label']);
    const key = scholarshipText(score.key, 32);
    if (!/^[a-z][a-zA-Z0-9_]{0,31}$/.test(key) || mapping.scores.some(s => s.key === key)) return fail('DUPLICATE_SCORE_KEY');
    mapping.scores.push({ key, column: scholarshipText(score.column, 120), label: scholarshipText(score.label, 120) });
  }
  const columns = [mapping.studentCode, mapping.fullName, mapping.awardType,
    ...[mapping.className, mapping.major, mapping.sourceIdentifier, mapping.scholarshipType, mapping.scholarshipRank, mapping.cohort].filter((v): v is string => Boolean(v)), ...mapping.scores.map(s => s.column)];
  const independentColumns = mapping.awardType === mapping.scholarshipType || mapping.awardType === mapping.scholarshipRank
    ? columns.filter((_, index) => index !== 2) : columns;
  if (new Set(independentColumns).size !== independentColumns.length) return fail('AMBIGUOUS_COLUMN_MAPPING');
  if (!Array.isArray(raw.rows) || raw.rows.length < 1 || raw.rows.length > SCHOLARSHIP_MAX_ROWS) return fail('INVALID_ROW_COUNT');
  const errors: Array<{ sourceRowNumber: number; field: string; code: string }> = [];
  const rows: ScholarshipCanonicalRow[] = [];
  const sourceRows = new Set<number>(), awards = new Set<string>(), identifiers = new Set<string>();
  const names = new Map<string, string>();
  for (const entry of raw.rows) {
    const n = scholarshipRecord(entry) && Number.isSafeInteger(entry.sourceRowNumber) ? Number(entry.sourceRowNumber) : 0;
    try {
      if (!scholarshipRecord(entry)) fail('INVALID_ROW');
      strictKeys(entry, ['sourceRowNumber', 'values']);
      if (n < 1 || n > 1000000 || sourceRows.has(n)) fail('DUPLICATE_SOURCE_ROW');
      sourceRows.add(n);
      const values = entry.values;
      if (!scholarshipRecord(values) || Object.keys(values).length > 40) fail('INVALID_CELLS');
      for (const [key, value] of Object.entries(values)) {
        scholarshipText(key, 120);
        if (value !== null && typeof value !== 'string' && typeof value !== 'number') fail('INVALID_CELL');
        if (typeof value === 'number' && !Number.isFinite(value)) fail('INVALID_CELL');
        if (typeof value === 'string') scholarshipText(value, 500, false);
      }
      if (columns.some(column => !Object.hasOwn(values, column))) fail('MISSING_MAPPED_COLUMN');
      const studentCode = scholarshipText(values[mapping.studentCode], 12);
      if (!/^\d{12}$/.test(studentCode)) fail('INVALID_STUDENT_CODE');
      const fullName = scholarshipText(values[mapping.fullName], 160);
      const fullNameSearch = normalizeScholarshipName(fullName);
      const awardType = scholarshipText(values[mapping.awardType], 120);
      const sourceIdentifier = mapping.sourceIdentifier ? scholarshipText(values[mapping.sourceIdentifier], 160) : null;
      const additional: Partial<Pick<ScholarshipCanonicalRow, 'scholarshipType' | 'scholarshipRank' | 'cohort'>> = {};
      for (const key of ['scholarshipType', 'scholarshipRank', 'cohort'] as const) {
        const column = mapping[key];
        if (column) additional[key] = values[column] === null ? null : scholarshipText(values[column], 160, false) || null;
      }
      const duplicateKey = JSON.stringify([studentCode, normalizeScholarshipName(awardType), sourceIdentifier,
        additional.scholarshipType ? normalizeScholarshipName(additional.scholarshipType) : null,
        additional.scholarshipRank ? normalizeScholarshipName(additional.scholarshipRank) : null]);
      if (awards.has(duplicateKey) || (sourceIdentifier && identifiers.has(sourceIdentifier))) fail('AMBIGUOUS_DUPLICATE_AWARD');
      if (names.has(studentCode) && names.get(studentCode) !== fullNameSearch) fail('CONFLICTING_STUDENT_NAME');
      awards.add(duplicateKey); if (sourceIdentifier) identifiers.add(sourceIdentifier); names.set(studentCode, fullNameSearch);
      const scores: Record<string, string | number | null> = {};
      for (const score of mapping.scores) {
        const value = values[score.column];
        scores[score.key] = value === null ? null : typeof value === 'number' ? value : scholarshipText(value, 120, false) || null;
      }
      const optional = (key: 'className' | 'major') => mapping[key] && values[mapping[key]] !== null
        ? scholarshipText(values[mapping[key]], 160, false) || null : null;
      const row = { sourceRowNumber: n, sourceIdentifier, studentCode, fullName, fullNameSearch,
        className: optional('className'), major: optional('major'), awardType, ...additional, scores };
      rows.push({ ...row, rowSha256: await scholarshipSha256(JSON.stringify(row)) });
    } catch (error) {
      if (!(error instanceof ScholarshipValidationError)) throw error;
      errors.push({ sourceRowNumber: n, field: 'row', code: error.message });
    }
  }
  rows.sort((a, b) => a.sourceRowNumber - b.sourceRowNumber);
  const payloadSha256 = await scholarshipSha256(JSON.stringify({ mapping, rows }));
  return { sourceSha256: raw.sourceSha256, sourceFilename, mapping, rows, errors, payloadSha256,
    expectedRows: raw.rows.length, acceptedRows: rows.length, rejectedRows: errors.length };
};
