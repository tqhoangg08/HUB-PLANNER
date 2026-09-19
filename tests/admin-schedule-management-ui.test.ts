import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('components/ScheduleBoard.tsx', 'utf8');

test('admin timetable preserves the five management tabs in an accessible tab strip', () => {
  assert.match(source, /aria-label="Danh mục quản lý thời khóa biểu"/);
  assert.match(source, /role="tablist"/);
  for (const label of [
    'Môn hệ thống gốc',
    'Môn sinh viên thêm',
    'Môn sinh viên yêu cầu thêm',
    'Môn sinh viên thay đổi',
    'Quản lý TKB sinh viên',
  ]) assert.match(source, new RegExp(label));
  assert.match(source, /aria-selected=\{adminTab === 'system'\}/);
  assert.match(source, /setAdminStatusFilter\('all'\)/);
});

test('admin timetable uses the student-management filter and action-bar pattern without changing its data authority', () => {
  assert.match(source, /aria-label="Bộ lọc thời khóa biểu"/);
  assert.match(source, /Khoa phụ trách/);
  assert.match(source, /Khoảng thời gian/);
  assert.match(source, /aria-label="Thao tác quản lý thời khóa biểu"/);
  assert.match(source, /Thêm môn/);
  assert.match(source, /Xuất Excel/);
  assert.match(source, /Làm mới/);
  assert.match(source, /fetchCourses\(\{ force: true \}\)/);
  assert.match(source, /fetchCourseRequests\(courseRequestPage, \{ force: true \}\)/);
  assert.doesNotMatch(source, /api\/admin\/timetable/);
});

test('admin timetable renders a dense responsive enterprise table and reuses course pagination', () => {
  for (const label of [
    'Mã môn', 'Tên môn', 'Tín chỉ', 'Khoa phụ trách', 'Học kỳ áp dụng',
    'Loại môn', 'Trạng thái', 'Cập nhật', 'Thao tác',
  ]) assert.match(source, new RegExp(label));
  assert.match(source, /min-w-\[1160px\]/);
  assert.match(source, /sticky right-0/);
  assert.match(source, /coursePaginationPages\.map/);
  assert.match(source, /aria-label="Trang trước"/);
  assert.match(source, /aria-label="Trang sau"/);
  assert.match(source, /adminCourseStatusLabel/);
  assert.match(source, /adminCourseTypeLabel/);
});
