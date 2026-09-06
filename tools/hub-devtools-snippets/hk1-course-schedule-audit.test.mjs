import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

// Native DOM regression tests use only synthetic HTML, never HUB or real sessions.
const source = readFileSync(new URL('./hk1-course-schedule-audit.js', import.meta.url), 'utf8')
  .replace('void run();', 'globalThis.auditTest = { generateRosterCandidates, exactMatch, parseRoster, parseTimetable, decide, scheduleOf };');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.evaluate(source);
  const results = await page.evaluate(() => {
    const a = globalThis.auditTest;
    const parse = html => new DOMParser().parseFromString(html, 'text/html');
    const generic = a.generateRosterCandidates('ABC_101_X_Y');
    const gym = a.generateRosterCandidates('GYM_101_MIDDLE_END');
    const roster = a.parseRoster(parse('<table><tr><td><table><tr><td>MSSV</td><td>Họ tên</td></tr>' + ['000012345678', '000012345679', '000012345680', '000012345681'].map(id => `<tr><td>${id}</td><td>Synthetic</td></tr>`).join('') + '</table></td></tr></table>'));
    const empty = a.parseRoster(parse('<table><tr><th>MSSV</th><th>Họ tên</th></tr></table>'));
    const tt = a.parseTimetable(parse('<table><tr><th>Mã lớp</th><th>Thứ</th><th>Tiết</th></tr></table>'));
    const s = a.scheduleOf([{ weekday: '2', periods: '1-3' }]);
    const t = a.scheduleOf([{ weekday: '3', periods: '1-3' }]);
    return {
      generic, gym, roster, empty, tt,
      exact: a.exactMatch('ABC_101_X_Y_EXTRA', generic),
      conflict: a.decide([{ schedule: s }, { schedule: t }]),
      majority: a.decide([{ schedule: s }, { schedule: t }, { schedule: s }]),
      blank: a.decide([{ schedule: a.scheduleOf([{}]) }]),
      keep: a.decide([{ schedule: s, instructor: '' }], { normalized_schedule: s, instructor: 'Existing' }),
      fill: a.decide([{ schedule: s, instructor: 'Synthetic instructor' }], { normalized_schedule: s }),
    };
  });
  assert.deepEqual(results.generic, ['ABC_101_1_X_Y', 'ABC_1011_1_X_Y', 'ABC_101_2_X_Y', 'ABC_1012_2_X_Y', 'ABC_101_X_Y']);
  assert.deepEqual(results.gym, ['GYM_101_1_MIDDLE_END', 'GYM_101_2_MIDDLE_END', 'GYM_101_MIDDLE_END']);
  assert.equal(new Set(results.generic).size, results.generic.length);
  assert.equal(results.exact, false);
  assert.equal(results.roster.dataRows, 4);
  assert.deepEqual(results.roster.identifiers, ['000012345678', '000012345679', '000012345680']);
  assert.equal(results.empty.found, true);
  assert.equal(results.empty.identifiers.length, 0);
  assert.equal(results.tt.recognized, true);
  assert.equal(results.tt.rows.length, 0);
  assert.equal(results.conflict.proposed_action, 'CONFLICT');
  assert.equal(results.majority.proposed_action, 'REVIEW_SCHEDULE');
  assert.equal(results.blank.proposed_action, 'UNRESOLVED');
  assert.equal(results.keep.proposed_action, 'KEEP');
  assert.equal(results.fill.proposed_action, 'FILL_INSTRUCTOR');
  console.log('HK1_SNIPPET_REGRESSION_TESTS=PASS');
} finally { await browser.close(); }

