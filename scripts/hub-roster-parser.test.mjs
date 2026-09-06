import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHk1RosterStudents } from './hub-roster-parser.mjs';

test('sanitized nested roster table ignores outer layout rows and preserves leading-zero identifiers', () => {
  const fixture = `
    <table class="layout"><tr><td colspan="2"><table class="students">
      <tr><th>STT</th><th>MSSV</th><th>Họ tên</th></tr>
      <tr><td>1</td><td>000012345678</td><td>Sanitized</td></tr>
      <tr><td>2</td><td><input type="hidden" value="001234567890" /></td><td>Sanitized</td></tr>
      <tr><td>3</td><td><a href="/detail?StudentID=012345678901">Xem</a></td><td>Sanitized</td></tr>
    </table></td></tr></table>`;
  const parsed = parseHk1RosterStudents(fixture);
  assert.equal(parsed.tableCount, 2);
  assert.equal(parsed.rowCount, 3);
  assert.equal(parsed.realRosterTableFound, true);
  assert.deepEqual(parsed.identifiers, ['000012345678', '001234567890', '012345678901']);
  assert.equal(parsed.sourceClass, 'td_text');
});

