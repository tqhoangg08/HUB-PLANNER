import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createEmptyPlanSchedules,
    getCourseRequestStudentCode,
    getPaginationPages,
    getManagementPage,
    normalizeAcademicProgramOptions,
    sortCourseRequestsNewestFirst,
    adminScheduleTabUrl,
    parseAdminScheduleTab,
    parseAdminScheduleSort,
    parseAdminSchedulePage,
    parseAdminSchedulePageSize,
    resolveAdminScheduleSemester,
    sortManagementRequests,
    sortManagementStudents,
    type CourseRequest,
} from '../features/schedule/scheduleBoardModel.ts';

const createCourseRequest = (
    overrides: Partial<CourseRequest> = {},
): CourseRequest => ({
    id: 'request-1',
    subject_name: 'Kinh tế học',
    course_code: 'ECO101',
    ...overrides,
});

test('schedule request pagination keeps the current page neighborhood and boundaries', () => {
    assert.deepEqual(getPaginationPages(6, 12), [1, 4, 5, 6, 7, 8, 12]);
    assert.deepEqual(getPaginationPages(1, 3), [1, 2, 3]);
});

test('management pagination slices bounded API results without inventing a server total', () => {
    const rows = Array.from({ length: 23 }, (_, index) => index + 1);
    assert.deepEqual(getManagementPage(rows, 2, 10), { rows: rows.slice(10, 20), page: 2, totalPages: 3, start: 11, end: 20, total: 23 });
    assert.deepEqual(getManagementPage(rows, 9, 20), { rows: rows.slice(20), page: 2, totalPages: 2, start: 21, end: 23, total: 23 });
    assert.deepEqual(getManagementPage([], 1, 10), { rows: [], page: 1, totalPages: 1, start: 0, end: 0, total: 0 });
});

test('schedule requests are sorted newest first and tolerate invalid dates', () => {
    const requests = [
        createCourseRequest({ id: 'old', created_at: '2026-06-01T00:00:00Z' }),
        createCourseRequest({ id: 'invalid', created_at: 'not-a-date' }),
        createCourseRequest({ id: 'new', created_at: '2026-07-01T00:00:00Z' }),
    ];

    assert.deepEqual(
        sortCourseRequestsNewestFirst(requests).map(request => request.id),
        ['new', 'old', 'invalid'],
    );
    assert.deepEqual(requests.map(request => request.id), ['old', 'invalid', 'new']);
});

test('student code uses only the authoritative profile value', () => {
    assert.equal(getCourseRequestStudentCode(createCourseRequest({
        user_id: 'user-id',
        user: { student_code: ' 030839230074 ', email: 'fallback@st.buh.edu.vn' },
    })), '030839230074');
    assert.equal(getCourseRequestStudentCode(createCourseRequest({
        user_id: 'user-id',
        user: { email: '030839230075@st.buh.edu.vn' },
    })), 'Chưa có MSSV');
    assert.equal(getCourseRequestStudentCode(createCourseRequest({ user_id: 'user-id' })), 'Chưa có MSSV');
});

test('five admin tabs have stable URL names and invalid sort safely defaults', () => {
    for (const [tab, url] of Object.entries({ system: 'system', user: 'user', requested: 'requested', user_changed: 'user-changed', student_schedules: 'student-schedules' })) {
        assert.equal(adminScheduleTabUrl(tab as Parameters<typeof adminScheduleTabUrl>[0]), url);
        assert.equal(parseAdminScheduleTab(url), tab);
    }
    assert.equal(parseAdminScheduleTab('bogus'), 'system');
    assert.equal(parseAdminScheduleSort('credits-desc'), 'credits-desc');
    assert.equal(parseAdminScheduleSort('bogus'), 'default');
    assert.equal(parseAdminSchedulePage('2'), 2);
    assert.equal(parseAdminSchedulePage('NaN'), 1);
    assert.equal(parseAdminSchedulePageSize('20'), 20);
    assert.equal(parseAdminSchedulePageSize('200'), 10);
});

test('admin semester restores from full or split URL values', () => {
    assert.equal(resolveAdminScheduleSemester(new URLSearchParams('semester=HK1_2026_2027')), 'HK1_2026_2027');
    assert.equal(resolveAdminScheduleSemester(new URLSearchParams('semester=HK1&year=2026-2027')), 'HK1_2026_2027');
    assert.notEqual(resolveAdminScheduleSemester(new URLSearchParams('semester=invalid')), 'invalid');
});

test('Vietnamese request sort and stable ties happen before slicing the page', () => {
    const requests = [
        createCourseRequest({ id: '3', subject_name: 'Zoology' }),
        createCourseRequest({ id: '2', subject_name: 'Ánh sáng' }),
        createCourseRequest({ id: '1', subject_name: 'Ánh sáng' }),
    ];
    assert.deepEqual(getManagementPage(sortManagementRequests(requests, 'name-asc'), 1, 2).rows.map(row => row.id), ['1', '2']);
    assert.deepEqual(sortManagementRequests(requests, 'name-desc').map(row => row.id), ['3', '1', '2']);
    assert.deepEqual(requests.map(row => row.id), ['3', '2', '1']);
});

test('student schedule sort uses authoritative totals and deterministic student-code ties', () => {
    const rows = [
        { user_id: 'b', student_code: 'SV10', full_name: 'An', course_count: 2, total_credits: 0, semesters: [] },
        { user_id: 'a', student_code: 'SV2', full_name: 'An', course_count: 3, total_credits: 7, semesters: [] },
    ];
    assert.deepEqual(sortManagementStudents(rows, 'name-asc').map(row => row.user_id), ['a', 'b']);
    assert.deepEqual(sortManagementStudents(rows, 'credits-desc').map(row => row.user_id), ['a', 'b']);
});

test('academic program options are trimmed, unique, and keep the default first', () => {
    const options = normalizeAcademicProgramOptions([
        ' Tiên tiến ',
        'Chính quy chuẩn',
        '',
        'Tiên tiến',
        'Chất lượng cao',
    ]);

    assert.equal(options[0], 'Chính quy chuẩn');
    assert.equal(options.filter(value => value === 'Tiên tiến').length, 1);
    assert.equal(options.includes(''), false);
});

test('plan schedules start independent', () => {
    const plans = createEmptyPlanSchedules();

    assert.notEqual(plans.A, plans.B);
    assert.notEqual(plans.B, plans.C);
    assert.deepEqual(plans, { A: [], B: [], C: [] });
});
