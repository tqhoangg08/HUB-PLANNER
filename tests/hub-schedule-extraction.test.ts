import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseHubScheduleLayout } from '../utils/hubScheduleParser.ts';

const pages = JSON.parse(readFileSync('tests/fixtures/hub-schedule-11.layout.json', 'utf8'));
export const expectedCourses = [
  ['AMA308_261_1_D01', 'Cấu trúc rời rạc', 2, 'Nguyễn Hoài Đức', ['2', '4'], 'A302', '12/10/2026', '28/10/2026'],
  ['ITE713_LT_261_1_D01', 'Phương pháp lập trình', 2, 'Đặng Đình Thuận', ['2', '4'], 'B1.301', '12/10/2026', '28/10/2026'],
  ['ITE717_LT_261_1_D01', 'Toán cho tin học 1', 2, 'Đinh Nguyễn Duy Hải', ['3', '5'], 'B1.401', '13/10/2026', '29/10/2026'],
  ['LAW349_2611_1_D01', 'Pháp luật đại cương', 2, 'Lê Thị Ngọc Trâm', ['6', '7'], 'A101', '16/10/2026', '31/10/2026'],
  ['GYM301_2611_1_D07', 'Học phần GDTC 1', 1, '', ['2', '2'], 'San1', '16/11/2026', '21/12/2026'],
  ['ENP706_261_1_D05', 'Tiếng Anh 1 - Nghe - Nói 1', 4, '', ['2', '6'], 'C206', '16/11/2026', '18/01/2027'],
  ['MLM306_2611_1_D05', 'Triết học Mác - Lênin', 3, 'Trần Mai Ước', ['3'], 'A204', '17/11/2026', '19/01/2027'],
  ['ITS798_261_1_D01', 'Điện toán căn bản', 3, 'Lê Quang Thái', ['3'], 'B1.405', '17/11/2026', '19/01/2027'],
  ['AMA308_TH_261_1_D01', 'Thực hành Cấu trúc rời rạc', 1, 'Nguyễn Khắc Cường', ['4'], 'B1.305', '18/11/2026', '23/12/2026'],
  ['ITE713_TH_261_1_D01', 'Thực hành Phương pháp lập trình', 2, 'Đặng Đình Thuận', ['5'], 'B1.403', '19/11/2026', '24/12/2026'],
  ['ITE717_TH_261_1_D01', 'Thực hành Toán cho tin học 1', 1, 'Đinh Nguyễn Duy Hải', ['5'], 'B1.306', '19/11/2026', '24/12/2026'],
];

test('anonymized two-page HUB PDF layout extracts all 11 courses, 23 credits, dates, teachers and meetings', () => {
  const result = parseHubScheduleLayout(pages);
  assert.equal(result.reliable, true);
  assert.equal(result.semester, 'HK1_2026_2027');
  assert.equal(result.courses.length, 11);
  assert.equal(result.courses.reduce((sum, course) => sum + course.credits, 0), 23);
  assert.deepEqual(result.courses.map(c => [c.course_code, c.subject_name, c.credits, c.instructor, c.meetings.map(m => m.day), c.meetings[0].room, c.start_date, c.end_date]), expectedCourses);
  for (const course of result.courses) for (const meeting of course.meetings) {
    assert.equal(meeting.campus, 'TD');
    assert.match(meeting.startTime, /^(07|13|15):\d{2}$/);
    assert.equal(meeting.shift, `${meeting.startTime}-${meeting.endTime}`);
  }
  assert.deepEqual(result.courses[4].meetings.map(m => m.shift), ['13:00-15:15', '15:50-17:05']);
});

test('HUB direct parser must reject incomplete layouts before AI fallback', () => {
  assert.equal(parseHubScheduleLayout([]).reliable, false);
  const partial = structuredClone(pages);
  partial[0].items = partial[0].items.filter((item: { text: string }) => !item.text.includes('28/10/2026'));
  assert.equal(parseHubScheduleLayout(partial).reliable, false);
});

test('fixture excludes student header, identity, signature and source URL', () => {
  const text = pages.flatMap((p: any) => p.items.map((i: any) => i.text)).join(' ');
  assert.doesNotMatch(text, /Họ tên|Mã số|StudentID|https?:|\b\d{12}\b/);
});
