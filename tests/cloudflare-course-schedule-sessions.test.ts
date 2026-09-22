import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStructuredScheduleSessions } from '../cloudflare/worker/src/course-schedule-sessions.ts';

const valid = [{ weeks: [1], dayOfWeek: 2, shift: 'S', campus: '', room: 'A.101' }];

test('worker accepts canonical structured schedule sessions and rejects malformed input', () => {
  assert.deepEqual(parseStructuredScheduleSessions(valid, 'HK1_2026_2027'), valid);
  assert.throws(() => parseStructuredScheduleSessions([], 'HK1_2026_2027'));
  assert.throws(() => parseStructuredScheduleSessions([{ ...valid[0], weeks: [23] }], 'HK1_2026_2027'));
  assert.throws(() => parseStructuredScheduleSessions([{ ...valid[0], weeks: [1, 2] }], 'HK1_2026_2027'));
  assert.throws(() => parseStructuredScheduleSessions([valid[0], { ...valid[0], room: 'B.202' }], 'HK1_2026_2027'));
  assert.throws(() => parseStructuredScheduleSessions([{ ...valid[0], dayOfWeek: 9 }], 'HK1_2026_2027'));
  assert.throws(() => parseStructuredScheduleSessions([{ ...valid[0], shift: 'CUSTOM' }], 'HK1_2026_2027'));
  assert.throws(() => parseStructuredScheduleSessions([{ ...valid[0], freeText: 'bypass' }], 'HK1_2026_2027'));
  assert.throws(() => parseStructuredScheduleSessions([{ ...valid[0], room: 'X'.repeat(121) }], 'HK1_2026_2027'));
});
