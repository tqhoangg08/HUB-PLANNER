import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['cloudflare/worker/src/d1-user-schedule-mutations.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { parseD1ScheduleReplaceRequest } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const semester = 'HK1_2026_2027';
const systemId = '1368d47c-f0cb-47da-aa8a-cb650078b2e2';
const course = {
  course_code: 'PRIVATE101_261_D01', subject_name: 'Anonymous course', credits: 1, instructor: 'Test instructor', phase: '1',
  scheduleSessions: [
    { weeks: [7], dayOfWeek: 2, shift: 'C', startTime: '13:00', endTime: '15:15', room: 'A302', campus: 'TD' },
    { weeks: [7], dayOfWeek: 2, shift: 'C', startTime: '15:50', endTime: '17:05', room: 'B204', campus: 'Q1' },
    { weeks: [8], dayOfWeek: 4, shift: 'S', startTime: '07:00', endTime: '11:05', room: 'A302', campus: 'TD', isEstimated: true },
  ],
};
const parse = (rows: unknown[]) => parseD1ScheduleReplaceRequest(new Request('https://example.test/api/user/v1/schedules/replace', {
  method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': '"0"', 'Idempotency-Key': 'schedule-test-0001' }, body: JSON.stringify({ semester, rows }),
}));

test('D1 import request keeps system references and exact private sessions/estimates without catalogue writes', async () => {
  const result = await parse([{ systemCourseId: systemId }, { course }]);
  assert.deepEqual(result.replacementItems[0], { courseId: systemId });
  const snapshot = result.replacementItems[1].snapshotCourse;
  assert.equal(snapshot.is_user_added, true);
  assert.equal(result.replacementItems[1].snapshotKind, 'PRIVATE_IMPORTED');
  assert.deepEqual(snapshot.scheduleSessions, course.scheduleSessions);
  assert.equal(snapshot.shift, '13:00-15:15\n15:50-17:05\n07:00-11:05');
  assert.equal(snapshot.campus, 'TD\nQ1\nTD');
});

test('D1 import rejects invalid credits, incorrect session counts and malformed ranges before mutation', async () => {
  for (const credits of [0, -1, 1.5, 5, null, 'unknown']) await assert.rejects(parse([{ course: { ...course, credits } }]));
  await assert.rejects(parse([{ course: { ...course, scheduleSessions: course.scheduleSessions.slice(1) } }]), /đúng 3 buổi/);
  for (const invalid of [{ endTime: '07:00' }, { startTime: '24:00' }, { shift: 'S' }, { isEstimated: 'yes' }, { startTime: null }]) {
    await assert.rejects(parse([{ course: { ...course, scheduleSessions: [{ ...course.scheduleSessions[0], ...invalid }, ...course.scheduleSessions.slice(1)] } }]));
  }
});

test('D1 import prevents overwriting official data or specifying another owner in import rows', async () => {
  await assert.rejects(parse([{ systemCourseId: systemId, course }]));
  await assert.rejects(parse([{ course, userId: 'someone-else' }]));
  await assert.rejects(parse([{ course: { ...course, is_user_added: false } }]));
});
