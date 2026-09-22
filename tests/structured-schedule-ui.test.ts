import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('unknown import courses and manual requests share the structured schedule editor on desktop and mobile', () => {
  const preview = read('components/ScheduleImportPreviewModal.tsx');
  const desktop = read('components/ScheduleBoard.tsx');
  const mobile = read('components/MobileSchedule.tsx');
  const editor = read('components/ScheduleSessionsEditor.tsx');
  assert.match(preview, /ScheduleSessionsEditor/);
  assert.doesNotMatch(preview, /<textarea/);
  for (const source of [desktop, mobile]) {
    assert.match(source, /ScheduleSessionsEditor/);
    assert.match(source, /scheduleSessions/);
    assert.match(source, /scheduleSessionsAreValid/);
  }
  assert.match(editor, /Chọn thứ \*/);
  assert.match(editor, /Chọn ca \*/);
  assert.match(editor, /Tuần học/);
  assert.match(editor, /Phòng/);
  assert.match(editor, /Nhân bản buổi/);
  assert.match(editor, /Áp dụng thứ cho tất cả/);
  assert.match(editor, /Áp dụng ca cho tất cả/);
  assert.doesNotMatch(editor, /Cơ sở buổi/);
  assert.match(desktop, /max-w-\[min\(96vw,1280px\)\]/);
  assert.match(desktop, /Giảng viên \*/);
  assert.match(mobile, /Giảng viên \*/);
});
