import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const files = [
  'components/ScheduleBoard.tsx',
  'components/MobileSchedule.tsx',
  'utils/manualCourseRequest.ts',
];

test('course browser writers use the private D1 authority client only', async () => {
  const source = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const joined = source.join('\n');
  assert.doesNotMatch(joined, /\.from\(['"]course_schedules['"]\)/);
  assert.doesNotMatch(joined, /resource=course-requests|manual-course-request/);
  assert.match(source[0], /createD1Course|updateD1Course|retireD1Course/);
  assert.match(source[1], /createD1Course|updateD1Course|retireD1Course/);
  assert.match(joined, /createD1CourseRequest/);
});

test('private D1 course client supplies CAS and idempotency headers', async () => {
  const [source, transport] = await Promise.all([
    readFile('utils/courseAuthorityApi.ts', 'utf8'),
    readFile('utils/privateApi.ts', 'utf8'),
  ]);
  assert.match(source, /Idempotency-Key/);
  assert.match(source, /If-Match/);
  assert.match(transport, /credentials: 'include'/);
  assert.match(source, /\/api\/private\/v1\/courses/);
  assert.match(source, /\/api\/private\/v1\/course-requests/);
});
