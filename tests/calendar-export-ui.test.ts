import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('desktop and mobile schedule surfaces use the shared calendar export dialog', () => {
  const desktop = read('components/ScheduleBoard.tsx');
  const mobile = read('components/MobileSchedule.tsx');
  const dialog = read('components/CalendarExportDialog.tsx');

  for (const source of [desktop, mobile]) {
    assert.match(source, /CalendarExportDialog/);
    assert.match(source, /isCalendarExportOpen/);
    assert.match(source, /currentSemesterSchedule/);
  }
  assert.match(desktop, /Thêm vào lịch/);
  assert.match(mobile, /Thêm lịch/);
  assert.match(dialog, /Thêm vào lịch thiết bị/);
  assert.match(dialog, /Thêm toàn bộ vào lịch/);
  assert.match(dialog, /Không nhắc/);
  assert.match(dialog, /Bao gồm phòng học/);
  assert.match(dialog, /Bao gồm giảng viên/);
  assert.match(dialog, /không tự cập nhật/);
});
