import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';

export const DIRECTORY_FIELDS = [
  'full_name', 'gender', 'general_class', 'major_class', 'major',
  'specialization', 'training_program', 'cohort',
];

const HEADERS = new Map([
  ['mssv', 'student_code'], ['họ tên', 'full_name'], ['giới tính', 'gender'],
  ['lớp đại cương', 'general_class'], ['lớp chuyên ngành', 'major_class'],
  ['ngành', 'major'], ['chuyên ngành', 'specialization'],
  ['chương trình đào tạo', 'training_program'], ['khóa', 'cohort'],
]);

const normalizedHeader = (value) => typeof value === 'string'
  ? value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi') : '';

const cellValue = (value) => {
  if (value == null) return null;
  if (typeof value === 'object' && 'text' in value) return cellValue(value.text);
  if (typeof value === 'object' && 'result' in value) return cellValue(value.result);
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : null;
  if (typeof value !== 'string') return null;
  return value.normalize('NFC').trim() || null;
};

export const normalizeDirectoryStudentCode = (value) => {
  const text = cellValue(value);
  if (text && /^\d{12}$/.test(text)) return text;
  if (text && /^\d{11}$/.test(text)) return `0${text}`;
  return null;
};

export const mergeDirectoryRecords = (previous, incoming) => {
  const conflicts = [];
  const merged = { ...previous };
  for (const field of DIRECTORY_FIELDS) {
    if (previous[field] && incoming[field] && previous[field] !== incoming[field]) {
      conflicts.push(field);
    } else if (!previous[field] && incoming[field]) {
      merged[field] = incoming[field];
    }
  }
  return { merged, conflicts };
};

export const validateStudentDirectoryWorkbook = async (workbookPath) => {
  const bytes = await readFile(workbookPath);
  const sourceVersion = createHash('sha256').update(bytes).digest('hex');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  let selected = null;
  for (const sheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 10); rowNumber += 1) {
      const columns = new Map();
      sheet.getRow(rowNumber).eachCell((cell, col) => {
        const field = HEADERS.get(normalizedHeader(cell.value));
        if (field) columns.set(field, col);
      });
      if (columns.has('student_code') && columns.has('full_name')) {
        if (selected) throw new Error('Multiple student directory sheets/headers found.');
        selected = { sheet, rowNumber, columns };
      }
    }
  }
  if (!selected) throw new Error('Student directory header was not found.');
  const counts = {
    totalRows: 0, validRows: 0, duplicateRows: 0, invalidMssv: 0,
    rowsWithFullName: 0, rowsWithCohort: 0, rowsWithMajor: 0,
    rowsWithTrainingProgram: 0,
  };
  const conflicts = new Map();
  const records = new Map();
  for (let number = selected.rowNumber + 1; number <= selected.sheet.rowCount; number += 1) {
    const row = selected.sheet.getRow(number);
    if (!row.hasValues) continue;
    counts.totalRows += 1;
    const studentCode = normalizeDirectoryStudentCode(
      row.getCell(selected.columns.get('student_code')).value,
    );
    if (!studentCode) { counts.invalidMssv += 1; continue; }
    counts.validRows += 1;
    const record = { student_code: studentCode };
    for (const field of DIRECTORY_FIELDS) {
      const column = selected.columns.get(field);
      record[field] = column ? cellValue(row.getCell(column).value) : null;
    }
    if (record.full_name) counts.rowsWithFullName += 1;
    if (record.cohort) counts.rowsWithCohort += 1;
    if (record.major) counts.rowsWithMajor += 1;
    if (record.training_program) counts.rowsWithTrainingProgram += 1;
    const previous = records.get(studentCode);
    if (previous) {
      counts.duplicateRows += 1;
      const result = mergeDirectoryRecords(previous, record);
      for (const field of result.conflicts) conflicts.set(field, (conflicts.get(field) || 0) + 1);
      records.set(studentCode, result.merged);
    } else {
      records.set(studentCode, record);
    }
  }
  const conflictCount = [...conflicts.values()].reduce((sum, count) => sum + count, 0);
  if (conflictCount) {
    throw new Error(`Conflicting duplicate MSSV: ${conflictCount} field conflicts in ${[...conflicts.keys()].join(', ')}.`);
  }
  return {
    sourceVersion, counts, conflictCount,
    rows: [...records.values()].sort((left, right) => left.student_code.localeCompare(right.student_code)),
    missingColumns: DIRECTORY_FIELDS.filter((field) => !selected.columns.has(field)),
  };
};

const sqlValue = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;

export const buildStudentDirectoryImportSql = (rows, sourceVersion, timestamp) => {
  const columns = ['student_code', ...DIRECTORY_FIELDS, 'source_version', 'imported_at', 'updated_at'];
  const commands = [];
  for (let start = 0; start < rows.length; start += 40) {
    const values = rows.slice(start, start + 40).map((row) =>
      `(${[row.student_code, ...DIRECTORY_FIELDS.map((field) => row[field]), sourceVersion, timestamp, timestamp].map(sqlValue).join(',')})`);
    commands.push(`INSERT INTO student_directory (${columns.join(',')}) VALUES ${values.join(',')}\n` +
      `ON CONFLICT(student_code) DO UPDATE SET ${DIRECTORY_FIELDS.map((field) => `${field}=excluded.${field}`).join(',')},` +
      `source_version=excluded.source_version,updated_at=excluded.updated_at ` +
      `WHERE ${DIRECTORY_FIELDS.map((field) => `student_directory.${field} IS NOT excluded.${field}`).join(' OR ')} ` +
      `OR student_directory.source_version IS NOT excluded.source_version;`);
  }
  return `${commands.join('\n')}\n`;
};
