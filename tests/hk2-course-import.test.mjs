import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, cp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSync, transformSync } from 'esbuild';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import { DatabaseSync } from 'node:sqlite';
import { auditPackage, DATA_DIR, FIELDS, SEMESTER, SHIFT_TIMES, verifiedInputs, planImport, sha256, normalizeKey,
  parseWeeks, scheduleSegments, weekDates, isClosure, isOnline, validateSnapshot } from '../scripts/hk2-2026-2027/catalogue.mjs';
import { getWeekDatesForSemester, getSemesterHolidayWeeks, getSemesterStartDate } from '../utils/academicCalendar.ts';
import { buildCalendarExport, getCanonicalShiftTimeRange } from '../utils/calendarExport.ts';
import { scheduleSessionsFromLegacyFields, serializeScheduleSessions, formatScheduleSession, getScheduleSessionTimeRange, scheduleSessionsOverlap } from '../utils/scheduleSessions.ts';
import { getOwnerEstimatedShift, ownerEstimatedShiftCaption, isTemporaryCatalogueItem, temporaryCatalogueView, searchTemporaryCatalogue } from '../utils/provisionalCoursePolicy.js';
import { parseStoredUserScheduleCourseSnapshot } from '../cloudflare/worker/src/user-schedules.ts';
import { handleCourses } from '../cloudflare/worker/src/courses.ts';

// Re-read and independently reconcile ALL source and review workbooks, not just generated data.
const audit = await auditPackage();
const eligible = audit.records.filter(r => r.publication !== 'BLOCKED');
const production = JSON.parse(await readFile(path.join(DATA_DIR, 'production-readonly.json'), 'utf8'));

test('preflight rejects partial, differently scoped, unsuccessful or write-containing snapshots', async () => {
  const sql = await readFile(path.join(DATA_DIR, 'preflight.sql'), 'utf8');
  assert.equal(validateSnapshot(production, sql).length, 5);
  for (const mutate of [
    s => { s.sql += ' SELECT 1'; }, s => { s.response.result.pop(); },
    s => { s.response.result[0].success = false; }, s => { s.response.result[0].meta.rows_written = 1; },
    s => { s.response.result[0].results.push({ semester: SEMESTER, count: 1 }); },
    s => { s.response.result[3].results.push({ semester: 'HK1_2026_2027', course_code: 'X', id: 'X' }); },
    s => { s.response.result[4].results = []; },
  ]) { const snapshot = structuredClone(production); mutate(snapshot); assert.throws(() => validateSnapshot(snapshot, sql)); }
});

test('all source rows, sheets, flags, programs and immutable generated artifacts reconcile', async () => {
  assert.equal(audit.summary.original_standard + audit.summary.original_advanced - audit.summary.placeholders, 2357);
  assert.equal(audit.records.length, 2357); assert.equal(audit.sheets.length, 9);
  assert.equal(audit.summary.candidate, 2322); assert.equal(audit.summary.review_required, 35);
  assert.equal(audit.summary.eligible, 2357); assert.equal(audit.summary.blocked, 0);
  assert.equal(audit.summary.prepared_rows, 2360); assert.equal(audit.summary.temporary_items, 3);
  assert.equal(audit.summary.exception_sheet_rows, 115); assert.equal(audit.summary.flagged_classes, 112);
  assert.equal(audit.summary.flag_occurrences, 113);
  assert.equal(new Set(audit.records.map(r => normalizeKey(r.course.course_code))).size, 2357);
  assert.deepEqual(Object.keys(audit.summary.programs).sort(), production.response.result[1].results.map(r => r.academic_program || 'standard').sort());
  const run = spawnSync(process.execPath, ['scripts/prepare-hk2-course-import.mjs', '--check'], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});

test('integrity verification fails before parsing when any input changes or is missing', async t => {
  const temp = await mkdtemp(path.join(tmpdir(), 'hub-hk2-integrity-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await cp(path.join(DATA_DIR, 'source'), path.join(temp, 'source'), { recursive: true });
  await cp(path.join(DATA_DIR, 'integrity.json'), path.join(temp, 'integrity.json'));
  const target = path.join(temp, 'source/hub_planner_hk2_2026_2027_staging.json');
  await writeFile(target, '{invalid and must never be parsed');
  await assert.rejects(verifiedInputs(temp), /SHA-256/);
  await rm(target);
  await assert.rejects(verifiedInputs(temp), /ENOENT/);
});

test('22 full weeks and daily closures retain program scope, with no whole holiday weeks', () => {
  const localIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  for (let w = 1; w <= 22; w++) assert.deepEqual(getWeekDatesForSemester(w, SEMESTER).map(localIso), weekDates(w));
  assert.deepEqual(weekDates(1), ['2027-02-15', '2027-02-16', '2027-02-17', '2027-02-18', '2027-02-19', '2027-02-20', '2027-02-21']);
  assert.equal(weekDates(22)[0], '2027-07-12'); assert.equal(weekDates(22)[6], '2027-07-18');
  assert.equal(localIso(getSemesterStartDate('HKHE_2026_2027')), '2027-07-19');
  assert.deepEqual(getSemesterHolidayWeeks(SEMESTER), []);
  for (const kind of ['standard', 'advanced']) {
    for (const date of ['2027-04-16', '2027-04-17', '2027-04-18', '2027-04-30', '2027-05-01', '2027-05-02', '2027-05-03']) assert.equal(isClosure(date, kind), true);
    for (const date of ['2027-04-15', '2027-04-19', '2027-04-29', '2027-05-04']) assert.equal(isClosure(date, kind), false);
    for (const date of ['2027-07-09', '2027-07-10', '2027-07-11']) assert.equal(isClosure(date, kind), kind === 'advanced');
    for (const date of weekDates(1)) assert.equal(isOnline(date, kind), kind === 'advanced' && date !== '2027-02-21');
  }
  assert.equal(audit.summary.holiday_class_conflicts, 0);
  assert.equal(audit.summary.holiday_exam_conflicts, 0);
  assert.deepEqual(audit.calendar_evidence.map(e => [e.weeks_checked, e.dates_checked]), [[22, 154], [22, 154]]);
});

test('source-verified shifts agree with existing export/parser code, preserve every meeting and reject ambiguous arrays', () => {
  for (const [source, exact] of Object.entries(SHIFT_TIMES)) {
    const [start, end] = exact.split('-'); assert.deepEqual(getCanonicalShiftTimeRange(source), { start, end });
  }
  for (const record of eligible) {
    const sessions = scheduleSessionsFromLegacyFields(record.course, SEMESTER);
    const expected = record.segments.flatMap(s => s.weeks.map(w => ({ w, day: s.day_of_week, room: s.room || '', campus: s.campus || '', start: s.timing_precision ? undefined : s.shift.split('-')[0], end: s.timing_precision ? undefined : s.shift.split('-')[1] })));
    assert.deepEqual(sessions.map(s => ({ w: s.weeks[0], day: s.dayOfWeek, room: s.room, campus: s.campus, start: s.startTime, end: s.endTime })), expected, record.course.course_code);
    for (const f of FIELDS) {
      if (typeof record.course[f] === 'string') assert.ok(record.course[f].length <= (f === 'subject_name' ? 240 : 500), `Authority length: ${record.course.course_code} ${f}`);
    }
  }
  const sample = audit.records.find(r => r.course.course_code === 'MLM309_262_D07');
  assert.deepEqual(sample.segments.map(s => [s.day_of_week, s.shift, s.weeks_raw, s.room]), [
    [7, '13:00-17:05', '12-15,17-20', 'B1.304'], [2, '07:00-11:05', '20', 'B1.104'],
  ]);
  assert.throws(() => scheduleSegments({ shift: 'S\nC', day_of_week: '2\n3\n4', weeks: '1-2', room: '', campus: 'TĐ' }), /Ambiguous/);
  for (const weeks of ['', '0', '23', '3-1', '1,1', '1-x']) assert.throws(() => parseWeeks(weeks));
});

test('instructors, merged codes, unknown hours, essays and adjustment markers never acquire invented data', () => {
  assert.ok(audit.records.every(r => r.course.instructor === null && r.course.is_user_added === false));
  assert.ok(audit.records.filter(r => r.source_kind === 'standard').every(r => r.course.academic_program === null));
  assert.equal(audit.records.filter(r => r.course.course_code.endsWith('_GHÉP')).length, 8);
  assert.ok(audit.placeholders.every(r => r.course_code === '_262_'));
  assert.ok(!audit.records.some(r => r.course.course_code === '_262_'));
  const ownerMapped = audit.records.filter(r => r.owner_derivation);
  assert.equal(ownerMapped.length, 8); assert.ok(ownerMapped.every(r => r.publication === 'ELIGIBLE_PENDING_OWNER_APPROVAL' && getOwnerEstimatedShift(r.course.shift)?.shift === 'S'));
  assert.equal(audit.records.filter(r => r.assessment === 'essay').length, 124);
  assert.ok(audit.records.filter(r => r.assessment === 'essay').every(r => r.course.exam_date === null && r.course.exam_shift === null && /Tiểu luận/.test(r.course.general_note)));
  const markers = audit.records.filter(r => r.issues.includes('REVIEW_EXAM_ROOM_MARKER'));
  assert.equal(markers.length, 15); assert.ok(markers.every(r => r.course.exam_room === null && r.course.general_note.includes(r.exam_room_raw)));
  const summer = audit.records.filter(r => r.issues.includes('REVIEW_EXAM_SUMMER_SOFTWARE'));
  assert.equal(summer.length, 78); assert.ok(summer.every(r => /^(19|20|21)\/07\/2027$/.test(r.course.exam_date) && r.publication !== 'BLOCKED'));
  const sunday = audit.records.filter(r => r.issues.includes('REVIEW_STANDARD_EXAM_SUNDAY_25_APR'));
  assert.equal(sunday.length, 4); assert.ok(sunday.every(r => r.course.exam_date === '25/04/2027'));
});

test('dry-run repeats exactly, detects duplicates/content conflicts/retired rows, and never offers a production write', () => {
  const first = planImport(audit.records, [], audit.temporary_items); assert.deepEqual(first, planImport(audit.records, [], audit.temporary_items));
  assert.deepEqual(first.counts, { additions: 2357, identical: 0, blocked: 0, conflicts: 0, temporary_items: 3 });
  assert.equal(first.can_apply, false);
  const pe = audit.records.find(r => r.owner_derivation);
  assert.throws(() => planImport([{ ...pe, course: { ...pe.course, shift: 'S' } }], []), /precision marker/);
  assert.throws(() => planImport([{ ...pe, owner_derivation: undefined }], []), /owner decision/);
  const old = { ...eligible[0].course, catalogue_visibility: 'published' };
  assert.equal(planImport(audit.records, [old]).counts.identical, 1);
  assert.equal(planImport(audit.records, [{ ...old, instructor: 'HK1 MUST NOT BE COPIED' }]).status, 'CONFLICT_STOP');
  assert.equal(planImport(audit.records, [{ ...old, catalogue_visibility: 'retired' }]).status, 'CONFLICT_STOP');
  assert.equal(planImport(audit.records, [{ ...old, course_code: 'UNEXPECTED_HK2_CODE' }]).status, 'CONFLICT_STOP');
  assert.throws(() => planImport(audit.records, [old, old]), /duplicate/);
  assert.throws(() => planImport([...audit.records, audit.records[0]], []), /Duplicate import/);
  assert.throws(() => planImport([{ ...eligible[0], course: { ...eligible[0].course, instructor: 'Guess' } }], []), /scope/);
  assert.throws(() => planImport([{ ...eligible[0], course: { ...eligible[0].course, semester: 'HK1_2026_2027' } }], []), /scope/);
  assert.throws(() => planImport([{ ...eligible[0], course: { ...eligible[0].course, credits: null } }], []), /credits/);
  const cli = spawnSync(process.execPath, ['scripts/prepare-hk2-course-import.mjs', '--remote', '--apply'], { encoding: 'utf8', windowsHide: true });
  assert.notEqual(cli.status, 0); assert.match(cli.stderr, /no production writer/);
});

test('owner PE derivation preserves source fields, uses S without invented clocks, and survives personal snapshots/ICS', async () => {
  const { staging } = await verifiedInputs();
  const expectedCodes = ['GYM302_262_PI_D17', 'GYM302_262_PI_D18', 'GYM304_262_PI_D52', 'GYM304_262_PI_D53',
    'GYM304_262_QV_D27', 'GYM304_262_QV_D28', 'GYM304_262_QV_D54', 'GYM304_262_QV_D55'];
  assert.deepEqual(audit.records.filter(r => r.owner_derivation).map(r => r.course.course_code), expectedCodes);
  for (const record of audit.records) {
    const source = staging.classes.find(r => r.course.course_code === record.course.course_code);
    assert.deepEqual(record.raw_schedule, source.raw_schedule);
    assert.deepEqual(record.source_notes, source.source_notes);
    for (const field of FIELDS) if (!record.owner_derivation || !['shift', 'general_note'].includes(field)) assert.deepEqual(record.course[field], source.course[field]);
    if (!record.owner_derivation) continue;
    assert.equal(record.owner_derivation.exact_clock_times_inferred, false);
    assert.ok(record.issues.includes('UNMAPPED_SHIFT_TIME'), 'School-source warning must remain visible');
    const snapshot = parseStoredUserScheduleCourseSnapshot(JSON.stringify(record.course));
    assert.deepEqual(snapshot, record.course);
    const sessions = scheduleSessionsFromLegacyFields(snapshot, SEMESTER);
    const uncertain = sessions.filter(s => s.timePrecision === 'owner_half_day');
    assert.ok(uncertain.length > 0);
    for (const session of uncertain) {
      assert.equal(session.shift, 'S'); assert.equal(session.startTime, undefined); assert.equal(session.endTime, undefined);
      assert.equal(getScheduleSessionTimeRange(session), null);
      assert.doesNotMatch(formatScheduleSession(session).join(' '), /\d{1,2}:\d{2}/);
      const roundTrip = scheduleSessionsFromLegacyFields(serializeScheduleSessions([session]), SEMESTER)[0];
      assert.equal(roundTrip.timePrecision, 'owner_half_day'); assert.equal(roundTrip.sourcePeriods, session.sourcePeriods);
      assert.equal(scheduleSessionsOverlap(session, { ...session, timePrecision: undefined, sourcePeriods: undefined, shift: 'S', startTime: '10:00', endTime: '11:00' }), true);
      assert.equal(scheduleSessionsOverlap(session, { ...session, timePrecision: undefined, sourcePeriods: undefined, shift: 'C', startTime: '13:00', endTime: '14:00' }), false);
    }
    const exported = buildCalendarExport({ semester: SEMESTER, courses: [record.course], reminderMinutes: 15 });
    assert.ok(exported.issues.some(i => i.reason === 'unknown_shift'));
    assert.ok(exported.events.every(e => !getOwnerEstimatedShift(e.shift)));
    for (const segment of record.segments.filter(s => s.timing_precision)) {
      const onlyUncertain = { ...record.course, shift: segment.serialized_shift, day_of_week: String(segment.day_of_week), weeks: segment.weeks_raw };
      const skipped = buildCalendarExport({ semester: SEMESTER, courses: [onlyUncertain], reminderMinutes: 15 });
      assert.equal(skipped.events.length, 0); assert.doesNotMatch(skipped.ics, /DTSTART|DTEND|VALARM/);
    }
  }
});

test('three temporary subjects retain stable distinct source keys, NULL credits and no operational weekly timetable', () => {
  const items = audit.temporary_items;
  assert.deepEqual(items.map(i => i.provenance.source_row), [1214, 1320, 1321]);
  assert.deepEqual(items.map(i => i.credits), [1, null, null]);
  assert.equal(new Set(items.map(i => i.technical_key)).size, 3);
  for (const item of items) {
    assert.equal(item.official_course_code, null); assert.equal(item.instructor, null);
    assert.equal(item.provenance.source_course_code, '_262_'); assert.equal(item.provenance.source_fields.weeks, '1-22');
    assert.deepEqual(item.segments, []); assert.equal(item.weeks, null);
    const view = temporaryCatalogueView(item);
    assert.equal(view.code_label, 'Mã lớp chưa công bố'); assert.equal(view.selectable, false);
    assert.equal(view.can_add_to_personal_schedule, false); assert.equal(view.can_export_ics, false); assert.equal(view.can_check_conflicts, false);
    const poisoned = { ...view, weeks: '1-22', day_of_week: '6', shift: 'S' };
    assert.deepEqual(scheduleSessionsFromLegacyFields(poisoned, SEMESTER), []);
    const exported = buildCalendarExport({ semester: SEMESTER, courses: [poisoned], reminderMinutes: 15 });
    assert.equal(exported.events.length, 0); assert.doesNotMatch(exported.ics, /DTSTART|DTEND|VALARM/);
    assert.equal(exported.issues[0].reason, 'temporary_subject');
    assert.throws(() => planImport([item], []), /Temporary subjects/);
  }
  assert.equal(searchTemporaryCatalogue(items, 'Thuc tap giua khoa').length, 2);
  assert.equal(searchTemporaryCatalogue(items, '1320')[0].technical_key, items[1].technical_key);
  assert.equal(searchTemporaryCatalogue(items, '_262_').length, 0);
  assert.throws(() => planImport(audit.records, [], [items[0], items[0]]), /Duplicate temporary/);
  const manifestSource = audit.integrity.files[items[1].provenance.source_file];
  for (const item of items) assert.equal(item.technical_key, `hk2tmp:${sha256(`${manifestSource}:LG HK2 du kien (2):${item.provenance.source_row}`)}`);
});

// Test-only statements: never exported by the preparation script and never receive remote bindings.
const localStatements = (db, records, startPosition = 2103) => records.map((r, index) => {
  const hash = sha256(JSON.stringify(r.course));
  const hex = sha256(`${SEMESTER}:${r.course.course_code}`);
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const extra = { id, created_at: '2026-11-19T00:00:00.000Z', updated_at: '2026-11-19T00:00:00.000Z',
    course_code_search: normalizeKey(r.course.course_code), subject_name_search: normalizeKey(r.course.subject_name),
    instructor_search: '', source_position: startPosition + index + 1, catalogue_visibility: 'published', revision: 0,
    source_kind: 'admin', source_key: `hk2-review:${r.source_kind}:${r.source_row}`,
    writer_provenance: 'hk2_fixture_only', instructor_provenance: 'source_not_published', content_hash: hash };
  const row = { ...r.course, is_user_added: 0, ...extra };
  return db.prepare(`INSERT INTO course_schedules (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).bind(...Object.values(row));
});

const sqliteFixture = () => {
  const sqlite = new DatabaseSync(':memory:');
  const prepare = (sql, values = []) => ({
    bind: (...args) => prepare(sql, args),
    run: async () => sqlite.prepare(sql).run(...values),
    all: async () => ({ results: sqlite.prepare(sql).all(...values).map(r => ({ ...r })) }),
    first: async () => { const row = sqlite.prepare(sql).get(...values); return row ? { ...row } : null; },
  });
  return { prepare, close: () => sqlite.close(), batch: async statements => {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const result = []; for (const statement of statements) result.push(await statement.all()); sqlite.exec('COMMIT'); return result; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
};

test('local SQLite fixture with live D1 schema/API: atomic rollback, 2,357 additions, no-op, HK1/user tables unchanged', async t => {
  const db = sqliteFixture(); t.after(() => db.close());
  const schema = production.response.result[4].results.map(r => r.sql);
  for (const type of ['CREATE TABLE', 'CREATE INDEX', 'CREATE UNIQUE INDEX', 'CREATE TRIGGER']) {
    for (const sql of schema.filter(s => s.startsWith(type))) await db.prepare(sql).run();
  }
  for (const table of ['user_schedules', 'user_course_requests', 'course_mutation_receipts', 'course_mutation_outbox']) await db.prepare(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, payload TEXT)`).run();
  // Synthetic HK1 fixture only. No actual personal data, accounts, schedules or requests are created.
  const seed = Array.from({ length: 2103 }, (_, i) => ({ ...eligible[0], source_kind: 'fixture-hk1', source_row: i,
    course: { ...eligible[0].course, course_code: `HK1_FIXTURE_${i}`, semester: 'HK1_2026_2027', instructor: `HK1 lecturer fixture ${i}` } }));
  await db.batch(localStatements(db, seed, 0));
  const snapshot = async sql => (await db.prepare(sql).all()).results;
  const hk1Sql = "SELECT * FROM course_schedules WHERE semester='HK1_2026_2027' ORDER BY id";
  const facetSql = 'SELECT * FROM course_filter_facets ORDER BY semester,phase,subject_name,major,cohort,academic_program,group_name';
  const before = await snapshot(hk1Sql); const facetsBefore = await snapshot(facetSql);
  const additions = localStatements(db, eligible);
  // Force a late constraint failure: every course and facet change in the batch must roll back.
  await assert.rejects(db.batch([...additions, additions[0]]), /UNIQUE|constraint/i);
  assert.equal((await snapshot(`SELECT id FROM course_schedules WHERE semester='${SEMESTER}'`)).length, 0);
  assert.deepEqual(await snapshot(hk1Sql), before); assert.deepEqual(await snapshot(facetSql), facetsBefore);
  await db.batch(localStatements(db, eligible));
  const hk2 = await snapshot(`SELECT * FROM course_schedules WHERE semester='${SEMESTER}' ORDER BY source_position`);
  assert.equal(hk2.length, 2357);
  assert.deepEqual(await snapshot(hk1Sql), before);
  const repeat = planImport(audit.records, hk2, audit.temporary_items);
  assert.deepEqual(repeat.counts, { additions: 0, identical: 2357, blocked: 0, conflicts: 0, temporary_items: 3 });
  assert.equal((await snapshot(`SELECT SUM(course_count) AS n FROM course_filter_facets WHERE semester='${SEMESTER}'`))[0].n, 2357);
  assert.deepEqual(await snapshot("SELECT * FROM course_filter_facets WHERE semester='HK1_2026_2027' ORDER BY semester,phase,subject_name,major,cohort,academic_program,group_name"), facetsBefore);
  for (const table of ['user_schedules', 'user_course_requests', 'course_mutation_receipts', 'course_mutation_outbox']) assert.deepEqual(await snapshot(`SELECT * FROM ${table}`), []);
  const publicRead = await handleCourses(new URL(`https://example.test/courses?semester=${SEMESTER}&limit=100`), { DB: db });
  assert.equal(publicRead.status, 200); assert.equal(publicRead.payload.total, 2357);
  assert.ok(publicRead.payload.data.every(c => c.instructor === null && c.semester === SEMESTER && c.is_user_added === false));
  const filtered = await handleCourses(new URL(`https://example.test/courses?semester=${SEMESTER}&academicProgram=${encodeURIComponent('CT Elite')}`), { DB: db });
  assert.equal(filtered.payload.total, 29);
});

test('local D1 runtime accepts normalized courses and rolls back an entire failed batch', { timeout: 60000 }, async t => {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("fixture") } }',
    compatibilityDate: '2026-07-29', d1Databases: ['DB'] });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const schema = production.response.result[4].results.map(r => r.sql);
  for (const type of ['CREATE TABLE', 'CREATE INDEX', 'CREATE UNIQUE INDEX', 'CREATE TRIGGER']) {
    for (const sql of schema.filter(s => s.startsWith(type))) await db.prepare(sql).run();
  }
  const sample = [eligible[0], eligible.find(r => r.course.course_code === 'MLM309_262_D07'),
    eligible.find(r => r.assessment === 'essay'), eligible.find(r => r.issues.includes('REVIEW_EXAM_ROOM_MARKER')),
    eligible.find(r => r.issues.includes('REVIEW_EXAM_SUMMER_SOFTWARE')), eligible.find(r => r.course.course_code.endsWith('_GHÉP')),
    eligible.find(r => r.owner_derivation)];
  const statements = localStatements(db, sample, 0);
  await assert.rejects(db.batch([...statements, statements[0]]), /UNIQUE|constraint/i);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM course_schedules').first()).n, 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM course_filter_facets').first()).n, 0);
  await db.batch(localStatements(db, sample, 0));
  const result = await handleCourses(new URL(`https://example.test/courses?semester=${SEMESTER}`), { DB: db });
  assert.equal(result.payload.total, 7); assert.ok(result.payload.data.every(r => r.instructor === null));
  const ownerRow = result.payload.data.find(r => r.course_code === sample[6].course.course_code);
  assert.equal(getOwnerEstimatedShift(ownerRow.shift)?.shift, 'S');
});

// Execute each component's own slot/room/day/shift helpers, with the real production
// week parser. No substitute renderer or mocked S/C classifier can hide a mobile-only regression.
const productionLogic = buildSync({ entryPoints: ['utils/scheduleLogic.js'], bundle: true,
  write: false, format: 'esm', platform: 'node' }).outputFiles[0].text;
const { parseWeeks: productionParseWeeks } = await import(`data:text/javascript;base64,${Buffer.from(productionLogic).toString('base64')}`);
const componentSlots = await Promise.all(['ScheduleBoard', 'MobileSchedule'].map(async component => {
  const file = `components/${component}.tsx`;
  const source = await readFile(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['getExactShiftRange', 'getMainShiftType', 'getShiftDisplay', 'getCourseTimeLabel', 'splitData', 'getCourseDetailsForSlot'];
  const statements = ast.statements.filter(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(d => names.includes(d.name.getText(ast))));
  assert.equal(statements.length, names.length, `${component}: all actual helper definitions must be found`);
  const compiled = transformSync(statements.map(node => node.getText(ast)).join('\n'), { loader: 'ts' }).code;
  const helpers = new Function('parseWeeks', 'getOwnerEstimatedShift', 'ownerEstimatedShiftCaption', 'isTemporaryCatalogueItem', `${compiled}; return { slot: getCourseDetailsForSlot, classify: getMainShiftType, display: getShiftDisplay, time: getCourseTimeLabel };`)(productionParseWeeks, getOwnerEstimatedShift, ownerEstimatedShiftCaption, isTemporaryCatalogueItem);
  return { component, ...helpers };
}));

for (const { component, slot, classify, display, time } of componentSlots) {
  test(`${component} actual slot renderer preserves every HK2 meeting, room and shift without mutating courses`, () => {
    for (const record of eligible) {
      const before = JSON.stringify(record.course);
      const queries = new Map();
      for (const segment of record.segments) for (const week of segment.weeks) {
        const shift = segment.shift === 'S' || Number(segment.shift.split(':')[0]) < 12 ? 'S' : 'C';
        queries.set(`${segment.day_of_week}:${week}:${shift}`, [segment.day_of_week, week, shift]);
      }
      for (const [day, week, shift] of queries.values()) {
        const matching = record.segments.filter(s => s.day_of_week === day && s.weeks.includes(week)
          && (s.shift === 'S' || Number(s.shift.split(':')[0]) < 12 ? 'S' : 'C') === shift);
        assert.deepEqual(slot(record.course, day, week, shift), {
          day, shift: [...new Set(matching.map(s => s.serialized_shift || s.shift))].join(';'),
          room: [...new Set(matching.map(s => s.room).filter(Boolean))].join(' / '),
          weeks: [...new Set(matching.map(s => s.weeks_raw))].join(' / '),
        }, `${component} ${record.course.course_code} day ${day} week ${week} ${shift}`);
      }
      assert.equal(JSON.stringify(record.course), before);
    }
  });

  test(`${component} displays owner-estimated periods without clock times and gives temporary items no weekly slots`, () => {
    for (const record of audit.records.filter(r => r.owner_derivation)) for (const segment of record.segments.filter(s => s.timing_precision)) {
      assert.equal(classify(segment.serialized_shift), 'S');
      assert.match(display(segment.serialized_shift), /dự kiến theo owner/);
      assert.match(time(segment.serialized_shift), /giờ chưa công bố/);
      assert.doesNotMatch(time(segment.serialized_shift), /\d{1,2}:\d{2}/);
      assert.ok(slot(record.course, segment.day_of_week, segment.weeks[0], 'S'));
    }
    for (const item of audit.temporary_items) {
      const view = temporaryCatalogueView(item);
      assert.equal(view.code_label, 'Mã lớp chưa công bố');
      for (const shift of ['S', 'C']) for (const week of [0, 1, 22]) assert.equal(slot(view, 6, week, shift), null);
      assert.equal(slot({ ...view, weeks: '1-22', day_of_week: '6', shift: 'S' }, 6, 1, 'S'), null);
    }
  });

  test(`${component} actual slot renderer preserves HK1 legacy samples and room/meeting boundary cases`, () => {
    const check = (course, queries) => {
      const before = structuredClone(course);
      for (const [day, week, shift, expected] of queries) {
        assert.deepEqual(slot(course, day, week, shift), expected === null ? null : { day, ...expected }, `${component} ${course.course_code || 'boundary'} ${day}/${week}/${shift}`);
      }
      assert.deepEqual(course, before, `${component}: display logic must not rewrite HK1/legacy fields`);
    };
    // Timetable fields only, copied from the existing HK1 export in Downloads
    // (course_schedules_HK1_2026_2027.xlsx). No instructors, IDs or personal fields.
    check({ course_code: 'ACC306_261_L02', semester: 'HK1_2026_2027', weeks: '2-3,5-9\n8-9',
      day_of_week: '7\n4', shift: 'S', room: 'B2.107\nB2.104' }, [
      [7, 2, 'S', { shift: 'S', room: 'B2.107', weeks: '2-3,5-9' }],
      [4, 8, 'S', { shift: 'S', room: 'B2.104', weeks: '8-9' }],
      [4, 2, 'S', null], [7, 8, 'C', null],
    ]);
    check({ course_code: 'GYM303_261_BB_D01', semester: 'HK1_2026_2027', weeks: '2-4\n5-7',
      day_of_week: '4', shift: '6-8\n9-10', room: 'Nhà tập luyện Bóng bàn' }, [
      [4, 2, 'C', { shift: '6-8', room: 'Nhà tập luyện Bóng bàn', weeks: '2-4' }],
      [4, 5, 'C', { shift: '9-10', room: 'Nhà tập luyện Bóng bàn', weeks: '5-7' }],
      [4, 0, 'C', { shift: '6-8;9-10', room: 'Nhà tập luyện Bóng bàn', weeks: '2-4 / 5-7' }],
      [4, 8, 'C', null], [4, 2, 'S', null],
    ]);
    check({ course_code: 'MLM303_261_L16', semester: 'HK1_2026_2027', weeks: '2-3,5-8',
      day_of_week: '7', shift: 'S', room: 'B2.402' }, [[7, 5, 'S', { shift: 'S', room: 'B2.402', weeks: '2-3,5-8' }]]);
    const legacy = { semester: 'HK1_2026_2027', weeks: '1-3 4-6', day_of_week: '2 4', shift: 'S C' };
    for (const room of ['LỚP ẢO', 'Sân bóng đá', 'Nhà thi đấu', 'Phòng  A 101']) check({ ...legacy, room }, [
      [2, 1, 'S', { shift: 'S', room, weeks: '1-3' }], [4, 4, 'C', { shift: 'C', room, weeks: '4-6' }],
      [2, 4, 'S', null], [4, 1, 'C', null],
    ]);
    for (const room of [undefined, null, '', '   ']) check({ ...legacy, room }, [
      [2, 1, 'S', { shift: 'S', room: '', weeks: '1-3' }], [4, 4, 'C', { shift: 'C', room: '', weeks: '4-6' }],
    ]);
    check({ ...legacy, room: ' LỚP ẢO \r\n Sân bóng đá ' }, [
      [2, 1, 'S', { shift: 'S', room: 'LỚP ẢO', weeks: '1-3' }], [4, 4, 'C', { shift: 'C', room: 'Sân bóng đá', weeks: '4-6' }],
    ]);
    check({ semester: 'HK1_2026_2027', weeks: '1\n2\n3', day_of_week: '2\n3\n4', shift: 'S\nC\nS', room: '\nNhà thi đấu\n' }, [
      [2, 1, 'S', { shift: 'S', room: '', weeks: '1' }], [3, 2, 'C', { shift: 'C', room: 'Nhà thi đấu', weeks: '2' }],
      [4, 3, 'S', { shift: 'S', room: '', weeks: '3' }],
    ]);
    check({ semester: 'HK1_2026_2027', weeks: '2\n2', day_of_week: '3\n3', shift: '1-3\n4-5', room: 'Nhà thi đấu\nSân bóng đá' }, [
      [3, 2, 'S', { shift: '1-3;4-5', room: 'Nhà thi đấu / Sân bóng đá', weeks: '2' }], [3, 2, 'C', null],
    ]);
    check({ semester: 'HK1_2026_2027', weeks: '1-3', day_of_week: '2,4', shift: 'S', room: 'LỚP ẢO' }, [
      [2, 2, 'S', { shift: 'S', room: 'LỚP ẢO', weeks: '1-3' }], [4, 2, 'S', { shift: 'S', room: 'LỚP ẢO', weeks: '1-3' }], [3, 2, 'S', null],
    ]);
    check({ ...legacy, weeks: '', room: 'Nhà thi đấu' }, [[2, 1, 'S', null]]);
  });
}
