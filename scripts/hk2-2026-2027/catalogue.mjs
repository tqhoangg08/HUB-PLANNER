/** Pure HK2 preparation. No network, credentials, remote execution or production writer. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { OWNER_ESTIMATED_RULE, ownerEstimatedShiftLabel, getOwnerEstimatedShift, temporaryCatalogueView } from '../../utils/provisionalCoursePolicy.js';

export const SEMESTER = 'HK2_2026_2027';
export const OWNER_PE_CODES = Object.freeze([
  'GYM302_262_PI_D17', 'GYM302_262_PI_D18', 'GYM304_262_PI_D52', 'GYM304_262_PI_D53',
  'GYM304_262_QV_D27', 'GYM304_262_QV_D28', 'GYM304_262_QV_D54', 'GYM304_262_QV_D55',
]);
export const OWNER_DECISIONS = Object.freeze({
  decision_id: OWNER_ESTIMATED_RULE, authorized_by: 'owner_explicit_request', date: '2026-11-20',
  scope: { semester: SEMESTER, physical_education_codes: OWNER_PE_CODES, temporary_source_rows: [1214, 1320, 1321] },
  period_to_half_day: { '1-2': 'S', '3-5': 'S' }, exact_times_published_by_school: false,
  temporary_items_are_official_classes: false, production_publication_approved: false,
});
export const DATA_DIR = path.resolve(import.meta.dirname, '../../data/hk2-2026-2027');
export const FIELDS = [
  'course_code', 'subject_name', 'prerequisite', 'credits', 'knowledge_block', 'shift', 'day_of_week',
  'weeks', 'room', 'campus', 'managing_faculty', 'exam_date', 'exam_shift', 'exam_campus', 'exam_room',
  'cohort', 'major', 'group_name', 'orientation', 'orientation_note_3', 'registration_type', 'general_note',
  'academic_program', 'student_count', 'phase', 'semester', 'instructor', 'is_user_added',
];
export const SHIFT_TIMES = Object.freeze({
  S: '07:00-11:05', C: '13:00-17:05', '1-3': '07:00-09:15', '4-5': '09:35-11:05',
  '6-8': '13:00-15:15', '9-10': '15:35-17:05',
});
export const PROGRAMS = Object.freeze({
  'ĐHCQ chuẩn': null, TABP: 'Tiếng Anh bán phần', 'CT đặc biệt': 'Chương trình đặc biệt', 'CT Elite': 'CT Elite',
});
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const normalizeKey = (value) => String(value ?? '').toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ').trim();
const clean = (v) => String(v ?? '').replace(/\r\n?/g, '\n').trim();
const nullable = (v) => clean(v) || null;
const lines = (v) => clean(v).split('\n').map(s => s.trim());
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const same = (a, b, label) => assert(JSON.stringify(a) === JSON.stringify(b), `${label}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const campus = (v) => lines(v).map(s => s === 'TĐ' ? 'TD' : ['39HN - SG', '36 TTĐ-SG'].includes(s) ? 'Q1' : s).join('\n');
const iso = (d) => d.toISOString().slice(0, 10);
export const weekDates = (week) => Array.from({ length: 7 }, (_, day) => iso(new Date(Date.UTC(2027, 1, 15 + (week - 1) * 7 + day))));
export const COMMON_CLOSURES = ['2027-04-16', '2027-04-17', '2027-04-18', '2027-04-30', '2027-05-01', '2027-05-02', '2027-05-03'];
export const ADVANCED_CLOSURES = ['2027-07-09', '2027-07-10', '2027-07-11'];
export const isClosure = (date, kind) => COMMON_CLOSURES.includes(date) || (kind === 'advanced' && ADVANCED_CLOSURES.includes(date));
export const isOnline = (date, kind) => kind === 'advanced' && date >= '2027-02-15' && date <= '2027-02-20';

const cellValue = (cell) => {
  const v = cell.value;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('formula' in v || 'sharedFormula' in v) return v.result ?? null;
    if ('richText' in v) return v.richText.map(p => p.text).join('');
    if ('text' in v) return v.text;
  }
  return v ?? null;
};

/** Verify every byte before parsing any staging/workbook data. Original SHA pins are in the supplied manifest. */
export async function verifiedInputs(dataDir = DATA_DIR) {
  const integrity = JSON.parse(await readFile(path.join(dataDir, 'integrity.json'), 'utf8'));
  const inputs = new Map();
  for (const [name, expected] of Object.entries(integrity.files)) {
    assert(path.basename(name) === name, 'Invalid input path');
    const bytes = await readFile(path.join(dataDir, 'source', name));
    same(sha256(bytes), expected, `SHA-256 ${name}`);
    inputs.set(name, bytes);
  }
  const staging = JSON.parse(inputs.get('hub_planner_hk2_2026_2027_staging.json').toString('utf8'));
  for (const source of staging.manifest.source_files) same(integrity.files[source.name], source.sha256, `Manifest ${source.kind}`);
  return { inputs, integrity, staging };
}

async function readBooks(inputs) {
  const books = new Map(); const sheets = [];
  for (const [name, bytes] of inputs) {
    if (!name.endsWith('.xlsx')) continue;
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes);
    for (const sheet of book.worksheets) {
      // Materialize ALL rows/cells on ALL sheets, including headers, notes and trailing formatted rows.
      const values = Array.from({ length: sheet.rowCount }, (_, r) =>
        Array.from({ length: sheet.columnCount }, (_, c) => cellValue(sheet.getCell(r + 1, c + 1))));
      sheets.push({ file: name, sheet: sheet.name, rows: sheet.rowCount, columns: sheet.columnCount,
        nonempty_cells: values.flat().filter(v => v !== null).length, values_sha256: sha256(JSON.stringify(values)) });
      sheet.fullValues = values;
    }
    books.set(name, book);
  }
  return { books, sheets };
}

export function parseWeeks(value) {
  const result = [];
  assert(clean(value), 'Missing weeks');
  for (const part of clean(value).split(',')) {
    const match = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    assert(match, `Invalid weeks: ${value}`);
    const from = Number(match[1]), to = Number(match[2] || from);
    assert(from >= 1 && to <= 22 && to >= from, `Weeks out of HK2 range: ${value}`);
    for (let w = from; w <= to; w++) result.push(w);
  }
  assert(new Set(result).size === result.length, `Repeated weeks: ${value}`);
  return result;
}

/** A singleton may be broadcast; a partial multi-line array must never be guessed. */
export function scheduleSegments(raw) {
  const keys = ['shift', 'day_of_week', 'weeks', 'room', 'campus'];
  const parts = Object.fromEntries(keys.map(k => [k, lines(raw[k])]));
  const count = Math.max(...Object.values(parts).map(p => p.length));
  for (const [key, list] of Object.entries(parts)) assert(list.length === 1 || list.length === count, `Ambiguous ${key} alignment`);
  return Array.from({ length: count }, (_, index) => {
    const get = (key) => parts[key][parts[key].length === 1 ? 0 : index];
    const day = Number(get('day_of_week'));
    assert(Number.isInteger(day) && day >= 2 && day <= 8, 'Invalid weekday');
    const shift = get('shift');
    assert(shift in SHIFT_TIMES || shift === '1-2' || shift === '3-5', `Unknown source shift ${shift}`);
    return { day_of_week: day, shift_raw: shift, shift: SHIFT_TIMES[shift] ?? null,
      weeks_raw: get('weeks'), weeks: parseWeeks(get('weeks')), room: get('room') || null,
      campus: campus(get('campus')) || null };
  });
}

const sourceRow = (kind, row) => {
  const at = (n) => clean(row[n - 1]);
  const mapping = kind === 'standard'
    ? { course_code: 3, subject_name: 4, prerequisite: 5, credits: 6, knowledge_block: 8, shift: 12,
      day_of_week: 13, weeks: 14, room: 15, campus: 16, managing_faculty: 17, exam_shift: 18,
      exam_date: 19, phase: 20, exam_campus: 21, cohort: 22, major: 23, orientation: 24, registration_type: 29 }
    : { course_code: 2, subject_name: 3, prerequisite: 4, credits: 5, knowledge_block: 7, shift: 8,
      day_of_week: 9, weeks: 10, room: 11, campus: 12, managing_faculty: 13, exam_date: 14,
      exam_shift: 15, exam_room: 16, phase: 17, exam_campus: 18, cohort: 19, major: 20, group_name: 21, orientation: 24, orientation_note_3: 28 };
  const fields = Object.fromEntries(Object.entries(mapping).map(([k, n]) => [k, at(n)]));
  const noteColumns = kind === 'standard'
    ? { merge_note: 9, note: 10, national_defense_weeks: 11, practical_learning: 25, practical_exam: 26, note1: 27, elective_note: 28 }
    : { note1_practical: 22, note2_practical_exam: 23, orientation: 24, merge_note: 25, taught_in_english: 27,
      group_orientation: 28, instructor_title: 29, instructor_name: 30 };
  return { fields, order: at(1), program: kind === 'standard' ? 'ĐHCQ chuẩn' : at(26),
    notes: Object.fromEntries(Object.entries(noteColumns).map(([k, n]) => [k, at(n)])) };
};

const examDate = (v) => {
  if (!v || v.toLocaleLowerCase('vi-VN') === 'tiểu luận') return null;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  assert(m, `Unrecognized exam date ${v}`);
  const date = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  assert(date.getUTCDate() === Number(m[1]) && date.getUTCMonth() + 1 === Number(m[2]), `Invalid date ${v}`);
  return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
};

export function normalizeSource(kind, row) {
  const { fields: f, notes, program, order } = sourceRow(kind, row);
  assert(program in PROGRAMS, `Unknown program ${program}`);
  assert(!notes.instructor_name && !notes.instructor_title, 'Instructor now published: independent review required');
  const raw = Object.fromEntries(['shift', 'day_of_week', 'weeks', 'room', 'campus'].map(k => [k, f[k]]));
  const segments = scheduleSegments(raw);
  const unknown = segments.some(s => s.shift === null);
  const course = Object.fromEntries(FIELDS.map(k => [k, null]));
  for (const [k, v] of Object.entries(f)) course[k] = nullable(v);
  course.credits = f.credits ? Number(f.credits) : null;
  course.semester = SEMESTER; course.instructor = null; course.is_user_added = false;
  course.academic_program = PROGRAMS[program];
  course.shift = unknown ? null : segments.map(s => s.shift).join('\n');
  course.day_of_week = segments.map(s => String(s.day_of_week)).join('\n');
  course.weeks = segments.map(s => s.weeks_raw).join('\n');
  course.room = nullable(segments.map(s => s.room ?? '').join('\n'));
  course.campus = nullable(segments.map(s => s.campus ?? '').join('\n'));
  course.exam_campus = nullable(campus(f.exam_campus));
  course.exam_date = examDate(f.exam_date);
  const marker = Boolean(f.exam_room && /ĐC/.test(f.exam_room));
  if (marker) { course.exam_room = null; notes.exam_room_raw_note = f.exam_room; }
  let noteText = Object.entries(notes).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  if (f.exam_date.toLocaleLowerCase('vi-VN') === 'tiểu luận') noteText.push('Hình thức đánh giá: Tiểu luận (không phải ngày thi)');
  course.general_note = noteText.join(' | ') || null;
  if (!course.exam_date) course.exam_shift = null;
  const issues = [];
  if (course.course_code.endsWith('_GHÉP')) issues.push('REVIEW_MERGED_CLASS_CODE');
  if (unknown) issues.push('UNMAPPED_SHIFT_TIME');
  if (kind === 'standard' && course.exam_date === '25/04/2027') issues.push('REVIEW_STANDARD_EXAM_SUNDAY_25_APR');
  if (marker) issues.push('REVIEW_EXAM_ROOM_MARKER');
  if (kind === 'advanced' && /^(19|20|21)\/07\/2027$/.test(course.exam_date || '')) issues.push('REVIEW_EXAM_SUMMER_SOFTWARE');
  const status = issues.some(i => i !== 'REVIEW_EXAM_SUMMER_SOFTWARE') ? 'REVIEW_REQUIRED' : 'CANDIDATE';
  return { course, raw, notes, program, order, issues, status, segments,
    assessment: f.exam_date.toLocaleLowerCase('vi-VN') === 'tiểu luận' ? 'essay' : course.exam_date ? 'scheduled_exam' : 'unpublished',
    exam_date_raw: f.exam_date, exam_room_raw: f.exam_room || null };
}

/** Apply the owner's later decision only AFTER independently reconciling the immutable source. */
const applyOwnerDecision = (item, normalized) => {
  const base = { ...item, record_kind: 'official_class', publication: 'ELIGIBLE_PENDING_OWNER_APPROVAL',
    assessment: normalized.assessment, exam_date_raw: normalized.exam_date_raw, exam_room_raw: normalized.exam_room_raw,
    segments: normalized.segments };
  if (!normalized.issues.includes('UNMAPPED_SHIFT_TIME')) return base;
  assert(item.source_kind === 'standard' && OWNER_PE_CODES.includes(item.course.course_code), 'Unapproved approximate-period class');
  const segments = normalized.segments.map(segment => {
    if (segment.shift !== null) return segment;
    assert(['1-2', '3-5'].includes(segment.shift_raw), 'Unapproved approximate period');
    return { ...segment, shift: 'S', shift_code: 'S', serialized_shift: ownerEstimatedShiftLabel(segment.shift_raw),
      timing_precision: 'owner_half_day', start_time: null, end_time: null, owner_decision_id: OWNER_ESTIMATED_RULE };
  });
  return { ...base, segments,
    course: { ...item.course, shift: segments.map(s => s.serialized_shift || s.shift).join('\n'),
      general_note: [item.course.general_note, 'Ca S dự kiến theo quyết định owner cho tiết 1-2/3-5; chưa có giờ chính xác do trường công bố.'].filter(Boolean).join(' | ') },
    owner_derivation: { decision_id: OWNER_ESTIMATED_RULE, source_status: item.status,
      source_shift: item.course.shift, source_periods: item.raw_schedule.shift, exact_clock_times_inferred: false,
      resolved_publication_block: 'UNMAPPED_SHIFT_TIME', preserved_source_warning: 'UNMAPPED_SHIFT_TIME' } };
};

const temporaryItem = (ex, source, raw) => {
  const technicalKey = `hk2tmp:${sha256(`${source.sha256}:LG HK2 du kien (2):${ex.source_row}`)}`;
  const item = { record_kind: 'temporary_subject', technical_key: technicalKey, semester: SEMESTER,
    official_course_code: null, subject_name: ex.subject_name,
    credits: ex.source_fields.credits ? Number(ex.source_fields.credits) : null, instructor: null,
    cohort: ex.cohort, major: ex.source_fields.major || null, group_name: ex.source_fields.group_name || null,
    academic_program: PROGRAMS[raw.program] ?? null,
    publication: 'TEMPORARY_PREVIEW_ONLY_REQUIRES_SEPARATE_SCHEMA', scheduling_status: 'NOT_CONFIRMED_AS_WEEKLY',
    segments: [], day_of_week: null, shift: null, weeks: null, room: null, campus: null,
    capabilities: { official_import: false, select_as_class: false, personal_schedule: false, ics: false, conflicts: false },
    provenance: { source_file: source.name, source_sha256: source.sha256, sheet: 'LG HK2 du kien (2)',
      source_row: ex.source_row, source_order: ex.source_order, source_course_code: ex.course_code,
      source_program: raw.program, source_fields: ex.source_fields, owner_decision_id: OWNER_ESTIMATED_RULE },
    warnings: ['OFFICIAL_CODE_NOT_PUBLISHED', 'WEEKLY_SCHEDULE_NOT_CONFIRMED', ...(ex.source_fields.credits ? [] : ['CREDITS_NOT_PUBLISHED'])] };
  return { ...item, preview: temporaryCatalogueView(item) };
};

export async function auditPackage(dataDir = DATA_DIR) {
  const { inputs, integrity, staging } = await verifiedInputs(dataDir);
  const { books, sheets } = await readBooks(inputs);
  const sourceMaps = new Map(); const originalCounts = {}; const calendarEvidence = [];
  for (const source of staging.manifest.source_files) {
    const book = books.get(source.name); assert(book, `Missing original ${source.name}`);
    const sheet = book.worksheets[0]; const map = new Map();
    for (const [index, row] of sheet.fullValues.entries()) {
      const parsed = sourceRow(source.kind, row);
      if (/^\d+$/.test(parsed.order) && parsed.fields.course_code) map.set(index + 1, row);
    }
    sourceMaps.set(source.kind, map); originalCounts[source.kind] = map.size;
    const cal = book.worksheets[1]; const start = cal.fullValues.findIndex(row => row[2] instanceof Date && iso(row[2]) === '2027-02-15');
    assert(start >= 0, 'Calendar start missing');
    const events = [];
    for (let w = 1; w <= 22; w++) {
      const rowIndex = start + (w - 1) * 2;
      same(cal.fullValues[rowIndex].slice(2, 9).map(iso), weekDates(w), `${source.kind} week ${w}`);
      same(staging.calendar_week_map[w], weekDates(w), `Staging week ${w}`);
      same(staging.manifest.weekly_calendar_start_dates[w - 1], weekDates(w)[0], `Manifest week ${w}`);
      cal.fullValues[rowIndex + 1].slice(2, 9).forEach((v, d) => {
        const note = clean(v);
        if (note && !/^\d/.test(note)) events.push({ program: source.kind, date: weekDates(w)[d], week: w, weekday: d + 2, note, source_row: rowIndex + 2 });
      });
    }
    const summer = cal.fullValues[start + 44]; same(iso(summer[2]), '2027-07-19', 'Summer start');
    const stagedEvents = staging.calendar_events.filter(e => e.program === source.kind);
    same(events, stagedEvents, `${source.kind} calendar events`);
    const allText = book.worksheets[0].fullValues.slice(0, 22).flat().map(clean).join('\n');
    if (source.kind === 'advanced') {
      assert(allText.includes('15/02/2027') && allText.includes('20/02/2027') && /online|trực tuyến/i.test(allText), 'Online date scope missing in original');
      same(clean(cal.fullValues[start + 1][1]), 'Online', 'Advanced online week marker');
    }
    calendarEvidence.push({ kind: source.kind, sheet: cal.name, weeks_checked: 22, dates_checked: 154, events_checked: events.length,
      online_dates: source.kind === 'advanced' ? weekDates(1).slice(0, 6) : [], summer_software_exam_dates: source.kind === 'advanced' ? ['2027-07-19', '2027-07-20', '2027-07-21'] : [] });
  }
  same(originalCounts, { standard: 937, advanced: 1423 }, 'Original counts');
  same(staging.classes.length, 2357, 'Staging count'); same(staging.exceptions.length, 3, 'Placeholder count');
  const codes = new Set(); const used = new Set(); const records = []; const temporaryItems = [];
  const flags = {}; let holidayConflicts = 0; let examHolidayConflicts = 0;
  for (const item of staging.classes) {
    const { source_kind: kind, source_row: rowNumber } = item;
    const key = `${kind}:${rowNumber}`; assert(!used.has(key), `Repeated source ${key}`); used.add(key);
    const row = sourceMaps.get(kind)?.get(rowNumber); assert(row, `Source row missing ${key}`);
    const normalized = normalizeSource(kind, row);
    const code = normalizeKey(normalized.course.course_code);
    assert(code && code !== '_262_' && !codes.has(code), `Duplicate/placeholder code ${code}`); codes.add(code);
    for (const f of FIELDS) same(item.course[f], normalized.course[f], `${key} ${f}`);
    same(item.raw_schedule, normalized.raw, `${key} raw schedule`);
    same(item.source_notes, normalized.notes, `${key} notes`);
    same(item.source_program, normalized.program, `${key} program`);
    same(item.source_order, normalized.order, `${key} source order`);
    same(item.source_file, staging.manifest.source_files.find(s => s.kind === kind).name, `${key} source filename`);
    same([...item.issues].sort(), [...normalized.issues].sort(), `${key} issues`);
    same(item.status, normalized.status, `${key} status`);
    for (const i of item.issues) flags[i] = (flags[i] || 0) + 1;
    for (const s of normalized.segments) for (const w of s.weeks) {
      if (isClosure(weekDates(w)[s.day_of_week - 2], kind)) holidayConflicts++;
    }
    if (normalized.course.exam_date) {
      const [day, month, year] = normalized.course.exam_date.split('/');
      if (isClosure(`${year}-${month}-${day}`, kind)) examHolidayConflicts++;
    }
    if (normalized.issues.includes('REVIEW_EXAM_SUMMER_SOFTWARE')) same(normalized.notes.note2_practical_exam, 'PM', `${key} summer software assessment`);
    records.push(applyOwnerDecision(item, normalized));
  }
  for (const ex of staging.exceptions) {
    const key = `${ex.kind}:${ex.source_row}`; assert(!used.has(key), `Repeated placeholder ${key}`); used.add(key);
    const original = sourceRow(ex.kind, sourceMaps.get(ex.kind).get(ex.source_row));
    same(original.fields.course_code, '_262_', 'Placeholder source');
    const placeholderFields = { ...original.fields }; delete placeholderFields.orientation; delete placeholderFields.orientation_note_3;
    same(ex.source_fields, placeholderFields, `Placeholder ${key} fields`);
    assert([1214, 1320, 1321].includes(ex.source_row), 'Unapproved temporary source row');
    temporaryItems.push(temporaryItem(ex, staging.manifest.source_files.find(s => s.kind === ex.kind), original));
  }
  same(used.size, 2360, 'No lost original row'); same(holidayConflicts, 0, 'Holiday class conflicts');
  same(examHolidayConflicts, 0, 'Holiday exam conflicts');
  const review = books.get('hub_planner_hk2_2026_2027_review.xlsx');
  const classRows = review.getWorksheet('LỚP HỌC PHẦN').fullValues.slice(1);
  same(classRows.length, 2357, 'Review rows');
  classRows.forEach((r, i) => {
    const item = staging.classes[i], c = item.course;
    const expected = [item.source_kind, item.source_row, c.course_code, c.subject_name, c.academic_program || 'Chính quy chuẩn',
      c.cohort, c.major, c.credits, c.day_of_week, c.shift, c.weeks, c.room, c.campus, c.phase, c.exam_date, c.exam_shift,
      c.instructor, item.status, item.issues.join('; ') || null, item.raw_schedule.shift, item.raw_schedule.campus];
    same(r, expected, `Review class row ${i + 2}`);
  });
  const exceptionRows = review.getWorksheet('NGOẠI LỆ').fullValues.slice(1);
  const expectedExceptions = [
    ...staging.exceptions.map(e => [e.kind, e.source_row, e.course_code, e.subject_name, e.reason]),
    ...staging.classes.filter(c => c.issues.length).map(c => [c.source_kind, c.source_row, c.course.course_code, c.course.subject_name, c.issues.join('; ')]),
  ];
  same(exceptionRows.map(r => r.slice(0, 5)), expectedExceptions, 'All 115 review exceptions');
  const weeks = review.getWorksheet('TUẦN HK2').fullValues.slice(1);
  same(weeks, Array.from({ length: 22 }, (_, i) => [i + 1, ...weekDates(i + 1)]), 'Review 22 weeks');
  const events = review.getWorksheet('LỊCH TRƯỜNG').fullValues.slice(1);
  const expectedEvents = [...staging.calendar_events].sort((a, b) => a.date.localeCompare(b.date) || a.program.localeCompare(b.program));
  same(events, expectedEvents.map(e => [e.program, e.date, e.week, e.weekday, e.note, e.source_row]), 'Review events');
  const count = (predicate) => records.filter(predicate).length;
  const summary = { original_standard: 937, original_advanced: 1423, original_total: 2360, placeholders: 3, staged: 2357,
    prepared_rows: records.length + temporaryItems.length, official_school_codes: records.length,
    temporary_items: temporaryItems.length, owner_half_day_classes: count(r => Boolean(r.owner_derivation)),
    candidate: count(r => r.status === 'CANDIDATE'), review_required: count(r => r.status === 'REVIEW_REQUIRED'),
    eligible: count(r => r.publication !== 'BLOCKED'), blocked: count(r => r.publication === 'BLOCKED'),
    flagged_classes: count(r => r.issues.length), warning_classes: count(r => r.issues.length && r.publication !== 'BLOCKED'),
    exception_sheet_rows: exceptionRows.length, flag_occurrences: Object.values(flags).reduce((a, b) => a + b, 0),
    flags, essay: count(r => r.assessment === 'essay'), holiday_class_conflicts: holidayConflicts, holiday_exam_conflicts: examHolidayConflicts,
    instructors_null: count(r => r.course.instructor === null) + temporaryItems.filter(r => r.instructor === null).length, missing_room: count(r => !r.course.room),
    missing_exam_date: count(r => !r.course.exam_date), programs: Object.fromEntries(Object.entries(PROGRAMS).map(([p, name]) => [name || 'standard', count(r => r.source_program === p)])) };
  same(summary.candidate, 2322, 'Candidates'); same(summary.review_required, 35, 'Review required');
  same(summary.blocked, 0, 'Blocked'); same(summary.flagged_classes, 112, 'Flagged classes'); same(summary.essay, 124, 'Essays');
  same(summary.owner_half_day_classes, 8, 'Owner PE scope'); same(summary.prepared_rows, 2360, 'Prepared total');
  same(new Set(temporaryItems.map(r => r.technical_key)).size, 3, 'Distinct temporary rows');
  return { schema_version: 2, semester: SEMESTER, integrity, owner_decisions: OWNER_DECISIONS, summary, sheets, calendar_evidence: calendarEvidence,
    records, temporary_items: temporaryItems, placeholders: staging.exceptions, calendar_events: staging.calendar_events };
}

/** Snapshot must cover every target-semester row, including retired rows. Never resolve a conflict by overwriting. */
export function planImport(records, existingRows, temporaryItems = []) {
  assert(Array.isArray(existingRows), 'A complete existing-row snapshot is required');
  assert(new Set(temporaryItems.map(r => r.technical_key)).size === temporaryItems.length, 'Duplicate temporary technical key');
  assert(temporaryItems.every(r => r.record_kind === 'temporary_subject' && r.official_course_code === null
    && r.capabilities.official_import === false && r.segments.length === 0), 'Unsafe temporary subject');
  const existing = new Map();
  for (const row of existingRows.filter(r => r.semester === SEMESTER)) {
    const key = normalizeKey(row.course_code);
    assert(!existing.has(key), `Existing duplicate HK2 code ${key}`); existing.set(key, row);
  }
  const additions = [], identical = [], blocked = [], conflicts = [], seen = new Set();
  for (const record of records) {
    assert(record.record_kind !== 'temporary_subject', 'Temporary subjects cannot enter official course authority');
    const c = record.course;
    assert(c.semester === SEMESTER && c.instructor === null && c.is_user_added === false && c.course_code !== '_262_', 'Invalid HK2 import scope');
    for (const k of ['course_code', 'subject_name', 'semester', 'day_of_week', 'weeks']) assert(clean(c[k]), `Missing ${k}`);
    assert(Number.isInteger(c.credits) && c.credits >= 0, 'Missing/invalid credits');
    if (record.issues?.includes('UNMAPPED_SHIFT_TIME')) {
      assert(record.owner_derivation?.decision_id === OWNER_ESTIMATED_RULE && OWNER_PE_CODES.includes(c.course_code), 'Missing owner decision for approximate periods');
      assert(c.shift === record.segments.map(s => s.serialized_shift || s.shift).join('\n'), 'Owner precision marker must survive official import');
      assert(record.segments.filter(s => s.timing_precision).every(s => getOwnerEstimatedShift(s.serialized_shift)
        && s.shift === 'S' && s.start_time === null && s.end_time === null), 'Owner half-day cannot contain exact clocks');
    }
    const key = normalizeKey(c.course_code); assert(!seen.has(key), `Duplicate import ${key}`); seen.add(key);
    const old = existing.get(key);
    if (record.publication === 'BLOCKED') { blocked.push(c.course_code); if (old) conflicts.push({ code: c.course_code, reason: 'BLOCKED_CODE_ALREADY_EXISTS' }); continue; }
    assert(c.shift && record.segments.every(s => s.shift), 'Unknown shift cannot be published');
    if (old) {
      const fields = FIELDS.filter(k => (k === 'is_user_added' ? Boolean(old[k]) : old[k] ?? null) !== c[k]);
      if (fields.length || old.catalogue_visibility !== 'published') conflicts.push({ code: c.course_code, fields, reason: 'EXISTING_CONTENT_OR_VISIBILITY' });
      else identical.push(c.course_code);
    } else additions.push(record);
  }
  for (const [key, row] of existing) if (!seen.has(key)) conflicts.push({ code: row.course_code, reason: 'UNEXPECTED_EXISTING_HK2' });
  return { semester: SEMESTER, mode: 'DRY_RUN_ONLY', can_apply: false, requires_owner_approval: true,
    additions: additions.map(r => r.course.course_code), identical, blocked, conflicts,
    status: conflicts.length ? 'CONFLICT_STOP' : 'AWAITING_OWNER_APPROVAL',
    payload_sha256: sha256(JSON.stringify(additions.map(r => r.course))),
    temporary_items: temporaryItems.map(r => ({ technical_key: r.technical_key, source_row: r.provenance.source_row,
      label: r.preview.code_label, official_import: false, scheduling_status: r.scheduling_status })),
    counts: { additions: additions.length, identical: identical.length, blocked: blocked.length, conflicts: conflicts.length,
      temporary_items: temporaryItems.length } };
}

/** A partial or differently scoped SELECT must never be mistaken for an empty HK2 catalogue. */
export function validateSnapshot(snapshot, expectedSql) {
  const sql = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  assert(snapshot.database_id === '88d702e1-60d3-490a-8514-38ef881cf133'
    && Number.isFinite(Date.parse(snapshot.checked_at)) && snapshot.response?.success === true, 'Unverified snapshot');
  same(sql(snapshot.sql), sql(expectedSql), 'Snapshot SELECT scope');
  const results = snapshot.response.result;
  assert(Array.isArray(results) && results.length === 5
    && results.every(r => r.success === true && Array.isArray(r.results)
      && r.meta?.rows_written === 0 && r.meta?.changes === 0 && r.meta?.changed_db === false), 'Incomplete/non-read-only snapshot');
  assert(results[3].results.every(row => row.semester === SEMESTER && row.course_code && row.id), 'Invalid existing HK2 scope');
  const hk2Count = results[0].results.filter(row => row.semester === SEMESTER).reduce((sum, row) => {
    assert(Number.isInteger(row.count) && row.count >= 0, 'Invalid snapshot count'); return sum + row.count;
  }, 0);
  same(hk2Count, results[3].results.length, 'Complete HK2 snapshot count');
  assert(results[4].results.some(row => /^CREATE TABLE course_schedules\b/.test(row.sql))
    && results[4].results.some(row => /^CREATE TABLE course_filter_facets\b/.test(row.sql)), 'Missing schema');
  return results;
}
