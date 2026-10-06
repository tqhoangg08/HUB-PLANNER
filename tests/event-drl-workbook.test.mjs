import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import { buildEventDrlImportSql, validateEventDrlWorkbook } from '../scripts/event-drl-workbook.mjs';

const historyHeaders = ['Mã mục quan sát', 'Tên sự kiện gốc', 'Tên sự kiện bỏ mã', 'Tên chuẩn hóa',
  'Tên chuẩn hóa bỏ năm', 'Đơn vị tổ chức', 'Đơn vị chuẩn hóa', 'Học kỳ/Năm học', 'Dòng nguồn'];
const ruleHeaders = ['Rule ID', 'Mục', 'Nhóm', 'Nội dung', 'Điều kiện / Cấp / Vai trò',
  'Điểm', 'Đơn vị tính', 'Phù hợp gán cho sự kiện', 'Cần rà soát', 'Ghi chú'];

const fixture = async (mutate = () => {}) => {
  const workbook = new ExcelJS.Workbook();
  const source = workbook.addWorksheet('Trang tính1');
  source.addRow(['Tên hoạt động']);
  const names = ['Hoạt động một', 'Hoạt động hai', 'Hoạt động ba',
    'Hội nghị học thuật 2025', 'Hội nghị học thuật 2024'];
  names.forEach((name) => source.addRow([name]));
  const history = workbook.addWorksheet('DM_LICH_SU_DRL_AI');
  history.addRow(historyHeaders);
  names.forEach((name, index) => {
    const normalized = name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    history.addRow([index < 3 ? 'III.1.1' : 'I.1.2', name, name, normalized,
      normalized.replace(/\b20\d{2}\b/g, '').trim(), 'Đơn vị mẫu', 'don vi mau', 'HK1', index + 2]);
  });
  const observed = workbook.addWorksheet('DM_MUC_DRL_QUAN_SAT');
  observed.addRow(['Mã mục quan sát', 'Số sự kiện']);
  observed.addRow(['III.1.1', 3]); observed.addRow(['I.1.2', 2]);
  const organizers = workbook.addWorksheet('DM_DON_VI');
  organizers.addRow(['Đơn vị chuẩn']); organizers.addRow(['Đơn vị mẫu']);
  const rules = workbook.addWorksheet('DM_QUY_TAC_DRL');
  rules.addRow(ruleHeaders);
  rules.addRow(['I_TEST', 'I', 'Điểm cộng', 'Hội nghị học thuật', 'Cấp trường', 5, 'Hoạt động', 'CÓ', '', '']);
  rules.addRow(['II_REVIEW', 'II', 'Điểm cộng', 'Chưa xác nhận', '', '', 'Hoạt động', 'CÓ', 'CÓ', '']);
  mutate({ source, history, observed, organizers, rules });
  const directory = await mkdtemp(path.join(tmpdir(), 'hub-event-drl-fixture-'));
  const file = path.join(directory, 'fixture.xlsx');
  await workbook.xlsx.writeFile(file);
  return { directory, file };
};

test('full history importer keeps all rows, including evidence after first three', async () => {
  const { directory, file } = await fixture();
  try {
    const dataset = await validateEventDrlWorkbook(file);
    assert.equal(dataset.stats.historicalLabeledRows, 5);
    assert.equal(dataset.stats.uniqueHistoricalTitles, 5);
    assert.equal(dataset.stats.observedCodes, 2);
    assert.equal(dataset.stats.activeEventRules, 1);
    assert.equal(dataset.historyRows[3].source_row, 5);
    assert.equal(dataset.historyRows[4].source_row, 6);
    const sql = buildEventDrlImportSql(dataset, '2026-10-06T00:00:00Z');
    assert.match(sql, /INSERT INTO event_drl_history/);
    assert.match(sql, /'i\.1\.2'/i);
    assert.equal(sql, buildEventDrlImportSql(dataset, '2026-10-06T00:00:00Z'));
    assert.match(sql, /'ready'/);
    const db = new DatabaseSync(':memory:');
    try {
      for (const migration of ['0006_create_public_events.sql', '0008_create_admin_events.sql',
        '0027_create_event_candidates.sql', '0052_event_drl_history.sql']) {
        db.exec(await readFile(path.join('cloudflare', 'migrations', migration), 'utf8'));
      }
      db.exec(sql);
      assert.equal(db.prepare('SELECT COUNT(*) AS rows FROM event_drl_history').get().rows, 5);
      assert.equal(db.prepare("SELECT status FROM event_drl_corpus").get().status, 'ready');
      db.exec(sql);
      assert.equal(db.prepare('SELECT COUNT(*) AS rows FROM event_drl_history').get().rows, 5);
      assert.equal(db.prepare('SELECT COUNT(DISTINCT source_row) AS rows FROM event_drl_history').get().rows, 5);
    } finally { db.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('source/summary mismatch blocks import before SQL generation', async () => {
  const { directory, file } = await fixture(({ observed }) => { observed.getRow(3).getCell(2).value = 3; });
  try { await assert.rejects(() => validateEventDrlWorkbook(file), /counts do not match/); }
  finally { await rm(directory, { recursive: true, force: true }); }
});
