import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';

const HEADER_RANKING = [
  'STT', 'MSSV', 'Họ tên SV', 'Mã Lớp SV', 'Ngành học',
  'Đểm TB HB', 'Xếp loại HT', 'Điểm RL', 'Xếp loại RL',
  'Số TC', 'Xếp loại HB',
];

const readText = (value, field, required = false) => {
  if (value == null || value === '') {
    if (required) throw new Error(`Missing ${field}.`);
    return null;
  }
  if (typeof value !== 'string') throw new Error(`${field} must be stored as text.`);
  const text = value.trim();
  if (required && !text) throw new Error(`Missing ${field}.`);
  return text || null;
};

const readNumber = (value, field, integer = false) => {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) ||
      (integer && !Number.isSafeInteger(value))) {
    throw new Error(`Invalid ${field}.`);
  }
  return value;
};

const studentCode = (value) => {
  if (typeof value !== 'string' || value.length !== 12 || value.trim() !== value) {
    throw new Error('MSSV must be exactly 12 text characters.');
  }
  return value;
};

const rowsFrom = (sheet) => {
  if (!sheet) throw new Error('Required workbook sheet is missing.');
  const rows = [];
  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const row = sheet.getRow(number);
    if (row.cellCount === 0 || !row.hasValues) {
      throw new Error('A data sheet contains a blank row.');
    }
    rows.push(row);
  }
  return rows;
};

export const validateExactRankingWorkbook = async (
  workbookPath,
  semester,
  expectedRows = null
) => {
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(semester)) {
    throw new Error('Invalid semester identifier.');
  }
  const bytes = await readFile(workbookPath);
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const rankingSheet = workbook.getWorksheet('Ranking');
  const dssvSheet = workbook.getWorksheet('DSSV');
  if (!rankingSheet || !dssvSheet) throw new Error('Ranking and DSSV sheets are required.');
  for (let i = 0; i < HEADER_RANKING.length; i += 1) {
    const actual = rankingSheet.getRow(1).getCell(i + 1).value;
    if (actual !== HEADER_RANKING[i] && !(i === 5 && actual === 'Điểm TB HB')) {
      throw new Error('Ranking sheet column mapping does not match the official source.');
    }
  }
  if (dssvSheet.getRow(1).getCell(2).value !== 'MSSV') {
    throw new Error('DSSV MSSV column is missing.');
  }

  const ranking = rowsFrom(rankingSheet);
  const dssv = rowsFrom(dssvSheet);
  if (expectedRows !== null && (ranking.length !== expectedRows || dssv.length !== expectedRows)) {
    throw new Error('Workbook row count does not match the required dataset.');
  }
  if (ranking.length === 0 || ranking.length !== dssv.length) {
    throw new Error('Ranking and DSSV row counts do not match.');
  }

  const rankingCodes = new Set();
  const parsed = ranking.map((row, index) => {
    const rank = readNumber(row.getCell(1).value, 'STT', true);
    if (rank !== index + 1) throw new Error('STT must be the complete official sequence.');
    const code = studentCode(row.getCell(2).value);
    if (rankingCodes.has(code)) throw new Error('Ranking MSSV values must be unique.');
    rankingCodes.add(code);
    return {
      semester,
      studentCode: code,
      rank,
      totalStudents: ranking.length,
      classCode: readText(row.getCell(4).value, 'class code', true),
      major: readText(row.getCell(5).value, 'major', true),
      gpa: readNumber(row.getCell(6).value, 'GPA'),
      trainingScore: readNumber(row.getCell(8).value, 'training score', true),
      credits: readNumber(row.getCell(10).value, 'credits', true),
      scholarshipStatus: readText(row.getCell(11).value, 'scholarship status'),
    };
  });

  const dssvCodes = new Set();
  for (const row of dssv) {
    const code = studentCode(row.getCell(2).value);
    if (dssvCodes.has(code)) throw new Error('DSSV MSSV values must be unique.');
    dssvCodes.add(code);
  }
  if (rankingCodes.size !== ranking.length || dssvCodes.size !== dssv.length ||
      [...rankingCodes].some((code) => !dssvCodes.has(code))) {
    throw new Error('Ranking and DSSV MSSV sets do not match.');
  }

  const classTotals = new Map();
  const majorTotals = new Map();
  for (const row of parsed) {
    classTotals.set(row.classCode, (classTotals.get(row.classCode) || 0) + 1);
    majorTotals.set(row.major, (majorTotals.get(row.major) || 0) + 1);
  }
  const classSeen = new Map();
  const majorSeen = new Map();
  const rows = parsed.map((row) => {
    const rankInClass = (classSeen.get(row.classCode) || 0) + 1;
    const rankInMajor = (majorSeen.get(row.major) || 0) + 1;
    classSeen.set(row.classCode, rankInClass);
    majorSeen.set(row.major, rankInMajor);
    return {
      ...row,
      rankInClass,
      totalInClass: classTotals.get(row.classCode),
      rankInMajor,
      totalInMajor: majorTotals.get(row.major),
    };
  });

  return {
    semester,
    sourceSha256,
    rankingRows: ranking.length,
    dssvRows: dssv.length,
    uniqueMssv: rankingCodes.size,
    rows,
  };
};

const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlValue = (value) => value == null ? 'NULL'
  : typeof value === 'number' ? String(value) : sqlText(value);

export const buildExactRankingImportSql = (dataset, importedAt) => {
  const { semester, rows, sourceSha256 } = dataset;
  const commands = [
    `INSERT INTO semester_exact_ranking_datasets
      (semester, total_students, source_sha256, status, imported_at)
      VALUES (${sqlText(semester)}, ${rows.length}, ${sqlText(sourceSha256)}, 'importing', ${sqlText(importedAt)})
      ON CONFLICT(semester) DO UPDATE SET
        total_students=excluded.total_students,
        source_sha256=excluded.source_sha256,
        status='importing', imported_at=excluded.imported_at;`,
    `DELETE FROM semester_exact_rankings WHERE semester=${sqlText(semester)};`,
  ];
  for (let start = 0; start < rows.length; start += 50) {
    const values = rows.slice(start, start + 50).map((row) => `(${[
      row.semester, row.studentCode, row.rank, row.totalStudents,
      row.gpa, row.trainingScore, row.credits, row.classCode,
      row.major, row.scholarshipStatus, row.rankInClass, row.totalInClass,
      row.rankInMajor, row.totalInMajor,
    ].map(sqlValue).join(', ')})`);
    commands.push(`INSERT INTO semester_exact_rankings
      (semester, student_code, rank, total_students, gpa, training_score,
       credits, class_code, major, scholarship_status, rank_in_class,
       total_in_class, rank_in_major, total_in_major)
      VALUES ${values.join(',\n')};`);
  }
  return `${commands.join('\n')}\n`;
};
