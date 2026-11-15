import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseHubTranscriptRows,
  extractPageRows,
  type PositionedPdfItem,
  type PositionedPdfRow,
} from '../utils/hubTranscriptParser.ts';
import { twoPageTranscriptFixture, transcriptRow, transcriptHeader } from './fixtures/transcript-two-page.ts';

const row = (y: number, items: Array<[string, number, number?]>): PositionedPdfRow => {
  const positionedItems: PositionedPdfItem[] = items.map(([text, x, width = Math.max(8, text.length * 3)]) => ({
    text,
    x,
    y,
    width,
  }));
  return {
    pageNumber: 1,
    y,
    items: positionedItems,
    text: positionedItems.map(item => item.text).join(' | '),
  };
};

test('transcript parser derives shifted columns and ignores overlapping portal navigation text', () => {
  const result = parseHubTranscriptRows([
    row(550, [['Nguyễn Văn A [Mã số: 050123456789]', 165]]),
    row(540, [['Chương trình đào tạo:', 230], ['Kế toán', 303], ['Kết quả:', 407]]),
    row(530, [['Học kỳ 2/2022-2023', 165]]),
    row(520, [
      ['Tài khoản sinh viên', 54],
      ['STT', 165],
      ['Mã học phần', 185],
      ['Tên học phần', 244],
      ['Tín chỉ', 393],
      ['Loại môn học', 422],
      ['Tổng điểm', 467],
      ['Kết quả', 502],
      ['Chi tiết', 531],
    ]),
    row(510, [['Học phần 1 (Đường lối quốc phòng và an ninh của Đảng', 246]]),
    row(507, [
      ['Nhập điểm rèn luyện', 54],
      ['1', 167],
      ['DAS301_4_2221_13', 186],
      ['2', 407],
      ['Bắt Buộc', 435],
      ['6.5', 481],
      ['Chi tiết', 537],
    ]),
    row(504, [['Cộng sản Việt Nam)', 246]]),
    row(496, [['STC Đậu (2) + STC Rớt (0) =', 297], ['2', 407], ['Điểm Trung Bình : 6.50', 425]]),
    row(488, [['Điểm rèn luyện =', 334], ['78', 407], ['Xếp loại: Tốt', 425]]),
  ]);

  assert.equal(result.reliable, true);
  assert.equal(result.subjectCount, 1);
  assert.equal(result.studentInfo.studentName, 'Nguyễn Văn A');
  assert.equal(result.studentInfo.studentCode, '050123456789');
  assert.equal(result.studentInfo.majorName, 'Kế toán');
  assert.equal(result.semesters[0].subjects[0].name, 'Học phần 1 (Đường lối quốc phòng và an ninh của Đảng Cộng sản Việt Nam)');
  assert.equal(result.semesters[0].subjects[0].credits, 2);
  assert.equal(result.semesters[0].subjects[0].scoreFinal, 6.5);
  assert.equal(result.semesters[0].trainingScore, 78);
  assert.deepEqual(result.creditChecks[0], {
    semesterId: 'imported_2022_2023_hk2',
    expected: 2,
    actual: 2,
    assessed: 2,
    pending: 0,
    summaryEvidence: 'verified',
    valid: true,
  });
});

test('native two-page transcript retains five semesters, 42 courses, M, zero and pending grades', () => {
  const result = parseHubTranscriptRows(twoPageTranscriptFixture());
  assert.equal(result.reliable, true);
  assert.equal(result.detectedSemesterCount, 5);
  assert.equal(result.subjectCount, 42);
  assert.deepEqual(result.semesters.map(s => s.subjects.length), [11, 10, 9, 9, 3]);
  assert.equal(result.semesters[3].subjects[6].name, 'Môn kiểm thử 4.7');
  assert.equal(result.semesters[0].subjects[0].scoreFinal, 0);
  assert.equal(result.semesters[0].subjects[1].importedScoreLabel, 'M');
  assert.equal(result.semesters[0].subjects[1].scoreFinal, null);
  assert.equal(result.semesters[0].subjects[1].isNonGPA, true);
  assert.equal(result.semesters[0].subjects[2].scoreFinal, 8.5);
  assert.ok(result.semesters[4].subjects.every(s => s.scoreCC === null && s.scoreProcess === null && s.scoreMid === null && s.scoreFinal === null && !s.importedScoreLabel));
  assert.deepEqual(result.creditChecks[4], { semesterId: 'imported_2033_2034_hk1', expected: 9, actual: 9, assessed: 0, pending: 9, summaryEvidence: 'verified', valid: true });
  assert.ok(result.rowChecks.every(check => check.valid));
});

test('row extraction preserves both pages and continuation without a repeated header', () => {
  const source = twoPageTranscriptFixture();
  const rows = [1, 2].flatMap(page => extractPageRows(source.filter(r => r.pageNumber === page).flatMap(r => r.items.map(i => ({ str: i.text, width: i.width, transform: [1, 0, 0, 1, i.x, i.y] }))), page));
  assert.deepEqual(parseHubTranscriptRows(rows).semesters.map(s => s.subjects.length), [11, 10, 9, 9, 3]);
  assert.equal(parseHubTranscriptRows(rows).reliable, true);
});

test('summary reads the explicit total after =, including inserted separators, in any year', () => {
  const rows = twoPageTranscriptFixture(2040);
  assert.equal(parseHubTranscriptRows(rows).creditChecks[4].expected, 9);
  const lastSummary = rows.findLast(r => r.text.includes('STC Đậu'))!;
  lastSummary.text = 'STC Đậu (0) + STC Rớt (0) = | 6 | Điểm Trung Bình : 0.00';
  assert.equal(parseHubTranscriptRows(rows).creditChecks[4].valid, false);
});

test('summary without registered total cannot infer evidence from parsed pending credits', () => {
  const rows = twoPageTranscriptFixture();
  rows.findLast(r => r.text.includes('STC Đậu'))!.text = 'STC Đậu (0) + STC Rớt (0)';
  const result = parseHubTranscriptRows(rows);
  assert.equal(result.reliable, false);
  assert.equal(result.creditChecks[4].expected, null);
  assert.equal(result.creditChecks[4].summaryEvidence, 'unreadable');
});

test('missing, duplicate and malformed course rows fail closed even without a credit summary', () => {
  for (const mode of ['missing', 'duplicate', 'credit', 'code', 'name', 'score']) {
    const rows = twoPageTranscriptFixture().filter(r => !r.text.includes('STC Đậu'));
    const index = rows.findIndex(r => r.text.includes('DEMO_0_5'));
    if (mode === 'missing') rows.splice(index, 1);
    else if (mode === 'duplicate') rows.splice(index, 0, structuredClone(rows[index]));
    else {
      const x = { credit: 414, code: 192, name: 246, score: 493 }[mode]!;
      rows[index].items = rows[index].items.filter(i => i.x !== x);
      if (mode === 'score') rows[index].items.push({ text: '11', x, y: rows[index].y, width: 8 });
    }
    const result = parseHubTranscriptRows(rows);
    assert.equal(result.reliable, false, mode);
    assert.equal(result.rowChecks[0].valid, false, mode);
  }
});

test('a repeated semester title and header on page two continue the same semester', () => {
  const rows = twoPageTranscriptFixture();
  const index = rows.findIndex(r => r.pageNumber === 2);
  rows.splice(index, 0, transcriptRow(2, 790, [['Học kỳ 2/2032-2033', 165]]), transcriptHeader(2, 775));
  const result = parseHubTranscriptRows(rows);
  assert.equal(result.detectedSemesterCount, 5);
  assert.equal(result.subjectCount, 42);
  assert.equal(result.reliable, true);
});

test('every supported BUH semester requires an explicit readable STC total', () => {
  for (let term = 0; term < 5; term++) {
    const rows = twoPageTranscriptFixture();
    const summary = rows.filter(r => r.text.includes('STC Đậu'))[term];
    const result = parseHubTranscriptRows(rows.filter(r => r !== summary));
    assert.equal(result.subjectCount, 42);
    assert.equal(result.rowChecks[term].valid, true);
    assert.equal(result.creditChecks[term].valid, false, `missing summary for term ${term}`);
    assert.equal(result.creditChecks[term].summaryEvidence, 'missing');
    assert.equal(result.reliable, false);
  }
});

test('losing the final course rows and their STC summary fails closed even when STT stays contiguous', () => {
  const rows = twoPageTranscriptFixture();
  const summary = rows.filter(r => r.text.includes('STC Đậu'))[4];
  const result = parseHubTranscriptRows(rows.filter(r => r !== summary && !/DEMO_4_[23]\b/.test(r.text)));
  assert.equal(result.subjectCount, 40);
  assert.deepEqual(result.rowChecks[4], { semesterId: 'imported_2033_2034_hk1', expected: 1, detected: 1, parsed: 1, valid: true });
  assert.equal(result.creditChecks[4].valid, false);
  assert.equal(result.reliable, false);
});

test('unreadable or ambiguous STC evidence never validates a BUH semester', () => {
  for (const text of [
    'STC Đậu (0) + STC Rớt (0)',
    'STC Đậu (0) + STC Rớt (0) = | ? | Điểm Trung Bình : 0.00',
    'STC Đậu (?) + STC Rớt (0) = | 9 | Điểm Trung Bình : 0.00',
    'STC Đậu (0) + STC Rớt (0) = | 9abc | Điểm Trung Bình : 0.00',
    'STC Đậu (0) + STC Rớt (0) = | 9 12 | Điểm Trung Bình : 0.00',
  ]) {
    const rows = twoPageTranscriptFixture();
    rows.filter(r => r.text.includes('STC Đậu'))[4].text = text;
    const result = parseHubTranscriptRows(rows);
    assert.equal(result.creditChecks[4].valid, false, text);
    assert.equal(result.reliable, false, text);
  }
  const rows = twoPageTranscriptFixture();
  rows.push(structuredClone(rows.filter(r => r.text.includes('STC Đậu'))[4]));
  assert.equal(parseHubTranscriptRows(rows).reliable, false, 'duplicate summary is ambiguous');
});
