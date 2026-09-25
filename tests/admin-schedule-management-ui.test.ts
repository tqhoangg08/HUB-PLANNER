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
  assert.match(source, /selectAdminTab\('requested'\)/);
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
  assert.match(source, /fetchCourseRequests\(1, \{ force: true \}\)/);
  assert.doesNotMatch(source, /api\/admin\/timetable/);
});

test('admin timetable renders a dense responsive enterprise table and reuses course pagination', () => {
  const tableStart = source.indexOf('<table className="w-full table-fixed border-collapse text-left text-[13px]');
  const tableEnd = source.indexOf('</table>', tableStart);
  const table = source.slice(tableStart, tableEnd);
  assert.ok(tableStart >= 0 && tableEnd > tableStart);
  for (const label of [
    'Mã môn', 'Tên môn', 'Tín chỉ', 'Khoa phụ trách', 'Học kỳ áp dụng', 'Loại môn', 'Thao tác',
  ]) assert.match(table, new RegExp(label));
  assert.doesNotMatch(table, />Trạng thái<|>Cập nhật</);
  assert.doesNotMatch(table, /adminCourseStatusLabel/);
  assert.match(source, /min-w-\[1040px\]/);
  assert.match(source, /sticky right-0/);
  assert.match(source, /coursePaginationPages\.map/);
  assert.match(source, /aria-label="Trang trước"/);
  assert.match(source, /aria-label="Trang sau"/);
  assert.match(source, /adminCourseTypeLabel/);
  assert.match(table, /aria-label=\{`Chỉnh sửa \$\{c\.course_code\}`\}/);
  assert.match(table, /aria-label=\{`Xóa \$\{c\.course_code\}`\}/);
});

test('remaining management tabs use real fields, dedicated filters, and one bounded pagination grammar', () => {
  for (const marker of ["adminTab === 'requested'", "adminTab === 'user_changed'", "adminTab === 'student_schedules'"]) assert.match(source, new RegExp(marker));
  assert.match(source, /placeholder=\{adminTab === 'requested' \? 'Mã yêu cầu, MSSV, tên môn/);
  assert.match(source, /Ngày gửi yêu cầu/);
  assert.match(source, /request\.request_note/);
  assert.match(source, /request\.scheduleSessions\?\.length/);
  assert.match(source, /getCourseRequestStudentCode\(request\)/);
  assert.match(source, /getChangedCourseDiffs\(course\)/);
  assert.match(source, /diff\.originalValue/);
  assert.match(source, /diff\.changedValue/);
  assert.match(source, /student\.course_count/);
  assert.match(source, /studentPageData\.rows\.map/);
  assert.match(source, /requestedPageData\.rows\.map/);
  assert.match(source, /changedPageData\.rows\.map/);
  assert.match(source, /aria-label="Phân trang quản lý thời khóa biểu"/);
  assert.match(source, /10 \/ trang/);
  assert.match(source, /20 \/ trang/);
  assert.match(source, /50 \/ trang/);
  assert.match(source, /setAdminQuery\(\{ pageSize: event\.target\.value, page: '1' \}\)/);
  assert.match(source, /sticky right-0/);
  assert.doesNotMatch(source, /TKB240001|TD20240073/);
});

test('URL controls all tabs, pagination and sort while request actions stay on the same tab', () => {
  assert.match(source, /parseAdminScheduleTab\(adminQuery\.get\('tab'\)\)/);
  assert.match(source, /adminScheduleTabUrl\(tab\)/);
  assert.match(source, /location\.search, isAdminView/);
  assert.match(source, /setAdminQuery\(\{ sort: event\.target\.value === 'default'/);
  assert.match(source, /sortManagementRequests\(filteredCourseRequests, adminSort\)/);
  assert.match(source, /sortManagementStudents\(filteredStudentScheduleSummaries, adminSort\)/);
  assert.match(source, /navigate\(`\/schedule\/\$\{encodeURIComponent\(student\.student_code \|\| student\.user_id\)\}\$\{location\.search\}`/);
  assert.doesNotMatch(source, /setAdminTab\('system'\)/);
});

test('request identity, quick approve, credits and email use authoritative backend values', () => {
  const authority = readFileSync('cloudflare/worker/src/course-authority.ts', 'utf8');
  const staff = readFileSync('cloudflare/worker/src/staff-schedules.ts', 'utf8');
  assert.match(authority, /LEFT JOIN user_profiles p ON p\.user_id=r\.user_id/);
  assert.match(staff, /user_schedule_course_snapshots snapshots/);
  assert.match(staff, /authEmails\(request, env/);
  assert.match(source, /request\.id\.slice\(0, 8\)\.toUpperCase\(\)/);
  assert.match(source, /approveD1CourseRequest\(request\.id, request\.revision!, \{\}\)/);
  assert.match(source, /student\.total_credits \?\? 0/);
  assert.match(source, /student\.email \|\| '—'/);
});

test('auditor keeps read-only request and schedule actions while admin review remains available', () => {
  const authority = readFileSync('cloudflare/worker/src/course-authority.ts', 'utf8');
  const staffSchedules = readFileSync('cloudflare/worker/src/staff-schedules.ts', 'utf8');
  assert.match(source, /!isAuditor && request\.status === 'pending'/);
  assert.match(source, /aria-label=\{\`Xem yêu cầu/);
  assert.match(source, /aria-label=\{\`Duyệt yêu cầu/);
  assert.match(source, /aria-label=\{\`Từ chối yêu cầu/);
  assert.match(source, /aria-label=\{\`Xem thay đổi/);
  assert.match(source, /aria-label=\{\`Xem TKB/);
  assert.match(source, /adminScheduleError \? <div role="alert"/);
  assert.match(source, /Không có dữ liệu phù hợp/);
  assert.match(source, /Đang tải dữ liệu/);
  assert.match(source, /!isAuditor && request\.status === 'pending'/);
  assert.match(authority, /const reviewRequest = async[\s\S]*?assertAdmin\(actor\)/);
  assert.match(staffSchedules, /request\.method !== 'GET'/);
});
