import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import ExcelJS from 'exceljs';
import {
  buildExactRankingImportSql,
  validateExactRankingWorkbook,
} from '../scripts/semester-exact-rankings.mjs';

const headers = ['STT', 'MSSV', 'Họ tên SV', 'Mã Lớp SV', 'Ngành học',
  'Đểm TB HB', 'Xếp loại HT', 'Điểm RL', 'Xếp loại RL', 'Số TC', 'Xếp loại HB'];

const fixture = async (count, change = () => {}) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hub-ranking-fixture-'));
  const file = path.join(dir, 'ranking.xlsx');
  const workbook = new ExcelJS.Workbook();
  const ranking = workbook.addWorksheet('Ranking');
  const dssv = workbook.addWorksheet('DSSV');
  ranking.addRow(headers);
  dssv.addRow(['STT', 'MSSV', 'Họ tên SV', 'Mã Lớp SV', 'Ngành học']);
  for (let rank = 1; rank <= count; rank += 1) {
    const code = String(rank).padStart(12, '0');
    const classCode = rank % 2 ? 'CLASS_A' : 'CLASS_B';
    const major = rank % 3 ? 'MAJOR_A' : 'MAJOR_B';
    ranking.addRow([rank, code, 'Student', classCode, major,
      3.5, 'Giỏi', 90, 'Tốt', 18, 'Giỏi']);
    dssv.addRow([rank, code, 'Student', classCode, major]);
  }
  change(ranking, dssv);
  await workbook.xlsx.writeFile(file);
  return { file, cleanup: () => rm(dir, { recursive: true, force: true }) };
};

test('official 10478-row fixture validates text MSSV and complete STT sequence', async () => {
  const item = await fixture(10478);
  try {
    const result = await validateExactRankingWorkbook(item.file, '2025-2026_HK2', 10478);
    assert.equal(result.rankingRows, 10478);
    assert.equal(result.dssvRows, 10478);
    assert.equal(result.uniqueMssv, 10478);
    assert.equal(result.rows[0].studentCode.length, 12);
    assert.equal(result.rows[0].studentCode.startsWith('0'), true);
    assert.equal(result.rows[0].rank, 1);
    assert.equal(result.rows.at(-1).rank, 10478);
    assert.equal(result.rows[2].rankInClass, 2);
    assert.equal(result.rows[2].totalInClass, 5239);
    assert.equal(result.rows[3].rankInMajor, 3);
    assert.equal(result.rows[3].totalInMajor > 0, true);
    const sql = buildExactRankingImportSql(result, '2026-09-28T00:00:00Z');
    assert.equal(sql, buildExactRankingImportSql(result, '2026-09-28T00:00:00Z'));
    assert.match(sql, /'000000000001'/);
    assert.match(sql, /'importing'/);
    assert.doesNotMatch(sql, /status='ready'/);
  } finally { await item.cleanup(); }
});

test('invalid STT, numeric MSSV, duplicates and DSSV mismatch stop validation', async () => {
  const changes = [
    (r) => { r.getRow(3).getCell(1).value = 9; },
    (r) => { r.getRow(2).getCell(2).value = 12345678901; },
    (r) => { r.getRow(3).getCell(2).value = r.getRow(2).getCell(2).value; },
    (_r, d) => { d.getRow(2).getCell(2).value = '999999999999'; },
  ];
  for (const change of changes) {
    const item = await fixture(4, change);
    try {
      await assert.rejects(() => validateExactRankingWorkbook(item.file,
        '2025-2026_HK2', 4));
    } finally { await item.cleanup(); }
  }
});

test('migration and import SQL preserve official order and stay non-ready until verification', async () => {
  const item = await fixture(4);
  const db = new DatabaseSync(':memory:');
  try {
    const dataset = await validateExactRankingWorkbook(item.file, '2025-2026_HK2', 4);
    db.exec(await readFile('cloudflare/migrations/0050_semester_exact_rankings.sql', 'utf8'));
    db.exec(buildExactRankingImportSql(dataset, '2026-09-28T00:00:00Z'));
    const summary = db.prepare(`SELECT COUNT(*) AS rows, COUNT(DISTINCT student_code) AS codes,
      MIN(rank) AS min_rank, MAX(rank) AS max_rank,
      MIN(total_students) AS min_total, MAX(total_students) AS max_total
      FROM semester_exact_rankings`).get();
    assert.deepEqual({ ...summary }, {
      rows: 4, codes: 4, min_rank: 1, max_rank: 4,
      min_total: 4, max_total: 4,
    });
    const row = db.prepare('SELECT rank, rank_in_class, rank_in_major FROM semester_exact_rankings WHERE rank=3').get();
    assert.deepEqual({ ...row }, { rank: 3, rank_in_class: 2, rank_in_major: 1 });
    assert.equal(db.prepare('SELECT status FROM semester_exact_ranking_datasets').get().status, 'importing');
    db.exec(buildExactRankingImportSql(dataset, '2026-09-28T00:00:00Z'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM semester_exact_rankings').get().n, 4);
  } finally { db.close(); await item.cleanup(); }
});

test('frontend uses imported HK2 benchmark mode and personal lookback metrics', () => {
  const api = readFileSync('utils/benchmarkRankingsApi.ts', 'utf8');
  const rankHook = readFileSync('hooks/useForecastRank.ts', 'utf8');
  const lookback = readFileSync('hooks/useSemesterLookback.ts', 'utf8');
  const modal = readFileSync('components/SemesterLookbackModal.tsx', 'utf8');
  const desktop = readFileSync('components/Dashboard.tsx', 'utf8');
  const mobile = readFileSync('components/MobileDashboard.tsx', 'utf8');
  assert.match(api, /rankingMode: RankingMode/);
  assert.match(api, /\/api\/user\/v1\/rankings\/benchmark/);
  assert.doesNotMatch(api.split('export const fetchCloudflareImportedBenchmarkRanking')[1], /student_code|studentCode|MSSV/);
  assert.match(rankHook, /semesterSources\[selectedSemester\] === 'imported'/);
  assert.match(rankHook, /fetchCloudflareImportedBenchmarkRanking/);
  assert.match(lookback, /LOOKBACK_SEMESTER_ID = '2025-2026_HK2'/);
  assert.match(lookback, /calculateSemesterStats\(resolvedSemester.subjects\)/);
  assert.match(lookback, /getScholarshipStatus\(gpa4, trainingScore, credits\)/);
  assert.match(lookback, /fetchCloudflareImportedBenchmarkRanking/);
  assert.doesNotMatch(lookback, /fetchCloudflareOwnRanking/);
  assert.doesNotMatch(modal, /Khả năng đạt học bổng: Rất cao/);
  assert.doesNotMatch(modal, /Không tìm thấy MSSV trong dữ liệu xếp hạng/);
  assert.match(modal, /Chưa đủ dữ liệu GPA, điểm rèn luyện hoặc tín chỉ/);
  assert.match(desktop, /formatRankingPosition\(rankingResult.rank, rankingResult.totalStudents\)/);
  assert.match(mobile, /formatRankingPosition\(rankingResult.rank, rankingResult.totalStudents\)/);
});
