import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseHubTranscriptRows,
  type PositionedPdfItem,
  type PositionedPdfRow,
} from '../utils/hubTranscriptParser.ts';

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
    valid: true,
  });
});
