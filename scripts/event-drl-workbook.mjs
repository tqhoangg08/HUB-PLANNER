import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';

const HISTORY_HEADERS = [
  'Mã mục quan sát', 'Tên sự kiện gốc', 'Tên sự kiện bỏ mã', 'Tên chuẩn hóa',
  'Tên chuẩn hóa bỏ năm', 'Đơn vị tổ chức', 'Đơn vị chuẩn hóa', 'Học kỳ/Năm học', 'Dòng nguồn',
];
const RULE_HEADERS = [
  'Rule ID', 'Mục', 'Nhóm', 'Nội dung', 'Điều kiện / Cấp / Vai trò',
  'Điểm', 'Đơn vị tính', 'Phù hợp gán cho sự kiện', 'Cần rà soát', 'Ghi chú',
];
const cell = (row, column) => String(row.getCell(column).text || '').normalize('NFC').trim();
const headerMap = (sheet, required) => {
  if (!sheet) throw new Error('Required workbook sheet missing.');
  const headers = new Map();
  sheet.getRow(1).eachCell((entry, number) => headers.set(String(entry.text || '').normalize('NFC').trim(), number));
  for (const name of required) if (!headers.has(name)) throw new Error('Required workbook column missing.');
  return (row, name) => cell(row, headers.get(name));
};
const normalized = (value) => value.normalize('NFC').replace(/\s+/gu, ' ').trim();

export const validateEventDrlWorkbook = async (filePath) => {
  const bytes = await readFile(filePath);
  const sourceVersion = createHash('sha256').update(bytes).digest('hex');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const source = workbook.getWorksheet('Trang tính1');
  const history = workbook.getWorksheet('DM_LICH_SU_DRL_AI');
  const observed = workbook.getWorksheet('DM_MUC_DRL_QUAN_SAT');
  const organizers = workbook.getWorksheet('DM_DON_VI');
  const rules = workbook.getWorksheet('DM_QUY_TAC_DRL');
  const h = headerMap(history, HISTORY_HEADERS);
  const o = headerMap(observed, ['Mã mục quan sát', 'Số sự kiện']);
  const g = headerMap(organizers, ['Đơn vị chuẩn']);
  const r = headerMap(rules, RULE_HEADERS);
  const original = headerMap(source, ['Tên hoạt động']);

  const historyRows = [];
  const sourceRows = new Set();
  const countsByCode = new Map();
  const codesByTitle = new Map();
  for (let number = 2; number <= history.rowCount; number += 1) {
    const row = history.getRow(number);
    if (!row.hasValues) continue;
    const sourceRow = Number(h(row, 'Dòng nguồn'));
    const entry = {
      source_row: sourceRow,
      observed_code: h(row, 'Mã mục quan sát'),
      title_original: h(row, 'Tên sự kiện gốc'),
      title_clean: h(row, 'Tên sự kiện bỏ mã'),
      title_normalized: h(row, 'Tên chuẩn hóa'),
      title_normalized_no_year: h(row, 'Tên chuẩn hóa bỏ năm'),
      organizer: h(row, 'Đơn vị tổ chức') || null,
      organizer_normalized: h(row, 'Đơn vị chuẩn hóa') || null,
      semester: h(row, 'Học kỳ/Năm học') || null,
    };
    if (!Number.isSafeInteger(sourceRow) || sourceRow < 2 || sourceRow > source.rowCount || sourceRows.has(sourceRow)) {
      throw new Error('Historical source row invalid or duplicated.');
    }
    const originalTitle = original(source.getRow(sourceRow), 'Tên hoạt động');
    if (!entry.observed_code || !entry.title_original || !entry.title_normalized || !entry.title_normalized_no_year ||
        normalized(originalTitle) !== normalized(entry.title_original)) {
      throw new Error('Historical row missing label/title or source title mismatch.');
    }
    sourceRows.add(sourceRow);
    historyRows.push(entry);
    countsByCode.set(entry.observed_code, (countsByCode.get(entry.observed_code) || 0) + 1);
    const titleCodes = codesByTitle.get(entry.title_normalized) || new Set();
    titleCodes.add(entry.observed_code);
    codesByTitle.set(entry.title_normalized, titleCodes);
  }

  const observedCounts = new Map();
  for (let number = 2; number <= observed.rowCount; number += 1) {
    const row = observed.getRow(number);
    if (!row.hasValues) continue;
    const code = o(row, 'Mã mục quan sát');
    const count = Number(o(row, 'Số sự kiện'));
    if (!code || !Number.isSafeInteger(count) || count < 0 || observedCounts.has(code)) {
      throw new Error('Observed-code summary invalid.');
    }
    observedCounts.set(code, count);
  }
  if (observedCounts.size !== countsByCode.size ||
      [...observedCounts].some(([code, count]) => countsByCode.get(code) !== count)) {
    throw new Error('Full historical code counts do not match source summary.');
  }

  const organizerRows = [];
  const organizerNames = new Set();
  for (let number = 2; number <= organizers.rowCount; number += 1) {
    const row = organizers.getRow(number);
    if (!row.hasValues) continue;
    const name = g(row, 'Đơn vị chuẩn');
    const key = normalized(name).toLocaleLowerCase('vi-VN');
    if (!name || organizerNames.has(key)) throw new Error('Organizer catalog has blank/duplicate name.');
    organizerNames.add(key);
    organizerRows.push({ name, name_normalized: key });
  }

  const ruleRows = [];
  const ruleIds = new Set();
  for (let number = 2; number <= rules.rowCount; number += 1) {
    const row = rules.getRow(number);
    if (!row.hasValues) continue;
    const ruleId = r(row, 'Rule ID');
    const section = r(row, 'Mục');
    const content = r(row, 'Nội dung');
    const pointsText = r(row, 'Điểm');
    const points = pointsText === '' ? null : Number(pointsText);
    if (!ruleId || ruleIds.has(ruleId) || !/^[I-V]+$/.test(section) || !content ||
        (points !== null && !Number.isSafeInteger(points))) throw new Error('Official rule invalid/duplicated.');
    ruleIds.add(ruleId);
    const eventSuitable = r(row, 'Phù hợp gán cho sự kiện') === 'CÓ';
    const needsReview = r(row, 'Cần rà soát') === 'CÓ';
    ruleRows.push({
      rule_id: ruleId, section, rule_group: r(row, 'Nhóm') || null, content,
      condition_text: r(row, 'Điều kiện / Cấp / Vai trò') || null,
      points, unit: r(row, 'Đơn vị tính') || null,
      event_suitable: eventSuitable ? 1 : 0,
      active: eventSuitable && !needsReview && points !== null ? 1 : 0,
    });
  }
  if (!historyRows.length || !organizerRows.length || !ruleRows.some((rule) => rule.active)) {
    throw new Error('Historical corpus, organizer catalog, or active rule catalog empty.');
  }
  return {
    sourceVersion, historyRows, organizerRows, ruleRows,
    stats: {
      historicalLabeledRows: historyRows.length,
      uniqueHistoricalTitles: codesByTitle.size,
      observedCodes: observedCounts.size,
      organizers: organizerRows.length,
      officialRules: ruleRows.length,
      activeEventRules: ruleRows.filter((rule) => rule.active).length,
      ambiguousNormalizedTitles: [...codesByTitle.values()].filter((codes) => codes.size > 1).length,
      invalidRows: 0,
      countsByCode: Object.fromEntries([...countsByCode].sort(([a], [b]) => a.localeCompare(b))),
    },
  };
};

const sql = (value) => value == null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const insertRows = (table, columns, rows, ignoreConflicts = false) => {
  const statements = [];
  for (let start = 0; start < rows.length; start += 40) {
    const values = rows.slice(start, start + 40).map((row) =>
      `(${columns.map((column) => sql(row[column])).join(',')})`).join(',');
    statements.push(`INSERT ${ignoreConflicts ? 'OR IGNORE ' : ''}INTO ${table} (${columns.join(',')}) VALUES ${values};`);
  }
  return statements.join('\n');
};

export const buildEventDrlImportSql = (dataset, at) => {
  const version = dataset.sourceVersion;
  const organizers = dataset.organizerRows.map((row) => ({ ...row, source_version: version }));
  const rules = dataset.ruleRows.map((row) => ({ ...row, source_version: version }));
  const history = dataset.historyRows.map((row) => ({ id: row.source_row, ...row, mapped_rule_id: null, source_version: version }));
  // Wrangler D1 execute --file runs a batch transaction. The ready marker is written last
  // and only when the imported aggregate matches the complete validated source.
  return [
    'DELETE FROM event_drl_prediction_cache;',
    'DELETE FROM event_candidate_drl_predictions;',
    'DELETE FROM event_drl_history;',
    'DELETE FROM drl_rules;',
    "DELETE FROM event_organizers WHERE source_version <> 'custom';",
    `DELETE FROM event_organizers WHERE source_version='custom' AND name_normalized IN (${organizers.map((row) => sql(row.name_normalized)).join(',')});`,
    'DELETE FROM event_drl_corpus;',
    insertRows('event_organizers', ['name', 'name_normalized', 'source_version'], organizers, true),
    insertRows('drl_rules', ['rule_id', 'section', 'rule_group', 'content', 'condition_text', 'points', 'unit', 'event_suitable', 'active', 'source_version'], rules),
    insertRows('event_drl_history', ['id', 'source_row', 'observed_code', 'title_original', 'title_clean', 'title_normalized', 'title_normalized_no_year', 'organizer', 'organizer_normalized', 'semester', 'mapped_rule_id', 'source_version'], history),
    `INSERT INTO event_drl_corpus(source_version,historical_rows,status,imported_at)
      SELECT ${sql(version)},${history.length},'ready',${sql(at)}
      WHERE (SELECT COUNT(*) FROM event_drl_history WHERE source_version=${sql(version)})=${history.length};`,
  ].join('\n');
};
